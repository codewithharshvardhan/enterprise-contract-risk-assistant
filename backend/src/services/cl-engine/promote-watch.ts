import { agentConfigService } from '../agent-config.service'
import * as baselinesStore from '../baselines-store'
import { signalsFor } from './metrics'
import { experimentGateInputs, markExperimentPromoted, findExperimentControl } from './validate'
import { registerStage } from './runtime'
import type { PromoteCandidate, PromoteGateResult, AgentConfigVersion, PromotedExperiment } from '../../types/continuous-learning'

// ─── Continuous Learning · Stage 5 (Promote) — binding + watcher ──────────────
//
// G9: the promotion gate is fed by the candidate's REAL backtest record, never by
// caller-supplied numbers. `promoteExperiment` resolves sample_size + effect from
// the experiment and rejects a candidate that hasn't been backtested.
//
// G10: `watchPromotions` measures the realised post-promotion effect from live
// Capture and auto-rolls-back a regression — so a promoted change is watched, not
// trusted forever.

const MIN_REALISED = 5
const REGRESS_PCT = 2
const REALISED_WINDOW_HOURS = 24 * 7

/** Promote a *validated* experiment: gate is bound to its backtest, not the caller (G9). */
export function promoteExperiment(experimentId: number, by?: string, note?: string): { gate: PromoteGateResult; version?: AgentConfigVersion; promotion?: PromotedExperiment } {
  const inp = experimentGateInputs(experimentId)
  if (!inp) return { gate: failGate('no such experiment') }
  if (!inp.ran) return { gate: failGate('candidate has not been backtested — run the backtest first') }
  const candidate: PromoteCandidate = {
    namespace: inp.namespace,
    key: inp.key,
    value: inp.value as PromoteCandidate['value'],
    baseline_id: inp.baseline_id,
    segment: inp.segment,
    delta_pct: inp.delta_pct, // from the real backtest, not the caller
    sample_size: inp.sample_size, // from the real backtest, not the caller
    promoted_by: by ?? 'operator',
    note,
  }
  const result = agentConfigService.promote(candidate, { blockingBreach: baselinesStore.hasBlockingBreach() })
  if (result.gate.passed) markExperimentPromoted(experimentId)
  return result
}

/** Measure realised effect for each live promotion; auto-rollback regressions (G10). */
export function watchPromotions(): number {
  let reconciled = 0
  for (const p of agentConfigService.getRuntimePromotions()) {
    if (p.promote_status !== 'promoted' || p.auto_rolled_back) continue
    const obs = signalsFor(p.segment, { sinceHours: REALISED_WINDOW_HOURS }).filter((s) => s.polarity !== 0)
    if (obs.length < MIN_REALISED) continue // keep watching until there's enough live data
    const observedRate = obs.filter((s) => s.polarity === 1).length / obs.length
    const baseline = p.baseline_id ? baselinesStore.getBaseline(p.baseline_id) : null
    const control = findExperimentControl(p.kb_namespace, p.kb_key, p.segment) ?? baseline?.target_value ?? observedRate
    const realisedLift = round((observedRate - control) * 100)
    const meetsTarget = baseline ? (baseline.direction === 'min' ? observedRate >= baseline.target_value : observedRate <= baseline.target_value) : true
    agentConfigService.updatePromotionRealised(p.id, {
      realised_lift_pct: realisedLift,
      realised_lift_ci: `±${round(100 / Math.sqrt(obs.length))}%`,
      realised_lift_at: nowStamp(),
      realised_sample_size: obs.length,
      realised_note: meetsTarget ? 'Realised effect meets target.' : `Realised below target (${round(observedRate)} vs ${baseline?.target_value}).`,
    })
    reconciled += 1
    const regressed = realisedLift <= -REGRESS_PCT || (!meetsTarget && realisedLift < 0)
    if (regressed) {
      agentConfigService.autoRollbackPromotion(p.id, `Auto-rollback: realised ${realisedLift}% vs control ${round(control)} (observed ${round(observedRate)}).`)
    }
  }
  return reconciled
}

function failGate(reason: string): PromoteGateResult {
  return { passed: false, reason, checks: [{ name: 'validated_experiment', passed: false, detail: reason }] }
}

registerStage((acc) => {
  acc.reconciled = watchPromotions()
})

function nowStamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000
}
