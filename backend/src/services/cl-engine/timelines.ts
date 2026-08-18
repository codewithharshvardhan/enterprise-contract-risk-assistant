import * as feedbackStore from '../feedback-store'
import { agentConfigService } from '../agent-config.service'
import { listDriftAlerts } from './detect'
import type { TimelineEvent } from '../../types/continuous-learning'

// ─── Continuous Learning · drill-through timelines (G11) ─────────────────────
//
// Per-baseline history: every signal, alert, opportunity, experiment, promotion
// and rollback that anchors to a quality target, merged and time-ordered. This
// is what the "View timeline" drill-through renders. Built from the same anchor
// (`baseline_id`) the Capture stores stamp on every signal.

type Source = () => Array<{ baseline_id: number | null | undefined; event: TimelineEvent }>

const sources: Source[] = [
  // Feedback signals
  () =>
    feedbackStore.recent(10_000).map((f) => ({
      baseline_id: f.baseline_id ?? f.derived_baseline_id,
      event: { id: `fb-${f.id}`, ts: f.ts, kind: 'feedback' as const, label: f.kind, detail: f.note || f.subject || f.stage },
    })),
  // Drift alerts
  () =>
    listDriftAlerts().map((a) => ({
      baseline_id: a.baseline_id,
      event: { id: `dr-${a.id}`, ts: a.detected_at, kind: 'drift' as const, label: `${a.metric} ${a.severity}`, detail: a.rca.hypothesis },
    })),
  // Promotions + rollbacks
  () =>
    agentConfigService.getRuntimePromotions().flatMap((p) => {
      const rows: Array<{ baseline_id: number | null | undefined; event: TimelineEvent }> = [
        { baseline_id: p.baseline_id, event: { id: `pr-${p.id}`, ts: p.promoted_at, kind: 'promotion' as const, label: p.candidate, detail: p.promote_note } },
      ]
      if (p.rolled_back_at) {
        rows.push({ baseline_id: p.baseline_id, event: { id: `rb-${p.id}`, ts: p.rolled_back_at, kind: 'rollback' as const, label: 'rollback', detail: p.rolled_back_note || '' } })
      }
      return rows
    }),
]

/** Additional timeline sources (opportunities, experiments) register here. */
export function registerTimelineSource(fn: Source): void {
  sources.push(fn)
}

/** Per-baseline timeline map: `{ [baselineId]: TimelineEvent[] }`, time-ordered. */
export function getTimelines(): Record<number, TimelineEvent[]> {
  const out: Record<number, TimelineEvent[]> = {}
  for (const source of sources) {
    for (const { baseline_id, event } of source()) {
      if (baseline_id == null || baseline_id === 0) continue
      ;(out[baseline_id] ??= []).push(event)
    }
  }
  for (const key of Object.keys(out)) {
    out[Number(key)]!.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
  }
  return out
}
