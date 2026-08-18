import { store } from '../db/database'
import * as baselinesStore from './baselines-store'
import type { Dashboard, FeedbackEntry } from '../types/continuous-learning'

// ─── Continuous Learning · Capture — the feedback/learning store ─────────────
//
// This is the CL counterpart of the governance audit log: call `recordFeedback(...)`
// from every reviewer / HITL action (👍 / 👎 / ✎ / note) and from agent
// self-evaluation, and the Continuous Learning dashboard reads it back live. It
// writes to the **shared application store** (`db/database`) under the `cl_feedback`
// collection — the same store the rest of the app uses — so there is no separate
// Continuous Learning database. Empty until the first signal is recorded.
//
// This is the *Capture* stage; compute Detect / Propose / Validate from these rows
// (+ the audit store) per `agents-plan.md`.

const COLLECTION = 'cl_feedback'

// `stage` + `kind` are required. `kind` is encoded as `<stage>_<signal>`
// (e.g. `decide_thumbs_down`, `extract_edit_and_approve`).
export interface FeedbackInput {
  stage: string
  kind: string
  pipeline_id?: number
  baseline_id?: number | null
  baseline_label?: string | null
  derived_baseline_id?: number | null
  csr?: string
  subject?: string
  intent?: string
  note?: string
  ts?: string
  data?: Record<string, string | number>
}

function nowStamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

/** Append one reviewer / agent feedback signal. Returns the stored entry. */
export function recordFeedback(input: FeedbackInput): FeedbackEntry {
  const explicit = input.baseline_id ?? null
  // Anchor the signal to a quality target so it's grouped on the baseline
  // timeline (G11). Explicit `baseline_id` wins; otherwise we derive one.
  const derived =
    input.derived_baseline_id ??
    (explicit == null
      ? baselinesStore.deriveBaselineId({
          stage: input.stage,
          segment: (input.data?.['segment'] as string) ?? null,
          metric: (input.data?.['metric'] as string) ?? input.intent ?? null,
        })
      : null)
  const anchor = explicit ?? derived
  const doc: Record<string, unknown> = {
    ts: input.ts ?? nowStamp(),
    pipeline_id: input.pipeline_id ?? 0,
    stage: input.stage,
    kind: input.kind,
    baseline_id: explicit,
    baseline_label: input.baseline_label ?? (anchor != null ? baselinesStore.getBaseline(anchor)?.label ?? null : null),
    derived_baseline_id: derived,
    subject: input.subject ?? '',
    intent: input.intent ?? '',
    csr: input.csr ?? '',
    note: input.note ?? '',
    ...(input.data ? { data: input.data } : {}),
  }
  return store.insert(COLLECTION, doc) as unknown as FeedbackEntry
}

/** Captured feedback, newest first — what the Capture tab renders. */
export function recent(limit = 200): FeedbackEntry[] {
  return store.list(COLLECTION, { newestFirst: true }).slice(0, limit) as unknown as FeedbackEntry[]
}

export function count(): number {
  return store.list(COLLECTION).length
}

const EDIT = ['edit', 'revise']
const NEGATIVE = ['thumbs_down', 'reject', 'down']
const POSITIVE = ['thumbs_up', 'approve', 'accept', 'up']

type Bucket = 'thumbs_up' | 'thumbs_down' | 'edit' | 'other'

function bucket(kind: string): Bucket {
  const k = kind.toLowerCase()
  if (EDIT.some((s) => k.includes(s))) return 'edit'
  if (NEGATIVE.some((s) => k.includes(s))) return 'thumbs_down'
  if (POSITIVE.some((s) => k.includes(s))) return 'thumbs_up'
  return 'other'
}

/**
 * Aggregate captured feedback into the `feedback_summary` shape the Overview
 * renders. Zeroed (and empty `per_stage`) when there is no feedback yet.
 */
export function summary(): Dashboard['feedback_summary'] {
  const rows = store.list(COLLECTION) as unknown as FeedbackEntry[]
  const perStage: Record<string, { thumbs_up: number; thumbs_down: number; edit: number; other: number }> = {}
  let up = 0
  let down = 0
  let edits = 0
  for (const r of rows) {
    const b = bucket(r.kind)
    const st = (perStage[r.stage] ??= { thumbs_up: 0, thumbs_down: 0, edit: 0, other: 0 })
    st[b] += 1
    if (b === 'thumbs_up') up += 1
    else if (b === 'thumbs_down') down += 1
    else if (b === 'edit') edits += 1
  }

  const rated = up + down
  return {
    total: rows.length,
    thumbs_up: up,
    thumbs_down: down,
    edits,
    ratio_positive: rated ? Math.round((up / rated) * 100) / 100 : 0,
    per_stage: perStage,
  }
}
