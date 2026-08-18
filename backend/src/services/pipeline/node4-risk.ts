import { callJsonLLM, MODEL } from '../openai'
import { agentConfigService } from '../agent-config.service'
import { recordTrace } from '../trace-store'
import * as auditStore from '../governance-audit-store'
import { NOT_FOUND } from '../../types/contract'
import type { ConfidenceScores, RiskFinding, RiskMatrix, RiskSeverity } from '../../types/contract'
import type { ExtractorOutput } from './node3-extractor'
import type { NodeOutput } from '../../types/contract'

export interface RiskOutput {
  risks: RiskFinding[]
  risk_matrix: RiskMatrix
  confidence: Pick<ConfidenceScores, 'extraction' | 'clause_identification' | 'risk_detection'>
}

const VALID_SEVERITIES: RiskSeverity[] = ['low', 'medium', 'high']

const SYSTEM_PROMPT = `You are an enterprise contract risk-analysis agent. You receive a JSON object describing a contract's extracted metadata, clauses, obligations, and absence flags. Identify risks and score the contract. Respond with ONLY a single JSON object (no markdown fences, no commentary) matching exactly this shape:

{
  "risks": [ { "category": string, "title": string, "severity": "low"|"medium"|"high", "explanation": string, "related_clause": string } ],
  "risk_matrix": { "commercial": number, "legal": number, "operational": number, "compliance": number, "overall_score": number },
  "risk_detection_confidence": number
}

Rules:
- Consider named risk patterns such as: unlimited/uncapped liability, missing or one-sided indemnification, missing confidentiality clause, missing or unfavorable termination terms, missing dispute resolution or governing law, missing or vague notice period, automatic/silent renewal traps, ambiguous or undefined service levels, one-sided obligations, missing data protection/compliance clauses, high or unbounded financial commitments, missing insurance requirements, and any other risk supported by the provided data.
- Every risk MUST include a concrete, specific "explanation" grounded in the given data (which field, clause, or absence flag triggered it) — never a generic template sentence.
- "related_clause" should reference a clause category name from the input when applicable, or be an empty string.
- Score "commercial", "legal", "operational", "compliance", and "overall_score" each on a 0 (no risk) to 10 (severe risk) scale. "overall_score" should reflect the overall risk level considering all dimensions, not simply their average.
- "risk_detection_confidence" is your own confidence (0 to 1) in the completeness and accuracy of the risk list you produced, given the input data quality.
- Do not invent risks unsupported by the input JSON.`

function clampScore(val: unknown, max = 10): number {
  const n = typeof val === 'number' && Number.isFinite(val) ? val : 0
  return Math.max(0, Math.min(max, Math.round(n * 100) / 100))
}

function clampUnit(val: unknown, fallback: number): number {
  const n = typeof val === 'number' && Number.isFinite(val) ? val : fallback
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100))
}

function coerceRiskMatrix(raw: unknown): RiskMatrix {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    commercial: clampScore(obj['commercial']),
    legal: clampScore(obj['legal']),
    operational: clampScore(obj['operational']),
    compliance: clampScore(obj['compliance']),
    overall_score: clampScore(obj['overall_score']),
  }
}

function coerceRisks(raw: unknown, contractId: string): RiskFinding[] {
  const arr = Array.isArray(raw) ? raw : []
  return arr
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object')
    .map((r, idx) => {
      const severity = VALID_SEVERITIES.includes(r['severity'] as RiskSeverity) ? (r['severity'] as RiskSeverity) : 'medium'
      const finding: RiskFinding = {
        id: `${contractId}-risk-${idx + 1}`,
        category: typeof r['category'] === 'string' && r['category'] ? r['category'] : 'General',
        title: typeof r['title'] === 'string' && r['title'] ? r['title'] : 'Unlabeled risk',
        severity,
        explanation: typeof r['explanation'] === 'string' ? r['explanation'] : '',
        related_clause: typeof r['related_clause'] === 'string' && r['related_clause'] ? r['related_clause'] : undefined,
      }
      return finding
    })
    .filter((r) => r.explanation.trim().length > 0)
}

function computeExtractionConfidence(extractorOutput: ExtractorOutput): number {
  const fields = Object.entries(extractorOutput.metadata)
  const total = fields.length
  if (total === 0) return 0.5
  const found = fields.filter(([key, val]) => {
    if (key === 'parties') return Array.isArray(val) && val.length > 0
    return val !== NOT_FOUND
  }).length
  return clampUnit(found / total, 0.5)
}

