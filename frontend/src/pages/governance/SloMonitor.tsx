import { useGovernanceData } from "../../lib/governance/useGovernanceData";
import { fetchSlo } from "../../lib/governance/api";
import { slo as sloFixture } from "../../lib/governance/fixtures";
import { KpiCard, Pill, SectionHeader } from "../../components/governance/ui";

export function SloMonitor() {
  const slo = useGovernanceData(fetchSlo, sloFixture);
  const maxTrend = Math.max(...slo.trend_24h);

  return (
    <div className="space-y-4">
      {/* Error budget strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard label="Error budget remaining" value={`${slo.error_budget.remaining_pct}%`} sub={`${slo.error_budget.window} window`} accent />
        <KpiCard label="Burn rate" value={slo.error_budget.burn_rate} sub="vs. ideal pace" />
        <KpiCard label="Stages in breach" value={slo.stages.filter((s) => s.status === "breach").length} sub="P95 latency above target" />
      </div>

      {/* Per-stage SLO table */}
      <div className="card p-5">
        <SectionHeader title="SLO Targets per Pipeline Stage" subtitle="P95 latency targets and observed values from the last 24 hours." />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zbrain-divider bg-zbrain-surface">
                {["Stage", "Target P95 (ms)", "Observed P95 (ms)", "Headroom", "Status"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-zbrain-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slo.stages.map((s) => {
                const headroom = s.target_p95_ms - s.observed_p95_ms;
                const ok = s.status === "ok";
                return (
                  <tr key={s.stage} className="border-b border-zbrain-divider/50">
                    <td className="px-3 py-2 font-semibold text-zbrain-ink">{s.stage}</td>
                    <td className="px-3 py-2 tabular-nums">{s.target_p95_ms}</td>
                    <td className="px-3 py-2 tabular-nums">{s.observed_p95_ms}</td>
                    <td className={`px-3 py-2 tabular-nums font-semibold ${ok ? "text-emerald-700" : "text-rose-700"}`}>
                      {headroom >= 0 ? "+" : ""}{headroom} ms
                    </td>
                    <td className="px-3 py-2">
                      <Pill className={ok ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}>
                        {ok ? "✓ within SLO" : "⚠ breach"}
                      </Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* P95 latency trend (sparkline) */}
      <div className="card p-5">
        <SectionHeader title="Decide stage P95 — 24h trend" subtitle="Sampled every 2h. Red zone above target (600 ms)." />
        <div className="flex items-end gap-1 h-28 px-1 border-l border-b border-zbrain-divider">
          {slo.trend_24h.map((v, i) => {
            const h = (v / maxTrend) * 100;
            const over = v > 600;
            return (
              <div key={i} className="flex-1 h-full flex flex-col items-center justify-end gap-0.5">
                <div className={`w-full rounded-sm ${over ? "bg-rose-300" : "bg-zbrain-100"}`} style={{ height: `${h}%` }} />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-zbrain-muted mt-2">
          <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>now</span>
        </div>
      </div>
    </div>
  );
}
