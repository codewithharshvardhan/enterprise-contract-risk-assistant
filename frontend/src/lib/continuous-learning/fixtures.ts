// Mock data + canonical types for the Continuous Learning template.
// Mirrors the keysight-salesops-governance/src/pages/Learning.tsx structure:
//   tabs: Overview · Baselines · Capture · Detect · Propose · Validate · Promote
// Adapt API shapes to your backend; UI consumes these constants directly.

// ─── SHARED TYPES ────────────────────────────────────────────────────────────
export type Funnel = {
  generated_at: string;
  capture:  { trace_events_7d: number; feedback_7d: number };
  detect:   { drift_alerts_open: number; drift_alerts_total_30d: number; rca_tickets_open: number };
  propose:  { opportunities_open: number; opportunities_accepted: number };
  validate: { shadow: number; ready: number; in_ab: number };
  promote:  { promoted_30d: number; auto_rolled_back_30d: number; rolled_back_30d: number };
};

export type Sla = {
  target_p90_hours: number;
  p50_hours: number | null;
  p90_hours: number | null;
  met: boolean;
  samples: number;
};

export type Baseline = {
  id: number;
  metric: string;
  label?: string;
  segment: string;
  direction: "min" | "max";
  target_value: number;
  drift_pct: number;
  severity: "warn" | "block_promotion";
  enabled: boolean;
  owner: string;
  rationale: string;
  source: string;
  unit: string;
  last_observed: number | null;
  last_observed_at: string | null;
  last_status: "healthy" | "drifting" | "breached" | "unknown";
  updated_at: string;
  updated_by: string;
  rollup_strategy: string;
  segments_observed: { segment: string; value: number; observed_at: string }[];
  // Optional drift drivers the backend detected for this baseline (e.g.
  // ["segment", "stage"]). Surfaced read-only in the editor — operators see
  // what the detector keyed on but don't edit it by hand.
  cause_factors?: string[];
};

export type DriftAlert = {
  id: number;
  baseline_id: number;
  baseline_label: string;
  metric: string;
  metric_label: string;
  metric_unit: "rate" | "probability" | "hours" | "raw";
  worse: "higher" | "lower";
  segment: string;
  status: "open" | "in_review" | "resolved";
  severity: "high" | "medium" | "warn" | "slo_breach";
  circuit_breaker_fired: boolean;
  circuit_breaker_message: string | null;
  recent_median: number;
  baseline_median: number;
  delta_pct: number;
  recent_n: number;
  baseline_n: number;
  detected_at: string;
  resolved_by: string | null;
  note: string | null;
  top_contributors: { segment: string; observed: number; status: "drifting" | "breached" | "healthy"; sample_size: number }[];
  details: Record<string, string | number>;
  rca: {
    top_features: { name: string; weight: number; direction: "+" | "-" }[];
    hypothesis: string;
    evidence_count: number;
    correlated_alert_ids: number[];
    example_runs: { run_id: string; outcome: string; note: string }[];
  };
};

export type LearningOpportunity = {
  id: number;
  baseline_id: number | null;
  segment: string;
  status: "open" | "accepted" | "deferred" | "rejected";
  change_type: "threshold" | "pattern_list" | "routing_rule" | "validation_rule" | "prompt";
  kind: "csr_cluster" | "drift_remedy" | "ops_review";
  support: number;
  scope: string;
  origin: string;
  lift: string;
  effort: string;
  title: string;
  rationale: string;
  evidence: {
    headline: string;
    counterfactual: { window_days: number; total_in_window: number; would_change: number; metric_label: string; savings_label: string };
    sample_cases: { pipeline_id: string; subject: string; intent: string; current_outcome: string; proposed_outcome: string; csr_action: string }[];
    observed_pattern: string;
  };
  ab_experiment_id: number | null;
};

export type ABExperiment = {
  id: number;
  baseline_id: number;
  candidate: string;
  segment: string;
  change_type: "threshold" | "pattern_list" | "routing_rule" | "validation_rule" | "prompt";
  promote_status: "shadow" | "ready" | "promoted" | "retired";
  control_prompt: string;
  candidate_prompt: string;
  backtest_results: { metric: string; control: number; treatment: number; samples: number };
  accuracy_delta_pct: number | null;
  accuracy_delta_ci: string | null;
  observed_value: number;
  target_value: number;
  sample_size: number;
  regression_metric: string | null;
  regression_delta: number | null;
  started_at: string;
  days_active: number;
  p_value: number;
  confidence_level: number;
};

