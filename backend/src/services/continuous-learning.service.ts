import type {
  Overview,
  Baseline,
  DriftAlert,
  LearningOpportunity,
  ABExperiment,
  PromotedExperiment,
  FeedbackEntry,
  TimelineEvent,
} from '../types/continuous-learning'
import { agentConfigService } from './agent-config.service'
import * as feedbackStore from './feedback-store'
import * as traceStore from './trace-store'
import * as baselinesStore from './baselines-store'
import { listDriftAlerts, openAlertCount, totalAlertCount } from './cl-engine/detect'
import { listOpportunities, openOpportunityCount, acceptedOpportunityCount } from './cl-engine/propose'
import { listExperiments, countByStatus } from './cl-engine/validate'
import { getTimelines } from './cl-engine/timelines'
import { computeSla } from './cl-engine/sla'
import { registerResolver } from './cl-engine/metrics'
import { registerCandidateScorer } from './cl-engine/validate'
import * as traceStoreModule from './trace-store'
import * as feedbackStoreModule from './feedback-store'
// Loads the post-promotion watcher so its cycle stage registers (G10).
import './cl-engine/promote-watch'

function nowStamp(): string {
  return new Date().toISOString().slice(0, 16).replace('T', ' ')
}

// ─── Seed quality targets ─────────────────────────────────────────────────────
// Called once at startup — idempotent (checks if already seeded).

function seedBaselines(): void {
  if (baselinesStore.listBaselines().length > 0) return

  baselinesStore.createBaseline({
    metric: 'extraction_completeness',
    label: 'Extraction Completeness',
    segment: 'all_contracts',
    direction: 'max',
    target_value: 0,
    drift_pct: 10,
    severity: 'warn',
    enabled: true,
    owner: 'extractor',
    rationale: 'Measures how many of the 7 expected clause types are identified per run',
    source: '',
    unit: 'rate',
  })

  baselinesStore.createBaseline({
    metric: 'risk_score_calibration',
    label: 'Risk Score Calibration',
    segment: 'all_contracts',
    direction: 'min',
    target_value: 0,
    drift_pct: 10,
    severity: 'warn',
    enabled: true,
    owner: 'risk',
    rationale: 'Standard deviation of overall_score across contracts — lower = more consistent',
    source: '',
    unit: 'score',
  })

  baselinesStore.createBaseline({
    metric: 'json_validity_rate',
    label: 'JSON Validity Rate',
    segment: 'all_contracts',
    direction: 'max',
    target_value: 0,
    drift_pct: 5,
    severity: 'block_promotion',
    enabled: true,
    owner: 'formatter',
    rationale: 'Rate of first-attempt valid JSON output — must stay high or promotion circuit breaker arms',
    source: '',
    unit: 'rate',
  })

  baselinesStore.createBaseline({
    metric: 'recommendation_consistency',
    label: 'Recommendation Consistency',
    segment: 'reviewed_contracts',
    direction: 'max',
    target_value: 0,
    drift_pct: 10,
    severity: 'warn',
    enabled: true,
    owner: 'risk',
    rationale: 'Agreement rate between agent recommendation and human reviewer decision',
    source: '',
    unit: 'rate',
  })
}

// ─── Seed tunable config ──────────────────────────────────────────────────────

function seedAgentConfig(): void {
  const cur = agentConfigService.getConfig()
  if (Object.keys(cur.namespaces).length > 0) return
  // Note: max_tokens seeds are sized for the current extraction/risk/summary
  // schema (20 metadata fields + 15 clauses + obligations for extractor; a risk
  // list + 4-dimension matrix for risk; a 10-field executive summary for
  // formatter). They're intentionally below each node's own generous in-code
  // fallback (7000/5000/3000) so a CL promotion that raises them further still
  // has real, demonstrable room to improve — but high enough that a real
  // pipeline run reliably produces valid, non-truncated JSON.
  agentConfigService.promote(
    {
      namespace: 'extractor', key: 'max_tokens', value: 2500,
      sample_size: 9999, delta_pct: 99, segment: 'global', change_type: 'threshold',
      promoted_by: 'system', note: 'Seed extractor config',
    },
    { blockingBreach: false },
  )
  ;[
    { namespace: 'extractor', key: 'temperature', value: 0.1 },
    { namespace: 'extractor', key: 'prompt_variant', value: 'default' },
    { namespace: 'extractor', key: 'min_input_chars', value: 50 },
    { namespace: 'extractor', key: 'max_input_chars', value: 150000 },
    { namespace: 'risk', key: 'max_tokens', value: 1800 },
    { namespace: 'risk', key: 'temperature', value: 0.1 },
    { namespace: 'risk', key: 'approved_threshold', value: 2.0 },
    { namespace: 'risk', key: 'needs_redline_threshold', value: 3.5 },
    { namespace: 'risk', key: 'prompt_variant', value: 'default' },
    { namespace: 'formatter', key: 'max_tokens', value: 900 },
  ].forEach(({ namespace, key, value }) => {
    agentConfigService.promote(
      { namespace, key, value, sample_size: 9999, delta_pct: 99, segment: 'global', change_type: 'threshold', promoted_by: 'system', note: `Seed ${namespace}.${key}` },
      { blockingBreach: false },
    )
  })
}

