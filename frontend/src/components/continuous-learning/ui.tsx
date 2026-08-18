import type { PropsWithChildren, ReactElement, ReactNode } from "react";

type SectionHeaderProps = Readonly<{ title: ReactNode; subtitle?: ReactNode; right?: ReactNode; tip?: string }>;
export function SectionHeader({ title, subtitle, right, tip }: SectionHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div>
        <h3 className="text-sm font-semibold text-zbrain-ink inline-flex items-center gap-1.5">
          {title}
          {tip && <InfoTip text={tip} />}
        </h3>
        {subtitle && <p className="text-xs text-zbrain-muted mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

type KpiCardProps = Readonly<{ label: string; value: ReactNode; sub?: string; trend?: string | null; tone?: "good" | "neutral" | "bad"; accent?: boolean }>;
export function KpiCard({ label, value, sub, trend, tone, accent }: KpiCardProps) {
  let valueColor: string;
  if (tone === "good") valueColor = "text-emerald-700";
  else if (tone === "bad") valueColor = "text-rose-700";
  else if (accent) valueColor = "text-zbrain";
  else valueColor = "text-zbrain-ink";
  return (
    <div className={`card p-4 ${accent ? "border-l-4 border-l-zbrain" : ""}`}>
      <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold">{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <p className={`text-2xl font-bold tabular-nums ${valueColor}`}>{value}</p>
        {trend && <span className="text-[11px] font-semibold text-emerald-600">{trend}</span>}
      </div>
      {sub && <p className="text-[11px] text-zbrain-muted mt-0.5">{sub}</p>}
    </div>
  );
}

type PillProps = Readonly<PropsWithChildren<{ className?: string }>>;
export function Pill({ className = "", children }: PillProps) {
  return <span className={`pill border ${className}`}>{children}</span>;
}

// Inline (?) tooltip — CSS hover, no JS. Position via "group" on the parent.
type InfoTipProps = Readonly<{ text: string }>;
export function InfoTip({ text }: InfoTipProps) {
  return (
    <span className="relative inline-flex group">
      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-zbrain-100 text-zbrain text-[9px] font-bold cursor-help">?</span>
      <span className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 w-64 text-[11px] leading-snug font-normal bg-zbrain-ink text-white px-2.5 py-1.5 rounded shadow-lg pointer-events-none">
        {text}
      </span>
    </span>
  );
}

// Clickable baseline tag — opens the drill-through panel.
type BaselineChipProps = Readonly<{ id: number; label: string; onClick?: (id: number) => void }>;
export function BaselineChip({ id, label, onClick }: BaselineChipProps) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(id)}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-zbrain-divider bg-white text-[11px] font-medium text-zbrain-ink hover:border-zbrain hover:bg-zbrain-50 transition-colors"
      title={`Open timeline for baseline ${label}`}
    >
      <span className="text-zbrain-muted">#{id}</span>
      <span>{label}</span>
    </button>
  );
}

// SVG flow arrow used by the Continuous Learning Loop diagram.
type FlowArrowProps = Readonly<{ direction: "up" | "down" | "left" | "right"; label?: string; color?: string }>;
export function FlowArrow({ direction, label, color = "#94A3B8" }: FlowArrowProps) {
  const horizontal = direction === "left" || direction === "right";
  const w = horizontal ? 60 : 24;
  const h = horizontal ? 24 : 60;
  let line: ReactElement;
  let head: ReactElement;
  if (direction === "right") {
    line = <line x1="2" y1="12" x2="52" y2="12" stroke={color} strokeWidth="2" strokeLinecap="round" />;
    head = <polyline points="46,5 56,12 46,19" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />;
  } else if (direction === "left") {
    line = <line x1="8" y1="12" x2="58" y2="12" stroke={color} strokeWidth="2" strokeLinecap="round" />;
    head = <polyline points="14,5 4,12 14,19" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />;
  } else if (direction === "down") {
    line = <line x1="12" y1="2" x2="12" y2="52" stroke={color} strokeWidth="2" strokeLinecap="round" />;
    head = <polyline points="5,46 12,56 19,46" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />;
  } else {
    line = <line x1="12" y1="8" x2="12" y2="58" stroke={color} strokeWidth="2" strokeLinecap="round" />;
    head = <polyline points="5,14 12,4 19,14" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />;
  }
  return (
    <div className={`flex ${horizontal ? "flex-col" : "flex-row"} items-center justify-center gap-1 select-none`} aria-hidden>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-shrink-0">
        {line}{head}
      </svg>
      {label && (
        <span className="text-[10px] font-medium uppercase tracking-wide whitespace-nowrap" style={{ color }}>{label}</span>
      )}
    </div>
  );
}