export type PromotedExperiment = {
  id: number;
  baseline_id: number;
  baseline_label: string;
  candidate: string;
  segment: string;
  change_type: string;
  promote_status: "promoted" | "retired";
  promoted_by: string;
  promoted_at: string;
  promote_note: string;
  kb_namespace: string;
  kb_key: string;
  control_prompt: string;
  candidate_prompt: string;
  accuracy_delta_pct: number;
  accuracy_delta_ci: string;
  realised_lift_pct: number | null;
  realised_lift_ci: string | null;
  realised_lift_at: string | null;
  realised_sample_size: number | null;
  realised_note: string | null;
  auto_rolled_back: boolean;
  rolled_back_at: string | null;
  rolled_back_by: string | null;
  rolled_back_note: string | null;
  linked_opportunity_id: number | null;
};

export type FeedbackEntry = {
  id: number;
  pipeline_id: number;
  stage: string;
  kind: string;          // intake_thumbs_up, edit_and_approve, decide_note, etc.
  baseline_id: number | null;
  baseline_label: string | null;
  derived_baseline_id: number | null;
  ts: string;
  csr: string;
  subject: string;
  intent: string;
  note: string;
  data?: Record<string, string | number>;
};

export type Dashboard = {
  window_days: number;
  generated_at: string;
  feedback_summary: {
    total: number;
    thumbs_up: number;
    thumbs_down: number;
    edits: number;
    ratio_positive: number;
    per_stage: Record<string, { thumbs_up: number; thumbs_down: number; edit: number; other: number }>;
  };
  throughput_24h: {
    pipelines: number;
    by_tier: { tier: string; count: number }[];
    by_status: { status: string; count: number }[];
  };
};

// ─── STAGE LABELS / TONES ────────────────────────────────────────────────────
export const STAGE_LABELS: Record<string, string> = {
  intake:      "Stage 1 · Intake & Classification",
  extract:     "Stage 2 · Data Extraction",
  decide:      "Stage 3 · Decision & Confidence",
  execute:     "Stage 4 · Workflow Execution",
  communicate: "Stage 5 · Communication",
};

export const STAGE_TONE: Record<string, string> = {
  intake:      "bg-blue-50 text-blue-700 border-blue-200",
  extract:     "bg-purple-50 text-purple-700 border-purple-200",
  decide:      "bg-amber-50 text-amber-700 border-amber-200",
  execute:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  communicate: "bg-rose-50 text-rose-700 border-rose-200",
};

// ─── FUNNEL + SLA ────────────────────────────────────────────────────────────
export let funnel: Funnel = {
  generated_at: "",
  capture: { trace_events_7d: 0, feedback_7d: 0 },
  detect: { drift_alerts_open: 0, drift_alerts_total_30d: 0, rca_tickets_open: 0 },
  propose: { opportunities_open: 0, opportunities_accepted: 0 },
  validate: { shadow: 0, ready: 0, in_ab: 0 },
  promote: { promoted_30d: 0, auto_rolled_back_30d: 0, rolled_back_30d: 0 },
};

export let sla: Sla = {
  target_p90_hours: 72,
  p50_hours: null,
  p90_hours: null,
  met: true,
  samples: 0,
};

// ─── OVERVIEW / DASHBOARD ────────────────────────────────────────────────────
export let dashboard: Dashboard = {
  window_days: 30,
  generated_at: "",
  feedback_summary: {
    total: 0,
    thumbs_up: 0,
    thumbs_down: 0,
    edits: 0,
    ratio_positive: 0,
    per_stage: {},
  },
  throughput_24h: { pipelines: 0, by_tier: [], by_status: [] },
};

// ─── BASELINES ───────────────────────────────────────────────────────────────
export let baselines: Baseline[] = [];

// ─── DRIFT ALERTS ────────────────────────────────────────────────────────────
export let driftAlerts: DriftAlert[] = [];

// ─── OPPORTUNITIES (PROPOSE) ─────────────────────────────────────────────────
export let opportunities: LearningOpportunity[] = [];

// ─── A/B EXPERIMENTS ─────────────────────────────────────────────────────────
export let abExperiments: ABExperiment[] = [];

// ─── PROMOTED ────────────────────────────────────────────────────────────────
export let promoted: PromotedExperiment[] = [];

// ─── FEEDBACK STREAM ─────────────────────────────────────────────────────────
export let feedback: FeedbackEntry[] = [];

// ─── DRILL-THROUGH TIMELINE ──────────────────────────────────────────────────
// What "View timeline" surfaces — every event tied to a baseline across all
// five loops, in reverse-chronological order.
export type TimelineEvent = {
  id: string;
  ts: string;
  kind: "feedback" | "drift" | "opportunity" | "experiment" | "promotion" | "rollback";
  label: string;
  detail: string;
};

export let baselineTimelines: Record<number, TimelineEvent[]> = {};

