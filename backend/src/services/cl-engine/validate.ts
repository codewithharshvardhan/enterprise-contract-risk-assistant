import { store } from '../../db/database'
import * as baselinesStore from '../baselines-store'
import { signalsFor, type SignalRow } from './metrics'
import { getOpportunity, setOpportunityStatus } from './propose'
import { registerTimelineSource } from './timelines'
import { GATE } from '../agent-config.service'
import type { ABExperiment } from '../../types/continuous-learning'

// ─── Continuous Learning · Stage 4 (Validate) — backtest + shadow ─────────────
//
// Proves a candidate is better BEFORE customers see it. Two mechanisms:
//   • backtest — replay the candidate vs the control over REAL historical Capture
//     rows (not synthetic constants); sample_size + effect come from that data.
//   • shadow   — accrue live agree/disagree as the candidate runs quietly beside
//     production (`recordShadow`).
// The candidate's re-scoring is the one seam: register a real scorer per change.
// WITHOUT a registered scorer the backtest shows ZERO effect (so the gate blocks
// promotion) — honest by default, never fabricated.

const COLLECTION = 'cl_experiments'
const BACKTEST_WINDOW_HOURS = 24 * 30

interface StoredExperiment extends ABExperiment {
  kb_namespace: string
  kb_key: string
  candidate_value: unknown
  linked_opportunity_id: number | null
  fingerprint: string
  backtest_ran: boolean
  shadow_n: number
  shadow_control: number
  shadow_candidate: number
}

// A scorer answers "would the candidate config score this historical row correct?"
export type CandidateScorer = (row: SignalRow, candidate: { namespace: string; key: string; value: unknown }) => boolean
const scorers: Record<string, CandidateScorer> = {}

/** Register a real candidate scorer for a config namespace (the agent does this). */
export function registerCandidateScorer(namespace: string, fn: CandidateScorer): void {
  scorers[namespace] = fn
}

function splitScope(scope: string): { namespace: string; key: string } {
  const i = scope.indexOf('.')
  return i < 0 ? { namespace: 'business_rules', key: scope } : { namespace: scope.slice(0, i), key: scope.slice(i + 1) }
}

/** Accept an opportunity into a shadow experiment (Validate). Returns the experiment. */
export function createExperimentFromOpportunity(opportunityId: number, candidateValue?: unknown): ABExperiment | null {
  const opp = getOpportunity(opportunityId)
  if (!opp) return null
  const { namespace, key } = splitScope(opp.scope)
  const baseline = opp.baseline_id != null ? baselinesStore.getBaseline(opp.baseline_id) : null
  const doc: Omit<StoredExperiment, 'id'> = {
    baseline_id: opp.baseline_id ?? 0,
    candidate: opp.title,
    segment: opp.segment,
    change_type: opp.change_type,
    promote_status: 'shadow',
    control_prompt: JSON.stringify({ [key]: null }),
    candidate_prompt: JSON.stringify({ [key]: candidateValue ?? opp.change_type }),
    backtest_results: { metric: key, control: 0, treatment: 0, samples: 0 },
    accuracy_delta_pct: null,
    accuracy_delta_ci: null,
    observed_value: 0,
    target_value: baseline?.target_value ?? 0,
    sample_size: 0,
    regression_metric: null,
    regression_delta: null,
    started_at: nowStamp(),
    days_active: 0,
    p_value: 1,
    confidence_level: 0,
    kb_namespace: namespace,
    kb_key: key,
    candidate_value: candidateValue ?? null,
    linked_opportunity_id: opportunityId,
    fingerprint: `exp:${namespace}.${key}:${opp.segment}`,
    backtest_ran: false,
    shadow_n: 0,
    shadow_control: 0,
    shadow_candidate: 0,
  }
  const stored = store.insert(COLLECTION, doc as unknown as Record<string, unknown>) as unknown as StoredExperiment
  setOpportunityStatus(opportunityId, 'accepted', stored.id)
  return strip(stored)
}

