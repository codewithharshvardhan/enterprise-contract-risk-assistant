import { inferBaselines } from './infer'
import { evaluateBaselines } from './evaluate'

// ─── Continuous Learning · the loop runtime ──────────────────────────────────
//
// One pass of the closed loop: infer any missing targets from data, evaluate
// every target, then (as later stages are wired) detect drift, propose remedies,
// and reconcile promotions. Run it on a timer (`startScheduler`, from the server
// entrypoint) AND on demand (`POST /baselines/evaluate`). Reads return the state
// the last cycle produced — exactly like the reference's scheduled detector + its
// manual `/baselines/evaluate` trigger.

export interface CycleResult {
  inferred: number
  evaluated: number
  breaches: number
  drift_alerts?: number
  opportunities?: number
  reconciled?: number
}

// Later stages register themselves here so runCycle stays the single entrypoint
// without creating import cycles.
type CycleStage = (acc: CycleResult) => void
const stages: CycleStage[] = []
export function registerStage(fn: CycleStage): void {
  stages.push(fn)
}

/** Run one full pass of the loop. */
export function runCycle(): CycleResult {
  const acc: CycleResult = { inferred: inferBaselines(), ...evaluateBaselines() }
  for (const stage of stages) {
    try {
      stage(acc)
    } catch {
      // a failing stage must not take down the others or the app
    }
  }
  return acc
}

let timer: ReturnType<typeof setInterval> | null = null

/** Start the background loop. Idempotent; call once from the server entrypoint. */
export function startScheduler(intervalMs = 60_000): void {
  if (timer) return
  runCycle()
  timer = setInterval(() => {
    try {
      runCycle()
    } catch {
      /* keep the app up */
    }
  }, intervalMs)
  if (typeof timer.unref === 'function') timer.unref()
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