// ─── COLOR MAPS ──────────────────────────────────────────────────────────────
export const baselineStatusTone: Record<"healthy" | "drifting" | "breached" | "unknown", { bg: string; border: string; text: string; bar: string; chip: string }> = {
  healthy:  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  drifting: { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-700",   bar: "bg-amber-500",   chip: "bg-amber-50 text-amber-700 border-amber-200" },
  breached: { bg: "bg-rose-50",    border: "border-rose-200",    text: "text-rose-700",    bar: "bg-rose-500",    chip: "bg-rose-50 text-rose-700 border-rose-200" },
  unknown:  { bg: "bg-slate-50",   border: "border-slate-200",   text: "text-slate-600",   bar: "bg-slate-400",   chip: "bg-slate-50 text-slate-600 border-slate-200" },
};

export const severityTone: Record<string, string> = {
  high:       "bg-rose-50 text-rose-700 border-rose-200",
  slo_breach: "bg-rose-50 text-rose-700 border-rose-200",
  medium:     "bg-amber-50 text-amber-700 border-amber-200",
  warn:       "bg-amber-50 text-amber-700 border-amber-200",
  low:        "bg-blue-50 text-blue-700 border-blue-200",
};

export const promoteStatusTone: Record<string, string> = {
  shadow:   "bg-amber-50 text-amber-700 border-amber-200",
  ready:    "bg-zbrain-50 text-zbrain-700 border-zbrain-200",
  promoted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  retired:  "bg-slate-100 text-slate-600 border-slate-200",
};

export const changeTypeTone: Record<string, string> = {
  threshold:        "bg-blue-50 text-blue-700 border-blue-200",
  pattern_list:     "bg-amber-50 text-amber-700 border-amber-200",
  routing_rule:     "bg-purple-50 text-purple-700 border-purple-200",
  validation_rule:  "bg-rose-50 text-rose-700 border-rose-200",
  prompt:           "bg-emerald-50 text-emerald-700 border-emerald-200",
};

// Classifier mirrors the reference FeedbackLog: any kind ending in `_up`
// counts as positive, `_down` as negative, `_note` as a CSR note, plus the
// canonical `edit_and_approve`. This lets backends emit per-stage kinds
// like `intake_thumbs_up` without us hard-coding a string list.
export function classifyKind(kind: string): { tone: string; bg: string; icon: string; label: string } {
  if (kind.endsWith("_up") || kind === "approve")
    return { tone: "bg-emerald-100 text-emerald-700 border-emerald-200", bg: "text-emerald-700", icon: "👍", label: kind };
  if (kind.endsWith("_down") || kind === "reject")
    return { tone: "bg-rose-100 text-rose-700 border-rose-200", bg: "text-rose-700", icon: "👎", label: kind };
  if (kind === "edit_and_approve")
    return { tone: "bg-amber-100 text-amber-800 border-amber-200", bg: "text-amber-700", icon: "✎", label: kind };
  if (kind.endsWith("_note") || kind === "note")
    return { tone: "bg-zbrain-50 text-zbrain border-zbrain-200", bg: "text-zbrain", icon: "💬", label: kind };
  return { tone: "bg-slate-100 text-slate-700 border-slate-200", bg: "text-slate-700", icon: "•", label: kind };
}

export const timelineKindTone: Record<string, string> = {
  feedback:    "bg-blue-50 text-blue-700 border-blue-200",
  drift:       "bg-rose-50 text-rose-700 border-rose-200",
  opportunity: "bg-purple-50 text-purple-700 border-purple-200",
  experiment:  "bg-amber-50 text-amber-700 border-amber-200",
  promotion:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  rollback:    "bg-slate-100 text-slate-600 border-slate-200",
};

// ─── LIVE HYDRATION ──────────────────────────────────────────────────────────
// The page renders these bundled fixtures instantly (works with no backend),
// then `useContinuousLearning()` fetches `/api/v1/continuous-learning/*` once on
// mount and calls `hydrateCL()` to swap in live data. The data exports above are
// `let` bindings precisely so this in-place reassignment is observed by every
// component on the next render — no prop-drilling through the workspace tree.
export type CLBundle = Partial<{
  funnel: Funnel;
  sla: Sla;
  dashboard: Dashboard;
  baselines: Baseline[];
  driftAlerts: DriftAlert[];
  opportunities: LearningOpportunity[];
  abExperiments: ABExperiment[];
  promoted: PromotedExperiment[];
  feedback: FeedbackEntry[];
  baselineTimelines: Record<number, TimelineEvent[]>;
}>;

export function hydrateCL(b: CLBundle): void {
  if (b.funnel) funnel = b.funnel;
  if (b.sla) sla = b.sla;
  if (b.dashboard) dashboard = b.dashboard;
  if (b.baselines) baselines = b.baselines;
  if (b.driftAlerts) driftAlerts = b.driftAlerts;
  if (b.opportunities) opportunities = b.opportunities;
  if (b.abExperiments) abExperiments = b.abExperiments;
  if (b.promoted) promoted = b.promoted;
  if (b.feedback) feedback = b.feedback;
  if (b.baselineTimelines) baselineTimelines = b.baselineTimelines;
}