// ─── Register metric resolvers ────────────────────────────────────────────────

function registerResolvers(): void {
  registerResolver('extraction_completeness', (segment, opts) => {
    const traces = traceStoreModule.all().filter((t) => t.stage === 'extractor' && t.outcome === 'success')
    const inWindow = traces.filter((t) => {
      if (opts.sinceHours == null) return true
      return Date.parse(t.ts) >= Date.now() - opts.sinceHours * 3_600_000
    })
    if (inWindow.length === 0) return { value: null, sample_size: 0, values: [] }
    const values = inWindow.map((t) => typeof t.confidence === 'number' ? t.confidence : 0)

    // Subtract 1/7 for each extraction_edit feedback in window
    const edits = feedbackStoreModule.recent(10000).filter((f) => f.kind === 'extraction_edit')
    const editPenalty = edits.length > 0 ? Math.min(edits.length / 7 / Math.max(values.length, 1), 0.3) : 0
    const adjusted = values.map((v) => Math.max(0, v - editPenalty))
    const avg = adjusted.reduce((a, b) => a + b, 0) / adjusted.length
    return { value: Math.round(avg * 10000) / 10000, sample_size: adjusted.length, values: adjusted }
  })

  registerResolver('risk_score_calibration', (segment, opts) => {
    const traces = traceStoreModule.all().filter((t) => t.stage === 'risk_evaluator' && t.outcome === 'success')
    const inWindow = traces.filter((t) => {
      if (opts.sinceHours == null) return true
      return Date.parse(t.ts) >= Date.now() - opts.sinceHours * 3_600_000
    })
    if (inWindow.length < 2) return { value: null, sample_size: inWindow.length, values: [] }
    const scores = inWindow.map((t) => {
      const d = t.data as Record<string, number> | undefined
      return typeof d?.['overall_score'] === 'number' ? d['overall_score'] : 0
    })

    // Add high-variance penalty for risk_score_edit feedback
    const edits = feedbackStoreModule.recent(10000).filter((f) => f.kind === 'risk_score_edit')
    const editOutliers = edits.map(() => 2.0)
    const all = [...scores, ...editOutliers]
    const mean = all.reduce((a, b) => a + b, 0) / all.length
    const variance = all.reduce((a, b) => a + (b - mean) ** 2, 0) / (all.length - 1)
    const stdev = Math.sqrt(variance)
    return { value: Math.round(stdev * 10000) / 10000, sample_size: scores.length, values: scores }
  })

  registerResolver('json_validity_rate', (_segment, opts) => {
    const traces = traceStoreModule.all().filter((t) => t.stage === 'formatter')
    const inWindow = traces.filter((t) => {
      if (opts.sinceHours == null) return true
      return Date.parse(t.ts) >= Date.now() - opts.sinceHours * 3_600_000
    })
    if (inWindow.length === 0) return { value: null, sample_size: 0, values: [] }
    const values = inWindow.map((t) => (t.outcome === 'success' ? 1 : 0) as number)
    const rate = (values as number[]).reduce((a, b) => a + b, 0) / values.length
    return { value: Math.round(rate * 10000) / 10000, sample_size: values.length, values }
  })

  registerResolver('recommendation_consistency', (_segment, opts) => {
    const traces = traceStoreModule.all().filter((t) => t.stage === 'risk_evaluator' && t.outcome === 'success')
    const feedbacks = feedbackStoreModule.recent(10000).filter((f) => ['review_approve', 'review_reject', 'review_edit'].includes(f.kind))
    if (feedbacks.length === 0) return { value: null, sample_size: 0, values: [] }
    const feedbackByContract = new Map<string, string>()
    for (const f of feedbacks) {
      const cid = (f.data as Record<string, string> | undefined)?.['contract_id']
      if (cid) feedbackByContract.set(cid, f.kind)
    }
    let agreed = 0; let total = 0
    for (const t of traces) {
      const cid = (t.data as Record<string, string> | undefined)?.['contract_id']
      if (!cid) continue
      const fbKind = feedbackByContract.get(cid)
      if (!fbKind) continue
      total++
      if (fbKind === 'review_approve') agreed++
    }
    if (total === 0) return { value: null, sample_size: 0, values: [] }
    const rate = agreed / total
    return { value: Math.round(rate * 10000) / 10000, sample_size: total, values: [rate] }
  })
}

