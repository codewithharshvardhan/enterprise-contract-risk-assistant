import { callJsonLLM, MODEL } from '../openai'
import { agentConfigService } from '../agent-config.service'
import { recordTrace } from '../trace-store'
import * as auditStore from '../governance-audit-store'
import { NOT_FOUND, VALID_RECOMMENDATIONS } from '../../types/contract'
import type { ExecutiveSummary, NodeOutput, PipelineResult, Recommendation } from '../../types/contract'
import type { ExtractorOutput } from './node3-extractor'
import type { RiskOutput } from './node4-risk'

const SUMMARY_FIELDS: (keyof ExecutiveSummary)[] = [
  'purpose', 'parties', 'commercial_overview', 'key_dates', 'financial_commitments',
  'major_obligations', 'significant_risks', 'important_clauses', 'recommended_next_steps', 'narrative',
]

const SYSTEM_PROMPT = `You are an enterprise contract executive-summary writer. You receive a JSON object with extracted contract data (metadata, clauses, obligations, absence_flags) and a completed risk analysis (risks, risk_matrix). Write a concise, decision-useful executive summary for a business reviewer who has not read the contract. Respond with ONLY a single JSON object (no markdown fences, no commentary) matching exactly this shape:

{
  "purpose": string,
  "parties": string,
  "commercial_overview": string,
  "key_dates": string,
  "financial_commitments": string,
  "major_obligations": string,
  "significant_risks": string,
  "important_clauses": string,
  "recommended_next_steps": string,
  "narrative": string
}

Rules:
- Every field is 1-3 plain-language sentences grounded ONLY in the provided data — never invent facts.
- "narrative" is a short (4-6 sentence) standalone paragraph a busy executive could read alone and understand the whole contract's shape and risk profile.
- "recommended_next_steps" should be actionable (e.g. "Route to legal for indemnification review before signature") but must NOT restate a formal recommendation code — that is decided separately.
- If a section has nothing notable in the data (e.g. no risks), say so plainly rather than padding.`

function coerceSummary(raw: unknown): ExecutiveSummary {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const summary = {} as ExecutiveSummary
  for (const field of SUMMARY_FIELDS) {
    const val = obj[field]
    summary[field] = typeof val === 'string' && val.trim() ? val.trim() : 'Not available.'
  }
  return summary
}

// The guardrail node — not the LLM — owns the final recommendation so it stays a
// deterministic function of the validated risk data, immune to prompt drift.
function determineRecommendation(extractorOutput: ExtractorOutput, riskOutput: RiskOutput): Recommendation {
  const { risk_matrix, risks } = riskOutput
  const { metadata, absence_flags } = extractorOutput
  const highCount = risks.filter((r) => r.severity === 'high').length

  const criticalMetadataMissing = [
    metadata.parties.length === 0,
    metadata.effective_date === NOT_FOUND,
    metadata.contract_value === NOT_FOUND,
  ].filter(Boolean).length

  if (risk_matrix.overall_score >= 8 || highCount >= 2) return 'HIGH_RISK_IMMEDIATE_REVIEW'
  if (criticalMetadataMissing >= 2) return 'REQUEST_MISSING_INFORMATION'

  const legalCriticalAbsent = absence_flags.some((f) => /governing law|dispute resolution|liability|indemnif/i.test(f))
  if (legalCriticalAbsent || risk_matrix.legal >= 6) return 'LEGAL_REVIEW_REQUIRED'
  if (risk_matrix.commercial >= 6) return 'PROCUREMENT_REVIEW_REQUIRED'
  if (absence_flags.length > 0 || highCount === 1 || risk_matrix.overall_score >= 4) return 'MINOR_REVISIONS_RECOMMENDED'
  return 'READY_FOR_REVIEW'
}

function determineContractStatus(overallScore: number, lowMax: number, moderateMax: number): PipelineResult['contract_status'] {
  if (overallScore <= lowMax) return 'low_risk'
  if (overallScore <= moderateMax) return 'moderate_risk'
  return 'high_risk'
}

