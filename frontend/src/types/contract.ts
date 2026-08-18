export type NodeStatus = 'idle' | 'running' | 'done' | 'error'

export interface NodeOutput {
  nodeId: string
  stepId: string
  label: string
  status: NodeStatus
  output?: string
  error?: string
  startedAt?: string
  completedAt?: string
  durationMs?: number
}

// ─── Contract information extraction (PRD §6.2) ───────────────────────────────

export interface ContractMetadata {
  title: string
  agreement_type: string
  parties: string[]
  effective_date: string
  expiration_date: string
  renewal_date: string
  duration: string
  governing_law: string
  jurisdiction: string
  payment_terms: string
  payment_schedule: string
  currency: string
  contract_value: string
  notice_period: string
  termination_conditions: string
  renewal_conditions: string
  confidentiality_requirements: string
  ip_ownership: string
  deliverables: string
  service_levels: string
}

export const NOT_FOUND = 'Not specified in contract'

// ─── Clause identification (PRD §6.3) ─────────────────────────────────────────

export const CLAUSE_CATEGORIES = [
  'Confidentiality',
  'Intellectual Property',
  'Limitation of Liability',
  'Indemnification',
  'Termination',
  'Force Majeure',
  'Data Protection',
  'Payment Terms',
  'Warranty',
  'Service Levels',
  'Change Management',
  'Governing Law',
  'Dispute Resolution',
  'Assignment',
  'Insurance Requirements',
] as const

export type ClauseCategory = (typeof CLAUSE_CATEGORIES)[number]

export interface ClauseFinding {
  category: string
  present: boolean
  excerpt?: string
}

// ─── Obligation extraction (PRD §6.4) ─────────────────────────────────────────

export type ObligationCategory =
  | 'payment'
  | 'delivery'
  | 'reporting'
  | 'notification'
  | 'compliance'
  | 'renewal'
  | 'other'

export interface Obligation {
  party: string
  category: ObligationCategory
  description: string
}

// ─── Risk detection & scoring (PRD §6.5 / §6.6) ───────────────────────────────

export type RiskSeverity = 'low' | 'medium' | 'high'

export interface RiskFinding {
  id: string
  category: string
  title: string
  severity: RiskSeverity
  explanation: string
  related_clause?: string
}

export interface RiskMatrix {
  commercial: number
  legal: number
  operational: number
  compliance: number
  overall_score: number
}

// ─── Executive summary (PRD §6.7) ─────────────────────────────────────────────

export interface ExecutiveSummary {
  purpose: string
  parties: string
  commercial_overview: string
  key_dates: string
  financial_commitments: string
  major_obligations: string
  significant_risks: string
  important_clauses: string
  recommended_next_steps: string
  narrative: string
}

// ─── Confidence scoring (PRD §6.8) ────────────────────────────────────────────

export interface ConfidenceScores {
  extraction: number
  clause_identification: number
  risk_detection: number
  summary: number
  overall: number
}

// ─── Recommended next action (PRD §6.9) ───────────────────────────────────────

export type Recommendation =
  | 'READY_FOR_REVIEW'
  | 'MINOR_REVISIONS_RECOMMENDED'
  | 'LEGAL_REVIEW_REQUIRED'
  | 'PROCUREMENT_REVIEW_REQUIRED'
  | 'HIGH_RISK_IMMEDIATE_REVIEW'
  | 'REQUEST_MISSING_INFORMATION'

export const VALID_RECOMMENDATIONS: Recommendation[] = [
  'READY_FOR_REVIEW',
  'MINOR_REVISIONS_RECOMMENDED',
  'LEGAL_REVIEW_REQUIRED',
  'PROCUREMENT_REVIEW_REQUIRED',
  'HIGH_RISK_IMMEDIATE_REVIEW',
  'REQUEST_MISSING_INFORMATION',
]

// ─── Final pipeline output ─────────────────────────────────────────────────────

export interface PipelineResult {
  contract_status: 'low_risk' | 'moderate_risk' | 'high_risk'
  metadata: ContractMetadata
  clauses: ClauseFinding[]
  obligations: Obligation[]
  absence_flags: string[]
  risks: RiskFinding[]
  risk_matrix: RiskMatrix
  summary: ExecutiveSummary
  confidence: ConfidenceScores
  recommendation: Recommendation
}

// ─── Human review (PRD §6.10) ─────────────────────────────────────────────────

export type RiskDecision = 'accepted' | 'rejected'

export interface ReviewComment {
  id: string
  text: string
  author?: string
  ts: string
}

export interface ReviewState {
  contractId: string
  editedMetadata: Partial<ContractMetadata>
  riskDecisions: Record<string, RiskDecision>
  comments: ReviewComment[]
  finalDecision?: 'approved' | 'rejected' | 'needs_revision'
  decidedBy?: string
  decidedAt?: string
}

// ─── Execution record ─────────────────────────────────────────────────────────

export interface ExecutionRecord {
  id: string
  contractId: string
  startedAt: string
  completedAt?: string
  status: 'running' | 'done' | 'error'
  nodes: NodeOutput[]
  result?: PipelineResult
  error?: string
  rawTextExcerpt?: string
  durationMs?: number
  sourceFilename?: string
  textHash?: string
  duplicateOfId?: string
  truncated?: boolean
}
