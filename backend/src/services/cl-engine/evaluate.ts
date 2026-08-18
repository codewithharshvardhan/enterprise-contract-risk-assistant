import * as baselinesStore from '../baselines-store'
import { resolveMetric, rollup, allSignals } from './metrics'
import type { Baseline, SegmentObservation } from '../../types/continuous-learning'

// ─── Continuous Learning · Stage 2 (Detect) — baseline evaluation ─────────────
//
// Measures each quality target against live activity and writes back
// `last_observed / last_observed_at / last_status` + the per-segment breakdown
// (`segments_observed`). This is what turns a target from `unknown` into
// healthy / drifting / breached, and what arms the circuit breaker when a
// `block_promotion` target breaches.
//
// The status bands are the reference's `evaluate_status`: a metric is healthy on
// the correct side of target, drifting within the tolerance band, breached past it.

export const RECENT_WINDOW_HOURS = 24 * 30 // observe the trailing 30 days

export type BaselineStatus = 'healthy' | 'drifting' | 'breached' | 'unknown'

/** Classify an observed value against a target's direction + tolerance band. */
export function evaluateStatus(b: Pick<Baseline, 'direction' | 'target_value' | 'drift_pct'>, observed: number | null): BaselineStatus {
  if (observed == null) return 'unknown'
  const target = b.target_value || 0
  if (target === 0) return 'unknown'
  const drift = (b.drift_pct || 0) / 100
  if (b.direction === 'min') {
    // observed should stay >= target
    if (observed >= target) return 'healthy'
    if (observed >= target * (1 - drift)) return 'drifting'
    return 'breached'
  }
  // direction === 'max' — observed should stay <= target
  if (observed <= target) return 'healthy'
  if (observed <= target * (1 + drift)) return 'drifting'
  return 'breached'
}

export interface SegmentObs {
  segment: string
  value: number
  sample_size: number
  status: BaselineStatus
}

/** The segments to break a target down by: its own segment, or all observed ones. */
export function segmentList(b: Baseline): string[] {
  if (b.segment && b.segment !== 'global') return [b.segment]
  const segs = new Set<string>()
  for (const s of allSignals()) segs.add(s.segment)
  segs.delete('global')
  return segs.size > 0 ? [...segs] : ['global']
}

/** Per-segment observations for a target over a window (feeds rollup + RCA). */
export function observeSegments(b: Baseline, sinceHours = RECENT_WINDOW_HOURS): SegmentObs[] {
  const out: SegmentObs[] = []
  for (const seg of segmentList(b)) {
    const o = resolveMetric(b.metric, seg, { sinceHours })
    if (o.value == null || o.sample_size === 0) continue
    out.push({ segment: seg, value: round(o.value), sample_size: o.sample_size, status: evaluateStatus(b, o.value) })
  }
  return out
}

/** Concept-level observed value for a target: rollup over its segments. */
export function observeBaseline(b: Baseline, sinceHours = RECENT_WINDOW_HOURS): { value: number | null; segments: SegmentObs[] } {
  const segments = observeSegments(b, sinceHours)
  let value: number | null
  if (b.segment && b.segment !== 'global') {
    value = segments[0]?.value ?? resolveMetric(b.metric, b.segment, { sinceHours }).value
  } else if (segments.length > 0) {
    value = rollup(segments.map((s) => ({ value: s.value, weight: s.sample_size })), b.rollup_strategy)
  } else {
    value = resolveMetric(b.metric, 'global', { sinceHours }).value
  }
  return { value: value == null ? null : round(value), segments }
}

/** Evaluate one baseline and persist the observation. Returns the new status. */
export function evaluateBaseline(b: Baseline): BaselineStatus {
  const { value, segments } = observeBaseline(b)
  const status = evaluateStatus(b, value)
  const segments_observed: SegmentObservation[] = segments.map((s) => ({
    segment: s.segment,
    value: s.value,
    observed_at: nowStamp(),
  }))
  baselinesStore.updateBaseline(b.id, {
    last_observed: value,
    last_observed_at: value == null ? null : nowStamp(),
    last_status: status,
    segments_observed,
  })
  return status
}

/** Evaluate every enabled baseline. Returns counts (and arms the breaker on breach). */
export function evaluateBaselines(): { evaluated: number; breaches: number } {
  let evaluated = 0
  let breaches = 0
  for (const b of baselinesStore.listBaselines()) {
    if (b.enabled === false) continue
    const status = evaluateBaseline(b)
    evaluated += 1
    if (status === 'breached') breaches += 1
  }
  return { evaluated, breaches }
}

function nowStamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000
}
