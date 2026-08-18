import { useGovernanceData } from "../../lib/governance/useGovernanceData";
import { fetchOverview } from "../../lib/governance/api";
import { overview as overviewFixture, severityColor } from "../../lib/governance/fixtures";
import { KpiCard, Pill, SectionHeader } from "../../components/governance/ui";

export function Overview() {
  const overview = useGovernanceData(fetchOverview, overviewFixture);
  const total = overview.policy_decisions.reduce((s, d) => s + d.value, 0);
  const maxFunnel = Math.max(...overview.pipeline_funnel.map((s) => s.count));

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {overview.kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} sub={k.sub} accent={k.accent} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Policy Decisions breakdown */}
        <div className="card p-5">
          <SectionHeader title="Policy Decisions (24h)" subtitle="Outcome of every PolicyEvaluator call." />
          <div className="space-y-2">
            {overview.policy_decisions.map((d) => {
              const pct = total ? Math.round((d.value / total) * 100) : 0;
              return (
                <div key={d.label}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="font-medium text-zbrain-ink">{d.label}</span>
                    <span className="tabular-nums text-zbrain-muted">{d.value.toLocaleString()} <span className="opacity-60">({pct}%)</span></span>
                  </div>
                  <div className="h-2 bg-zbrain-divider rounded-sm overflow-hidden">
                    <div className="h-full rounded-sm" style={{ width: `${pct}%`, background: d.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Breach alerts */}
        <div className="card p-5 lg:col-span-2">
          <SectionHeader title="Breach Alerts" subtitle={`${overview.breach_alerts.length} active. Severity follows AGT risk score tiers.`} />
          <ul className="divide-y divide-zbrain-divider">
            {overview.breach_alerts.map((a, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5">
                <Pill className={severityColor[a.severity]}>{a.severity}</Pill>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold text-zbrain-ink">{a.kind.replace(/_/g, " ")}</span>
                    <span className="text-[11px] text-zbrain-muted truncate">{a.message}</span>
                  </div>
                </div>
                <button className="text-[11px] text-zbrain hover:underline shrink-0">Investigate →</button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Pipeline funnel */}
      <div className="card p-5">
        <SectionHeader title="Pipeline Funnel (24h)" subtitle="Counts of cases that reached each pipeline stage. Bar segments show denies." />
        <div className="space-y-2">
          {overview.pipeline_funnel.map((s) => {
            const pct = (s.count / maxFunnel) * 100;
            const denyPct = s.count > 0 ? (s.deny / s.count) * 100 : 0;
            return (
              <div key={s.stage} className="flex items-center gap-3">
                <div className="w-24 text-xs font-medium text-zbrain-ink">{s.stage}</div>
                <div className="flex-1 h-6 bg-zbrain-surface rounded-md relative overflow-hidden">
                  <div className="h-full bg-zbrain-100 relative" style={{ width: `${pct}%` }}>
                    {s.deny > 0 && (
                      <div className="absolute right-0 top-0 h-full bg-red-300" style={{ width: `${denyPct}%` }} />
                    )}
                  </div>
                </div>
                <div className="w-24 text-right tabular-nums text-xs text-zbrain-ink font-semibold">{s.count.toLocaleString()}</div>
                <div className="w-20 text-right tabular-nums text-[11px] text-rose-600">{s.deny > 0 ? `–${s.deny}` : "–"}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent activity */}
      <div className="card p-5">
        <SectionHeader title="Recent activity" subtitle="Latest governance events across all pipelines." />
        <ul className="divide-y divide-zbrain-divider">
          {overview.recent.map((e, i) => (
            <li key={i} className="py-2 flex items-start gap-3 text-xs">
              <span className="font-mono text-zbrain-muted tabular-nums w-12 shrink-0">{e.time}</span>
              <span className="text-zbrain-ink">{e.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
