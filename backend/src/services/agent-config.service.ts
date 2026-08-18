import type {
  AgentConfigValue,
  AgentConfigVersion,
  PromoteCandidate,
  PromoteGateResult,
  PromotedExperiment,
} from '../types/continuous-learning'

// ─── Operator-tunable agent config (Continuous Learning · Loop D) ─────────────
//
// This is what makes the app's agents **configurable, not coded**. Every agent
// reads its tunable knobs from here — never hard-codes them:
//
//   const tol = agentConfigService.getValue('business_rules', 'quantity_tolerance', 0.05)
//
// A Continuous Learning proposal that clears the Validate gate is applied here as
// a **new version** (`promote`), and `rollback` restores a prior one within the
// retention window. No deploy, fully audited, always reversible. Swap this
// in-memory store for your real config store (DB / feature flags) in production;
// keep the method surface so agents and the API don't change.

// Tunable agent config — starts EMPTY. Add the knobs your agents actually read
// (one namespace per agent or per concern) as you build them, e.g.
// `{ business_rules: { quantity_tolerance: 0.1 } }`. A promote writes a new version
// of this surface; nothing here is hardcoded to a sample domain.
const SEED_CONFIG: Record<string, Record<string, AgentConfigValue>> = {}

// Promotion gate — nothing reaches production without clearing BOTH a minimum
// sample size AND a minimum effect size (and no block_promotion baseline breached).
export const GATE = { MIN_SAMPLE: 200, MIN_EFFECT_PCT: 2.0 } as const

function nowStamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

class AgentConfigService {
  private versions: AgentConfigVersion[]
  private runtimePromotions: PromotedExperiment[] = []
  private nextPromotionId = 900
  // promotion.id → the config version it created (so the watcher can revert to v-1).
  private promotionVersions = new Map<number, number>()

  constructor() {
    this.versions = [
      {
        version: 1,
        created_at: nowStamp(),
        created_by: 'system',
        note: 'Initial config',
        namespaces: structuredClone(SEED_CONFIG),
      },
    ]
  }

  private current(): AgentConfigVersion {
    // Always ≥1 version (seeded in the constructor).
    return this.versions[this.versions.length - 1] as AgentConfigVersion
  }

  /** The current tunable config — what the UI's GET /config renders. */
  getConfig(): AgentConfigVersion {
    return this.current()
  }

  /** Full version history (newest last), for audit / rollback targets. */
  getHistory(): AgentConfigVersion[] {
    return this.versions
  }

  /** Promotions + rollbacks applied at runtime (the Promote tab merges these in). */
  getRuntimePromotions(): PromotedExperiment[] {
    return this.runtimePromotions
  }

  /**
   * Read a tunable value. THIS is how the app's agents stay configurable —
   * call it instead of hard-coding thresholds, pattern lists, routing rules,
   * or prompt variants.
   */
  getValue<T extends AgentConfigValue>(namespace: string, key: string, fallback: T): T {
    const ns = this.current().namespaces[namespace]
    const val = ns?.[key]
    return val === undefined ? fallback : (val as T)
  }

  /** Evaluate the promotion gate without applying anything (pre-flight). */
  evaluateGate(candidate: PromoteCandidate, opts: { blockingBreach?: boolean } = {}): PromoteGateResult {
    const n = candidate.sample_size ?? 0
    const effect = Math.abs(candidate.delta_pct ?? 0)
    const breach = Boolean(opts.blockingBreach)
    const checks = [
      { name: 'min_sample', passed: n >= GATE.MIN_SAMPLE, detail: `n=${n} (min ${GATE.MIN_SAMPLE})` },
      { name: 'min_effect', passed: effect >= GATE.MIN_EFFECT_PCT, detail: `|Δ|=${effect}% (min ${GATE.MIN_EFFECT_PCT}%)` },
      {
        name: 'no_blocking_breach',
        passed: !breach,
        detail: breach ? 'a block_promotion baseline is breached — circuit breaker armed' : 'clear',
      },
    ]
    const passed = checks.every((c) => c.passed)
    const failed = checks.filter((c) => !c.passed).map((c) => c.name)
    return { passed, reason: passed ? 'Gate passed' : `Gate failed: ${failed.join(', ')}`, checks }
  }

