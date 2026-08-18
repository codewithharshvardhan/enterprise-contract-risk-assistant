import { useGovernanceData } from "../../lib/governance/useGovernanceData";
import { fetchCompliance } from "../../lib/governance/api";
import { compliance as complianceFixture, gradeColor, severityColor } from "../../lib/governance/fixtures";
import { KpiCard, Pill, SectionHeader } from "../../components/governance/ui";

export function Compliance() {
  const compliance = useGovernanceData(fetchCompliance, complianceFixture);
  const { coverage_pct, controls, needs_attention } = compliance;
  const counts = controls.reduce(
    (acc, c) => { acc[c.grade] = (acc[c.grade] ?? 0) + 1; return acc; },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-4">
      {/* Coverage strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Coverage"   value={`${coverage_pct}%`} sub="weighted by severity" accent />
        <KpiCard label="Strong"     value={counts.strong   ?? 0} />
        <KpiCard label="Moderate"   value={counts.moderate ?? 0} />
        <KpiCard label="Weak"       value={counts.weak     ?? 0} />
        <KpiCard label="No evidence" value={counts.none    ?? 0} />
      </div>

      {/* Needs attention */}
      {needs_attention.length > 0 && (
        <div className="card p-4 border-l-4 border-l-amber-500 bg-amber-50/60">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none">⚠</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">
                {needs_attention.length} controls need attention
              </p>
              <p className="text-xs text-amber-700 mt-0.5 mb-2">
                Evidence strength rated weak or below. Add policy rules or increase runtime coverage.
              </p>
              <div className="flex flex-wrap gap-2">
                {needs_attention.map((r) => (
                  <div key={r.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg border bg-white">
                    <span className="text-[11px] font-mono font-bold text-zbrain-ink">{r.id}</span>
                    <span className="text-[11px] text-zbrain-ink opacity-80">{r.name}</span>
                    <Pill className={severityColor[r.severity]}>{r.severity}</Pill>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OWASP control cards */}
      <div className="card p-5">
        <SectionHeader title="OWASP ASI Top-10 Coverage" subtitle="Evidence grade per control, derived from runtime governance events." />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {controls.map((c) => {
            const gc = gradeColor[c.grade] ?? "";
            return (
              <div key={c.id} className="card p-4 flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-mono font-bold text-zbrain">{c.id}</span>
                    <span className="text-sm font-semibold text-zbrain-ink">{c.name}</span>
                    <Pill className={severityColor[c.severity]}>{c.severity}</Pill>
                  </div>
                  <Pill className={gc}>{c.grade}</Pill>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-zbrain-muted">
                  <span><span className="font-semibold text-zbrain-ink">{c.rules}</span> policy rules</span>
                  <span>·</span>
                  <span>~<span className="font-semibold text-zbrain-ink">{c.evidence}</span> evaluations</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
