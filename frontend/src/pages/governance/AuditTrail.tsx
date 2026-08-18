import { useState } from "react";
import { useGovernanceData } from "../../lib/governance/useGovernanceData";
import { fetchAudit } from "../../lib/governance/api";
import { auditRows as auditRowsFixture, auditDetails as auditDetailsFixture, outcomeColor } from "../../lib/governance/fixtures";
import { Pill, SectionHeader } from "../../components/governance/ui";

export function AuditTrail() {
  const { rows: auditRows, details: auditDetails } = useGovernanceData(fetchAudit, { rows: auditRowsFixture, details: auditDetailsFixture });
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const selected = selectedIdx != null ? auditRows.find((r) => r.idx === selectedIdx) : null;
  const detail   = selectedIdx != null ? auditDetails[selectedIdx] : null;

  return (
    <>
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <SectionHeader title="Audit Trail" subtitle="Hash-chained audit log — click any row for the forensic detail panel." />
          <Pill className="bg-emerald-50 text-emerald-700 border-emerald-200">
            <span className="font-bold mr-1">✓</span> Hash chain: verified
          </Pill>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <select className="text-xs border border-zbrain-divider rounded-md px-2 py-1 bg-white"><option>All event types</option></select>
          <select className="text-xs border border-zbrain-divider rounded-md px-2 py-1 bg-white"><option>All agents</option></select>
          <select className="text-xs border border-zbrain-divider rounded-md px-2 py-1 bg-white"><option>All outcomes</option></select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zbrain-divider bg-zbrain-surface">
                {["#", "Time", "Agent", "Event", "Outcome", "Chain"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-zbrain-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {auditRows.map((r) => {
                const active = r.idx === selectedIdx;
                return (
                  <tr
                    key={r.idx}
                    onClick={() => setSelectedIdx(active ? null : r.idx)}
                    className={
                      "border-b border-zbrain-divider/50 cursor-pointer transition-colors " +
                      (active ? "bg-zbrain-50" : "hover:bg-zbrain-surface")
                    }
                  >
                    <td className="px-3 py-2 tabular-nums text-zbrain-muted">{r.idx}</td>
                    <td className="px-3 py-2 font-mono text-zbrain-muted">{r.time}</td>
                    <td className="px-3 py-2 text-zbrain-ink font-medium">{r.agent}</td>
                    <td className="px-3 py-2 text-zbrain-ink">{r.event}</td>
                    <td className="px-3 py-2"><Pill className={outcomeColor[r.outcome] ?? ""}>{r.outcome}</Pill></td>
                    <td className="px-3 py-2 text-emerald-600">✓</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Forensic bottom panel — slides up from the bottom when a row is selected */}
      {selected && detail && (
        <>
          <button
            aria-label="Close detail panel"
            onClick={() => setSelectedIdx(null)}
            className="fixed inset-0 bg-zbrain-ink/20 z-30 cursor-default"
          />
          <aside className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-zbrain-divider shadow-2xl max-h-[70vh] overflow-y-auto">
            <div className="max-w-[1400px] mx-auto px-6 py-5">
              {/* Panel header */}
              <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b border-zbrain-divider">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold">Audit entry #{selected.idx}</span>
                    <Pill className={outcomeColor[selected.outcome] ?? ""}>{selected.outcome}</Pill>
                  </div>
                  <h2 className="text-base font-semibold text-zbrain-ink">{selected.event}</h2>
                  <p className="text-xs text-zbrain-muted mt-0.5">
                    <span className="font-mono">{selected.time}</span> · {selected.agent}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedIdx(null)}
                  className="text-zbrain-muted hover:text-zbrain-ink text-xl leading-none px-2"
                >
                  ✕
                </button>
              </div>

              {/* Identity + chain integrity */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold mb-1">Agent DID</p>
                  <p className="text-xs font-mono text-zbrain-ink break-all">{detail.agentDid}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold mb-1">Run ID</p>
                  <p className="text-xs font-mono text-zbrain-ink">{detail.runId}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold mb-1">Policy decision</p>
                  <Pill className={
                    detail.policyDecision === "deny"  ? "bg-red-50 text-red-700 border-red-200" :
                    detail.policyDecision === "audit" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                                       "bg-emerald-50 text-emerald-700 border-emerald-200"
                  }>{detail.policyDecision}</Pill>
                </div>
              </div>

              {/* Hash chain */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="card p-3 bg-zbrain-surface border border-zbrain-divider">
                  <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold mb-1">Previous hash</p>
                  <p className="text-xs font-mono text-zbrain-ink">{detail.prevHash}</p>
                </div>
                <div className="card p-3 bg-zbrain-surface border border-zbrain-divider">
                  <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold mb-1">Entry hash</p>
                  <p className="text-xs font-mono text-zbrain-ink">{detail.entryHash}</p>
                </div>
              </div>

              {/* Raw action */}
              <div className="mb-4">
                <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold mb-1">Raw action</p>
                <pre className="card p-3 bg-zbrain-ink text-emerald-200 font-mono text-[11px] overflow-x-auto">{detail.rawAction}</pre>
              </div>

              {/* Context snapshot */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold mb-1">Context snapshot</p>
                <div className="card p-3 bg-zbrain-surface border border-zbrain-divider">
                  <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 text-xs">
                    {Object.entries(detail.contextSnapshot).map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-zbrain-muted font-mono">{k}</dt>
                        <dd className="text-zbrain-ink break-all">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
