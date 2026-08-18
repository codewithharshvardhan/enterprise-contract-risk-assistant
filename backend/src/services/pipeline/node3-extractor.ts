import { callJsonLLM, MODEL } from '../openai'
import { agentConfigService } from '../agent-config.service'
import { recordTrace } from '../trace-store'
import * as auditStore from '../governance-audit-store'
import { CLAUSE_CATEGORIES, NOT_FOUND } from '../../types/contract'
import type { ClauseFinding, ContractMetadata, NodeOutput, Obligation } from '../../types/contract'

const MIN_INPUT_CHARS = 50

export interface ExtractorOutput {
  metadata: ContractMetadata
  clauses: ClauseFinding[]
  obligations: Obligation[]
  absence_flags: string[]
}

const METADATA_FIELDS: (keyof ContractMetadata)[] = [
  'title', 'agreement_type', 'parties', 'effective_date', 'expiration_date', 'renewal_date', 'duration',
  'governing_law', 'jurisdiction', 'payment_terms', 'payment_schedule', 'currency', 'contract_value',
  'notice_period', 'termination_conditions', 'renewal_conditions', 'confidentiality_requirements',
  'ip_ownership', 'deliverables', 'service_levels',
]

const SYSTEM_PROMPT = `You are an enterprise contract extraction agent. Read the contract text and extract structured information. Respond with ONLY a single JSON object (no markdown fences, no commentary) matching exactly this shape:

{
  "metadata": {
    "title": string, "agreement_type": string, "parties": string[], "effective_date": string,
    "expiration_date": string, "renewal_date": string, "duration": string, "governing_law": string,
    "jurisdiction": string, "payment_terms": string, "payment_schedule": string, "currency": string,
    "contract_value": string, "notice_period": string, "termination_conditions": string,
    "renewal_conditions": string, "confidentiality_requirements": string, "ip_ownership": string,
    "deliverables": string, "service_levels": string
  },
  "clauses": [ { "category": string, "present": boolean, "excerpt": string } ],
  "obligations": [ { "party": string, "category": "payment"|"delivery"|"reporting"|"notification"|"compliance"|"renewal"|"other", "description": string } ],
  "absence_flags": string[]
}

Rules:
- For every metadata field you cannot find in the text, use exactly the string "${NOT_FOUND}" — never omit a key, never invent facts not supported by the text.
- "clauses" MUST contain exactly one entry for each of these ${CLAUSE_CATEGORIES.length} categories, in this order: ${CLAUSE_CATEGORIES.join(', ')}. Set "present": true only if the contract actually contains language for that clause; "excerpt" is a short (<200 char) quote or paraphrase when present, empty string when absent.
- "obligations" should list concrete duties for each party mentioned in the contract (e.g. "Client shall pay invoices within 30 days" -> party: Client, category: payment).
- "absence_flags" should list important standard clauses or information that are missing and could expose the organization to risk (e.g. "No dispute resolution clause found", "No governing law specified").
- Preserve document context — do not hallucinate parties, dates, or amounts that are not in the text.`

function coerceMetadata(raw: unknown): ContractMetadata {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const metadata = {} as ContractMetadata
  for (const field of METADATA_FIELDS) {
    const val = obj[field]
    if (field === 'parties') {
      metadata.parties = Array.isArray(val) ? val.filter((p): p is string => typeof p === 'string') : []
    } else {
      ;(metadata as unknown as Record<string, unknown>)[field] = typeof val === 'string' && val.trim() ? val : NOT_FOUND
    }
  }
  return metadata
}

function coerceClauses(raw: unknown): ClauseFinding[] {
  const arr = Array.isArray(raw) ? raw : []
  const byCategory = new Map<string, ClauseFinding>()
  for (const entry of arr) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const category = typeof e['category'] === 'string' ? e['category'] : ''
    if (!category) continue
    byCategory.set(category, {
      category,
      present: Boolean(e['present']),
      excerpt: typeof e['excerpt'] === 'string' ? e['excerpt'].slice(0, 400) : undefined,
    })
  }
  // Guarantee every canonical category is represented even if the model dropped one.
  return CLAUSE_CATEGORIES.map((category) => byCategory.get(category) ?? { category, present: false, excerpt: '' })
}

