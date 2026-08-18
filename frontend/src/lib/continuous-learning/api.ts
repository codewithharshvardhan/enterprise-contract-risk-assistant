import { service1Client } from "../api";
import * as fx from "./fixtures";
import type { Baseline, CLBundle, FeedbackEntry } from "./fixtures";

// Continuous Learning API surface. In dev, service1Client proxies
// /proxy/service1/* to the backend (see vite.config + src/lib/api.ts). Each fetch
// falls back to the bundled fixtures, so the workspace renders out of the box with
// no backend and upgrades to live data the moment the backend responds.
const BASE = "/api/v1/continuous-learning";

// Result of a promote attempt — `ok` is the gate outcome; on a gate failure the
// backend returns `422` with the `gate` breakdown, surfaced here so the UI can
// show WHY it was blocked rather than silently failing.
export type PromoteResult = { ok: boolean; gate?: unknown; version?: unknown; promotion?: unknown };

async function load<T>(path: string, fallback: T): Promise<T> {
  try {
    const { data } = await service1Client.get<T>(`${BASE}${path}`);
    return data;
  } catch (err) {
    console.warn(`[continuous-learning] backend unavailable for ${path}; using bundled fixtures.`, err);
    return fallback;
  }
}

// Per-stage fetchers — one per documented endpoint in the contract.
export const fetchOverview      = () => load("/overview", { funnel: fx.funnel, sla: fx.sla, dashboard: fx.dashboard });
export const fetchBaselines     = () => load("/baselines", fx.baselines);
export const fetchFeedback      = () => load("/feedback", fx.feedback);
export const fetchDriftAlerts   = () => load("/drift-alerts", fx.driftAlerts);
export const fetchOpportunities = () => load("/opportunities", fx.opportunities);
export const fetchExperiments   = () => load("/experiments", fx.abExperiments);
export const fetchPromoted      = () => load("/promoted", fx.promoted);
export const fetchTimelines     = () => load("/timelines", fx.baselineTimelines);

// Capture (write) — POST a reviewer / HITL signal (👍/👎/✎/note). This is the CL
// analog of writing a governance audit row; the backend overlays it on the seed
// immediately. Wire it to your app's reviewer / HITL actions. `stage` and `kind`
// are required (`kind` encoded as `<stage>_<signal>`, e.g. `decide_thumbs_down`).
// Resolves to the stored entry, or null if the backend is unavailable.
export async function recordFeedback(
  entry: { stage: string; kind: string } & Partial<FeedbackEntry>,
): Promise<FeedbackEntry | null> {
  try {
    const { data } = await service1Client.post<FeedbackEntry>(`${BASE}/feedback`, entry);
    return data;
  } catch (err) {
    console.warn("[continuous-learning] failed to record feedback; backend unavailable.", err);
    return null;
  }
}

// Quality targets (baselines) — operator-defined and editable. Define them per use
// case; they are persisted by the backend (empty until you add them). Each resolves
// to the affected baseline (or null / false if the backend is unavailable).
export async function createBaseline(target: { metric: string } & Partial<Baseline>): Promise<Baseline | null> {
  try {
    const { data } = await service1Client.post<Baseline>(`${BASE}/baselines`, target);
    return data;
  } catch (err) {
    console.warn("[continuous-learning] failed to create baseline; backend unavailable.", err);
    return null;
  }
}

export async function updateBaseline(id: number, patch: Partial<Baseline>): Promise<Baseline | null> {
  try {
    const { data } = await service1Client.put<Baseline>(`${BASE}/baselines/${id}`, patch);
    return data;
  } catch (err) {
    console.warn("[continuous-learning] failed to update baseline; backend unavailable.", err);
    return null;
  }
}

export async function deleteBaseline(id: number): Promise<boolean> {
  try {
    await service1Client.delete(`${BASE}/baselines/${id}`);
    return true;
  } catch (err) {
    console.warn("[continuous-learning] failed to delete baseline; backend unavailable.", err);
    return false;
  }
}

// Propose (write) — record the operator's decision on an opportunity. `accepted`
// promotes it to an A/B experiment (and out of the open tuning queue); `deferred`
// and `rejected` persist the status. Re-hydrate after the call (via
// useContinuousLearning().refresh) so the queue and the Validate tab reflect the
// transfer. Resolves to the backend response, or null if the backend is unavailable.
export async function decideOpportunity(
  id: number,
  decision: "accepted" | "deferred" | "rejected",
  value?: unknown,
): Promise<unknown | null> {
  try {
    const { data } = await service1Client.post<unknown>(`${BASE}/opportunities/${id}/decide`, { decision, value });
    return data;
  } catch (err) {
    console.warn("[continuous-learning] failed to record opportunity decision; backend unavailable.", err);
    return null;
  }
}

// Validate (write) — replay a candidate vs control over real Capture rows. Resolves
// to the updated experiment (with sample_size + accuracy_delta_pct), or null.
export async function backtestExperiment(id: number): Promise<unknown | null> {
  try {
    const { data } = await service1Client.post<unknown>(`${BASE}/experiments/${id}/backtest`, {});
    return data;
  } catch (err) {
    console.warn("[continuous-learning] backtest failed; backend unavailable.", err);
    return null;
  }
}

// Validate (write) — retire a shadow/ready experiment that won't be promoted.
export async function retireExperiment(id: number): Promise<unknown | null> {
  try {
    const { data } = await service1Client.post<unknown>(`${BASE}/experiments/${id}/retire`, {});
    return data;
  } catch (err) {
    console.warn("[continuous-learning] retire failed; backend unavailable.", err);
    return null;
  }
}

// Promote (write) — ship a VALIDATED experiment as gated config. The gate binds to
// the experiment's real backtest (never the caller). Returns the gate result even on
// a 422 block (via validateStatus), so the UI can show why; null only on a network
// failure. Re-hydrate after.
export async function promoteExperiment(experimentId: number, note?: string): Promise<PromoteResult | null> {
  try {
    const res = await service1Client.post<Record<string, unknown>>(
      `${BASE}/promote`,
      { experiment_id: experimentId, note },
      { validateStatus: () => true },
    );
    return { ok: res.status < 300, ...(res.data ?? {}) };
  } catch (err) {
    console.warn("[continuous-learning] promote failed; backend unavailable.", err);
    return null;
  }
}

// Promote (write) — roll the tunable agent-config back. Omit `version` to undo the
// latest promotion (the one-click Rollback); pass one to target a specific version.
export async function rollbackConfig(version?: number, note?: string): Promise<unknown | null> {
  try {
    const { data } = await service1Client.post<unknown>(`${BASE}/rollback`, { version, note });
    return data;
  } catch (err) {
    console.warn("[continuous-learning] rollback failed; backend unavailable.", err);
    return null;
  }
}

// One-shot bundle fetch used by useContinuousLearning() to hydrate the workspace.
export async function fetchContinuousLearning(): Promise<CLBundle> {
  const [overview, baselines, feedback, driftAlerts, opportunities, abExperiments, promoted, baselineTimelines] =
    await Promise.all([
      fetchOverview(),
      fetchBaselines(),
      fetchFeedback(),
      fetchDriftAlerts(),
      fetchOpportunities(),
      fetchExperiments(),
      fetchPromoted(),
      fetchTimelines(),
    ]);
  return { ...overview, baselines, feedback, driftAlerts, opportunities, abExperiments, promoted, baselineTimelines };
}