// ─── Register candidate scorers ───────────────────────────────────────────────

function registerScorers(): void {
  registerCandidateScorer('extractor', (row, candidate) => {
    // Scorer: higher max_tokens → estimate better clause fill. 2500 is the
    // seeded baseline (see seedAgentConfig) — keep this in sync with it.
    const candidateMaxTokens = candidate.key === 'max_tokens' ? Number(candidate.value) : 2500
    const baselineRatio = typeof row.value === 'number' ? row.value : 0.5
    return baselineRatio * (candidateMaxTokens / 2500) >= 0.85
  })

  registerCandidateScorer('risk', (row, _candidate) => {
    // Scorer: polarity 1 = correct risk evaluation
    return row.polarity === 1
  })

  registerCandidateScorer('formatter', (row, candidate) => {
    // Scorer: higher max_tokens → better chance of valid JSON. 900 is the
    // seeded baseline (see seedAgentConfig) — keep this in sync with it.
    const candidateMaxTokens = candidate.key === 'max_tokens' ? Number(candidate.value) : 900
    return candidateMaxTokens >= 900 && row.polarity !== -1
  })
}

// ─── Initialize on import ─────────────────────────────────────────────────────

seedBaselines()
seedAgentConfig()
registerResolvers()
registerScorers()

// ─── Service class ────────────────────────────────────────────────────────────

class ContinuousLearningService {
  getOverview(): Overview {
    const fb = feedbackStore.summary()
    const promotions = agentConfigService.getRuntimePromotions()
    return {
      funnel: {
        generated_at: nowStamp(),
        capture: { trace_events_7d: traceStore.countSince(24 * 7), feedback_7d: fb.total },
        detect: {
          drift_alerts_open: openAlertCount(),
          drift_alerts_total_30d: totalAlertCount(),
          rca_tickets_open: listDriftAlerts().filter((a) => a.status !== 'resolved' && (a.severity === 'high' || a.severity === 'slo_breach')).length,
        },
        propose: { opportunities_open: openOpportunityCount(), opportunities_accepted: acceptedOpportunityCount() },
        validate: { shadow: countByStatus('shadow'), ready: countByStatus('ready'), in_ab: countByStatus('shadow') + countByStatus('ready') },
        promote: {
          promoted_30d: promotions.filter((p) => p.promote_status === 'promoted').length,
          auto_rolled_back_30d: promotions.filter((p) => p.auto_rolled_back).length,
          rolled_back_30d: promotions.filter((p) => p.rolled_back_at != null).length,
        },
      },
      sla: computeSla(),
      dashboard: {
        window_days: 30,
        generated_at: nowStamp(),
        feedback_summary: fb,
        throughput_24h: { pipelines: 0, by_tier: [], by_status: [] },
      },
    }
  }

  getBaselines(): Baseline[] { return baselinesStore.listBaselines() }
  getFeedback(): FeedbackEntry[] { return feedbackStore.recent() }
  getDriftAlerts(): DriftAlert[] { return listDriftAlerts() }
  getOpportunities(): LearningOpportunity[] { return listOpportunities() }
  getExperiments(): ABExperiment[] { return listExperiments() }
  getPromoted(): PromotedExperiment[] { return [...agentConfigService.getRuntimePromotions()] }
  getTimelines(): Record<number, TimelineEvent[]> { return getTimelines() }
  hasBlockingBreach(): boolean { return baselinesStore.hasBlockingBreach() }
}

export const continuousLearningService = new ContinuousLearningService()