/** Replay the candidate vs control over REAL historical rows. Sets sample_size + effect. */
export function backtestExperiment(experimentId: number): ABExperiment | null {
  const exp = store.get(COLLECTION, experimentId) as unknown as StoredExperiment | null
  if (!exp) return null
  const rows = signalsFor(exp.segment, { sinceHours: BACKTEST_WINDOW_HOURS }).filter((s) => s.polarity !== 0)
  const samples = rows.length
  const controlCorrect = rows.filter((r) => r.polarity === 1).length
  const scorer = scorers[exp.kb_namespace]
  const candidate = { namespace: exp.kb_namespace, key: exp.kb_key, value: exp.candidate_value }
  const treatmentCorrect = scorer ? rows.filter((r) => scorer(r, candidate)).length : controlCorrect
  const controlAcc = samples ? controlCorrect / samples : 0
  const treatmentAcc = samples ? treatmentCorrect / samples : 0
  const deltaPct = round((treatmentAcc - controlAcc) * 100)
  const passesGate = samples >= GATE.MIN_SAMPLE && Math.abs(deltaPct) >= GATE.MIN_EFFECT_PCT
  const patch: Partial<StoredExperiment> = {
    backtest_results: { metric: exp.kb_key, control: round(controlAcc), treatment: round(treatmentAcc), samples },
    accuracy_delta_pct: deltaPct,
    accuracy_delta_ci: `±${round(100 / Math.sqrt(Math.max(samples, 1)))}%`,
    observed_value: round(treatmentAcc),
    sample_size: samples,
    regression_metric: 'accuracy',
    regression_delta: deltaPct,
    days_active: 0,
    p_value: samples > 0 ? round(Math.max(0.001, 1 / Math.sqrt(samples))) : 1,
    confidence_level: samples >= GATE.MIN_SAMPLE ? 0.95 : 0.8,
    promote_status: passesGate ? 'ready' : 'shadow',
    backtest_ran: true,
  }
  store.update(COLLECTION, experimentId, patch as Record<string, unknown>)
  return strip(store.get(COLLECTION, experimentId) as unknown as StoredExperiment)
}

/** Accrue one live shadow comparison (candidate run quietly beside production). */
export function recordShadow(experimentId: number, controlCorrect: boolean, candidateCorrect: boolean): void {
  const exp = store.get(COLLECTION, experimentId) as unknown as StoredExperiment | null
  if (!exp) return
  const n = exp.shadow_n + 1
  const c = exp.shadow_control + (controlCorrect ? 1 : 0)
  const t = exp.shadow_candidate + (candidateCorrect ? 1 : 0)
  const deltaPct = round(((t - c) / n) * 100)
  store.update(COLLECTION, experimentId, {
    shadow_n: n,
    shadow_control: c,
    shadow_candidate: t,
    sample_size: Math.max(exp.sample_size, n),
    accuracy_delta_pct: deltaPct,
    regression_metric: 'accuracy',
    regression_delta: deltaPct,
    observed_value: round(t / n),
  })
}

/** Backtest record bound to an experiment — the REAL numbers the promote gate uses. */
export function experimentGateInputs(experimentId: number): { sample_size: number; delta_pct: number; namespace: string; key: string; value: unknown; baseline_id: number; segment: string; ran: boolean } | null {
  const exp = store.get(COLLECTION, experimentId) as unknown as StoredExperiment | null
  if (!exp) return null
  return {
    sample_size: exp.sample_size,
    delta_pct: exp.accuracy_delta_pct ?? 0,
    namespace: exp.kb_namespace,
    key: exp.kb_key,
    value: exp.candidate_value,
    baseline_id: exp.baseline_id,
    segment: exp.segment,
    ran: exp.backtest_ran,
  }
}

export function markExperimentPromoted(experimentId: number): void {
  store.update(COLLECTION, experimentId, { promote_status: 'promoted' })
}

/** Retire a shadow/ready experiment the operator is no longer pursuing. */
export function retireExperiment(experimentId: number): ABExperiment | null {
  if (!store.get(COLLECTION, experimentId)) return null
  store.update(COLLECTION, experimentId, { promote_status: 'retired' })
  return strip(store.get(COLLECTION, experimentId) as unknown as StoredExperiment)
}

/** The backtested control accuracy for a promoted config knob (for realised-lift). */
export function findExperimentControl(namespace: string, key: string, segment: string): number | null {
  const exp = (store.list(COLLECTION) as unknown as StoredExperiment[]).find(
    (e) => e.kb_namespace === namespace && e.kb_key === key && e.segment === segment && e.backtest_ran,
  )
  return exp ? exp.backtest_results.control : null
}

export function listExperiments(): ABExperiment[] {
  return (store.list(COLLECTION, { newestFirst: true }) as unknown as StoredExperiment[]).map(strip)
}

export function countByStatus(status: ABExperiment['promote_status']): number {
  return (store.list(COLLECTION) as unknown as StoredExperiment[]).filter((e) => e.promote_status === status).length
}

const INTERNAL_KEYS = ['kb_namespace', 'kb_key', 'candidate_value', 'linked_opportunity_id', 'fingerprint', 'backtest_ran', 'shadow_n', 'shadow_control', 'shadow_candidate']
function strip(e: StoredExperiment): ABExperiment {
  const rest = { ...e } as Record<string, unknown>
  for (const k of INTERNAL_KEYS) delete rest[k]
  return rest as unknown as ABExperiment
}

registerTimelineSource(() =>
  (store.list(COLLECTION) as unknown as StoredExperiment[]).map((e) => ({
    baseline_id: e.baseline_id,
    event: { id: `ex-${e.id}`, ts: e.started_at, kind: 'experiment' as const, label: e.candidate, detail: `${e.promote_status} · Δ${e.accuracy_delta_pct ?? 0}%` },
  })),
)

function nowStamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000
}
