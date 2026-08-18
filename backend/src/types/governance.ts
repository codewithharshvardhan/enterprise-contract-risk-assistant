// Governance dashboard fixture shapes. Field names/casing match the data
// exactly (mixed snake_case and camelCase) — the dashboard UI depends on them.

export interface KpiCard {
  label: string
  value: number | string
  sub: string
  accent?: boolean
}

export interface PolicyDecision {
  label: string
  value: number
  color: string
}

export interface BreachAlert {
  severity: string
  kind: string
  message: string
}

export interface FunnelStage {
  stage: string
  count: number
  deny: number
}

export interface RecentEvent {
  time: string
  text: string
}

export interface Overview {
  kpis: KpiCard[]
  policy_decisions: PolicyDecision[]
  breach_alerts: BreachAlert[]
  pipeline_funnel: FunnelStage[]
  recent: RecentEvent[]
}

export interface AuditRow {
  idx: number
  time: string
  agent: string
  event: string
  outcome: string
  chain: string
}

export interface AuditDetail {
  agentDid: string
  runId: string
  policyDecision: 'allow' | 'deny' | 'audit'
  prevHash: string
  entryHash: string
  rawAction: string
  contextSnapshot: Record<string, unknown>
}

export interface AuditResponse {
  rows: AuditRow[]
  details: Record<number, AuditDetail>
}

export interface Agent {
  id: string
  name: string
  ring: number
  trustTier: string
  trustScore: number
  allowed: number
  denied: number
  tools: string[]
}

export interface Pipeline {
  pipelineId: string
  pipelineName: string
  root: { label: string; did: string }
  agents: Agent[]
}

export interface FleetResponse {
  pipelines: Pipeline[]
  allTenantTools: string[]
}

export interface PolicyRule {
  id: string
  label: string
  scope: string
  action: string
  priority: number
  stages: string[]
  fires: number
  owasp: string
}

export interface BlockedPatternCategory {
  id: string
  label: string
  patterns: number
  fires: number
}

export interface BlockedPatterns {
  kpis: {
    total_patterns: number
    total_blocks: number
    most_active_category: string
    most_active_count: number
    categories_count: number
  }
  categories: BlockedPatternCategory[]
}

export interface ConfidenceGate {
  stage: string
  gate: string
  action: string
}

export interface PoliciesResponse {
  rules: PolicyRule[]
  blockedPatterns: BlockedPatterns
  confidenceGates: ConfidenceGate[]
}

export interface ComplianceControl {
  id: string
  name: string
  grade: string
  severity: string
  evidence: number
  rules: number
}

export interface ComplianceAttentionItem {
  id: string
  name: string
  grade: string
  severity: string
}

export interface Compliance {
  coverage_pct: number
  controls: ComplianceControl[]
  needs_attention: ComplianceAttentionItem[]
}

export interface SloStage {
  stage: string
  target_p95_ms: number
  observed_p95_ms: number
  status: string
}

export interface Slo {
  stages: SloStage[]
  error_budget: { remaining_pct: number; burn_rate: string; window: string }
  trend_24h: number[]
}
