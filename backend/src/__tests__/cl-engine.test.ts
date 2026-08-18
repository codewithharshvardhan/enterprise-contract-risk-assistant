import { describe, it, expect } from 'vitest'
import * as baselinesStore from '../services/baselines-store'
import { recordFeedback } from '../services/feedback-store'
import { recordTrace } from '../services/trace-store'
import { runCycle } from '../services/cl-engine/runtime'
import { evaluateStatus } from '../services/cl-engine/evaluate'
import { listDriftAlerts } from '../services/cl-engine/detect'
import { getTimelines } from '../services/cl-engine/timelines'
import { listOpportunities, validateProposal, decideOpportunity, openOpportunityCount } from '../services/cl-engine/propose'
import { registerCandidateScorer, createExperimentFromOpportunity, backtestExperiment, recordShadow, listExperiments } from '../services/cl-engine/validate'
import { promoteExperiment, watchPromotions } from '../services/cl-engine/promote-watch'
import { agentConfigService } from '../services/agent-config.service'
import { computeSla } from '../services/cl-engine/sla'

// End-to-end checks that the Continuous Learning ENGINE actually produces data
// (not the empty stubs it shipped with). These are the acceptance criteria the
// audit found missing — one per closed-loop stage.

describe('CL engine · G1 baseline evaluation + inference', () => {
  it('infers a target from data and moves a baseline out of "unknown"', () => {
    // A target with NO number — it must be inferred from activity (R1).
    const b = baselinesStore.createBaseline({ metric: 'answer_quality', segment: 'global', direction: 'min', severity: 'warn' })
    expect(b.target_value).toBe(0)
    expect(b.last_status).toBe('unknown')

    // Capture from BOTH sources (R4): human feedback + agent activity traces.
    for (let i = 0; i < 9; i++) recordFeedback({ stage: 'answer', kind: 'answer_thumbs_up' })
    for (let i = 0; i < 3; i++) recordFeedback({ stage: 'answer', kind: 'answer_thumbs_down' })
    for (let i = 0; i < 6; i++) recordTrace({ stage: 'answer', outcome: 'success' })
    for (let i = 0; i < 2; i++) recordTrace({ stage: 'answer', outcome: 'failure' })

    const cycle = runCycle()
    expect(cycle.evaluated).toBeGreaterThanOrEqual(1)

    const after = baselinesStore.getBaseline(b.id)
    expect(after).toBeTruthy()
    expect(after!.target_value).toBeGreaterThan(0) // inferred from data
    expect(after!.last_observed).not.toBeNull() // measured
    expect(after!.last_status).not.toBe('unknown') // healthy / drifting / breached
  })

  it('classifies status with the tolerance bands', () => {
    // min: observed should stay >= target (0.90), 5% band → drifting floor 0.855
    const min = { direction: 'min' as const, target_value: 0.9, drift_pct: 5 }
    expect(evaluateStatus(min, 0.92)).toBe('healthy')
    expect(evaluateStatus(min, 0.88)).toBe('drifting')
    expect(evaluateStatus(min, 0.80)).toBe('breached')
    expect(evaluateStatus(min, null)).toBe('unknown')

    // max: observed should stay <= target (30000), 5% band → drifting ceiling 31500
    const max = { direction: 'max' as const, target_value: 30000, drift_pct: 5 }
    expect(evaluateStatus(max, 25000)).toBe('healthy')
    expect(evaluateStatus(max, 31000)).toBe('drifting')
    expect(evaluateStatus(max, 40000)).toBe('breached')
  })
})

