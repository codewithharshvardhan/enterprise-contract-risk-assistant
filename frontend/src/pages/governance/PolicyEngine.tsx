import { useGovernanceData } from "../../lib/governance/useGovernanceData";
import { fetchPolicies, fetchFleet } from "../../lib/governance/api";
import { policyRules as policyRulesFixture, blockedPatterns as blockedPatternsFixture, confidenceGates as confidenceGatesFixture, pipelines as pipelinesFixture, allTenantTools as allTenantToolsFixture, categoryPalette, ringColor, stageBadge } from "../../lib/governance/fixtures";
import { KpiCard, Pill, RingBadge, SectionHeader } from "../../components/governance/ui";

export function PolicyEngine() {
  const { rules: policyRules, blockedPatterns, confidenceGates } = useGovernanceData(fetchPolicies, { rules: policyRulesFixture, blockedPatterns: blockedPatternsFixture, confidenceGates: confidenceGatesFixture });
  const { pipelines } = useGovernanceData(fetchFleet, { pipelines: pipelinesFixture, allTenantTools: allTenantToolsFixture });
  const agents = pipelines[0]?.agents ?? [];
  return (
    <div className="space-y-4">
      {/* Confidence / Enforcement Gates per stage */}
      <div className="card p-5">
        <SectionHeader title="Pipeline Enforcement Gates" subtitle="Where PolicyEvaluator + CapabilityGuard fire across the six-stage pipeline." />
        <div className="overflow-hidden rounded-lg border border-zbrain-divider">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-zbrain-surface border-b border-zbrain-divider">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zbrain-muted w-[140px]">Stage</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zbrain-muted">Gate</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zbrain-muted w-[120px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zbrain-divider">
              {confidenceGates.map((g) => (
                <tr key={g.stage}>
                  <td className="px-3 py-2.5 font-semibold text-zbrain-ink">{g.stage}</td>
                  <td className="px-3 py-2.5 text-zbrain-muted">{g.gate}</td>
                  <td className="px-3 py-2.5">
                    {g.action === "none"
                      ? <span className="text-[11px] text-zbrain-muted opacity-50">–</span>
                      : <Pill className={g.action === "deny"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200"}>{g.action}</Pill>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-Agent Capacity */}
      <div className="card p-5">
        <SectionHeader title="Per-Agent Capacity & Trust" subtitle="Ring derived from trust tier; allowed/denied tool counts from CapabilityGuard scope." />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zbrain-divider bg-zbrain-surface">
                {["Agent", "Ring", "Trust Score", "Trust Tier", "Allowed", "Denied"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-zbrain-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className="border-b border-zbrain-divider/50">
                  <td className="px-3 py-2 font-medium text-zbrain-ink">{a.name}</td>
                  <td className="px-3 py-2"><RingBadge ring={a.ring} className={ringColor[a.ring]} /></td>
                  <td className="px-3 py-2 tabular-nums font-semibold">{Math.round(a.trustScore * 1000)}</td>
                  <td className="px-3 py-2"><Pill className="bg-blue-50 text-blue-700 border-blue-200">{a.trustTier}</Pill></td>
                  <td className="px-3 py-2 tabular-nums text-emerald-700 font-semibold">{a.allowed}</td>
                  <td className="px-3 py-2 tabular-nums text-zbrain-muted">{a.denied}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Blocked Patterns — each category styled with its own colour */}
      <div className="card p-5">
        <SectionHeader title="Blocked Patterns" subtitle="Parameter sanitization across all tool calls." />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KpiCard label="Total patterns"        value={blockedPatterns.kpis.total_patterns} />
          <KpiCard label="Total blocks"          value={blockedPatterns.kpis.total_blocks} />
          <KpiCard label="Most active category"  value={blockedPatterns.kpis.most_active_category} sub={`${blockedPatterns.kpis.most_active_count} blocks`} />
          <KpiCard label="Categories"            value={blockedPatterns.kpis.categories_count} />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {blockedPatterns.categories.map((c) => {
            const palette = categoryPalette[c.id] ?? categoryPalette.direct_override;
            if (!palette) return null;
            const maxFires = Math.max(...blockedPatterns.categories.map((cc) => cc.fires), 1);
            const barPct = (c.fires / maxFires) * 100;
            return (
              <div key={c.id} className={`rounded-lg border p-3 ${palette.bg} ${palette.border}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className={`text-xs font-bold ${palette.text}`}>{c.label}</p>
                  <Pill className={palette.badge}>{c.patterns} patterns</Pill>
                </div>
                <p className={`text-[9px] leading-snug mb-2.5 opacity-80 ${palette.text}`}>
                  {c.fires > 0 ? `Most recent block within the last hour.` : `No blocks in the last 24h.`}
                </p>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[9px] uppercase tracking-wider opacity-60 ${palette.text}`}>blocks</span>
                  <span className={`text-xs font-bold tabular-nums ${palette.text}`}>{c.fires.toLocaleString()}</span>
                </div>
                <div className="h-1.5 bg-white/60 rounded-sm overflow-hidden">
                  <div className={`h-full rounded-sm ${palette.bar}`} style={{ width: `${barPct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Policies */}
      <div className="card p-5">
        <SectionHeader title="Active GovernancePolicies" subtitle="One row per pattern category; fire counts from audit_logs." />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zbrain-divider bg-zbrain-surface">
                {["Policy Rule", "Scope", "Priority", "Action", "Enforced At", "Fires", "OWASP"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-zbrain-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {policyRules.map((p) => (
                <tr key={p.id} className="border-b border-zbrain-divider/50 border-l-4 border-l-purple-400">
                  <td className="px-3 py-2 font-semibold text-zbrain-ink">{p.label}</td>
                  <td className="px-3 py-2"><Pill className="bg-blue-50 text-blue-700 border-blue-200">{p.scope}</Pill></td>
                  <td className="px-3 py-2 tabular-nums font-semibold">{p.priority}</td>
                  <td className="px-3 py-2"><Pill className="bg-purple-50 text-purple-700 border-purple-200">{p.action}</Pill></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 flex-wrap">
                      {p.stages.map((s) => (
                        <Pill key={s} className={stageBadge[s] ?? ""}>{s}</Pill>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums font-semibold">{p.fires}</td>
                  <td className="px-3 py-2 font-mono text-zbrain-muted">{p.owasp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
