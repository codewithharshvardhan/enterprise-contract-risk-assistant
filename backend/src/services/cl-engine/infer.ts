import * as baselinesStore from '../baselines-store'
import { allSignals, signalsFor, median, percentile, type SignalRow } from './metrics'

// ─── Continuous Learning · target inference (R1) + cause-factor detection (R3) ─
//
// Quality targets are **never hardcoded**. The qualitative shape of each target
// (metric, segment, direction, severity) comes from the use case (`agents-plan.md`,
// via the agent-planner). The *numbers* come from the data, here:
//
//   • target_value  ← the empirical median of the observed metric (p50)
//   • tolerance     ← the observed spread (p10/p90 inter-decile band)
//   • cause_factors ← the dimensions that most separate good vs bad outcomes
//
// Operators review the inferred values in the admin UI and accept or override
// them — they never type a number into a blank field.

const WINDOW_HOURS = 24 * 30 // 30-day empirical window
const MIN_SAMPLE = 8

export interface TargetSuggestion {
  target_value: number
  drift_pct: number
  sample_size: number
  cause_factors: { factor: string; score: number }[]
}

function isBinary(values: number[]): boolean {
  return values.length > 0 && values.every((v) => v === 0 || v === 1)
}

/** Infer target_value + tolerance for one metric from its observed signals. */
export function inferTarget(metric: string, segment = 'global'): TargetSuggestion | null {
  const rows = allSignals()
  const obs = observedSeries(metric, segment, rows)
  if (obs.length < MIN_SAMPLE) return null

  let target: number
  let driftPct: number
  if (isBinary(obs)) {
    // Rate metric: target = observed rate; band = ±2·binomial std, relative.
    const p = obs.reduce((a, b) => a + b, 0) / obs.length
    const se = Math.sqrt((p * (1 - p)) / obs.length)
    target = round(p, 4)
    driftPct = clamp((p === 0 ? 0 : (2 * se) / p) * 100, 2, 25)
  } else {
    // Numeric metric: target = p50; band = half the inter-decile range, relative.
    const p50 = median(obs)
    const halfIDR = (percentile(obs, 90) - percentile(obs, 10)) / 2
    target = round(p50, 4)
    driftPct = clamp(p50 === 0 ? 5 : (halfIDR / Math.abs(p50)) * 100, 2, 25)
  }
  return { target_value: target, drift_pct: round(driftPct, 1), sample_size: obs.length, cause_factors: inferCauseFactors(metric, rows) }
}

/**
 * Detect which dimensions drive a metric: for each candidate dimension, group the
 * rated signals by value and score by how far apart the per-group outcomes are
 * (range of group means). Higher spread ⇒ stronger cause factor.
 */
export function inferCauseFactors(metric: string, rows?: SignalRow[]): { factor: string; score: number }[] {
  const sig = signalsFor('global', { sinceHours: WINDOW_HOURS }, rows).filter((s) => s.polarity !== 0)
  if (sig.length < MIN_SAMPLE) return []
  const dims = candidateDimensions()
  const scored: { factor: string; score: number }[] = []
  for (const dim of dims) {
    const groups = new Map<string, number[]>()
    for (const s of sig) {
      const key = dimensionValue(s, dim)
      if (key == null) continue
      let g = groups.get(key)
      if (!g) {
        g = []
        groups.set(key, g)
      }
      g.push(s.polarity === 1 ? 1 : 0)
    }
    const means = [...groups.values()].filter((g) => g.length >= 3).map((g) => g.reduce((a, b) => a + b, 0) / g.length)
    if (means.length < 2) continue
    scored.push({ factor: dim, score: round(Math.max(...means) - Math.min(...means), 3) })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 5)
}

/**
 * Fill inferred numbers + cause factors onto baselines that don't have a target
 * yet (target_value 0). Operator-set targets are never overwritten. Returns the
 * number of baselines updated. This is the runtime half of "targets are inferred".
 */
export function inferBaselines(opts: { force?: boolean } = {}): number {
  let updated = 0
  for (const b of baselinesStore.listBaselines()) {
    if (!opts.force && b.target_value > 0) continue // respect operator-set targets
    const sug = inferTarget(b.metric, b.segment)
    if (!sug) continue
    baselinesStore.updateBaseline(b.id, {
      target_value: sug.target_value,
      drift_pct: sug.drift_pct,
      cause_factors: sug.cause_factors,
      source: b.source || 'inferred_p50',
      updated_by: 'inference',
    })
    updated += 1
  }
  return updated
}

// ─── helpers ─────────────────────────────────────────────────────────────────

// Observed per-item series for a metric: numeric samples if present, else 1/0 polarity.
function observedSeries(metric: string, segment: string, rows: SignalRow[]): number[] {
  void metric // the default series is metric-agnostic; per-metric resolvers refine upstream
  const sig = signalsFor(segment, { sinceHours: WINDOW_HOURS }, rows)
  const numeric = sig.filter((s) => typeof s.value === 'number').map((s) => s.value as number)
  if (numeric.length >= MIN_SAMPLE) return numeric
  return sig.filter((s) => s.polarity !== 0).map((s) => (s.polarity === 1 ? 1 : 0))
}

// The dimensions available to break a metric down by. `segment` is the primary
// breakdown (as in the reference's per-segment contributors); `stage` is secondary.
// Apps with richer telemetry can extend this by registering per-metric resolvers.
function candidateDimensions(): string[] {
  return ['segment', 'stage']
}

function dimensionValue(s: SignalRow, dim: string): string | null {
  if (dim === 'segment') return s.segment
  if (dim === 'stage') return s.stage
  return null
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function round(n: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}
