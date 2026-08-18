import { agentConfigService } from '../agent-config.service'
import { signalsFor, percentile } from './metrics'
import type { Sla } from '../../types/continuous-learning'

// ─── Continuous Learning · loop health (G12) ─────────────────────────────────
//
// The headline SLA: how long from a signal landing to a remedy shipping. For each
// promotion we measure the latency from the FIRST negative signal on its target/
// segment to the moment it was promoted, then report p50/p90 vs target. Computed
// from real Capture timestamps — never the hardcoded null/met:true it shipped with.
// An unmeasured loop reports `met:false` (not a misleading green).

const TARGET_P90_HOURS = 72

export function computeSla(): Sla {
  const latencies: number[] = []
  for (const p of agentConfigService.getRuntimePromotions()) {
    const promotedMs = Date.parse(p.promoted_at)
    if (Number.isNaN(promotedMs)) continue
    const negatives = signalsFor(p.segment, {}).filter((s) => s.polarity === -1 && s.ms <= promotedMs)
    if (negatives.length === 0) continue
    const firstMs = Math.min(...negatives.map((s) => s.ms))
    const hours = (promotedMs - firstMs) / 3_600_000
    if (hours >= 0) latencies.push(hours)
  }
  const samples = latencies.length
  const p50 = samples ? round(percentile(latencies, 50)) : null
  const p90 = samples ? round(percentile(latencies, 90)) : null
  // An unmeasured loop is NOT healthy by default — it's unknown, reported as not-met.
  const met = samples > 0 && p90 != null ? p90 <= TARGET_P90_HOURS : false
  return { target_p90_hours: TARGET_P90_HOURS, p50_hours: p50, p90_hours: p90, met, samples }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