function coerceObligations(raw: unknown): Obligation[] {
  const arr = Array.isArray(raw) ? raw : []
  const validCategories = new Set(['payment', 'delivery', 'reporting', 'notification', 'compliance', 'renewal', 'other'])
  return arr
    .filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === 'object')
    .map((o) => ({
      party: typeof o['party'] === 'string' ? o['party'] : 'Unspecified',
      category: (validCategories.has(o['category'] as string) ? o['category'] : 'other') as Obligation['category'],
      description: typeof o['description'] === 'string' ? o['description'] : '',
    }))
    .filter((o) => o.description.trim().length > 0)
}

export async function runNode3Extractor(formattedText: string, contractId: string): Promise<{ node: NodeOutput; extractorOutput: ExtractorOutput }> {
  const startedAt = new Date().toISOString()
  const startMs = Date.now()

  const safeText = typeof formattedText === 'string' ? formattedText.trim() : ''
  const maxTokens = (agentConfigService.getValue('extractor', 'max_tokens', 7000) as number) || 7000
  const temperature = (agentConfigService.getValue('extractor', 'temperature', 0.1) as number) ?? 0.1
  const minInputChars = (agentConfigService.getValue('extractor', 'min_input_chars', MIN_INPUT_CHARS) as number) || MIN_INPUT_CHARS

  if (safeText.length < minInputChars) {
    auditStore.record('Extractor_and_Absence_Agent', 'extractor_policy_check', 'Blocked', { policyId: 'POL-EXT-001', contractId, inputLength: safeText.length, threshold: minInputChars })
    throw new Error(`POL-EXT-001: Contract text too short (${safeText.length} chars). Minimum required is ${minInputChars}.`)
  }
  auditStore.record('Extractor_and_Absence_Agent', 'extractor_policy_check', 'Success', { policyId: 'POL-EXT-001', contractId, inputLength: safeText.length })

  auditStore.record('Extractor_and_Absence_Agent', 'extractor_run_started', 'Success', { contractId, inputCharCount: safeText.length, model: MODEL, maxTokens, temperature })
  auditStore.record('Extractor_and_Absence_Agent', 'extractor_policy_check', 'Success', { policyId: 'POL-EXT-002', contractId, temperature })
  auditStore.record('Extractor_and_Absence_Agent', 'extractor_policy_check', 'Success', { policyId: 'POL-EXT-003', contractId, maxTokens })

  let parsed: { metadata: unknown; clauses: unknown; obligations: unknown; absence_flags: unknown }
  try {
    parsed = await callJsonLLM({ systemPrompt: SYSTEM_PROMPT, userPrompt: safeText, temperature, maxTokens })
  } catch (err) {
    const durationMs = Date.now() - startMs
    const message = err instanceof Error ? err.message : String(err)
    auditStore.record('Extractor_and_Absence_Agent', 'extractor_run_completed', 'Blocked', { contractId, outcome: 'failure', durationMs, error: message })
    recordTrace({ stage: 'extractor', outcome: 'failure', value: durationMs, segment: 'all_contracts', confidence: 0, data: { contract_id: contractId, model: MODEL } })
    throw new Error(`Node 3 Extractor failed via OpenRouter (${MODEL}): ${message}`)
  }

  const extractorOutput: ExtractorOutput = {
    metadata: coerceMetadata(parsed.metadata),
    clauses: coerceClauses(parsed.clauses),
    obligations: coerceObligations(parsed.obligations),
    absence_flags: Array.isArray(parsed.absence_flags) ? parsed.absence_flags.filter((f): f is string => typeof f === 'string') : [],
  }

  const durationMs = Date.now() - startMs
  const presentCount = extractorOutput.clauses.filter((c) => c.present).length
  const clauseFillRatio = Math.round((presentCount / CLAUSE_CATEGORIES.length) * 100) / 100

  auditStore.record('Extractor_and_Absence_Agent', 'extractor_run_completed', 'Success', {
    contractId, durationMs, clausesFound: presentCount, obligationsFound: extractorOutput.obligations.length, absenceFlags: extractorOutput.absence_flags.length,
  })
  recordTrace({ stage: 'extractor', outcome: 'success', value: durationMs, segment: 'all_contracts', confidence: clauseFillRatio, data: { contract_id: contractId, model: MODEL } })

  const node: NodeOutput = {
    nodeId: 'node-3',
    stepId: 'Extractor_and_Absence_Agent',
    label: 'Extractor & Absence Agent',
    status: 'done',
    output: `Extracted ${METADATA_FIELDS.length} metadata fields, ${presentCount}/${CLAUSE_CATEGORIES.length} clauses present, ${extractorOutput.obligations.length} obligations, ${extractorOutput.absence_flags.length} absence flags`,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs,
  }

  return { node, extractorOutput }
}