export async function runNode5Guardrail(extractorOutput: ExtractorOutput, riskOutput: RiskOutput, contractId: string): Promise<{ node: NodeOutput; result: PipelineResult }> {
  const startedAt = new Date().toISOString()
  const startMs = Date.now()

  const maxTokens = (agentConfigService.getValue('formatter', 'max_tokens', 3000) as number) || 3000
  const temperature = (agentConfigService.getValue('formatter', 'temperature', 0) as number) ?? 0
  const lowMax = (agentConfigService.getValue('formatter', 'low_risk_max_score', 3.0) as number) ?? 3.0
  const moderateMax = (agentConfigService.getValue('formatter', 'moderate_risk_max_score', 6.5) as number) ?? 6.5

  auditStore.record('JSON_Guardrail_Formatter', 'formatter_policy_check', temperature === 0 ? 'Success' : 'Blocked', { policyId: 'POL-FMT-003', contractId, temperature })
  auditStore.record('JSON_Guardrail_Formatter', 'formatter_run_started', 'Success', { contractId, model: MODEL, maxTokens })

  let parsedSummary: unknown
  try {
    parsedSummary = await callJsonLLM({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: JSON.stringify({ ...extractorOutput, risks: riskOutput.risks, risk_matrix: riskOutput.risk_matrix }),
      temperature,
      maxTokens,
    })
    auditStore.record('JSON_Guardrail_Formatter', 'formatter_policy_check', 'Success', { policyId: 'POL-FMT-001', contractId })
  } catch (err) {
    const durationMs = Date.now() - startMs
    const message = err instanceof Error ? err.message : String(err)
    auditStore.record('JSON_Guardrail_Formatter', 'formatter_policy_check', 'Blocked', { policyId: 'POL-FMT-001', contractId, error: message })
    auditStore.record('JSON_Guardrail_Formatter', 'formatter_run_completed', 'Blocked', { contractId, durationMs })
    recordTrace({ stage: 'formatter', outcome: 'failure', value: durationMs, segment: 'json_serialization', confidence: 0, data: { contract_id: contractId, schema_valid: false } })
    throw new Error(`Node 5 JSON Guardrail Formatter failed via OpenRouter (${MODEL}): ${message}`)
  }

  const summary = coerceSummary(parsedSummary)
  const summaryFieldsPresent = SUMMARY_FIELDS.filter((f) => summary[f] !== 'Not available.').length
  const schemaComplete = summaryFieldsPresent === SUMMARY_FIELDS.length
  auditStore.record('JSON_Guardrail_Formatter', 'formatter_policy_check', schemaComplete ? 'Success' : 'Blocked', { policyId: 'POL-FMT-002', contractId, summaryFieldsPresent, totalFields: SUMMARY_FIELDS.length })

  const recommendation = determineRecommendation(extractorOutput, riskOutput)
  const recommendationValid = VALID_RECOMMENDATIONS.includes(recommendation)
  auditStore.record('JSON_Guardrail_Formatter', 'formatter_policy_check', recommendationValid ? 'Success' : 'Blocked', { policyId: 'POL-FMT-004', contractId, recommendation })

  const contract_status = determineContractStatus(riskOutput.risk_matrix.overall_score, lowMax, moderateMax)

  const confidenceSummary = Math.round((summaryFieldsPresent / SUMMARY_FIELDS.length) * (riskOutput.confidence.extraction * 0.5 + riskOutput.confidence.clause_identification * 0.5) * 100) / 100
  const confidenceOverall = Math.round(
    ((riskOutput.confidence.extraction + riskOutput.confidence.clause_identification + riskOutput.confidence.risk_detection + confidenceSummary) / 4) * 100,
  ) / 100

  const result: PipelineResult = {
    contract_status,
    metadata: extractorOutput.metadata,
    clauses: extractorOutput.clauses,
    obligations: extractorOutput.obligations,
    absence_flags: extractorOutput.absence_flags,
    risks: riskOutput.risks,
    risk_matrix: riskOutput.risk_matrix,
    summary,
    confidence: {
      extraction: riskOutput.confidence.extraction,
      clause_identification: riskOutput.confidence.clause_identification,
      risk_detection: riskOutput.confidence.risk_detection,
      summary: confidenceSummary,
      overall: confidenceOverall,
    },
    recommendation,
  }

  const durationMs = Date.now() - startMs
  auditStore.record('JSON_Guardrail_Formatter', 'formatter_run_completed', 'Success', { contractId, durationMs, outputBytes: JSON.stringify(result).length, recommendation, contract_status })
  recordTrace({ stage: 'formatter', outcome: 'success', value: durationMs, segment: recommendation, confidence: confidenceOverall, data: { contract_id: contractId, schema_valid: true, output_bytes: JSON.stringify(result).length } })

  const node: NodeOutput = {
    nodeId: 'node-5',
    stepId: 'JSON_Guardrail_Formatter',
    label: 'JSON Guardrail Formatter',
    status: 'done',
    output: `Finalized result: ${contract_status}, recommendation ${recommendation}, overall confidence ${confidenceOverall}`,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs,
  }

  return { node, result }
}