describe('CL engine · G3/G4 drift detection + RCA + circuit breaker', () => {
  it('raises a drift alert with worst-first contributors + RCA when a block_promotion target breaches', () => {
    const b = baselinesStore.createBaseline({
      metric: 'reply_success',
      segment: 'global',
      direction: 'min',
      target_value: 0.99,
      drift_pct: 2,
      severity: 'block_promotion',
    })
    // Two segments, both below target → breach; 'intent:returns' is the worst.
    for (let i = 0; i < 8; i++) recordFeedback({ stage: 'reply', kind: 'reply_thumbs_down', data: { segment: 'intent:returns' } })
    for (let i = 0; i < 2; i++) recordFeedback({ stage: 'reply', kind: 'reply_thumbs_up', data: { segment: 'intent:returns' } })
    for (let i = 0; i < 5; i++) recordTrace({ stage: 'reply', outcome: 'failure', segment: 'intent:orders' })
    for (let i = 0; i < 5; i++) recordTrace({ stage: 'reply', outcome: 'success', segment: 'intent:orders' })

    runCycle()

    expect(baselinesStore.getBaseline(b.id)!.last_status).toBe('breached')
    expect(baselinesStore.hasBlockingBreach()).toBe(true) // breaker armed

    const alert = listDriftAlerts().find((a) => a.baseline_id === b.id)
    expect(alert).toBeTruthy()
    expect(alert!.circuit_breaker_fired).toBe(true)
    expect(alert!.top_contributors.length).toBeGreaterThanOrEqual(2)
    // worst-first: lowest observed value leads (min direction)
    expect(alert!.top_contributors[0]!.observed).toBeLessThanOrEqual(alert!.top_contributors[1]!.observed)
    expect(alert!.rca.hypothesis).toContain('reply_success')
    expect(alert!.rca.example_runs.length).toBeGreaterThan(0)
  })
})

describe('CL engine · G11 signal anchoring + timelines', () => {
  it('anchors feedback to a target and surfaces it on that baseline timeline', () => {
    const b = baselinesStore.createBaseline({ metric: 'intent_accuracy', segment: 'global', direction: 'min' })
    const fb = recordFeedback({ stage: 'classify', kind: 'classify_edit', data: { metric: 'intent_accuracy' } })
    expect(fb.derived_baseline_id).toBe(b.id) // anchored, not null

    const timelines = getTimelines()
    expect(timelines[b.id]).toBeTruthy()
    expect(timelines[b.id]!.some((e) => e.kind === 'feedback' && e.id === `fb-${fb.id}`)).toBe(true)
  })
})

describe('CL engine · G5/G6 opportunity generation + validity gate', () => {
  it('turns a breach into a scored, linked, typed opportunity and validates it', () => {
    const seg = 'svc:billing'
    const b = baselinesStore.createBaseline({ metric: 'po_accuracy', segment: seg, direction: 'min', target_value: 0.95, drift_pct: 2, severity: 'warn' })
    for (let i = 0; i < 8; i++) recordFeedback({ stage: 'extract', kind: 'extract_thumbs_down', data: { segment: seg } })
    for (let i = 0; i < 2; i++) recordFeedback({ stage: 'extract', kind: 'extract_thumbs_up', data: { segment: seg } })

    runCycle()

    const opp = listOpportunities().find((o) => o.baseline_id === b.id && o.kind === 'drift_remedy')
    expect(opp).toBeTruthy()
    expect(opp!.origin).toMatch(/^drift_alert:/) // linked to its cause
    expect(opp!.scope).toContain('.') // maps to a config namespace.key
    expect(['threshold', 'pattern_list', 'routing_rule', 'validation_rule', 'prompt']).toContain(opp!.change_type)

    // pre-test validity gate accepts a sound proposal, rejects a malformed one
    expect(validateProposal(opp!).valid).toBe(true)
    const bad = validateProposal({ change_type: 'bogus' as never, scope: '', support: 0, evidence: opp!.evidence, baseline_id: null })
    expect(bad.valid).toBe(false)
    expect(bad.reasons.length).toBeGreaterThan(0)
  })

  it('does not duplicate opportunities across cycles (dedup by fingerprint)', () => {
    const before = listOpportunities().length
    runCycle()
    runCycle()
    expect(listOpportunities().length).toBe(before) // idempotent
  })

  it('decision persists: accept leaves the open queue, reject is recorded', () => {
    const seg = 'svc:onboarding'
    const b = baselinesStore.createBaseline({ metric: 'kyc_pass', segment: seg, direction: 'min', target_value: 0.95, drift_pct: 2, severity: 'warn' })
    for (let i = 0; i < 6; i++) recordFeedback({ stage: 'verify', kind: 'verify_thumbs_down', data: { segment: seg } })
    runCycle()
    const opp = listOpportunities().find((o) => o.baseline_id === b.id && o.kind === 'drift_remedy')!
    expect(opp.status).toBe('open')

    // reject → persisted status, drops out of the open queue
    const openBefore = openOpportunityCount()
    const rejected = decideOpportunity(opp.id, 'rejected')
    expect(rejected!.status).toBe('rejected')
    expect(listOpportunities().find((o) => o.id === opp.id)!.status).toBe('rejected')
    expect(openOpportunityCount()).toBe(openBefore - 1)

    // accept (the cluster opp) → it becomes an experiment and is no longer 'open'
    const cluster = listOpportunities().find((o) => o.baseline_id === b.id && o.kind === 'csr_cluster' && o.status === 'open')
    if (cluster) {
      createExperimentFromOpportunity(cluster.id, 0.97)
      expect(listOpportunities().find((o) => o.id === cluster.id)!.status).toBe('accepted')
    }
  })
})