function computeClauseConfidence(extractorOutput: ExtractorOutput): number {
  const clauses = extractorOutput.clauses
  if (clauses.length === 0) return 0.5
  const evidenced = clauses.filter((c) => (c.present && (c.excerpt ?? '').trim().length > 0) || !c.present).length
  return clampUnit(evidenced / clauses.length, 0.7)
}

export async function runNode4Risk(extractorOutput: ExtractorOutput, contractId: string): Promise<{ node: NodeOutput; riskOutput: RiskOutput }> {
  const startedAt = new Date().toISOString()
  const startMs = Date.now()

  const maxTokens = (agentConfigService.getValue('risk', 'max_tokens', 5000) as number) || 5000
  const temperature = (agentConfigService.getValue('risk', 'temperature', 0.1) as number) ?? 0.1

  auditStore.record('Risk_Matrix_Evaluator', 'risk_policy_check', 'Success', { policyId: 'POL-RISK-003', contractId, note: 'thresholds sourced from agent-config.service, not inlined' })
  auditStore.record('Risk_Matrix_Evaluator', 'risk_policy_check', temperature <= 0.3 ? 'Success' : 'Blocked', { policyId: 'POL-RISK-004', contractId, temperature })
  auditStore.record('Risk_Matrix_Evaluator', 'risk_run_started', 'Success', { contractId, model: MODEL, maxTokens, temperature })

  let parsed: { risks: unknown; risk_matrix: unknown; risk_detection_confidence: unknown }
  try {
    parsed = await callJsonLLM({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: JSON.stringify(extractorOutput),
      temperature,
      maxTokens,
    })
  } catch (err) {
    const durationMs = Date.now() - startMs
    const message = err instanceof Error ? err.message : String(err)
    auditStore.record('Risk_Matrix_Evaluator', 'risk_run_completed', 'Blocked', { contractId, outcome: 'failure', durationMs, error: message })
    recordTrace({ stage: 'risk_evaluator', outcome: 'failure', value: durationMs, segment: 'all_contracts', confidence: 0, data: { contract_id: contractId, model: MODEL } })
    throw new Error(`Node 4 Risk Evaluator failed via OpenRouter (${MODEL}): ${message}`)
  }

  const risk_matrix = coerceRiskMatrix(parsed.risk_matrix)
  const risks = coerceRisks(parsed.risks, contractId)
  const scoresInRange = [risk_matrix.commercial, risk_matrix.legal, risk_matrix.operational, risk_matrix.compliance, risk_matrix.overall_score].every((s) => s >= 0 && s <= 10)
  auditStore.record('Risk_Matrix_Evaluator', 'risk_policy_check', scoresInRange ? 'Success' : 'Blocked', { policyId: 'POL-RISK-001', contractId, risk_matrix })
  const severitiesValid = risks.every((r) => VALID_SEVERITIES.includes(r.severity))
  auditStore.record('Risk_Matrix_Evaluator', 'risk_policy_check', severitiesValid ? 'Success' : 'Blocked', { policyId: 'POL-RISK-002', contractId, risksFound: risks.length })

  const riskOutput: RiskOutput = {
    risks,
    risk_matrix,
    confidence: {
      extraction: computeExtractionConfidence(extractorOutput),
      clause_identification: computeClauseConfidence(extractorOutput),
      risk_detection: clampUnit(parsed.risk_detection_confidence, 0.7),
    },
  }

  const durationMs = Date.now() - startMs
  const highSeverityCount = risks.filter((r) => r.severity === 'high').length
  auditStore.record('Risk_Matrix_Evaluator', 'risk_run_completed', 'Success', { contractId, durationMs, risksFound: risks.length, highSeverityCount, overallScore: risk_matrix.overall_score })
  recordTrace({ stage: 'risk_evaluator', outcome: 'success', value: durationMs, segment: 'all_contracts', confidence: riskOutput.confidence.risk_detection, data: { contract_id: contractId, model: MODEL } })

  const node: NodeOutput = {
    nodeId: 'node-4',
    stepId: 'Risk_Matrix_Evaluator',
    label: 'Risk Matrix Evaluator',
    status: 'done',
    output: `Identified ${risks.length} risk(s) (${highSeverityCount} high severity); overall risk score ${risk_matrix.overall_score}/10`,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs,
  }

  return { node, riskOutput }
}
