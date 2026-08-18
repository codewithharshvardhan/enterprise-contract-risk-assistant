import type { PropsWithChildren, ReactNode } from "react";

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-zbrain-ink">{title}</h3>
      {subtitle && <p className="text-xs text-zbrain-muted mt-0.5">{subtitle}</p>}
    </div>
  );
}

export function KpiCard({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: string; accent?: boolean }) {
  return (
    <div className={`card p-4 ${accent ? "border-l-4 border-l-zbrain" : ""}`}>
      <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${accent ? "text-zbrain" : "text-zbrain-ink"}`}>{value}</p>
      {sub && <p className="text-[11px] text-zbrain-muted mt-0.5">{sub}</p>}
    </div>
  );
}

export function Pill({ className = "", children }: PropsWithChildren<{ className?: string }>) {
  return <span className={`pill border ${className}`}>{children}</span>;
}

export function RingBadge({ ring, className = "" }: { ring: number; className?: string }) {
  return <span className={`pill border ${className}`}>Ring {ring}</span>;
}
