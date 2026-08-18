import type { Request, Response } from 'express'
import { continuousLearningService } from '../services/continuous-learning.service'
import { agentConfigService, GATE } from '../services/agent-config.service'
import { recordFeedback, type FeedbackInput } from '../services/feedback-store'
import { recordTrace, type TraceInput } from '../services/trace-store'
import * as baselinesStore from '../services/baselines-store'
import { runCycle } from '../services/cl-engine/runtime'
import { inferBaselines } from '../services/cl-engine/infer'
import { createExperimentFromOpportunity, backtestExperiment, recordShadow, retireExperiment } from '../services/cl-engine/validate'
import { decideOpportunity } from '../services/cl-engine/propose'
import { promoteExperiment, watchPromotions } from '../services/cl-engine/promote-watch'

// ─── Read model (Capture → Detect → Propose → Validate → Promote) ────────────
export function getOverview(_req: Request, res: Response): void {
  res.json(continuousLearningService.getOverview())
}

// ─── Quality targets (baselines) — operator-defined, persisted, editable ─────
export function getBaselines(_req: Request, res: Response): void {
  res.json(continuousLearningService.getBaselines())
}

// Define a quality target. Requires at least `metric`.
export function createBaseline(req: Request, res: Response): void {
  const body = (req.body ?? {}) as Record<string, unknown>
  if (!body['metric']) {
    res.status(400).json({ message: 'metric is required' })
    return
  }
  res.status(201).json(baselinesStore.createBaseline(body))
}

// Edit an existing quality target (partial update).
export function updateBaseline(req: Request, res: Response): void {
  const id = Number(req.params['id'])
  const updated = baselinesStore.updateBaseline(id, (req.body ?? {}) as Record<string, unknown>)
  if (!updated) {
    res.status(404).json({ message: `No such baseline: ${req.params['id']}` })
    return
  }
  res.json(updated)
}

export function deleteBaseline(req: Request, res: Response): void {
  const id = Number(req.params['id'])
  if (!baselinesStore.deleteBaseline(id)) {
    res.status(404).json({ message: `No such baseline: ${req.params['id']}` })
    return
  }
  res.json({ deleted: id })
}

// Infer target_value / tolerance / cause-factors from data for targetless
// baselines (R1/R3). Targets are inferred from activity, never hardcoded; an
// operator-set target (target_value > 0) is preserved unless `force` is passed.
export function inferBaselines_(req: Request, res: Response): void {
  const force = Boolean((req.body ?? {})['force'])
  const inferred = inferBaselines({ force })
  res.json({ inferred, baselines: baselinesStore.listBaselines() })
}

// Run a detector pass on demand: infer missing targets → evaluate every target →
// detect drift → propose remedies → reconcile promotions. Returns the cycle counts.
export function runDetector(_req: Request, res: Response): void {
  res.json(runCycle())
}

export function getFeedback(_req: Request, res: Response): void {
  res.json(continuousLearningService.getFeedback())
}

// Capture stage — record an agent-activity trace (the agent-side counterpart of
// feedback). Drift is computed from BOTH traces and human feedback.
export function captureTrace(req: Request, res: Response): void {
  const body = (req.body ?? {}) as Partial<TraceInput>
  if (!body.stage) {
    res.status(400).json({ message: 'stage is required' })
    return
  }
  res.status(201).json(recordTrace(body as TraceInput))
}

// Capture stage — record a reviewer / HITL signal (👍/👎/✎/note). The CL analog of
// writing a governance audit row; it persists to the shared app store and the
// dashboard reads it back live. Agents can call `recordFeedback(...)` directly.
export function captureFeedback(req: Request, res: Response): void {
  const body = (req.body ?? {}) as Partial<FeedbackInput>
  if (!body.stage || !body.kind) {
    res.status(400).json({ message: 'stage and kind are required' })
    return
  }
  res.status(201).json(recordFeedback(body as FeedbackInput))
}

export function getDriftAlerts(_req: Request, res: Response): void {
  res.json(continuousLearningService.getDriftAlerts())
}

export function getOpportunities(_req: Request, res: Response): void {
  res.json(continuousLearningService.getOpportunities())
}

export function getExperiments(_req: Request, res: Response): void {
  res.json(continuousLearningService.getExperiments())
}

// Validate stage — accept an opportunity into a shadow experiment.
export function acceptOpportunity(req: Request, res: Response): void {
  const id = Number(req.params['id'])
  const value = (req.body ?? {})['value']
  const exp = createExperimentFromOpportunity(id, value)
  if (!exp) {
    res.status(404).json({ message: `No such opportunity: ${req.params['id']}` })
    return
  }
  res.status(201).json(exp)
}

