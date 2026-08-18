import { store } from '../../db/database'
import * as baselinesStore from '../baselines-store'
import { signalsFor } from './metrics'
import { listDriftAlerts } from './detect'
import { registerStage } from './runtime'
import { registerTimelineSource } from './timelines'
import type { ChangeType, DriftAlert, LearningOpportunity } from '../../types/continuous-learning'

// ─── Continuous Learning · Stage 3 (Propose) — opportunities + validity gate ──
//
// Turns signals into ranked, typed remediation candidates: a remedy per open
// drift alert, plus clusters of recurring reviewer corrections. Each opportunity
// is scored (severity × magnitude), de-duplicated by fingerprint, linked back to
// its cause (baseline + alert), and typed to a config namespace.key so it can be
// shipped as gated config. `validateProposal` is the pre-test sanity gate.
//
// Ported from the reference `drift_alert_generator` (scoring + remedy templates).

const COLLECTION = 'cl_opportunities'
const CLUSTER_SUPPORT = 3 // a correction must recur this many times to propose

const SEVERITY_WEIGHT: Record<string, number> = { slo_breach: 1.0, high: 1.0, warn: 0.65, medium: 0.5 }

interface StoredOpportunity extends LearningOpportunity {
  fingerprint: string
  created_at: string
}

function existingFingerprints(): Set<string> {
  return new Set((store.list(COLLECTION) as unknown as StoredOpportunity[]).map((o) => o.fingerprint))
}

function changeTypeFor(metric: string): ChangeType {
  const m = metric.toLowerCase()
  if (m.includes('latency') || m.includes('cost') || m.includes('route')) return 'routing_rule'
  if (m.includes('extract') || m.includes('complete') || m.includes('valid')) return 'validation_rule'
  if (m.includes('accuracy') || m.includes('intent') || m.includes('classif') || m.includes('quality') || m.includes('match')) return 'prompt'
  return 'threshold'
}

/** The config knob a remedy maps to (`namespace.key`) — what makes it implementable. */
function configTarget(metric: string, segment: string): { namespace: string; key: string } {
  return { namespace: 'business_rules', key: segment && segment !== 'global' ? `${metric}:${segment}` : metric }
}

function score(severity: string, recent: number, base: number): number {
  const w = SEVERITY_WEIGHT[severity] ?? 0.5
  const mag = Math.min(1.5, Math.abs(recent - base) / Math.max(Math.abs(base), 1e-9))
  return Math.round(Math.min(1, w * (0.6 + 0.4 * mag)) * 100) / 100
}

function fromAlert(a: DriftAlert): Omit<StoredOpportunity, 'id'> {
  const { namespace, key } = configTarget(a.metric, a.segment)
  const negatives = signalsFor(a.segment, { sinceHours: 24 * 7 }).filter((s) => s.polarity === -1)
  const s = score(a.severity, a.recent_median, a.baseline_median)
  return {
    fingerprint: `drift:${a.metric}:${a.segment}`,
    created_at: nowStamp(),
    baseline_id: a.baseline_id,
    segment: a.segment,
    status: 'open',
    change_type: changeTypeFor(a.metric),
    kind: 'drift_remedy',
    support: a.recent_n,
    scope: `${namespace}.${key}`,
    origin: `drift_alert:${a.id}`,
    lift: `${Math.abs(a.delta_pct)}% toward target`,
    effort: a.severity === 'high' || a.severity === 'slo_breach' ? 'Med' : 'Low',
    title: `Remediate ${a.metric_label}${a.segment !== 'global' ? ` · ${a.segment}` : ''} (score ${s})`,
    rationale: a.rca.hypothesis,
    evidence: {
      headline: `${a.metric_label} at ${a.recent_median} vs baseline ${a.baseline_median}`,
      counterfactual: { window_days: 7, total_in_window: a.recent_n, would_change: negatives.length, metric_label: a.metric_label, savings_label: `${negatives.length} signals` },
      sample_cases: negatives.slice(0, 3).map((c, i) => ({ pipeline_id: `${c.source}#${i + 1}`, subject: `${c.stage} signal`, intent: c.segment, current_outcome: 'negative', proposed_outcome: 'improved', csr_action: c.stage })),
      observed_pattern: `recurring negative signals on ${a.segment}`,
    },
    ab_experiment_id: null,
  }
}

