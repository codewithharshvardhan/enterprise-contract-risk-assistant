#!/usr/bin/env tsx
/**
 * Continuous Learning · Stage 4 (Validate) — candidate validator.
 *
 * Replays a candidate config change against the REAL Capture store (recorded
 * feedback + agent traces) via the engine's backtest, then checks the promotion
 * gate (min sample AND min effect). This is the script the CL loop runs BEFORE a
 * change is allowed to promote — and the numbers come from real history, not
 * fabricated constants.
 *
 *   npm run validate:agents
 *   npm run validate:agents -- --demo     # seed a small dataset so it runs standalone
 *
 * Exit 0 = candidate cleared the gate (eligible to promote); exit 1 = it did not
 * (or there is no captured history to validate against). The circuit breaker
 * (a breached block_promotion baseline) is reported as a promote-time precondition.
 *
 * INTEGRATION POINT: register a real candidate scorer with
 * `registerCandidateScorer(namespace, (row, candidate) => boolean)` so the backtest
 * re-scores historical rows with your agent. Without one, the backtest reports ZERO
 * effect (the gate blocks) — honest by default, never invented.
 */
import { GATE } from '../src/services/agent-config.service'
import { continuousLearningService } from '../src/services/continuous-learning.service'
import * as baselinesStore from '../src/services/baselines-store'
import { recordFeedback } from '../src/services/feedback-store'
import { runCycle } from '../src/services/cl-engine/runtime'
import { listOpportunities } from '../src/services/cl-engine/propose'
import { createExperimentFromOpportunity, backtestExperiment, registerCandidateScorer } from '../src/services/cl-engine/validate'

function seedDemo(): void {
  // A small, honest dataset so the harness runs out of the box: a quality target
  // plus real captured signals. NOT shipped into generated apps — demo only.
  const seg = 'demo'
  baselinesStore.createBaseline({ metric: 'demo_accuracy', segment: seg, direction: 'min', target_value: 0.9, drift_pct: 2, severity: 'warn' })
  for (let i = 0; i < 220; i++) {
    const down = i % 5 < 3 // ~60% negative → breached
    recordFeedback({ stage: 'demo', kind: down ? 'demo_thumbs_down' : 'demo_thumbs_up', data: { segment: seg } })
  }
  // A scorer that fixes the negatives — a real (here, illustrative) re-scoring.
  registerCandidateScorer('business_rules', () => true)
}

function main(): void {
  const demo = process.argv.includes('--demo')
  if (demo) seedDemo()

  runCycle() // infer targets → evaluate → detect drift → propose remedies
  const opportunity = listOpportunities().find((o) => o.kind === 'drift_remedy')

  console.log('\nContinuous Learning · candidate validation')
  console.log('─'.repeat(64))

  if (!opportunity) {
    console.log('  No remediation candidate to validate — the Capture store has no')
    console.log('  drift signals yet. Wire recordFeedback(...) / recordTrace(...) into')
    console.log('  the app (or run with --demo) so there is real history to backtest.')
    console.log('─'.repeat(64))
    process.exit(1)
  }

  const exp = createExperimentFromOpportunity(opportunity.id)
  const result = exp ? backtestExperiment(exp.id) : null
  if (!result) {
    console.log('  Could not create/backtest an experiment for the candidate.')
    process.exit(1)
  }

  const delta = result.accuracy_delta_pct ?? 0
  const passed = result.promote_status === 'ready'
  console.log(`  change          ${opportunity.scope} (${opportunity.change_type})`)
  console.log(`  metric (control)   ${result.backtest_results.control}`)
  console.log(`  metric (treatment) ${result.backtest_results.treatment}`)
  console.log(`  delta              ${delta}%   (min |Δ| ${GATE.MIN_EFFECT_PCT}%)`)
  console.log(`  sample size        ${result.sample_size}            (min ${GATE.MIN_SAMPLE})`)
  console.log('─'.repeat(64))
  console.log(`  VERDICT: ${passed ? '✓ candidate validated — eligible to promote' : '✗ candidate failed validation'}`)
  if (continuousLearningService.hasBlockingBreach()) {
    console.log('  ⚠ circuit breaker ARMED: a block_promotion baseline is breached — promotion is paused.')
  }
  console.log('')
  process.exit(passed ? 0 : 1)
}

main()