// Propose stage — record the operator's decision on an opportunity. `accepted`
// moves it to an A/B experiment (and out of the open queue); `deferred`/`rejected`
// just persist the status. The single endpoint the tuning-queue buttons call.
export function decideOpportunity_(req: Request, res: Response): void {
  const id = Number(req.params['id'])
  const { decision, value } = (req.body ?? {}) as { decision?: string; value?: unknown }
  if (decision === 'accepted') {
    const exp = createExperimentFromOpportunity(id, value)
    if (!exp) {
      res.status(404).json({ message: `No such opportunity: ${req.params['id']}` })
      return
    }
    res.status(201).json({ decision, experiment: exp })
    return
  }
  if (decision === 'deferred' || decision === 'rejected') {
    const opp = decideOpportunity(id, decision)
    if (!opp) {
      res.status(404).json({ message: `No such opportunity: ${req.params['id']}` })
      return
    }
    res.json({ decision, opportunity: opp })
    return
  }
  res.status(400).json({ message: 'decision must be one of: accepted, deferred, rejected' })
}

// Validate stage — replay the candidate vs control over real historical data.
export function backtestExperimentHandler(req: Request, res: Response): void {
  const id = Number(req.params['id'])
  const result = backtestExperiment(id)
  if (!result) {
    res.status(404).json({ message: `No such experiment: ${req.params['id']}` })
    return
  }
  res.json(result)
}

// Validate stage — retire a shadow/ready experiment that won't be promoted.
export function retireExperimentHandler(req: Request, res: Response): void {
  const id = Number(req.params['id'])
  const result = retireExperiment(id)
  if (!result) {
    res.status(404).json({ message: `No such experiment: ${req.params['id']}` })
    return
  }
  res.json(result)
}

// Validate stage — accrue one live shadow comparison for an experiment.
export function recordShadowHandler(req: Request, res: Response): void {
  const { experiment_id, control_correct, candidate_correct } = (req.body ?? {}) as {
    experiment_id?: number
    control_correct?: boolean
    candidate_correct?: boolean
  }
  if (typeof experiment_id !== 'number') {
    res.status(400).json({ message: 'experiment_id (number) is required' })
    return
  }
  recordShadow(experiment_id, Boolean(control_correct), Boolean(candidate_correct))
  res.json({ ok: true })
}

// Promote stage — measure realised effect and auto-rollback regressions on demand.
export function reconcilePromotions(_req: Request, res: Response): void {
  res.json({ reconciled: watchPromotions() })
}

export function getPromoted(_req: Request, res: Response): void {
  res.json(continuousLearningService.getPromoted())
}

export function getTimelines(_req: Request, res: Response): void {
  res.json(continuousLearningService.getTimelines())
}

// ─── Loop D · operator-tunable agent config (writes are privileged) ──────────
export function getConfig(_req: Request, res: Response): void {
  res.json({
    ...agentConfigService.getConfig(),
    gate: { min_sample: GATE.MIN_SAMPLE, min_effect_pct: GATE.MIN_EFFECT_PCT },
    blocking_breach: continuousLearningService.hasBlockingBreach(),
  })
}

// Promote a VALIDATED experiment as versioned config. The gate's sample/effect
// come from the experiment's real backtest record — not from the request body
// (G9). 200 if the gate passes and the change ships; 422 with the gate breakdown
// (or an un-backtested candidate) if it does not.
export function promote(req: Request, res: Response): void {
  const { experiment_id, by, note } = (req.body ?? {}) as { experiment_id?: number; by?: string; note?: string }
  if (typeof experiment_id !== 'number') {
    res.status(400).json({ message: 'experiment_id (number) is required — promotion binds to a validated experiment' })
    return
  }
  const result = promoteExperiment(experiment_id, by, note)
  res.status(result.gate.passed ? 200 : 422).json(result)
}

// Roll a promoted change back to a prior version (always reversible). With no
// `version`, undoes the latest promotion (restores the previous config version) —
// what the UI's one-click Rollback button uses.
export function rollback(req: Request, res: Response): void {
  const { version, by, note } = (req.body ?? {}) as { version?: number; by?: string; note?: string }
  const current = agentConfigService.getConfig().version
  const target = typeof version === 'number' ? version : current - 1
  if (target < 1 || target >= current) {
    res.status(400).json({ message: 'nothing to roll back to' })
    return
  }
  const result = agentConfigService.rollback(target, by, note)
  res.status(result.error ? 404 : 200).json(result)
}
