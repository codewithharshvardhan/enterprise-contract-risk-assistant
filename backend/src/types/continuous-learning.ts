// Continuous Learning — data contract.
//
// These shapes are the contract the /continuous-learning UI reads. Field names
// (and their mixed snake/camel casing) are intentional — the frontend fixtures
// read these exact keys. Tailor the *values* to your app's domain; never rename
// keys. See the `continuous-learning-dashboard` skill for the full wiring guide.

// ─── Stage 0 · Quality targets (baselines) ───────────────────────────────────
export interface SegmentObservation {
  segment: string
  value: number
  observed_at: string
}

export interface Baseline {
  id: number
  metric: string
  label?: string
  segment: string
  direction: 'min' | 'max'
  target_value: number
  drift_pct: number
  severity: 'warn' | 'block_promotion'
  enabled: boolean
  owner: string
  rationale: string
  source: string
  unit: string
  last_observed: number | null
  last_observed_at: string | null
  last_status: 'healthy' | 'drifting' | 'breached' | 'unknown'
  updated_at: string
  updated_by: string
  rollup_strategy: string
  segments_observed: SegmentObservation[]
  // Detected dimensions that most drive this metric (R3 — cause-factor detection).
  // Inferred from data; feeds RCA top-contributors when the target drifts.
  cause_factors?: { factor: string; score: number }[]
}

// ─── Headline rollups (Overview) ─────────────────────────────────────────────
export interface Funnel {
  generated_at: string
  capture: { trace_events_7d: number; feedback_7d: number }
  detect: { drift_alerts_open: number; drift_alerts_total_30d: number; rca_tickets_open: number }
  propose: { opportunities_open: number; opportunities_accepted: number }
  validate: { shadow: number; ready: number; in_ab: number }
  promote: { promoted_30d: number; auto_rolled_back_30d: number; rolled_back_30d: number }
}

export interface Sla {
  target_p90_hours: number
  p50_hours: number | null
  p90_hours: number | null
  met: boolean
  samples: number
}

export interface Dashboard {
  window_days: number
  generated_at: string
  feedback_summary: {
    total: number
    thumbs_up: number
    thumbs_down: number
    edits: number
    ratio_positive: number
    per_stage: Record<string, { thumbs_up: number; thumbs_down: number; edit: number; other: number }>
  }
  throughput_24h: {
    pipelines: number
    by_tier: { tier: string; count: number }[]
    by_status: { status: string; count: number }[]
  }
}

export interface Overview {
  funnel: Funnel
  sla: Sla
  dashboard: Dashboard
}

// ─── Stage 1 · Capture (feedback) ────────────────────────────────────────────
export interface FeedbackEntry {
  id: number
  pipeline_id: number
  stage: string
  kind: string
  baseline_id: number | null
  baseline_label: string | null
  derived_baseline_id: number | null
  ts: string
  csr: string
  subject: string
  intent: string
  note: string
  data?: Record<string, string | number>
}

// ─── Stage 1 · Capture (agent activity / traces) ─────────────────────────────
// The agent-side counterpart of FeedbackEntry: every agent run/decision, with its
// self-evaluated outcome and optional numeric sample. Drift draws on BOTH sources.
export interface TraceEvent {
  id: number
  pipeline_id: number
  stage: string
  kind: string
  segment: string
  baseline_id: number | null
  outcome: string
  value: number | null
  confidence: number | null
  ts: string
  data?: Record<string, string | number | boolean>
}

// ─── Stage 2 · Detect (drift alerts) ─────────────────────────────────────────
export interface DriftAlert {
  id: number
  baseline_id: number
  baseline_label: string
  metric: string
  metric_label: string
  metric_unit: 'rate' | 'probability' | 'hours' | 'raw'
  worse: 'higher' | 'lower'
  segment: string
  status: 'open' | 'in_review' | 'resolved'
  severity: 'high' | 'medium' | 'warn' | 'slo_breach'
  circuit_breaker_fired: boolean
  circuit_breaker_message: string | null
  recent_median: number
  baseline_median: number
  delta_pct: number
  recent_n: number
  baseline_n: number
  detected_at: string
  resolved_by: string | null
  note: string | null
  top_contributors: { segment: string; observed: number; status: 'drifting' | 'breached' | 'healthy'; sample_size: number }[]
  details: Record<string, string | number>
  rca: {
    top_features: { name: string; weight: number; direction: '+' | '-' }[]
    hypothesis: string
    evidence_count: number
    correlated_alert_ids: number[]
    example_runs: { run_id: string; outcome: string; note: string }[]
  }
}

