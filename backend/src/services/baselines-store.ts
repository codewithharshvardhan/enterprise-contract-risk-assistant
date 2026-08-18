import { store } from '../db/database'
import type { Baseline } from '../types/continuous-learning'

// ─── Continuous Learning · Quality targets (baselines) ───────────────────────
//
// Quality targets are **not** hardcoded: they are defined per use case, stored in
// the shared application store (`db/database`, `cl_baselines` collection), and the
// operator can add, edit, or remove them at runtime. Starts empty.
//
// A baseline is the unit Continuous Learning measures drift against:
// `(metric, segment, direction, target_value, drift_pct, severity)`.
// `severity = 'block_promotion'` arms the promotion circuit breaker when that target
// is breached. Observed fields (`last_observed`, `last_status`, `segments_observed`)
// stay empty until your Detect stage computes them.

const COLLECTION = 'cl_baselines'

type BaselineDefaults = Omit<Baseline, 'id' | 'metric' | 'updated_at'>

const DEFAULTS: BaselineDefaults = {
  label: '',
  segment: 'global',
  direction: 'max',
  target_value: 0,
  drift_pct: 0,
  severity: 'warn',
  enabled: true,
  owner: '',
  rationale: '',
  source: '',
  unit: 'rate',
  last_observed: null,
  last_observed_at: null,
  last_status: 'unknown',
  updated_by: 'operator',
  rollup_strategy: 'raw',
  segments_observed: [],
}

function nowStamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function withLabel<T extends { label?: string; metric?: string }>(data: T): T {
  if (!data.label) data.label = data.metric ?? ''
  return data
}

export function listBaselines(): Baseline[] {
  return store.list(COLLECTION) as unknown as Baseline[]
}

export function getBaseline(id: number): Baseline | null {
  return store.get(COLLECTION, id) as unknown as Baseline | null
}

/** Add a quality target. Requires at least `metric`. */
export function createBaseline(payload: Record<string, unknown>): Baseline {
  const { id: _id, updated_at: _u, ...rest } = payload
  const data = withLabel({ ...DEFAULTS, ...rest, updated_at: nowStamp() } as Record<string, unknown> & {
    label?: string
    metric?: string
  })
  return store.insert(COLLECTION, data) as unknown as Baseline
}

/** Edit an existing quality target (partial update). */
export function updateBaseline(id: number, payload: Record<string, unknown>): Baseline | null {
  const { id: _id, ...rest } = payload
  const patch = { ...rest, updated_at: nowStamp() }
  const updated = store.update(COLLECTION, id, patch)
  if (!updated) return null
  const label = (updated['label'] as string) || (updated['metric'] as string) || ''
  return store.update(COLLECTION, id, { label }) as unknown as Baseline
}

export function deleteBaseline(id: number): boolean {
  return store.remove(COLLECTION, id)
}

/** Circuit breaker: true while any `block_promotion` quality target is breached. */
export function hasBlockingBreach(): boolean {
  return listBaselines().some((b) => b.severity === 'block_promotion' && b.last_status === 'breached')
}

/**
 * Anchor a captured signal to the quality target it relates to (G11). Tries, in
 * order: an explicit metric (+segment) match, a segment match, then a stage that
 * appears in a target's metric/label. Returns null when nothing matches — the
 * signal stays unanchored rather than guessing. This is what groups feedback by
 * the target it relates to so the per-baseline timeline isn't empty.
 */
export function deriveBaselineId(opts: { stage?: string; segment?: string | null; metric?: string | null }): number | null {
  const baselines = listBaselines()
  if (baselines.length === 0) return null
  const { stage } = opts
  const seg = opts.segment ?? null
  const metric = opts.metric ?? null
  if (metric) {
    const m = baselines.find((b) => b.metric === metric && (!seg || b.segment === seg)) ?? baselines.find((b) => b.metric === metric)
    if (m) return m.id
  }
  if (seg) {
    const s = baselines.find((b) => b.segment === seg)
    if (s) return s.id
  }
  if (stage) {
    const st = baselines.find((b) => b.metric.includes(stage) || (b.label ?? '').includes(stage))
    if (st) return st.id
  }
  return null
}