  /**
   * Promote a validated candidate: re-check the gate, write a NEW config version
   * (the prior one is retained for rollback), and append a change-ledger entry.
   * Returns the gate result; `version`/`promotion` are set only when it passed.
   */
  promote(
    candidate: PromoteCandidate,
    opts: { blockingBreach?: boolean } = {},
  ): { gate: PromoteGateResult; version?: AgentConfigVersion; promotion?: PromotedExperiment } {
    const gate = this.evaluateGate(candidate, opts)
    if (!gate.passed) return { gate }

    const cur = this.current()
    const namespaces = structuredClone(cur.namespaces)
    if (!namespaces[candidate.namespace]) namespaces[candidate.namespace] = {}
    namespaces[candidate.namespace]![candidate.key] = candidate.value

    const version: AgentConfigVersion = {
      version: cur.version + 1,
      created_at: nowStamp(),
      created_by: candidate.promoted_by ?? 'operator',
      note: candidate.note ?? `Promote ${candidate.namespace}.${candidate.key}`,
      namespaces,
    }
    this.versions.push(version)

    const promotion: PromotedExperiment = {
      id: this.nextPromotionId++,
      baseline_id: candidate.baseline_id ?? 0,
      baseline_label: `${candidate.namespace}.${candidate.key}`,
      candidate: candidate.candidate ?? `${candidate.key}=${JSON.stringify(candidate.value)}`,
      segment: candidate.segment ?? 'global',
      change_type: candidate.change_type ?? 'threshold',
      promote_status: 'promoted',
      promoted_by: version.created_by,
      promoted_at: version.created_at,
      promote_note: version.note,
      kb_namespace: candidate.namespace,
      kb_key: candidate.key,
      control_prompt: JSON.stringify({ [candidate.key]: cur.namespaces[candidate.namespace]?.[candidate.key] ?? null }),
      candidate_prompt: JSON.stringify({ [candidate.key]: candidate.value }),
      accuracy_delta_pct: candidate.delta_pct ?? 0,
      accuracy_delta_ci: '—',
      realised_lift_pct: null,
      realised_lift_ci: null,
      realised_lift_at: null,
      realised_sample_size: null,
      realised_note: 'Watching realised effect.',
      auto_rolled_back: false,
      rolled_back_at: null,
      rolled_back_by: null,
      rolled_back_note: null,
      linked_opportunity_id: null,
    }
    this.runtimePromotions.push(promotion)
    this.promotionVersions.set(promotion.id, version.version)
    return { gate, version, promotion }
  }

  /** Record the realised (post-promotion) effect a watcher measured (G10). */
  updatePromotionRealised(promotionId: number, fields: Partial<PromotedExperiment>): void {
    const p = this.runtimePromotions.find((x) => x.id === promotionId)
    if (p) Object.assign(p, fields)
  }

  /**
   * Auto-revert a specific regressed promotion (G10): restore the config to the
   * version just before it, and stamp the promotion as auto-rolled-back. This is
   * what the post-promotion watcher calls when realised performance regresses.
   */
  autoRollbackPromotion(promotionId: number, note: string): { version?: AgentConfigVersion; error?: string } {
    const promo = this.runtimePromotions.find((p) => p.id === promotionId)
    if (!promo || promo.promote_status !== 'promoted') return { error: 'not an active promotion' }
    const createdVersion = this.promotionVersions.get(promotionId) ?? this.current().version
    const prior = this.versions.find((v) => v.version === createdVersion - 1) ?? this.versions[0]
    const cur = this.current()
    const version: AgentConfigVersion = {
      version: cur.version + 1,
      created_at: nowStamp(),
      created_by: 'auto-rollback-watcher',
      note,
      namespaces: structuredClone(prior?.namespaces ?? {}),
    }
    this.versions.push(version)
    promo.promote_status = 'retired'
    promo.auto_rolled_back = true
    promo.rolled_back_at = version.created_at
    promo.rolled_back_by = 'auto-rollback-watcher'
    promo.rolled_back_note = note
    return { version }
  }

  /** Restore a prior version as a NEW version (always reversible, fully audited). */
  rollback(
    toVersion: number,
    by = 'operator',
    note?: string,
  ): { version?: AgentConfigVersion; error?: string } {
    const target = this.versions.find((v) => v.version === toVersion)
    if (!target) return { error: `No such config version: ${toVersion}` }
    const cur = this.current()
    const version: AgentConfigVersion = {
      version: cur.version + 1,
      created_at: nowStamp(),
      created_by: by,
      note: note ?? `Rollback to v${toVersion}`,
      namespaces: structuredClone(target.namespaces),
    }
    this.versions.push(version)

    // Mark the most recent live promotion as rolled back.
    const last = [...this.runtimePromotions].reverse().find((p) => p.promote_status === 'promoted')
    if (last) {
      last.promote_status = 'retired'
      last.rolled_back_at = version.created_at
      last.rolled_back_by = by
      last.rolled_back_note = version.note
    }
    return { version }
  }
}

export const agentConfigService = new AgentConfigService()
