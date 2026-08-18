import { store } from '../db/database'
import * as baselinesStore from './baselines-store'
import type { TraceEvent } from '../types/continuous-learning'

// ─── Continuous Learning · Capture — the agent-activity / trace store ─────────
//
// The **agent-side** counterpart of `feedback-store` (which captures *human*
// signals). Call `recordTrace(...)` from every agent decision / pipeline run —
// the model's own output, its confidence, latency, cost, and self-evaluated
// outcome — and the Continuous Learning loop reads it back to measure quality.
//
// Drift is computed from BOTH sources: agent activity (`cl_traces`, here) AND
// human feedback (`cl_feedback`). A metric like "intent accuracy" combines the
// agent's self-reported outcome with the human corrections that contradict it.
//
// Writes to the shared application store (`db/database`) under `cl_traces`.
// Empty until the first agent run is recorded.

const COLLECTION = 'cl_traces'

// `stage` is required. `outcome` is the agent's self-evaluated result for this
// run; `value` is an optional numeric metric sample (latency_ms, a score, cost…).
export interface TraceInput {
  stage: string
  kind?: string
  segment?: string
  baseline_id?: number | null
  outcome?: 'success' | 'failure' | 'neutral' | string
  value?: number
  confidence?: number
  pipeline_id?: number
  ts?: string
  data?: Record<string, string | number | boolean>
}

function nowStamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

/** Append one agent-activity trace event. Returns the stored entry. */
export function recordTrace(input: TraceInput): TraceEvent {
  const doc: Record<string, unknown> = {
    ts: input.ts ?? nowStamp(),
    pipeline_id: input.pipeline_id ?? 0,
    stage: input.stage,
    kind: input.kind ?? `${input.stage}_run`,
    segment: input.segment ?? 'global',
    baseline_id:
      input.baseline_id ??
      baselinesStore.deriveBaselineId({ stage: input.stage, segment: input.segment ?? null }),
    outcome: input.outcome ?? 'neutral',
    value: typeof input.value === 'number' ? input.value : null,
    confidence: typeof input.confidence === 'number' ? input.confidence : null,
    ...(input.data ? { data: input.data } : {}),
  }
  return store.insert(COLLECTION, doc) as unknown as TraceEvent
}

/** Agent traces, newest first — feeds the Capture tab's trace counts. */
export function recent(limit = 500): TraceEvent[] {
  return store.list(COLLECTION, { newestFirst: true }).slice(0, limit) as unknown as TraceEvent[]
}

/** All trace rows (oldest first) — the engine reads these for metric resolution. */
export function all(): TraceEvent[] {
  return store.list(COLLECTION) as unknown as TraceEvent[]
}

export function count(): number {
  return store.list(COLLECTION).length
}

/** Count of trace events within the last `hours` (the funnel's `trace_events_7d`). */
export function countSince(hours: number): number {
  const cutoff = Date.now() - hours * 3_600_000
  return (store.list(COLLECTION) as unknown as TraceEvent[]).filter((t) => Date.parse(t.ts) >= cutoff).length
}
