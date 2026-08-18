import { store } from '../../db/database'
import * as baselinesStore from '../baselines-store'
import { resolveMetric, pctChange, signalsFor } from './metrics'
import { observeSegments, type SegmentObs } from './evaluate'
import { registerStage } from './runtime'
import type { Baseline, DriftAlert } from '../../types/continuous-learning'

// ─── Continuous Learning · Stage 2 (Detect) — drift alerts + RCA ──────────────
//
// When an evaluated target is drifting or breached, raise an explainable
// DriftAlert: a recent-window-vs-baseline-window comparison (median + %Δ +
// distribution), the per-segment **top contributors** (worst-first), and an RCA
// bundle (hypothesis, contributing factors, correlated alerts, example runs).
// Alerts are idempotent by fingerprint `baseline:{metric}:{segment}`; when a
// target returns to healthy its open alert is resolved.
//
// Ported from the reference detector (`monitor.detect_baseline_violations` +
// `_sort_contributors_worst_first`); the math is generic, the signals come from
// the shared Capture stores (feedback + agent traces).

const COLLECTION = 'cl_drift_alerts'
const RECENT_HOURS = 24 * 7 // last 7 days
const BASELINE_FROM = 24 * 37 // 7–37 days ago = baseline window
const BASELINE_UNTIL = 24 * 7

interface StoredAlert extends DriftAlert {
  fingerprint: string
}

function fingerprint(b: Baseline): string {
  return `baseline:${b.metric}:${b.segment}`
}

function openAlerts(): StoredAlert[] {
  return (store.list(COLLECTION, { newestFirst: true }) as unknown as StoredAlert[]).filter((a) => a.status !== 'resolved')
}

function unitOf(b: Baseline): DriftAlert['metric_unit'] {
  return (['rate', 'probability', 'hours', 'raw'] as const).includes(b.unit as DriftAlert['metric_unit'])
    ? (b.unit as DriftAlert['metric_unit'])
    : 'raw'
}

function severityOf(b: Baseline, status: string): DriftAlert['severity'] {
  if (status === 'breached') return b.severity === 'block_promotion' ? 'slo_breach' : 'high'
  if (status === 'drifting') return 'warn'
  return 'medium'
}

function contributors(segs: SegmentObs[], direction: Baseline['direction']): DriftAlert['top_contributors'] {
  const scoped = segs.filter((s) => s.segment !== 'global')
  const worst = (s: SegmentObs): number => (direction === 'min' ? s.value : -s.value)
  return [...scoped]
    .sort((a, b) => worst(a) - worst(b))
    .slice(0, 5)
    .map((s) => ({ segment: s.segment, observed: s.value, status: s.status === 'unknown' ? 'healthy' : s.status, sample_size: s.sample_size }))
}

function buildRca(b: Baseline, recent: number, base: number, deltaPct: number, segs: SegmentObs[]): DriftAlert['rca'] {
  const worst = contributors(segs, b.direction)
  const negatives = signalsFor(b.segment, { sinceHours: RECENT_HOURS }).filter((s) => s.polarity === -1)
  const features =
    b.cause_factors && b.cause_factors.length > 0
      ? b.cause_factors.map((f) => ({ name: f.factor, weight: f.score, direction: '-' as const }))
      : worst.map((c) => ({ name: c.segment, weight: round(Math.abs(c.observed - base)), direction: (c.observed < base ? '-' : '+') as '+' | '-' }))
  const correlated = openAlerts()
    .filter((a) => a.baseline_id === b.id || a.metric === b.metric)
    .map((a) => a.id)
  return {
    top_features: features.slice(0, 5),
    hypothesis: `${b.label || b.metric}${b.segment !== 'global' ? ` (${b.segment})` : ''} moved to ${round(recent)} vs baseline ${round(base)} (${deltaPct >= 0 ? '+' : ''}${round(deltaPct)}%).${worst[0] ? ` Worst contributor: ${worst[0].segment} at ${worst[0].observed}.` : ''}`,
    evidence_count: negatives.length,
    correlated_alert_ids: correlated,
    example_runs: negatives.slice(0, 5).map((s, i) => ({ run_id: `${s.source}#${i + 1}`, outcome: 'negative', note: `${s.stage} signal in ${s.segment}` })),
  }
}

/** Detect drift for every evaluated target; upsert/resolve alerts. Returns open count. */
export function detectDrift(): number {
  const baselines = baselinesStore.listBaselines().filter((b) => b.enabled !== false)
  const live = new Set<string>()

  for (const b of baselines) {
    const status = b.last_status
    if (status !== 'drifting' && status !== 'breached') continue // only alert on out-of-band
    const fp = fingerprint(b)
    live.add(fp)

    const recentObs = resolveMetric(b.metric, b.segment, { sinceHours: RECENT_HOURS })
    const baseObs = resolveMetric(b.metric, b.segment, { sinceHours: BASELINE_FROM, untilHours: BASELINE_UNTIL })
    const recentMedian = round(recentObs.value ?? b.last_observed ?? 0)
    const baselineMedian = round(baseObs.value ?? b.target_value)
    const deltaPct = round(pctChange(recentMedian, baselineMedian))
    const segs = observeSegments(b)
    const severity = severityOf(b, status)
    const breaker = b.severity === 'block_promotion' && status === 'breached'

    const payload: Omit<StoredAlert, 'id'> = {
      fingerprint: fp,
      baseline_id: b.id,
      baseline_label: b.label || b.metric,
      metric: b.metric,
      metric_label: b.label || b.metric,
      metric_unit: unitOf(b),
      worse: b.direction === 'min' ? 'lower' : 'higher',
      segment: b.segment,
      status: 'open',
      severity,
      circuit_breaker_fired: breaker,
      circuit_breaker_message: breaker ? `${b.metric} breached a block_promotion target — auto-promotion paused.` : null,
      recent_median: recentMedian,
      baseline_median: baselineMedian,
      delta_pct: deltaPct,
      recent_n: recentObs.sample_size,
      baseline_n: baseObs.sample_size,
      detected_at: nowStamp(),
      resolved_by: null,
      note: null,
      top_contributors: contributors(segs, b.direction),
      details: { observed: recentMedian, target: b.target_value, drift_pct: b.drift_pct },
      rca: buildRca(b, recentMedian, baselineMedian, deltaPct, segs),
    }

    const existing = openAlerts().find((a) => a.fingerprint === fp)
    if (existing) {
      store.update(COLLECTION, existing.id, { ...payload, status: existing.status, detected_at: existing.detected_at })
    } else {
      store.insert(COLLECTION, payload as unknown as Record<string, unknown>)
    }
  }

  // Resolve alerts whose target is no longer out of band.
  for (const a of openAlerts()) {
    if (!live.has(a.fingerprint)) {
      store.update(COLLECTION, a.id, { status: 'resolved', resolved_by: 'auto', note: 'Target returned to healthy.' })
    }
  }

  return openAlerts().length
}

/** The Detect tab read model (newest first), with internal fields stripped. */
export function listDriftAlerts(): DriftAlert[] {
  return (store.list(COLLECTION, { newestFirst: true }) as unknown as StoredAlert[]).map((a) => {
    const rest = { ...a } as Record<string, unknown>
    delete rest['fingerprint']
    return rest as unknown as DriftAlert
  })
}

export function openAlertCount(): number {
  return openAlerts().length
}

export function totalAlertCount(): number {
  return store.list(COLLECTION).length
}

registerStage((acc) => {
  acc.drift_alerts = detectDrift()
})

function nowStamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000
}
