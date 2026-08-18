import * as feedbackStore from '../feedback-store'
import * as traceStore from '../trace-store'
import type { FeedbackEntry, TraceEvent } from '../../types/continuous-learning'

// ─── Continuous Learning · metric resolution (the ONE domain seam) + stats ────
//
// Everything downstream (evaluate, detect, propose, validate, sla) runs off two
// things: (1) the **metric resolvers** here, and (2) the shared Capture stores.
// A resolver turns "(metric, segment, time window)" into an observed value +
// sample — computed from BOTH agent activity (`cl_traces`) AND human feedback
// (`cl_feedback`).
//
// The template ships a **working default resolver** so feedback/trace-derived
// targets evaluate out of the box. For app-specific metrics, the generating
// agent registers one resolver per quality target (per `agents-plan.md`):
//
//   registerResolver('intent_accuracy', (segment, { sinceHours }) => ({ value, sample_size, values }))
//
// Nothing else in the engine is domain-specific.

// A normalized signal row — feedback and traces collapsed into one shape.
export interface SignalRow {
  ts: string
  ms: number
  stage: string
  segment: string
  baseline_id: number | null
  polarity: 1 | 0 | -1 // success / neutral / correction-or-failure
  value: number | null // numeric metric sample, when the signal carries one
  source: 'feedback' | 'trace'
}

export interface Observation {
  value: number | null // rolled-up observed value for the window (null = no data)
  sample_size: number
  values: number[] // per-item series (numeric samples, or 1/0 polarity) for distribution math
}

export interface ResolveOpts {
  sinceHours?: number // include signals newer than now - sinceHours (default: all)
  untilHours?: number // exclude signals newer than now - untilHours (for baseline windows)
}

export type MetricResolver = (segment: string, opts: ResolveOpts) => Observation

const POSITIVE = ['success', 'ok', 'correct', 'pass', 'approve', 'accept', 'up', 'thumbs_up', 'resolved', 'match', 'helpful']
const NEGATIVE = ['failure', 'fail', 'error', 'incorrect', 'reject', 'down', 'thumbs_down', 'edit', 'revise', 'miss', 'mismatch', 'escalate', 'unhelpful']

function classify(s: string): 1 | 0 | -1 {
  const k = s.toLowerCase()
  if (NEGATIVE.some((t) => k.includes(t))) return -1
  if (POSITIVE.some((t) => k.includes(t))) return 1
  return 0
}

function numericFrom(data: Record<string, string | number | boolean> | undefined, explicit: number | null): number | null {
  if (typeof explicit === 'number') return explicit
  if (!data) return null
  for (const key of ['value', 'score', 'latency_ms', 'cost_usd', 'metric']) {
    const v = data[key]
    if (typeof v === 'number') return v
  }
  return null
}

/** All Capture signals (feedback + traces) as one normalized, time-sorted series. */
export function allSignals(): SignalRow[] {
  const fb = (feedbackStore.recent(10_000) as FeedbackEntry[]).map<SignalRow>((r) => ({
    ts: r.ts,
    ms: Date.parse(r.ts),
    stage: r.stage,
    segment: (r.data?.['segment'] as string) ?? 'global',
    baseline_id: r.baseline_id,
    polarity: classify(r.kind),
    value: numericFrom(r.data, null),
    source: 'feedback',
  }))
  const tr = (traceStore.recent(10_000) as TraceEvent[]).map<SignalRow>((r) => ({
    ts: r.ts,
    ms: Date.parse(r.ts),
    stage: r.stage,
    segment: r.segment ?? 'global',
    baseline_id: r.baseline_id,
    polarity: classify(`${r.outcome} ${r.kind}`),
    value: numericFrom(r.data, r.value),
    source: 'trace',
  }))
  return [...fb, ...tr].sort((a, b) => a.ms - b.ms)
}