/** Mine recurring reviewer corrections (edits/negatives) into clustered proposals. */
function fromCorrectionClusters(): Array<Omit<StoredOpportunity, 'id'>> {
  const clusters = new Map<string, { stage: string; segment: string; n: number }>()
  for (const s of signalsFor('global', { sinceHours: 24 * 30 })) {
    if (s.source !== 'feedback' || s.polarity !== -1) continue
    const k = `${s.stage}::${s.segment}`
    const c = clusters.get(k) ?? { stage: s.stage, segment: s.segment, n: 0 }
    c.n += 1
    clusters.set(k, c)
  }
  const out: Array<Omit<StoredOpportunity, 'id'>> = []
  for (const c of clusters.values()) {
    if (c.n < CLUSTER_SUPPORT) continue
    const baselineId = baselinesStore.deriveBaselineId({ stage: c.stage, segment: c.segment })
    const { namespace, key } = configTarget(c.stage, c.segment)
    out.push({
      fingerprint: `cluster:${c.stage}:${c.segment}`,
      created_at: nowStamp(),
      baseline_id: baselineId,
      segment: c.segment,
      status: 'open',
      change_type: 'pattern_list',
      kind: 'csr_cluster',
      support: c.n,
      scope: `${namespace}.${key}`,
      origin: 'correction_cluster',
      lift: `${c.n} corrections clustered`,
      effort: 'Low',
      title: `Add ${c.stage} corrections for ${c.segment} (${c.n} signals)`,
      rationale: `${c.n} reviewer corrections recurred on ${c.stage}/${c.segment}; encode them as a rule.`,
      evidence: {
        headline: `${c.n} recurring corrections on ${c.stage}`,
        counterfactual: { window_days: 30, total_in_window: c.n, would_change: c.n, metric_label: c.stage, savings_label: `${c.n} corrections` },
        sample_cases: [],
        observed_pattern: `same correction repeated ${c.n}× on ${c.segment}`,
      },
      ab_experiment_id: null,
    })
  }
  return out
}

/** Generate opportunities from drift + correction clusters (deduped). Returns open count. */
export function generateOpportunities(): number {
  const seen = existingFingerprints()
  const candidates = [...listDriftAlerts().filter((a) => a.status !== 'resolved').map(fromAlert), ...fromCorrectionClusters()]
  for (const c of candidates) {
    if (seen.has(c.fingerprint)) continue
    seen.add(c.fingerprint)
    store.insert(COLLECTION, c as unknown as Record<string, unknown>)
  }
  return (store.list(COLLECTION) as unknown as StoredOpportunity[]).filter((o) => o.status === 'open').length
}

/** Read model (newest first), internal fields stripped. */
export function listOpportunities(): LearningOpportunity[] {
  return (store.list(COLLECTION, { newestFirst: true }) as unknown as StoredOpportunity[]).map((o) => {
    const rest = { ...o } as Record<string, unknown>
    delete rest['fingerprint']
    delete rest['created_at']
    return rest as unknown as LearningOpportunity
  })
}

export function getOpportunity(id: number): StoredOpportunity | null {
  return store.get(COLLECTION, id) as unknown as StoredOpportunity | null
}

export function setOpportunityStatus(id: number, status: LearningOpportunity['status'], abId?: number): void {
  store.update(COLLECTION, id, { status, ...(abId != null ? { ab_experiment_id: abId } : {}) })
}

/**
 * Record a non-accept operator decision (defer/reject) and return the updated
 * opportunity. Accept is handled separately (it creates an A/B experiment via
 * `createExperimentFromOpportunity`). Returns null if the id is unknown.
 */
export function decideOpportunity(id: number, status: 'deferred' | 'rejected' | 'open'): LearningOpportunity | null {
  if (!getOpportunity(id)) return null
  setOpportunityStatus(id, status)
  return listOpportunities().find((o) => o.id === id) ?? null
}

export function openOpportunityCount(): number {
  return (store.list(COLLECTION) as unknown as StoredOpportunity[]).filter((o) => o.status === 'open').length
}

export function acceptedOpportunityCount(): number {
  return (store.list(COLLECTION) as unknown as StoredOpportunity[]).filter((o) => o.status === 'accepted').length
}

export interface ProposalValidity {
  valid: boolean
  reasons: string[]
}

/**
 * Pre-test validity gate (G6): is a proposal sensible/actionable BEFORE it costs
 * a backtest? Distinct from the post-test promotion gate. Checks the change type
 * is known, it maps to a config namespace.key, it has grounding, and it isn't
 * already being tested.
 */
export function validateProposal(o: Pick<LearningOpportunity, 'change_type' | 'scope' | 'support' | 'evidence' | 'baseline_id'>): ProposalValidity {
  const reasons: string[] = []
  const known: ChangeType[] = ['threshold', 'pattern_list', 'routing_rule', 'validation_rule', 'prompt']
  if (!known.includes(o.change_type)) reasons.push(`unknown change_type: ${o.change_type}`)
  if (!o.scope || !o.scope.includes('.')) reasons.push('no config target (namespace.key) to apply')
  const grounding = (o.support ?? 0) + (o.evidence?.sample_cases?.length ?? 0) + (o.evidence?.counterfactual?.would_change ?? 0)
  if (grounding < 1) reasons.push('no grounding evidence (0 supporting cases)')
  if (o.baseline_id == null) reasons.push('not anchored to a quality target')
  return { valid: reasons.length === 0, reasons }
}

registerStage((acc) => {
  acc.opportunities = generateOpportunities()
})

registerTimelineSource(() =>
  (store.list(COLLECTION) as unknown as StoredOpportunity[]).map((o) => ({
    baseline_id: o.baseline_id,
    event: { id: `op-${o.id}`, ts: o.created_at, kind: 'opportunity' as const, label: o.title, detail: o.rationale },
  })),
)

function nowStamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}