describe('CL engine · G7–G10/G12 validate → promote → watch → SLA', () => {
  it('backtests over real data, binds the gate, promotes, measures SLA, then auto-rolls-back a regression', () => {
    // Isolate from earlier block_promotion breaches so the breaker is clear.
    for (const x of baselinesStore.listBaselines()) if (x.severity === 'block_promotion') baselinesStore.deleteBaseline(x.id)

    const seg = 'svc:returns'
    const b = baselinesStore.createBaseline({ metric: 'auto_resolve', segment: seg, direction: 'min', target_value: 0.9, drift_pct: 2, severity: 'warn' })
    // Enough rows to clear the gate's min-sample (200); mostly negative → breach.
    for (let i = 0; i < 150; i++) recordFeedback({ stage: 'resolve', kind: 'resolve_thumbs_down', data: { segment: seg } })
    for (let i = 0; i < 60; i++) recordFeedback({ stage: 'resolve', kind: 'resolve_thumbs_up', data: { segment: seg } })

    runCycle()
    const opp = listOpportunities().find((o) => o.baseline_id === b.id && o.kind === 'drift_remedy')
    expect(opp).toBeTruthy()

    // G7: a registered scorer makes the candidate score rows correct — REAL replay.
    registerCandidateScorer('business_rules', () => true)
    const exp = createExperimentFromOpportunity(opp!.id, 0.95)
    expect(exp!.promote_status).toBe('shadow')
    const bt = backtestExperiment(exp!.id)!
    expect(bt.sample_size).toBeGreaterThanOrEqual(200) // from real captured rows
    expect(Math.abs(bt.accuracy_delta_pct!)).toBeGreaterThanOrEqual(2)
    expect(bt.promote_status).toBe('ready')

    // G8: shadow accrual records live agreement
    recordShadow(exp!.id, false, true)
    expect(listExperiments().some((e) => e.id === exp!.id)).toBe(true)

    // G9: promote binds the gate to the experiment's real numbers (not caller input)
    const before = agentConfigService.getConfig().version
    const promoted = promoteExperiment(exp!.id, 'tester', 'ship it')
    expect(promoted.gate.passed).toBe(true)
    expect(agentConfigService.getConfig().version).toBe(before + 1)
    const promotionId = promoted.promotion!.id

    // G12: a remedy shipped against a signal → SLA has a real sample (not null/0)
    const sla = computeSla()
    expect(sla.samples).toBeGreaterThan(0)
    expect(typeof sla.met).toBe('boolean')

    // G10: regress the segment post-promotion → watcher measures + auto-rolls-back
    for (let i = 0; i < 40; i++) recordFeedback({ stage: 'resolve', kind: 'resolve_thumbs_down', data: { segment: seg } })
    watchPromotions()
    const after = agentConfigService.getRuntimePromotions().find((p) => p.id === promotionId)!
    expect(after.realised_lift_pct).not.toBeNull()
    expect(after.auto_rolled_back).toBe(true)
  })
})