// ─── Stage 3 · Propose (opportunities) ───────────────────────────────────────
export type ChangeType = 'threshold' | 'pattern_list' | 'routing_rule' | 'validation_rule' | 'prompt'

export interface LearningOpportunity {
  id: number
  baseline_id: number | null
  segment: string
  status: 'open' | 'accepted' | 'deferred' | 'rejected'
  change_type: ChangeType
  kind: 'csr_cluster' | 'drift_remedy' | 'ops_review'
  support: number
  scope: string
  origin: string
  lift: string
  effort: string
  title: string
  rationale: string
  evidence: {
    headline: string
    counterfactual: { window_days: number; total_in_window: number; would_change: number; metric_label: string; savings_label: string }
    sample_cases: { pipeline_id: string; subject: string; intent: string; current_outcome: string; proposed_outcome: string; csr_action: string }[]
    observed_pattern: string
  }
  ab_experiment_id: number | null
}

// ─── Stage 4 · Validate (A/B experiments) ────────────────────────────────────
export interface ABExperiment {
  id: number
  baseline_id: number
  candidate: string
  segment: string
  change_type: ChangeType
  promote_status: 'shadow' | 'ready' | 'promoted' | 'retired'
  control_prompt: string
  candidate_prompt: string
  backtest_results: { metric: string; control: number; treatment: number; samples: number }
  accuracy_delta_pct: number | null
  accuracy_delta_ci: string | null
  observed_value: number
  target_value: number
  sample_size: number
  regression_metric: string | null
  regression_delta: number | null
  started_at: string
  days_active: number
  p_value: number
  confidence_level: number
}

// ─── Stage 5 · Promote (live changes / change ledger) ────────────────────────
export interface PromotedExperiment {
  id: number
  baseline_id: number
  baseline_label: string
  candidate: string
  segment: string
  change_type: string
  promote_status: 'promoted' | 'retired'
  promoted_by: string
  promoted_at: string
  promote_note: string
  kb_namespace: string
  kb_key: string
  control_prompt: string
  candidate_prompt: string
  accuracy_delta_pct: number
  accuracy_delta_ci: string
  realised_lift_pct: number | null
  realised_lift_ci: string | null
  realised_lift_at: string | null
  realised_sample_size: number | null
  realised_note: string | null
  auto_rolled_back: boolean
  rolled_back_at: string | null
  rolled_back_by: string | null
  rolled_back_note: string | null
  linked_opportunity_id: number | null
}

// ─── Cross-cutting · drill-through timeline ──────────────────────────────────
export interface TimelineEvent {
  id: string
  ts: string
  kind: 'feedback' | 'drift' | 'opportunity' | 'experiment' | 'promotion' | 'rollback'
  label: string
  detail: string
}

// ─── Loop D · operator-tunable agent config (the KB) ─────────────────────────
// This is what makes the generated app's agents *configurable, not coded*: every
// agent reads its tunable knobs (thresholds, pattern lists, routing rules,
// prompts) from this versioned store via agentConfigService.getValue(). A
// promoted Continuous Learning candidate writes a new version here — never a code
// patch — and rollback restores a prior version within the retention window.
export type AgentConfigValue = number | string | boolean | string[] | Record<string, unknown>

export interface AgentConfig {
  // namespace -> key -> tunable value (e.g. namespaces.business_rules.quantity_tolerance)
  namespaces: Record<string, Record<string, AgentConfigValue>>
}

export interface AgentConfigVersion {
  version: number
  created_at: string
  created_by: string
  note: string
  namespaces: Record<string, Record<string, AgentConfigValue>>
}

export interface PromoteCandidate {
  namespace: string
  key: string
  value: AgentConfigValue
  // gate evidence carried over from the Validate stage
  baseline_id?: number
  candidate?: string
  segment?: string
  change_type?: ChangeType
  delta_pct?: number
  sample_size?: number
  promoted_by?: string
  note?: string
}

export interface PromoteGateResult {
  passed: boolean
  reason: string
  checks: { name: string; passed: boolean; detail: string }[]
}