/** Signals for one segment within an optional time window. `global` matches all segments. */
export function signalsFor(segment: string, opts: ResolveOpts = {}, rows?: SignalRow[]): SignalRow[] {
  const now = Date.now()
  const lo = opts.sinceHours != null ? now - opts.sinceHours * 3_600_000 : -Infinity
  const hi = opts.untilHours != null ? now - opts.untilHours * 3_600_000 : Infinity
  return (rows ?? allSignals()).filter(
    (r) => (segment === 'global' || r.segment === segment) && r.ms >= lo && r.ms <= hi,
  )
}

/**
 * Default resolver — observed value for a (metric, segment, window) over BOTH
 * Capture stores. If the segment's signals carry numeric samples it returns
 * their median; otherwise it returns the positive rate (successes ÷ rated).
 */
export function defaultObservation(segment: string, opts: ResolveOpts = {}, rows?: SignalRow[]): Observation {
  const sig = signalsFor(segment, opts, rows)
  const numeric = sig.filter((s) => typeof s.value === 'number') as (SignalRow & { value: number })[]
  if (numeric.length > 0) {
    const values = numeric.map((s) => s.value)
    return { value: median(values), sample_size: values.length, values }
  }
  const rated = sig.filter((s) => s.polarity !== 0)
  if (rated.length === 0) return { value: null, sample_size: 0, values: [] }
  const values: number[] = rated.map((s) => (s.polarity === 1 ? 1 : 0))
  const pos = values.reduce((a, b) => a + b, 0)
  return { value: pos / values.length, sample_size: values.length, values }
}

const registry: Record<string, MetricResolver> = {}

/** Register a per-metric resolver (the agent does this per quality target). */
export function registerResolver(metric: string, fn: MetricResolver): void {
  registry[metric] = fn
}

/** Resolve an observed value: a registered resolver if present, else the default. */
export function resolveMetric(metric: string, segment: string, opts: ResolveOpts = {}): Observation {
  const fn = registry[metric]
  return fn ? fn(segment, opts) : defaultObservation(segment, opts)
}

// ─── Stats helpers (generic, domain-free) ────────────────────────────────────

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

export function median(xs: number[]): number {
  return percentile(xs, 50)
}

/** Linear-interpolation percentile, p in 0..100. 0 if empty. */
export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  if (s.length === 1) return s[0] as number
  const idx = (p / 100) * (s.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  const loV = s[lo] as number
  if (lo === hi) return loV
  const hiV = s[hi] as number
  return loV + (hiV - loV) * (idx - lo)
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1))
}

/** Signed percentage change of `recent` vs `base`. 0 when base is 0. */
export function pctChange(recent: number, base: number): number {
  if (base === 0) return recent === 0 ? 0 : 100
  return ((recent - base) / Math.abs(base)) * 100
}

/** Population Stability Index between two numeric series (distribution shift). */
export function psi(recent: number[], base: number[], bins = 10): number {
  if (recent.length < 5 || base.length < 5) return 0
  const lo = Math.min(...base, ...recent)
  const hi = Math.max(...base, ...recent)
  if (hi === lo) return 0
  const width = (hi - lo) / bins
  const dist = (xs: number[]): number[] => {
    const counts = new Array<number>(bins).fill(0)
    for (const x of xs) {
      let b = Math.floor((x - lo) / width)
      if (b < 0) b = 0
      if (b >= bins) b = bins - 1
      counts[b] = (counts[b] as number) + 1
    }
    return counts.map((c) => Math.max(c / xs.length, 1e-6))
  }
  const pr = dist(recent)
  const pb = dist(base)
  let s = 0
  for (let i = 0; i < bins; i++) s += ((pr[i] as number) - (pb[i] as number)) * Math.log((pr[i] as number) / (pb[i] as number))
  return s
}

/** Roll several per-segment observations into one concept-level value. */
export function rollup(obs: { value: number; weight?: number }[], strategy = 'weighted_avg'): number | null {
  if (obs.length === 0) return null
  const values = obs.map((o) => o.value)
  if (strategy === 'max') return Math.max(...values)
  if (strategy === 'min') return Math.min(...values)
  const tw = obs.reduce((s, o) => s + (o.weight ?? 1), 0)
  return tw === 0 ? mean(values) : obs.reduce((s, o) => s + o.value * (o.weight ?? 1), 0) / tw
}
