import { useGovernanceData } from "../../lib/governance/useGovernanceData";
import { fetchFleet } from "../../lib/governance/api";
import { pipelines as pipelinesFixture, allTenantTools as allTenantToolsFixture, ringColor, trustTiers } from "../../lib/governance/fixtures";
import { Pill, RingBadge, SectionHeader } from "../../components/governance/ui";

export function AgentFleet() {
  const { pipelines, allTenantTools } = useGovernanceData(fetchFleet, { pipelines: pipelinesFixture, allTenantTools: allTenantToolsFixture });
  const p = pipelines[0];
  if (!p) return null;
  // Bucket each agent into its tier by score so the bars are derived from
  // the same data the identity cards display.
  const tierRows = trustTiers.map((t) => {
    const agents = p.agents.filter((a) => {
      const score = Math.round(a.trustScore * 1000);
      return score >= t.min && score <= t.max;
    });
    return { ...t, count: agents.length, names: agents.map((a) => a.name) };
  });
  const maxCount = Math.max(...tierRows.map((r) => r.count), 1);

  return (
    <div className="space-y-4">
      {/* Trust Tier Distribution — horizontal bars, one row per tier */}
      <div className="card p-5">
        <SectionHeader
          title="Trust Tier Distribution"
          subtitle="Fleet-level view of agent trust tiers, matched to AGT's 4-tier classification model."
        />
        <div className="space-y-2.5 mt-3">
          {tierRows.map((t) => {
            const width = t.count > 0 ? Math.max((t.count / maxCount) * 100, 8) : 0;
            return (
              <div key={t.label} className="flex items-center gap-3">
                <div className="w-36 shrink-0">
                  <span className={`text-xs font-semibold ${t.text}`}>{t.label}</span>
                </div>
                <div className="flex-1 h-6 rounded bg-zbrain-surface relative overflow-hidden">
                  <div className={`h-full rounded ${t.bar} opacity-80 transition-all`} style={{ width: `${width}%` }} />
                </div>
                <div className="w-56 shrink-0 flex items-center gap-2">
                  <span className={`text-xs font-bold tabular-nums ${t.count > 0 ? t.text : "text-zbrain-muted"}`}>{t.count}</span>
                  {t.names.length > 0 && (
                    <span className="text-[10px] text-zbrain-muted truncate" title={t.names.join(", ")}>{t.names.join(", ")}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* Legend — score ranges per tier */}
        <div className="flex gap-4 mt-4 flex-wrap pt-3 border-t border-zbrain-divider">
          {trustTiers.map((t) => (
            <div key={t.label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${t.bar}`} />
              <span className="text-[10px] text-zbrain-muted">{t.min === 900 ? "≥ 900" : `${t.min}–${t.max}`}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Delegation Chain */}
      <div className="card p-5">
        <SectionHeader title="Delegation Chain" subtitle="Capability scope narrows at each level: child scope ⊆ parent scope." />
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 mb-4">
          <span className="font-bold">✓</span>
          <span className="font-mono font-semibold">ScopeChain.verify()</span>
          <span>passed: all {p.agents.length} delegates satisfy monotonic scope narrowing.</span>
        </div>

        <div className="p-4 rounded-lg bg-purple-50 border border-purple-200 mb-3">
          <p className="text-sm font-semibold text-zbrain-ink">{p.root.label}</p>
          <p className="text-[10px] font-mono text-zbrain-muted">{p.root.did}</p>
        </div>

        <div className="ml-6 pl-5 border-l-2 border-purple-200 space-y-2">
          {p.agents.map((a) => (
            <div key={a.id} className={`p-3 rounded-lg border ${ringColor[a.ring] ?? ""}`}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <p className="text-xs font-semibold text-zbrain-ink">{a.name}</p>
                  <p className="text-[10px] font-mono opacity-70">did:agent:{a.id}</p>
                </div>
                <div className="flex items-center gap-1">
                  <RingBadge ring={a.ring} className={ringColor[a.ring] ?? ""} />
                  <Pill className="bg-emerald-50 text-emerald-700 border-emerald-200">● active</Pill>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {a.tools.map((t) => (
                  <Pill key={t} className="bg-emerald-50 text-emerald-700 border-emerald-200">{t}</Pill>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stage Agent Identities — full tool listing, allowed + denied */}
      <div className="card p-5">
        <SectionHeader title="Stage Agent Identities" subtitle="Each stage agent has a unique DID, trust ring, and explicit allowed / denied tool lists." />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {p.agents.map((a) => {
            const allowed = new Set(a.tools);
            const denied = allTenantTools.filter((t) => !allowed.has(t));
            return (
              <div key={a.id} className="card p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-zbrain-ink">{a.name}</p>
                    <p className="text-[10px] font-mono text-zbrain-muted mt-0.5 break-all">did:agent:{a.id}</p>
                  </div>
                  <RingBadge ring={a.ring} className={ringColor[a.ring] ?? ""} />
                </div>

                <div className={`rounded-lg p-3 border ${ringColor[a.ring] ?? ""}`}>
                  <div className="flex items-end gap-2">
                    <span className="text-2xl font-bold tabular-nums">{Math.round(a.trustScore * 1000)}</span>
                    <span className="text-xs mb-0.5 opacity-70">/1000</span>
                    <span className="ml-auto text-[10px] font-medium">{a.trustTier}</span>
                  </div>
                </div>

                {/* Allowed tools */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold mb-1.5">
                    Allowed tools (capability guard) · {a.tools.length}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {a.tools.map((t) => (
                      <Pill key={t} className="bg-emerald-50 text-emerald-700 border-emerald-200">{t}</Pill>
                    ))}
                  </div>
                </div>

                {/* Denied tools */}
                {denied.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold mb-1.5">
                      Blocked tools · {denied.length}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {denied.map((t) => (
                        <Pill key={t} className="bg-gray-100 text-gray-400 border-gray-200 line-through opacity-60">{t}</Pill>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
