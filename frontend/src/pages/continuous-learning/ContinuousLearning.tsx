import { useState } from "react";
import { BaselineChip, FlowArrow, InfoTip, KpiCard, Pill, SectionHeader } from "../../components/continuous-learning/ui";
import { createBaseline, deleteBaseline, updateBaseline, decideOpportunity, backtestExperiment, promoteExperiment, rollbackConfig, retireExperiment } from "../../lib/continuous-learning/api";
import { useContinuousLearning } from "../../lib/continuous-learning/useContinuousLearning";
import {
  abExperiments,
  baselineStatusTone,
  baselineTimelines,
  baselines,
  changeTypeTone,
  classifyKind,
  dashboard,
  driftAlerts,
  feedback,
  funnel,
  opportunities,
  promoteStatusTone,
  promoted,
  severityTone,
  sla,
  STAGE_LABELS,
  STAGE_TONE,
  timelineKindTone,
  type Baseline,
  type DriftAlert,
  type FeedbackEntry,
  type LearningOpportunity,
  type ABExperiment,
  type PromotedExperiment,
} from "../../lib/continuous-learning/fixtures";

// ─── TABS ────────────────────────────────────────────────────────────────────
type SubTab = "dashboard" | "baselines" | "feedback" | "drift" | "tuning" | "experiments" | "promote";

const SUB_TABS: { key: SubTab; label: string; funnelHint?: string }[] = [
  { key: "dashboard",   label: "Overview" },
  { key: "baselines",   label: "Baselines · quality targets",   funnelHint: "00" },
  { key: "feedback",    label: "Capture · feedback log",        funnelHint: "01" },
  { key: "drift",       label: "Detect · drift & RCA bundles",  funnelHint: "02" },
  { key: "tuning",      label: "Propose · tuning queue",        funnelHint: "03" },
  { key: "experiments", label: "Validate · A/B experiments",    funnelHint: "04" },
  { key: "promote",     label: "Promote · live changes",        funnelHint: "05" },
];

function days(h: number | null) {
  if (h == null) return "n/a";
  return h < 36 ? `${Math.round(h)}h` : `${(h / 24).toFixed(1)}d`;
}

const baselineById = (id: number | null) => (id == null ? null : baselines.find((b) => b.id === id) ?? null);

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export function ContinuousLearning() {
  // Render bundled fixtures instantly, then swap in live /api/v1/continuous-learning data.
  // `refresh` re-hydrates the workspace after a baseline write.
  const { refresh } = useContinuousLearning();
  const [tab, setTab] = useState<SubTab>("dashboard");
  const [drillId, setDrillId] = useState<number | null>(null);
  const [driftFilter, setDriftFilter] = useState<number | null>(null);
  const [tuneFilter, setTuneFilter] = useState<number | null>(null);
  const [expFilter, setExpFilter] = useState<number | null>(null);
  const [promoteFilter, setPromoteFilter] = useState<number | null>(null);

  const openDrill = (id: number) => setDrillId(id);
  const closeDrill = () => setDrillId(null);

  const jumpFromDrill = (jump: SubTab, baselineId: number) => {
    if (jump === "drift") setDriftFilter(baselineId);
    if (jump === "tuning") setTuneFilter(baselineId);
    if (jump === "experiments") setExpFilter(baselineId);
    if (jump === "promote") setPromoteFilter(baselineId);
    setDrillId(null);
    setTab(jump);
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto px-6 py-6">
      {/* Page header — title, blurb, tab strip */}
      <div className="card p-4">
        <h1 className="text-lg font-semibold text-zbrain-ink">Continuous Learning</h1>
        <p className="text-[13px] text-zbrain-muted mt-1.5 max-w-3xl leading-relaxed">
          Track the AI&apos;s accuracy, surface classification drift before it impacts customers,
          and apply tuning suggestions with one click. Aggregates every CSR signal (thumbs,
          edits, and HITL outcomes) into a single quality workspace.
        </p>

        <div className="mt-4 flex items-center gap-1.5 flex-wrap">
          {SUB_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                tab === t.key
                  ? "bg-zbrain text-white border-zbrain"
                  : "bg-white text-zbrain-ink border-zbrain-divider hover:bg-zbrain-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Funnel — renders on every tab */}
      <HubFunnel onJump={setTab} />

      {tab === "dashboard"   && <OverviewTab onOpenDrill={openDrill} />}
      {tab === "baselines"   && <BaselinesTab onOpenDrill={openDrill} onRefresh={refresh} />}
      {tab === "feedback"    && <CaptureTab onOpenDrill={openDrill} />}
      {tab === "drift"       && <DetectTab baselineFilter={driftFilter} setBaselineFilter={setDriftFilter} onOpenDrill={openDrill} />}
      {tab === "tuning"      && <ProposeTab baselineFilter={tuneFilter} setBaselineFilter={setTuneFilter} onOpenDrill={openDrill} onRefresh={refresh} />}
      {tab === "experiments" && <ValidateTab baselineFilter={expFilter} setBaselineFilter={setExpFilter} onOpenDrill={openDrill} onRefresh={refresh} />}
      {tab === "promote"     && <PromoteTab baselineFilter={promoteFilter} setBaselineFilter={setPromoteFilter} onOpenDrill={openDrill} onRefresh={refresh} />}

      <BaselineDrillthrough baselineId={drillId} onClose={closeDrill} onJumpToTab={jumpFromDrill} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// HUB FUNNEL — 5-cell closed-loop strip with SLA pill
// ════════════════════════════════════════════════════════════════════════════
function HubFunnel({ onJump }: Readonly<{ onJump: (tab: SubTab) => void }>) {
  const stages = [
    { key: "capture",  num: "01", title: "Capture",  blurb: "Telemetry from every decision boundary",
      primary: `${funnel.capture.trace_events_7d.toLocaleString()} signals · 7d`,
      secondary: `${funnel.capture.feedback_7d} CSR feedback rows`,
      color: "#1A55F9", bg: "rgba(26, 85, 249, 0.06)", onClick: () => onJump("feedback") },
    { key: "detect",   num: "02", title: "Detect",   blurb: "Drift alerts + RCA bundles",
      primary: `${funnel.detect.drift_alerts_open} open drift alerts`,
      secondary: `${funnel.detect.rca_tickets_open} RCA tickets open`,
      color: "#C97A0B", bg: "rgba(201, 122, 11, 0.06)", onClick: () => onJump("drift") },
    { key: "propose",  num: "03", title: "Propose",  blurb: "Typed remediation candidates",
      primary: `${funnel.propose.opportunities_open} in queue`,
      secondary: `${funnel.propose.opportunities_accepted} accepted`,
      color: "#7A3CC1", bg: "rgba(122, 60, 193, 0.06)", onClick: () => onJump("tuning") },
    { key: "validate", num: "04", title: "Validate", blurb: "Shadow / A/B / canary, gated",
      primary: `${funnel.validate.shadow + funnel.validate.ready} live experiments`,
      secondary: `${funnel.validate.in_ab} opportunities in test`,
      color: "#0F8FA9", bg: "rgba(15, 143, 169, 0.06)", onClick: () => onJump("experiments") },
    { key: "promote",  num: "05", title: "Promote",  blurb: "Signed, versioned, reconciled",
      primary: `${funnel.promote.promoted_30d} promoted · 30d`,
      secondary: `${funnel.promote.rolled_back_30d} rollbacks (${funnel.promote.auto_rolled_back_30d} auto)`,
      color: "#1F8A4C", bg: "rgba(31, 138, 76, 0.06)", onClick: () => onJump("promote") },
  ];

  const slaTone = sla.met ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-700";

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-zbrain-muted font-semibold">Closed-loop discipline</div>
          <h2 className="text-sm font-semibold text-zbrain-ink mt-0.5">Capture → Detect → Propose → Validate → Promote</h2>
        </div>
        <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-[11px] font-semibold ${slaTone}`}>
          <span className="uppercase tracking-wider text-[9.5px]">Signal → remedy</span>
          <span className="tabular-nums">p90 {days(sla.p90_hours)}</span>
          <span className="opacity-70 tabular-nums">/ target {days(sla.target_p90_hours)}</span>
          <span className="tabular-nums opacity-70">· n={sla.samples}</span>
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
        {stages.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={s.onClick}
            className="text-left rounded-lg border border-zbrain-divider hover:border-zbrain hover:shadow-sm transition-all p-3 bg-white"
            style={{ borderTop: `3px solid ${s.color}` }}
            title={`Jump to ${s.title} surface`}
          >
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-[0.14em] font-bold" style={{ color: s.color }}>{s.num}</span>
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-semibold" style={{ background: s.bg, color: s.color }}>{i + 1}</span>
            </div>
            <div className="text-[13px] font-semibold text-zbrain-ink">{s.title}</div>
            <div className="text-[11px] text-zbrain-muted mb-2 leading-snug">{s.blurb}</div>
            <div className="text-[12.5px] font-semibold text-zbrain-ink tabular-nums">{s.primary}</div>
            <div className="text-[10.5px] text-zbrain-muted mt-0.5 tabular-nums">{s.secondary}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ════════════════════════════════════════════════════════════════════════════
function OverviewTab({ onOpenDrill }: Readonly<{ onOpenDrill: (id: number) => void }>) {
  const [windowDays, setWindowDays] = useState(dashboard.window_days);
  const fs = dashboard.feedback_summary;
  const ratio = fs.ratio_positive;
  const ratioTone: "good" | "neutral" | "bad" = ratio >= 0.8 ? "good" : ratio >= 0.6 ? "neutral" : "bad";

  return (
    <div className="space-y-4">
      <ContinuousLearningLoop />

      {/* Window control */}
      <div className="card p-3 flex items-center justify-between gap-3">
        <div className="text-xs text-zbrain-muted">
          Window: <span className="font-semibold text-zbrain-ink">{windowDays} days</span> · generated <span className="font-mono">{dashboard.generated_at}</span>
        </div>
        <div className="flex items-center gap-1">
          {[7, 14, 30, 90].map((d) => (
            <button key={d} onClick={() => setWindowDays(d)}
              className={`text-[11px] px-2.5 py-1 rounded-md border ${
                windowDays === d ? "bg-zbrain text-white border-zbrain" : "bg-white text-zbrain-ink border-zbrain-divider hover:bg-zbrain-50"
              }`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Feedback events" value={fs.total.toLocaleString()} sub={`👍 ${fs.thumbs_up} · 👎 ${fs.thumbs_down} · ✎ ${fs.edits}`} accent />
        <KpiCard label="Positive ratio"  value={`${Math.round(ratio * 100)}%`} sub="thumbs up / total" tone={ratioTone} />
        <KpiCard label="Drift signals"   value={funnel.detect.drift_alerts_open} sub={`${funnel.detect.rca_tickets_open} RCA tickets open`} tone={funnel.detect.drift_alerts_open > 0 ? "bad" : "good"} />
        <KpiCard label="Tuning queue"    value={funnel.propose.opportunities_open} sub={`${funnel.propose.opportunities_accepted} accepted`} tone="neutral" />
      </div>

      {/* Health by baseline + CSR feedback by stage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HealthByBaseline onOpenDrill={onOpenDrill} />
        <CsrFeedbackByStage />
      </div>

      {/* Throughput */}
      <Throughput24h />
    </div>
  );
}

function ContinuousLearningLoop() {
  const counts = {
    feedback: feedback.length,
    drift: driftAlerts.filter((d) => d.status !== "resolved").length,
    opportunitiesOpen: opportunities.filter((o) => o.status === "open").length,
    abActive: abExperiments.filter((x) => x.promote_status === "shadow" || x.promote_status === "ready").length,
    abPromoted: promoted.filter((x) => x.promote_status === "promoted").length,
  };

  const cell = (letter: string, subtitle: string, name: string, body: string, metric: { label: string; value: number; tone: "ok" | "warn" | "neutral" }, accent: string) => (
    <div className="text-left bg-white rounded-xl border border-zbrain-divider hover:border-zbrain hover:shadow-md transition p-4 w-full h-full">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold text-white" style={{ background: accent }}>{letter}</span>
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-zbrain-muted">{subtitle}</div>
          <div className="text-sm font-semibold text-zbrain-ink leading-tight">{name}</div>
        </div>
      </div>
      <p className="mt-2 text-xs text-zbrain-muted leading-snug">{body}</p>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.12em] text-zbrain-muted">{metric.label}</span>
        <span className={`text-2xl font-semibold tabular-nums ${
          metric.tone === "ok" ? "text-emerald-700" : metric.tone === "warn" ? "text-amber-700" : "text-zbrain-ink"
        }`}>{metric.value}</span>
      </div>
    </div>
  );

  return (
    <section className="card p-5 bg-gradient-to-br from-white to-zbrain-surface">
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-[0.14em] text-emerald-700 font-semibold">
          Five learning loops · live since first mailbox cutover
        </div>
        <h2 className="text-base font-semibold text-zbrain-ink mt-1">Continuous Learning Loop</h2>
        <p className="text-xs text-zbrain-muted mt-1 max-w-3xl">
          Each loop converts a CSR action or a Monitor signal into an auditable improvement on a cycle measured in days, with one-click rollback on every promoted change.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_60px_1fr] gap-y-3 gap-x-2 items-stretch">
        {cell("A", "Observe",  "Signal capture",            "Every CSR action and drift event lands in the Learning Store.",                          { label: "Signals captured",   value: counts.feedback,           tone: counts.feedback > 0 ? "ok" : "neutral" }, "#1A55F9")}
        <FlowArrow direction="right" label="Cluster"  color="#1A55F9" />
        {cell("B", "Identify", "Opportunity identification","Clustered into ranked candidates with lift, effort, and risk.",                          { label: "Open opportunities", value: counts.opportunitiesOpen,  tone: counts.opportunitiesOpen > 0 ? "warn" : "neutral" }, "#7A3CC1")}

        <FlowArrow direction="up"   label="Re-seed"        color="#0F8FA9" />
        <div className="hidden md:block" />
        <FlowArrow direction="down" label="Promote to A/B" color="#7A3CC1" />

        {cell("D", "Improve", "Operator-tunable knowledge bases", "Routine rule, glossary, and routing changes happen in the UI, not in code.", { label: "Promoted changes",   value: counts.abPromoted,         tone: counts.abPromoted > 0 ? "ok" : "neutral" }, "#0F8FA9")}
        <FlowArrow direction="left" label="Promoted" color="#C97A0B" />
        {cell("C", "Promote", "A/B promotion",            "Shadow comparison against production until pre-defined success criteria gate promotion.", { label: "Active experiments", value: counts.abActive,           tone: counts.abActive > 0 ? "warn" : "neutral" }, "#C97A0B")}
      </div>

      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[12px] font-bold text-white shrink-0" style={{ background: "#10B981" }}>E</span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-emerald-700">Always-on watch · spans A → B → C → D</div>
          <div className="text-sm font-semibold text-zbrain-ink leading-tight">Drift & anomaly detection</div>
          <p className="mt-1 text-xs text-zbrain-muted leading-snug">
            Rolling baselines surface accuracy and confidence anomalies. Crossing the SLO floor pauses auto-action for the affected segment.
          </p>
        </div>
        <span className="text-xs font-medium text-emerald-700 whitespace-nowrap">{counts.drift} active alerts →</span>
      </div>
    </section>
  );
}

function HealthByBaseline({ onOpenDrill }: Readonly<{ onOpenDrill: (id: number) => void }>) {
  // Sort: breached → drifting → unknown → healthy
  const order = { breached: 0, drifting: 1, unknown: 2, healthy: 3 };
  const sorted = [...baselines].sort((a, b) => (order[a.last_status] ?? 9) - (order[b.last_status] ?? 9));

  return (
    <div className="card p-5">
      <SectionHeader title="Health by baseline" tip="Each row is a quality target. Clicking a row opens its timeline across capture, detect, propose, validate, and promote." />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zbrain-divider bg-zbrain-surface">
              {["Baseline", "Status", "Last observed", "Drift / Opp / Exp / Promo"].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-zbrain-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => {
              const tone = baselineStatusTone[b.last_status];
              const driftCount = driftAlerts.filter((d) => d.baseline_id === b.id && d.status === "open").length;
              const oppCount = opportunities.filter((o) => o.baseline_id === b.id && o.status === "open").length;
              const expCount = abExperiments.filter((e) => e.baseline_id === b.id).length;
              const promoCount = promoted.filter((p) => p.baseline_id === b.id).length;
              return (
                <tr key={b.id} onClick={() => onOpenDrill(b.id)} className="border-b border-zbrain-divider/50 cursor-pointer hover:bg-zbrain-surface">
                  <td className="px-3 py-2.5">
                    <p className="text-xs font-semibold text-zbrain-ink">{b.label || b.metric}</p>
                    <p className="text-[10px] font-mono text-zbrain-muted">{b.segment}</p>
                  </td>
                  <td className="px-3 py-2.5"><Pill className={tone.chip}>{b.last_status}</Pill></td>
                  <td className="px-3 py-2.5 tabular-nums text-zbrain-ink">{b.last_observed?.toFixed(3) ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <Pill className="bg-rose-50 text-rose-700 border-rose-200">{driftCount}</Pill>
                      <Pill className="bg-purple-50 text-purple-700 border-purple-200">{oppCount}</Pill>
                      <Pill className="bg-amber-50 text-amber-700 border-amber-200">{expCount}</Pill>
                      <Pill className="bg-emerald-50 text-emerald-700 border-emerald-200">{promoCount}</Pill>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CsrFeedbackByStage() {
  const rows = Object.entries(dashboard.feedback_summary.per_stage).map(([stageKey, c]) => {
    const total = c.thumbs_up + c.thumbs_down + c.edit + c.other;
    const positivity = total > 0 ? c.thumbs_up / total : 0;
    return { stageKey, total, positivity, ...c };
  });

  return (
    <div className="card p-5">
      <SectionHeader title="CSR feedback by stage" tip="Per-stage thumbs/edit/other counts and a positivity rate. Edited drafts are the strongest tuning signal." />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zbrain-divider bg-zbrain-surface">
              {["Stage", "👍", "👎", "✎", "Total", "Positivity"].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-zbrain-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.stageKey} className="border-b border-zbrain-divider/50">
                <td className="px-3 py-2"><Pill className={STAGE_TONE[r.stageKey] ?? ""}>{STAGE_LABELS[r.stageKey] ?? r.stageKey}</Pill></td>
                <td className="px-3 py-2 tabular-nums text-emerald-700 font-semibold">{r.thumbs_up}</td>
                <td className="px-3 py-2 tabular-nums text-rose-700 font-semibold">{r.thumbs_down}</td>
                <td className="px-3 py-2 tabular-nums text-amber-700 font-semibold">{r.edit}</td>
                <td className="px-3 py-2 tabular-nums font-semibold">{r.total}</td>
                <td className="px-3 py-2 tabular-nums">{Math.round(r.positivity * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Throughput24h() {
  const t = dashboard.throughput_24h;
  const maxTier = Math.max(...t.by_tier.map((x) => x.count), 1);
  const maxStatus = Math.max(...t.by_status.map((x) => x.count), 1);
  return (
    <div className="card p-5">
      <SectionHeader title="Last 24h throughput" subtitle="Pipelines processed and how they decomposed by tier and status." />
      <div className="grid grid-cols-1 md:grid-cols-[140px_1fr_1fr] gap-4 items-start">
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold">Pipelines</p>
          <p className="text-4xl font-bold tabular-nums text-zbrain-ink">{t.pipelines}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold mb-2">By tier</p>
          <div className="space-y-1.5">
            {t.by_tier.map((row) => (
              <div key={row.tier} className="flex items-center gap-2">
                <span className="w-24 text-[11px] text-zbrain-ink">{row.tier}</span>
                <div className="flex-1 h-3 rounded-sm bg-zbrain-surface overflow-hidden">
                  <div className="h-full bg-zbrain-400" style={{ width: `${(row.count / maxTier) * 100}%` }} />
                </div>
                <span className="w-10 text-[11px] tabular-nums font-semibold text-right">{row.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold mb-2">By status</p>
          <div className="space-y-1.5">
            {t.by_status.map((row) => (
              <div key={row.status} className="flex items-center gap-2">
                <span className="w-24 text-[11px] text-zbrain-ink">{row.status}</span>
                <div className="flex-1 h-3 rounded-sm bg-zbrain-surface overflow-hidden">
                  <div className="h-full bg-emerald-400" style={{ width: `${(row.count / maxStatus) * 100}%` }} />
                </div>
                <span className="w-10 text-[11px] tabular-nums font-semibold text-right">{row.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// BASELINES TAB
// ════════════════════════════════════════════════════════════════════════════
function BaselinesTab({ onOpenDrill, onRefresh }: Readonly<{ onOpenDrill: (id: number) => void; onRefresh: () => Promise<void> }>) {
  // `editing` holds the row being edited (edit mode); `adding` toggles create mode.
  const [editing, setEditing] = useState<Baseline | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDelete = async (b: Baseline) => {
    if (!window.confirm(`Delete baseline "${b.label || b.metric}"? The drift detector will stop evaluating it.`)) return;
    setError(null);
    setDeletingId(b.id);
    try {
      const ok = await deleteBaseline(b.id);
      if (!ok) throw new Error("Backend unavailable — the baseline was not deleted.");
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  };

  const enabled = baselines.filter((b) => b.enabled);
  const counts = {
    total: baselines.length,
    enabled: enabled.length,
    healthy:  baselines.filter((b) => b.last_status === "healthy").length,
    drifting: baselines.filter((b) => b.last_status === "drifting").length,
    breached: baselines.filter((b) => b.last_status === "breached").length,
    block:    baselines.filter((b) => b.last_status === "breached" && b.severity === "block_promotion").length,
    unknown:  baselines.filter((b) => b.last_status === "unknown").length,
  };

  return (
    <div className="space-y-4">
      <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-zbrain-ink inline-flex items-center gap-1.5">
          Quality targets
          <InfoTip text="A baseline pins a target value, a tolerance band, and the severity (warn vs block promotion). Live metrics roll up against these to fire drift alerts and gate A/B promotions." />
        </h2>
        <div className="flex items-center gap-1.5">
          <button onClick={() => { void onRefresh(); }} className="text-[11px] px-3 py-1.5 rounded-md border border-zbrain-divider bg-white hover:bg-zbrain-surface text-zbrain-ink">↻ Refresh observations</button>
          <button onClick={() => { setError(null); setAdding(true); }} className="text-[11px] px-3 py-1.5 rounded-md bg-zbrain text-white font-semibold hover:bg-zbrain-700">+ Add baseline</button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total baselines" value={counts.total}    sub={`${counts.enabled} enabled`} accent />
        <KpiCard label="Healthy"          value={counts.healthy}  sub={`of ${counts.enabled} observed`} tone={counts.healthy === counts.enabled ? "good" : "neutral"} />
        <KpiCard label="Drifting"         value={counts.drifting} sub="inside tolerance band" tone={counts.drifting > 0 ? "neutral" : "good"} />
        <KpiCard label="Breached"         value={counts.breached} sub={`${counts.block} block promotions`} tone={counts.breached > 0 ? "bad" : "good"} />
      </div>

      {counts.block > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 flex items-center gap-2">
          <span className="text-rose-700 font-bold">⚠</span>
          <p className="text-xs text-rose-800">
            <span className="font-semibold">{counts.block} baseline{counts.block > 1 ? "s" : ""}</span> currently in <span className="font-mono">block_promotion</span> state. Auto-promotion is paused for affected segments until the breach clears.
          </p>
        </div>
      )}

      <BaselineGroup status="breached" rows={baselines.filter((b) => b.last_status === "breached")} onOpenDrill={onOpenDrill} onEdit={setEditing} onDelete={onDelete} deletingId={deletingId} />
      <BaselineGroup status="drifting" rows={baselines.filter((b) => b.last_status === "drifting")} onOpenDrill={onOpenDrill} onEdit={setEditing} onDelete={onDelete} deletingId={deletingId} />
      <BaselineGroup status="healthy"  rows={baselines.filter((b) => b.last_status === "healthy")}  onOpenDrill={onOpenDrill} onEdit={setEditing} onDelete={onDelete} deletingId={deletingId} />
      <BaselineGroup status="unknown"  rows={baselines.filter((b) => b.last_status === "unknown")}  onOpenDrill={onOpenDrill} onEdit={setEditing} onDelete={onDelete} deletingId={deletingId} />

      {(adding || editing) && (
        <BaselineEditor
          row={editing}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={async () => { setAdding(false); setEditing(null); await onRefresh(); }}
        />
      )}
    </div>
  );
}

function BaselineGroup({ status, rows, onOpenDrill, onEdit, onDelete, deletingId }: Readonly<{ status: keyof typeof baselineStatusTone; rows: Baseline[]; onOpenDrill: (id: number) => void; onEdit: (b: Baseline) => void; onDelete: (b: Baseline) => void; deletingId: number | null }>) {
  const [open, setOpen] = useState(status !== "healthy");
  const [expanded, setExpanded] = useState<number | null>(null);
  if (rows.length === 0) return null;
  const tone = baselineStatusTone[status];
  const title = status === "unknown" ? "No data yet" : status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-3 px-5 py-3 ${tone.bg} ${tone.border} border-b text-left`}
      >
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${tone.bar}`} />
          <span className={`text-sm font-semibold ${tone.text}`}>{title}</span>
          <Pill className={tone.chip}>{rows.length} baseline{rows.length > 1 ? "s" : ""}</Pill>
        </div>
        <span className={`text-xs ${tone.text}`}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="divide-y divide-zbrain-divider">
          {rows.map((b) => {
            const isOpen = expanded === b.id;
            return (
              <div key={b.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <BaselineChip id={b.id} label={b.label || b.metric} onClick={onOpenDrill} />
                      <Pill className={tone.chip}>{b.last_status}</Pill>
                      <Pill className={b.severity === "block_promotion" ? severityTone.high : severityTone.warn}>{b.severity}</Pill>
                      <span className="text-[10px] text-zbrain-muted font-mono">{b.segment}</span>
                    </div>
                    <p className="text-[11px] text-zbrain-muted mt-1.5 leading-snug">{b.rationale}</p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-2 text-[11px]">
                      <div><span className="text-zbrain-muted">Direction:</span> <span className="font-semibold">{b.direction}</span></div>
                      <div><span className="text-zbrain-muted">Target:</span> <span className="font-semibold tabular-nums">{b.target_value}</span></div>
                      <div><span className="text-zbrain-muted">Tolerance:</span> <span className="font-semibold tabular-nums">±{b.drift_pct}</span></div>
                      <div><span className="text-zbrain-muted">Observed:</span> <span className="font-semibold tabular-nums">{b.last_observed?.toFixed(3) ?? "—"}</span></div>
                      <div><span className="text-zbrain-muted">Owner:</span> <span className="font-semibold">{b.owner}</span></div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <button onClick={() => onOpenDrill(b.id)} className="text-[11px] text-zbrain font-semibold hover:underline whitespace-nowrap">View timeline →</button>
                    <div className="flex gap-1">
                      <button onClick={() => onEdit(b)} className="text-[10px] px-2 py-0.5 rounded border border-zbrain-divider text-zbrain-muted hover:bg-zbrain-surface">Edit</button>
                      <button onClick={() => onDelete(b)} disabled={deletingId === b.id} className="text-[10px] px-2 py-0.5 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50">{deletingId === b.id ? "Deleting…" : "Delete"}</button>
                    </div>
                  </div>
                </div>

                {b.segments_observed.length > 0 && (
                  <button onClick={() => setExpanded(isOpen ? null : b.id)} className="mt-2 text-[10px] text-zbrain-muted hover:text-zbrain-ink">
                    {isOpen ? "▾" : "▸"} {b.segments_observed.length} sub-segments observed
                  </button>
                )}
                {isOpen && b.segments_observed.length > 0 && (
                  <div className="mt-2 rounded border border-zbrain-divider bg-zbrain-surface/50 overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-zbrain-surface border-b border-zbrain-divider">
                          <th className="px-3 py-1.5 text-left text-[9px] uppercase tracking-wider text-zbrain-muted">Segment</th>
                          <th className="px-3 py-1.5 text-left text-[9px] uppercase tracking-wider text-zbrain-muted">Value</th>
                          <th className="px-3 py-1.5 text-left text-[9px] uppercase tracking-wider text-zbrain-muted">Observed at</th>
                        </tr>
                      </thead>
                      <tbody>
                        {b.segments_observed.map((s) => (
                          <tr key={s.segment} className="border-b border-zbrain-divider/40 last:border-0">
                            <td className="px-3 py-1.5 font-mono">{s.segment}</td>
                            <td className="px-3 py-1.5 tabular-nums font-semibold">{s.value.toFixed(3)}</td>
                            <td className="px-3 py-1.5 text-zbrain-muted font-mono">{s.observed_at}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-[10px] text-zbrain-muted px-3 py-1.5 border-t border-zbrain-divider">Rollup: <span className="font-mono">{b.rollup_strategy}</span></p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Metric options for create mode (no catalog endpoint in this template — adapt to
// your own metric registry). The default direction per metric mirrors the
// reference governance app: error-rate metrics minimise, agreement metrics maximise.
const METRIC_OPTIONS = [
  { key: "L4_false_positive_rate", direction: "min" },
  { key: "confidence_baseline", direction: "max" },
  { key: "spam_classifier_agreement", direction: "max" },
  { key: "reply_edit_rate", direction: "min" },
] as const satisfies readonly { key: string; direction: "min" | "max" }[];

const DEFAULT_METRIC = METRIC_OPTIONS[0];

// Build the initial controlled draft. In edit mode every field is pre-filled
// from the row. In create mode the operator picks a metric; target_value +
// drift_pct are seeded with sensible inferred defaults they can override.
function initialBaselineDraft(row: Baseline | null): Partial<Baseline> {
  if (row) return { ...row };
  return {
    metric: DEFAULT_METRIC.key,
    segment: "global",
    direction: DEFAULT_METRIC.direction,
    target_value: 0.9,
    drift_pct: 5,
    severity: "warn",
    enabled: true,
    source: "post-hoc ground truth (HITL audit)",
    label: "",
    rationale: "",
  };
}

function BaselineEditor({ row, onClose, onSaved }: Readonly<{ row: Baseline | null; onClose: () => void; onSaved: () => void | Promise<void> }>) {
  const isNew = !row;
  const [draft, setDraft] = useState<Partial<Baseline>>(() => initialBaselineDraft(row));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The target is INFERRED from observed data, never typed blank. On edit we show
  // the baseline's current (data-derived) target as the starting point; on create
  // we seed a default. Either way the operator ACCEPTS or OVERRIDES it.
  const inferredTarget = row?.target_value ?? null;
  const inferredDrift = row?.drift_pct ?? null;
  const factors = row?.cause_factors ?? [];

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const created = await createBaseline({ metric: draft.metric ?? "", ...draft });
        if (!created) throw new Error("Backend unavailable — the baseline was not created.");
      } else {
        // Metric + segment are immutable on edit; only send the tunable fields.
        const updated = await updateBaseline(row.id, {
          target_value: draft.target_value,
          drift_pct: draft.drift_pct,
          direction: draft.direction,
          severity: draft.severity,
          enabled: draft.enabled,
          source: draft.source,
          label: draft.label,
          rationale: draft.rationale,
        });
        if (!updated) throw new Error("Backend unavailable — the baseline was not updated.");
      }
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl max-w-xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-zbrain-divider">
          <h3 className="text-sm font-semibold text-zbrain-ink">{isNew ? "Add baseline" : "Edit baseline"}</h3>
          <button onClick={onClose} className="text-zbrain-muted hover:text-zbrain-ink text-xl leading-none">✕</button>
        </div>
        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold">Metric</span>
              <select
                className="mt-1 w-full text-xs border border-zbrain-divider rounded-md px-2 py-1.5 bg-white disabled:bg-zbrain-surface disabled:text-zbrain-muted"
                value={draft.metric ?? ""}
                disabled={!isNew}
                onChange={(e) => {
                  const m = METRIC_OPTIONS.find((x) => x.key === e.target.value);
                  setDraft((d) => ({ ...d, metric: e.target.value, direction: m?.direction ?? d.direction }));
                }}
              >
                {METRIC_OPTIONS.map((m) => <option key={m.key} value={m.key}>{m.key}</option>)}
                {/* Preserve a custom metric that isn't in the option list (edit mode). */}
                {draft.metric && !METRIC_OPTIONS.some((m) => m.key === draft.metric) && (
                  <option value={draft.metric}>{draft.metric}</option>
                )}
              </select>
              {!isNew && <span className="block text-[9px] text-zbrain-muted mt-0.5">metric is immutable; delete and recreate to change</span>}
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold">Segment</span>
              <input
                className="mt-1 w-full text-xs border border-zbrain-divider rounded-md px-2 py-1.5 font-mono disabled:bg-zbrain-surface disabled:text-zbrain-muted"
                placeholder="stage:decide"
                value={draft.segment ?? ""}
                disabled={!isNew}
                onChange={(e) => setDraft((d) => ({ ...d, segment: e.target.value }))}
              />
              {!isNew && <span className="block text-[9px] text-zbrain-muted mt-0.5">segment is immutable on edit</span>}
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold">Direction</span>
              <select
                className="mt-1 w-full text-xs border border-zbrain-divider rounded-md px-2 py-1.5 bg-white"
                value={draft.direction ?? "min"}
                onChange={(e) => setDraft((d) => ({ ...d, direction: e.target.value as "min" | "max" }))}
              >
                <option value="min">min (lower is better)</option>
                <option value="max">max (higher is better)</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold">Severity</span>
              <select
                className="mt-1 w-full text-xs border border-zbrain-divider rounded-md px-2 py-1.5 bg-white"
                value={draft.severity ?? "warn"}
                onChange={(e) => setDraft((d) => ({ ...d, severity: e.target.value as "warn" | "block_promotion" }))}
              >
                <option value="warn">warn</option>
                <option value="block_promotion">block_promotion</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold">Target value</span>
              <input
                type="number"
                step="any"
                className="mt-1 w-full text-xs border border-zbrain-divider rounded-md px-2 py-1.5 tabular-nums"
                value={draft.target_value ?? 0}
                onChange={(e) => setDraft((d) => ({ ...d, target_value: Number(e.target.value) }))}
              />
              <span className="block text-[9px] text-zbrain-muted mt-0.5">
                {inferredTarget != null
                  ? `inferred from data: ${inferredTarget} — accept or override`
                  : "inferred default — accept or override"}
              </span>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold">Tolerance (drift %)</span>
              <input
                type="number"
                step="0.1"
                className="mt-1 w-full text-xs border border-zbrain-divider rounded-md px-2 py-1.5 tabular-nums"
                value={draft.drift_pct ?? 0}
                onChange={(e) => setDraft((d) => ({ ...d, drift_pct: Number(e.target.value) }))}
              />
              <span className="block text-[9px] text-zbrain-muted mt-0.5">
                {inferredDrift != null
                  ? `inferred from data: ±${inferredDrift}% — accept or override`
                  : "how far observed can stray before an alert fires"}
              </span>
            </label>
          </div>
          {factors.length > 0 && (
            <div className="rounded-md border border-zbrain-divider bg-zbrain-surface/50 px-3 py-2">
              <span className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold">Detected drift factors</span>
              <p className="text-[11px] text-zbrain-ink mt-0.5">
                factors: <span className="font-mono">{factors.join(", ")}</span> <span className="text-zbrain-muted">[detected]</span>
              </p>
            </div>
          )}
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold">Source</span>
            <input
              className="mt-1 w-full text-xs border border-zbrain-divider rounded-md px-2 py-1.5"
              value={draft.source ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold">Display label</span>
            <input
              className="mt-1 w-full text-xs border border-zbrain-divider rounded-md px-2 py-1.5"
              placeholder="Optional friendly name"
              value={draft.label ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold">Rationale</span>
            <textarea
              className="mt-1 w-full text-xs border border-zbrain-divider rounded-md px-2 py-1.5 h-20 resize-none"
              placeholder="Why this target was chosen…"
              value={draft.rationale ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, rationale: e.target.value }))}
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!draft.enabled}
              onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
            />
            <span className="text-[11px] text-zbrain-ink">Enabled (detector evaluates this baseline on every pass)</span>
          </label>
          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-800">{error}</div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-zbrain-divider flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-[11px] px-3 py-1.5 rounded-md border border-zbrain-divider text-zbrain-muted hover:bg-zbrain-surface">Cancel</button>
          <button onClick={() => { void save(); }} disabled={saving} className="text-[11px] px-3 py-1.5 rounded-md bg-zbrain text-white font-semibold hover:bg-zbrain-700 disabled:opacity-50">
            {saving ? "Saving…" : isNew ? "Create baseline" : "Save baseline"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CAPTURE TAB — feedback log
// Mirrors keysight FeedbackLogPanel: KPI strip · stage/kind FilterPills with
// icons · pipeline groups with thumbs summary · per-entry rows with icon+kind
// pill, baseline chip, and a collapsible stage-snapshot JSON block.
// ════════════════════════════════════════════════════════════════════════════
function CaptureTab({ onOpenDrill }: Readonly<{ onOpenDrill: (id: number) => void }>) {
  const [stage, setStage] = useState<string>("all");
  const [kind, setKind] = useState<"all" | "positive" | "negative" | "edit" | "note">("all");
  const [baselineFilter, setBaselineFilter] = useState<number | null>(null);
  const [groupByPipeline, setGroupByPipeline] = useState(true);
  const [open, setOpen] = useState<Set<number>>(new Set());

  const totals = {
    all:      feedback.length,
    positive: feedback.filter((r) => r.kind.endsWith("_up") || r.kind === "approve").length,
    negative: feedback.filter((r) => r.kind.endsWith("_down") || r.kind === "reject").length,
    edit:     feedback.filter((r) => r.kind === "edit_and_approve").length,
    note:     feedback.filter((r) => r.kind.endsWith("_note") || r.kind === "note").length,
  };
  const stageCounts: Record<string, number> = {};
  for (const r of feedback) stageCounts[r.stage] = (stageCounts[r.stage] ?? 0) + 1;

  const filtered = feedback.filter((r) => {
    if (stage !== "all" && r.stage !== stage) return false;
    if (kind === "positive" && !(r.kind.endsWith("_up") || r.kind === "approve")) return false;
    if (kind === "negative" && !(r.kind.endsWith("_down") || r.kind === "reject")) return false;
    if (kind === "note" && !(r.kind.endsWith("_note") || r.kind === "note")) return false;
    if (kind === "edit" && r.kind !== "edit_and_approve") return false;
    if (baselineFilter != null && r.baseline_id !== baselineFilter && r.derived_baseline_id !== baselineFilter) return false;
    return true;
  });

  // Group by pipeline_id, newest pipeline first
  const grouped = new Map<number, FeedbackEntry[]>();
  for (const r of filtered) {
    const arr = grouped.get(r.pipeline_id) ?? [];
    arr.push(r);
    grouped.set(r.pipeline_id, arr);
  }
  const groups = Array.from(grouped.entries()).sort((a, b) => b[0] - a[0]);

  const togglePipeline = (id: number) => {
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        {/* Header row: title left, KPI strip + baseline filter + refresh right */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h2 className="text-sm font-semibold inline-flex items-center gap-1.5">
            Feedback log
            <InfoTip text="Per-stage CSR signals from Trace and HITL outcomes. Feeds tuning and drift detection." />
          </h2>
          <div className="flex items-start gap-3 flex-wrap">
            <div className="grid grid-cols-5 gap-2 text-center">
              <KPIPill label="Total" n={totals.all}      tone="text-zbrain-ink" />
              <KPIPill label="👍"     n={totals.positive} tone="text-emerald-700" />
              <KPIPill label="👎"     n={totals.negative} tone="text-rose-700" />
              <KPIPill label="✎"      n={totals.edit}     tone="text-amber-700" />
              <KPIPill label="💬"     n={totals.note}     tone="text-zbrain" />
            </div>
            <BaselineFilterDropdown value={baselineFilter} onChange={setBaselineFilter} />
            <button className="text-[11px] px-3 py-1.5 rounded-md border border-zbrain-divider bg-white hover:bg-zbrain-surface text-zbrain-ink whitespace-nowrap">↻ Refresh</button>
          </div>
        </div>

        {/* Filter pill rows: Stage + Kind */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wider text-zbrain-muted">Stage:</span>
          <FilterPill active={stage === "all"} onClick={() => setStage("all")} label="All" count={feedback.length} />
          {Object.entries(STAGE_LABELS).map(([k, v]) => (
            <FilterPill key={k} active={stage === k} onClick={() => setStage(k)} label={v} count={stageCounts[k] ?? 0} />
          ))}
          <span className="ml-3 text-xs uppercase tracking-wider text-zbrain-muted">Kind:</span>
          <FilterPill active={kind === "all"}      onClick={() => setKind("all")}      label="All" />
          <FilterPill active={kind === "positive"} onClick={() => setKind("positive")} label="👍" />
          <FilterPill active={kind === "negative"} onClick={() => setKind("negative")} label="👎" />
          <FilterPill active={kind === "edit"}     onClick={() => setKind("edit")}     label="✎ edits" />
          <FilterPill active={kind === "note"}     onClick={() => setKind("note")}     label="💬 notes" />
          <button onClick={() => setGroupByPipeline((v) => !v)} className="ml-auto text-xs text-zbrain hover:underline">
            {groupByPipeline ? "show flat list" : "group by activity"}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-12 text-center text-zbrain-muted text-sm">
          No feedback yet. Open a request in Activity and use the per-stage feedback controls, or resolve a HITL task.
        </div>
      ) : groupByPipeline ? (
        <div className="space-y-3">
          {groups.map(([pid, items]) => (
            <PipelineGroup
              key={pid}
              pipelineId={pid}
              items={items}
              expanded={open.has(pid) || groups.length <= 3}
              onToggle={() => togglePipeline(pid)}
              onOpenDrill={onOpenDrill}
            />
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-zbrain-divider">
            {filtered.map((f) => <FeedbackRow key={f.id} f={f} showPipeline onOpenDrill={onOpenDrill} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function KPIPill({ label, n, tone }: Readonly<{ label: string; n: number; tone: string }>) {
  return (
    <div className="bg-zbrain-surface border border-zbrain-divider rounded-md px-2 py-1.5 min-w-[60px]">
      <div className="text-[10px] uppercase tracking-wider text-zbrain-muted">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${tone}`}>{n}</div>
    </div>
  );
}

function FilterPill({ active, onClick, label, count }: Readonly<{ active: boolean; onClick: () => void; label: string; count?: number }>) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
        active ? "bg-zbrain text-white border-zbrain" : "bg-white text-zbrain-ink border-zbrain-divider hover:bg-zbrain-50"
      }`}
    >
      {label}
      {count != null && <span className={`ml-1 text-[10px] ${active ? "text-white/80" : "text-zbrain-muted"}`}>{count}</span>}
    </button>
  );
}

function PipelineGroup({
  pipelineId, items, expanded, onToggle, onOpenDrill,
}: Readonly<{ pipelineId: number; items: FeedbackEntry[]; expanded: boolean; onToggle: () => void; onOpenDrill: (id: number) => void }>) {
  let pos = 0, neg = 0, note = 0, edit = 0;
  const stageBreakdown: Record<string, number> = {};
  for (const f of items) {
    stageBreakdown[f.stage] = (stageBreakdown[f.stage] ?? 0) + 1;
    if (f.kind.endsWith("_up") || f.kind === "approve") pos += 1;
    else if (f.kind.endsWith("_down") || f.kind === "reject") neg += 1;
    else if (f.kind === "edit_and_approve") edit += 1;
    else if (f.kind.endsWith("_note") || f.kind === "note") note += 1;
  }
  return (
    <div className="card overflow-hidden">
      <button onClick={onToggle} className="w-full text-left px-4 py-3 bg-zbrain-surface hover:bg-zbrain-50/40 flex items-center gap-3 border-b border-zbrain-divider flex-wrap">
        <span className="text-xs text-zbrain-muted">{expanded ? "▾" : "▸"}</span>
        <span className="text-sm font-semibold">Activity #{pipelineId}</span>
        <span className="text-xs text-zbrain-muted">·</span>
        <span className="text-xs text-zbrain-muted">{items.length} signal{items.length === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-1.5 ml-2">
          {pos  > 0 && <span className="pill bg-emerald-100 text-emerald-700 text-[10px]">👍 {pos}</span>}
          {neg  > 0 && <span className="pill bg-rose-100 text-rose-700 text-[10px]">👎 {neg}</span>}
          {edit > 0 && <span className="pill bg-amber-100 text-amber-800 text-[10px]">✎ {edit}</span>}
          {note > 0 && <span className="pill bg-zbrain-50 text-zbrain text-[10px]">💬 {note}</span>}
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {Object.entries(stageBreakdown).map(([k, v]) => (
            <span key={k} className={`pill border text-[10px] ${STAGE_TONE[k] ?? "bg-slate-100 text-slate-700 border-zbrain-divider"}`}>
              {STAGE_LABELS[k] ?? k} · {v}
            </span>
          ))}
          <span className="text-xs text-zbrain hover:underline whitespace-nowrap">Open Trace ↗</span>
        </div>
      </button>
      {expanded && (
        <div className="divide-y divide-zbrain-divider">
          {items.map((f) => <FeedbackRow key={f.id} f={f} onOpenDrill={onOpenDrill} />)}
        </div>
      )}
    </div>
  );
}

function FeedbackRow({ f, showPipeline, onOpenDrill }: Readonly<{ f: FeedbackEntry; showPipeline?: boolean; onOpenDrill: (id: number) => void }>) {
  const [showSnapshot, setShowSnapshot] = useState(false);
  const k = classifyKind(f.kind);
  const persistedId = f.baseline_id ?? null;
  const derivedId   = f.derived_baseline_id ?? null;
  const anchorId    = persistedId ?? derivedId;
  const isDerivedOnly = persistedId == null && derivedId != null;
  const baseline = baselineById(anchorId);

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <span className="font-mono text-zbrain-muted whitespace-nowrap">{f.ts}</span>
        <span className={`pill border text-[10px] ${STAGE_TONE[f.stage] ?? "bg-slate-100 text-slate-700 border-zbrain-divider"}`}>
          {STAGE_LABELS[f.stage] ?? f.stage}
        </span>
        <span className={`pill ${k.tone} text-[10px]`}>{k.icon} {k.label}</span>
        {baseline ? (
          <span className="inline-flex items-center gap-1">
            <BaselineChip id={baseline.id} label={baseline.label || baseline.metric} onClick={onOpenDrill} />
            {isDerivedOnly && <span className="text-[9px] text-zbrain-muted italic">derived</span>}
          </span>
        ) : (
          <span className="text-[10px] text-zbrain-muted italic">no baseline</span>
        )}
        <span className="text-[10px] text-zbrain-muted">{f.csr}</span>
        {showPipeline && <span className="ml-auto text-zbrain hover:underline">Activity #{f.pipeline_id} ↗</span>}
      </div>
      {f.note && <div className="mt-1.5 text-sm text-zbrain-ink">{f.note}</div>}
      {f.data && Object.keys(f.data).length > 0 && (
        <div className="mt-2">
          <button onClick={() => setShowSnapshot(!showSnapshot)} className="text-[11px] text-zbrain-muted cursor-pointer hover:text-zbrain-ink">
            {showSnapshot ? "▾" : "▸"} stage snapshot ({Object.keys(f.data).length} key{Object.keys(f.data).length === 1 ? "" : "s"})
          </button>
          {showSnapshot && (
            <pre className="mt-1.5 text-[10px] bg-slate-50 border border-zbrain-divider rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap">
              {JSON.stringify(f.data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DETECT TAB — drift alerts + RCA
// ════════════════════════════════════════════════════════════════════════════
function DetectTab({ baselineFilter, setBaselineFilter, onOpenDrill }: Readonly<{ baselineFilter: number | null; setBaselineFilter: (id: number | null) => void; onOpenDrill: (id: number) => void }>) {
  const [showUnanchored, setShowUnanchored] = useState(false);
  const rows = driftAlerts.filter((d) => {
    if (baselineFilter != null && d.baseline_id !== baselineFilter) return false;
    if (!showUnanchored && d.baseline_id == null) return false;
    return true;
  });

  const armed    = rows.filter((d) => d.circuit_breaker_fired).length;
  const breached = rows.filter((d) => d.severity === "slo_breach").length;
  const warned   = rows.filter((d) => d.severity === "warn" || d.severity === "medium").length;
  const resolved = rows.filter((d) => d.status === "resolved").length;

  return (
    <div className="space-y-3">
      <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-zbrain-ink inline-flex items-center gap-1.5">
          Drift signals
          <InfoTip text="A drift signal fires when a live metric moves outside its baseline tolerance band. Each card carries an RCA bundle: contributing features, hypothesis, and example runs." />
        </h2>
        <div className="flex items-center gap-1.5 flex-wrap">
          <BaselineFilterDropdown value={baselineFilter} onChange={setBaselineFilter} />
          <label className="flex items-center gap-1 text-[11px] text-zbrain-ink">
            <input type="checkbox" checked={showUnanchored} onChange={(e) => setShowUnanchored(e.target.checked)} />
            Show alerts without a baseline anchor
          </label>
          <button className="text-[11px] px-3 py-1.5 rounded-md border border-zbrain-divider bg-white hover:bg-zbrain-surface text-zbrain-ink">↻ Refresh</button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Pill className="bg-rose-50 text-rose-700 border-rose-200">Circuit breaker armed · {armed}</Pill>
          <Pill className="bg-rose-50 text-rose-700 border-rose-200">SLO breach · {breached}</Pill>
          <Pill className="bg-amber-50 text-amber-700 border-amber-200">Warning · {warned}</Pill>
          <Pill className="bg-slate-100 text-slate-600 border-slate-200">Resolved · {resolved}</Pill>
        </div>
      )}

      <div className="space-y-3">
        {rows.map((d) => <DriftAlertCard key={d.id} alert={d} onOpenDrill={onOpenDrill} />)}
        {rows.length === 0 && <div className="card p-6 text-sm text-zbrain-muted">No drift signals match the current filter.</div>}
      </div>
    </div>
  );
}

function describeSegment(seg: string) {
  return seg.replace(/_/g, " ").replace(/,\s*/g, " · ");
}

function fmtMetricValue(v: number, unit: "rate" | "probability" | "hours" | "raw") {
  if (unit === "rate" || unit === "probability") return `${(v * 100).toFixed(1)}%`;
  if (unit === "hours") return `${v}h`;
  return v.toFixed(3);
}

function DriftAlertCard({ alert, onOpenDrill }: Readonly<{ alert: DriftAlert; onOpenDrill: (id: number) => void }>) {
  const [showRaw, setShowRaw] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showRca, setShowRca] = useState(false);

  // Natural-language headline — matches the reference DriftAlertCard.
  const segDesc   = describeSegment(alert.segment);
  const baseStr   = fmtMetricValue(alert.baseline_median, alert.metric_unit);
  const currStr   = fmtMetricValue(alert.recent_median, alert.metric_unit);
  const direction = alert.worse === "higher" ? "rose to" : "dropped to";
  const headline  = `${alert.metric_label} for ${segDesc} ${direction} ${currStr} from a ${baseStr} baseline.`;

  const isWorseChange = alert.worse === "higher" ? alert.delta_pct >= 0 : alert.delta_pct <= 0;
  const deltaTone = isWorseChange ? "text-rose-700" : "text-emerald-700";

  const detailEntries = Object.entries(alert.details);

  const statusLabel = ({ open: "Open", in_review: "In review", resolved: "Resolved" } as Record<string, string>)[alert.status] ?? alert.status;
  const statusPillCls = alert.status === "resolved"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : alert.status === "in_review"
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-rose-50 text-rose-700 border-rose-200";

  return (
    <div className="border border-zbrain-divider rounded-lg p-4">
      {/* Header chip row */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <BaselineChip id={alert.baseline_id} label={alert.baseline_label} onClick={onOpenDrill} />
        <Pill className={`${severityTone[alert.severity] ?? ""} uppercase tracking-[0.1em] font-semibold`}>
          {alert.severity === "slo_breach" ? "SLO breach" : alert.severity}
        </Pill>
        <Pill className="bg-slate-100 text-slate-700 border-slate-200">{alert.metric_label}</Pill>
        <span className="text-[10px] uppercase tracking-wider text-zbrain-muted font-mono">{alert.segment}</span>
        <span className="ml-auto text-[11px] text-zbrain-muted whitespace-nowrap">Detected {alert.detected_at}</span>
      </div>

      {/* Headline sentence with InfoTip glossary */}
      <div className="text-[14px] font-semibold text-zbrain-ink leading-snug inline-flex items-start gap-1.5">
        <span>{headline}</span>
        <InfoTip text={`Metric: ${alert.metric_label} (${alert.metric}). Worse = ${alert.worse}. Baseline source: ${baselineById(alert.baseline_id)?.source ?? "n/a"}. Severity rule: ${alert.severity === "slo_breach" ? "metric breached its SLO floor — auto-action paused" : alert.severity === "high" ? "high-impact deviation, on-call should triage" : "tolerance band exceeded"}.`} />
      </div>

      {/* Inline metrics row */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
        <span><span className="text-zbrain-muted">Baseline:</span> <span className="font-semibold tabular-nums">{baseStr}</span></span>
        <span><span className="text-zbrain-muted">Observed:</span> <span className="font-semibold tabular-nums">{currStr}</span></span>
        <span className={`tabular-nums font-semibold ${deltaTone}`}>{alert.delta_pct > 0 ? "+" : ""}{alert.delta_pct.toFixed(1)}%</span>
        {alert.details.share_pct != null && (
          <span>
            <span className="text-zbrain-muted">Share:</span>{" "}
            <span className="font-semibold tabular-nums">
              {typeof alert.details.share_pct === "number" ? alert.details.share_pct.toFixed(1) : alert.details.share_pct}% of cases
            </span>
          </span>
        )}
      </div>

      {/* Top contributor chip */}
      {alert.top_contributors.length > 0 && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50/70 px-2 py-1 text-[11px] text-rose-900">
          <span className="text-rose-700 font-semibold uppercase tracking-wider text-[9.5px]">Top contributor</span>
          <span className="font-mono text-[11px]">{alert.top_contributors[0]!.segment}</span>
          <span className="text-zbrain-muted">at</span>
          <span className="font-semibold tabular-nums">{fmtMetricValue(alert.top_contributors[0]!.observed, alert.metric_unit)}</span>
          {alert.top_contributors.length > 1 && (
            <InfoTip text={alert.top_contributors.map((c) => `${c.segment} at ${fmtMetricValue(c.observed, alert.metric_unit)} (${c.status}, n=${c.sample_size.toLocaleString()})`).join("\n")} />
          )}
        </div>
      )}

      {/* Circuit breaker */}
      {alert.circuit_breaker_fired && (
        <div className="mt-2.5 px-3 py-2 rounded-md border border-rose-200 bg-rose-50 text-xs text-rose-900 inline-flex items-center gap-1.5">
          <span className="font-semibold">Circuit breaker is armed.</span>
          <InfoTip text={alert.circuit_breaker_message ?? `New cases in segment ${alert.segment} cannot auto-close at L4 right now. They drop to L2 human review until a rule owner resolves this alert or the metric recovers.`} />
        </div>
      )}

      {/* How the detector got these numbers */}
      {detailEntries.length > 0 && (
        <div className="mt-2.5">
          <button onClick={() => setShowDetails(!showDetails)} className="text-[11px] uppercase tracking-wider text-zbrain-muted font-semibold cursor-pointer hover:text-zbrain-ink select-none">
            {showDetails ? "▾" : "▸"} How the detector got these numbers
          </button>
          {showDetails && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 mt-1.5 text-[12px] leading-snug pl-3 border-l-2 border-zbrain-divider/70">
              {detailEntries.map(([k, v]) => (
                <div key={k}>
                  <span className="text-zbrain-muted">{k.replace(/_/g, " ")}:</span>{" "}
                  <span className="text-zbrain-ink tabular-nums">{String(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* RCA bundle (kept from previous design — adds top features + example runs) */}
      <div className="mt-2.5">
        <button onClick={() => setShowRca(!showRca)} className="text-[11px] uppercase tracking-wider text-zbrain-muted font-semibold cursor-pointer hover:text-zbrain-ink select-none">
          {showRca ? "▾" : "▸"} RCA bundle ({alert.rca.evidence_count} runs analysed)
        </button>
        {showRca && (
          <div className="mt-2 rounded-md border border-zbrain-divider bg-zbrain-surface/40 p-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold mb-1.5">Root-cause hypothesis</p>
              <p className="text-[11px] text-zbrain-ink leading-relaxed">{alert.rca.hypothesis}</p>
              {alert.rca.correlated_alert_ids.length > 0 && (
                <p className="text-[10px] text-zbrain-muted mt-2">Correlated alerts: {alert.rca.correlated_alert_ids.map((id) => `#${id}`).join(", ")}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold mb-1.5">Top contributing features</p>
              <div className="space-y-1.5">
                {alert.rca.top_features.map((f) => (
                  <div key={f.name}>
                    <div className="flex justify-between mb-0.5">
                      <span className="text-[10px] font-mono">{f.name}</span>
                      <span className="text-[10px] tabular-nums font-semibold">{f.direction}{f.weight.toFixed(2)}</span>
                    </div>
                    <div className="h-1.5 bg-white rounded-sm overflow-hidden">
                      <div className={`h-full ${f.direction === "+" ? "bg-rose-400" : "bg-emerald-400"}`} style={{ width: `${f.weight * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold mb-1.5">Example runs</p>
              <div className="space-y-1.5">
                {alert.rca.example_runs.map((r) => (
                  <div key={r.run_id} className="rounded border border-zbrain-divider bg-white p-2">
                    <div className="flex justify-between mb-0.5">
                      <span className="text-[10px] font-mono font-semibold">{r.run_id}</span>
                      <span className="text-[10px] text-zbrain-muted">{r.outcome}</span>
                    </div>
                    <p className="text-[10.5px] text-zbrain-muted leading-snug">{r.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status row + Show raw */}
      <div className="mt-3 flex items-center gap-2 text-[11px] flex-wrap">
        <Pill className={statusPillCls}>Status: {statusLabel}</Pill>
        {alert.resolved_by && <span className="text-zbrain-muted">Resolved by {alert.resolved_by}</span>}
        {alert.note && !alert.resolved_by && <span className="text-zbrain-muted truncate">Note: {alert.note}</span>}
        <button onClick={() => onOpenDrill(alert.baseline_id)} className="ml-auto text-[11px] text-zbrain font-semibold hover:underline">View timeline →</button>
        <button onClick={() => setShowRaw(!showRaw)} className="px-2.5 py-1 text-[11px] font-medium rounded-md text-zbrain-muted hover:text-zbrain-ink hover:bg-zinc-50" title="Show the raw alert record">
          {showRaw ? "Hide raw" : "Show raw"}
        </button>
      </div>

      {showRaw && (
        <pre className="mt-2 text-[11px] leading-snug bg-zinc-50 border border-zbrain-divider rounded-md p-3 overflow-x-auto whitespace-pre">
          {JSON.stringify(alert, null, 2)}
        </pre>
      )}
    </div>
  );
}

function BaselineFilterDropdown({ value, onChange }: Readonly<{ value: number | null; onChange: (id: number | null) => void }>) {
  return (
    <select value={value ?? "all"} onChange={(e) => onChange(e.target.value === "all" ? null : Number(e.target.value))}
            className="text-xs border border-zbrain-divider rounded-md px-2 py-1 bg-white">
      <option value="all">All baselines</option>
      {baselines.map((b) => <option key={b.id} value={b.id}>#{b.id} {b.label || b.metric}</option>)}
    </select>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PROPOSE TAB — opportunities + KB suggestions
// ════════════════════════════════════════════════════════════════════════════
function ProposeTab({ baselineFilter, setBaselineFilter, onOpenDrill, onRefresh }: Readonly<{ baselineFilter: number | null; setBaselineFilter: (id: number | null) => void; onOpenDrill: (id: number) => void; onRefresh: () => void | Promise<void> }>) {
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only OPEN opportunities sit in the queue — accepting one transfers it to the
  // Validate (A/B) tab; deferring/rejecting closes it. Decisions persist on the
  // backend, so a decided opportunity never reappears here as if untouched.
  const rows = opportunities.filter((o) => o.status === "open" && (baselineFilter == null || o.baseline_id === baselineFilter));
  const anchored   = rows.filter((o) => o.baseline_id != null);
  const unanchored = rows.filter((o) => o.baseline_id == null);
  const decidedCount = opportunities.filter((o) => o.status !== "open").length;

  const decide = async (o: LearningOpportunity, decision: "accepted" | "deferred" | "rejected") => {
    setError(null);
    setDecidingId(o.id);
    try {
      const ok = await decideOpportunity(o.id, decision);
      if (ok == null) throw new Error("the backend did not accept the decision");
      await onRefresh();
    } catch (e) {
      setError(`Could not ${decision === "accepted" ? "promote to A/B" : decision} "${o.title}" — ${(e as Error).message}`);
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-zbrain-ink inline-flex items-center gap-1.5">
          Tuning queue
          <InfoTip text="Typed remediation candidates clustered from feedback + drift signals. Accept moves an opportunity to A/B; Defer queues it for the next sweep; Reject closes it with a reason." />
        </h2>
        <div className="flex items-center gap-1.5">
          <BaselineFilterDropdown value={baselineFilter} onChange={setBaselineFilter} />
          <button onClick={() => { void onRefresh(); }} className="text-[11px] px-3 py-1.5 rounded-md border border-zbrain-divider bg-white hover:bg-zbrain-surface text-zbrain-ink">↻ Refresh</button>
        </div>
      </div>

      {error && <div className="card p-3 border border-rose-200 bg-rose-50 text-[11px] text-rose-700">{error}</div>}

      <div className="card p-5">
        <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-zbrain-divider">
          <h3 className="text-sm font-semibold text-zbrain-ink">Opportunity board</h3>
          <div className="flex items-center gap-2 text-[11px]">
            <span><span className="font-semibold text-zbrain-ink">{anchored.length}</span> anchored</span>
            <span className="text-zbrain-muted">·</span>
            <span><span className="font-semibold text-zbrain-ink">{unanchored.length}</span> unanchored</span>
            <span className="text-zbrain-muted">·</span>
            <span><span className="font-semibold text-zbrain-ink">{decidedCount}</span> decided</span>
          </div>
        </div>

        {rows.length === 0 && <p className="text-[12px] text-zbrain-muted py-6 text-center">No open opportunities — the queue is clear.</p>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {anchored.map((o) => <OpportunityCard key={o.id} opp={o} deciding={decidingId === o.id} onDecide={(s) => decide(o, s)} onOpenDrill={onOpenDrill} />)}
        </div>

        {unanchored.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold mb-2">Unanchored opportunities</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {unanchored.map((o) => <OpportunityCard key={o.id} opp={o} deciding={decidingId === o.id} onDecide={(s) => decide(o, s)} onOpenDrill={onOpenDrill} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OpportunityCard({ opp, deciding, onDecide, onOpenDrill }: Readonly<{ opp: LearningOpportunity; deciding: boolean; onDecide: (s: "accepted" | "deferred" | "rejected") => void; onOpenDrill: (id: number) => void }>) {
  const [showEvidence, setShowEvidence] = useState(false);
  const baseline = baselineById(opp.baseline_id);
  const decided = opp.status !== "open";
  return (
    <div className={`card p-4 border ${opp.status === "accepted" ? "border-emerald-200 bg-emerald-50/30" : opp.status === "rejected" ? "border-slate-200 bg-slate-50/50 opacity-70" : "border-zbrain-divider"}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Pill className={changeTypeTone[opp.change_type] ?? ""}>{opp.change_type}</Pill>
          {baseline && <BaselineChip id={baseline.id} label={baseline.label || baseline.metric} onClick={onOpenDrill} />}
          <Pill className="bg-zbrain-50 text-zbrain-700 border-zbrain-200">support · {opp.support}</Pill>
          <Pill className="bg-purple-50 text-purple-700 border-purple-200">{opp.kind.replace("_", " ")}</Pill>
        </div>
      </div>

      <p className="text-sm font-semibold text-zbrain-ink inline-flex items-center gap-1.5">{opp.title}<InfoTip text={opp.rationale} /></p>
      <p className="text-[11px] text-zbrain-muted mt-1 leading-snug">{opp.evidence.headline}</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 mb-3">
        <div className="rounded border border-zbrain-divider bg-zbrain-surface px-2 py-1">
          <p className="text-[9px] uppercase tracking-wider text-zbrain-muted font-semibold">Sample</p>
          <p className="text-[11px] font-semibold">{opp.evidence.counterfactual.would_change}/{opp.evidence.counterfactual.total_in_window}</p>
          <p className="text-[9px] text-zbrain-muted">last {opp.evidence.counterfactual.window_days}d</p>
        </div>
        <div className="rounded border border-zbrain-divider bg-zbrain-surface px-2 py-1">
          <p className="text-[9px] uppercase tracking-wider text-zbrain-muted font-semibold">Source</p>
          <p className="text-[11px] font-mono">{opp.origin}</p>
        </div>
        <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1">
          <p className="text-[9px] uppercase tracking-wider text-emerald-700 font-semibold">Lift</p>
          <p className="text-[11px] font-semibold text-emerald-800">{opp.lift}</p>
        </div>
        <div className="rounded border border-zbrain-divider bg-zbrain-surface px-2 py-1">
          <p className="text-[9px] uppercase tracking-wider text-zbrain-muted font-semibold">Effort</p>
          <p className="text-[11px] font-semibold">{opp.effort}</p>
        </div>
      </div>

      <button onClick={() => setShowEvidence(!showEvidence)} className="text-[11px] text-zbrain-muted hover:text-zbrain-ink">
        {showEvidence ? "▾ Hide" : "▸ Show"} evidence panel
      </button>

      {showEvidence && (
        <div className="mt-2 rounded border border-zbrain-divider bg-zbrain-surface/50 p-3 space-y-2">
          <p className="text-[11px] text-zbrain-ink"><span className="text-zbrain-muted">Observed pattern:</span> {opp.evidence.observed_pattern}</p>
          <p className="text-[11px] text-zbrain-ink"><span className="text-zbrain-muted">Counterfactual:</span> {opp.evidence.counterfactual.savings_label} on {opp.evidence.counterfactual.metric_label}</p>
          {opp.evidence.sample_cases.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[10.5px]">
                <thead><tr className="bg-white border-b border-zbrain-divider">
                  {["Pipeline", "Subject", "Current", "→ Proposed", "CSR action"].map((h) => (
                    <th key={h} className="px-2 py-1 text-left text-[9px] uppercase tracking-wider text-zbrain-muted">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {opp.evidence.sample_cases.map((c) => (
                    <tr key={c.pipeline_id} className="border-b border-zbrain-divider/40 last:border-0">
                      <td className="px-2 py-1 font-mono">{c.pipeline_id}</td>
                      <td className="px-2 py-1 truncate max-w-[180px]">{c.subject}</td>
                      <td className="px-2 py-1 text-zbrain-muted">{c.current_outcome}</td>
                      <td className="px-2 py-1 text-emerald-700 font-semibold">{c.proposed_outcome}</td>
                      <td className="px-2 py-1">{c.csr_action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-1.5 pt-3 mt-3 border-t border-zbrain-divider">
        {decided ? (
          <Pill className={opp.status === "accepted" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : opp.status === "rejected" ? "bg-slate-100 text-slate-600 border-slate-200" : "bg-amber-50 text-amber-700 border-amber-200"}>{opp.status === "accepted" ? "in A/B" : opp.status}</Pill>
        ) : (
          <>
            <button disabled={deciding} onClick={() => onDecide("rejected")} className="text-[11px] px-2.5 py-1 rounded-md border border-zbrain-divider text-zbrain-muted hover:bg-zbrain-surface disabled:opacity-50">Reject</button>
            <button disabled={deciding} onClick={() => onDecide("deferred")} className="text-[11px] px-2.5 py-1 rounded-md border border-zbrain-divider text-zbrain-muted hover:bg-zbrain-surface disabled:opacity-50">Defer</button>
            <button disabled={deciding} onClick={() => onDecide("accepted")} className="text-[11px] px-2.5 py-1 rounded-md bg-zbrain text-white font-semibold hover:bg-zbrain-700 disabled:opacity-50">{deciding ? "…" : "Accept → A/B"}</button>
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// VALIDATE TAB — A/B experiments
// ════════════════════════════════════════════════════════════════════════════
function ValidateTab({ baselineFilter, setBaselineFilter, onOpenDrill, onRefresh }: Readonly<{ baselineFilter: number | null; setBaselineFilter: (id: number | null) => void; onOpenDrill: (id: number) => void; onRefresh: () => void | Promise<void> }>) {
  const [showAll, setShowAll] = useState(false);
  const rows = abExperiments.filter((e) => baselineFilter == null || e.baseline_id === baselineFilter);

  const shadow   = rows.filter((e) => e.promote_status === "shadow").length;
  const ready    = rows.filter((e) => e.promote_status === "ready").length;
  const promoted_ = rows.filter((e) => e.promote_status === "promoted").length;
  const retired  = rows.filter((e) => e.promote_status === "retired").length;

  const visible = showAll ? rows : rows.slice(0, 5);
  const hidden = rows.length - visible.length;

  return (
    <div className="space-y-3">
      <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-zbrain-ink inline-flex items-center gap-1.5">
          Shadow A/B
          <InfoTip text="Each experiment compares a candidate KB rule against production. Promotion is gated on reaching the baseline's target with no regression on guardrail metrics." />
        </h2>
        <BaselineFilterDropdown value={baselineFilter} onChange={setBaselineFilter} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Pill className="bg-amber-50 text-amber-700 border-amber-200">Shadow · {shadow}</Pill>
        <Pill className="bg-zbrain-50 text-zbrain-700 border-zbrain-200">Ready · {ready}</Pill>
        <Pill className="bg-emerald-50 text-emerald-700 border-emerald-200">Promoted · {promoted_}</Pill>
        <Pill className="bg-slate-100 text-slate-600 border-slate-200">Retired · {retired}</Pill>
      </div>

      <div className="space-y-2">
        {visible.map((e) => <ABRow key={e.id} exp={e} onOpenDrill={onOpenDrill} onRefresh={onRefresh} />)}
        {rows.length === 0 && <div className="card p-6 text-sm text-zbrain-muted">No experiments match the current filter.</div>}
      </div>

      {hidden > 0 && (
        <button onClick={() => setShowAll(true)} className="text-[11px] text-zbrain font-semibold hover:underline">Show all (+{hidden} more)</button>
      )}
      {showAll && rows.length > 5 && (
        <button onClick={() => setShowAll(false)} className="text-[11px] text-zbrain-muted hover:text-zbrain-ink">Collapse</button>
      )}
    </div>
  );
}

function ABRow({ exp, onOpenDrill, onRefresh }: Readonly<{ exp: ABExperiment; onOpenDrill: (id: number) => void; onRefresh: () => void | Promise<void> }>) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [gateMsg, setGateMsg] = useState<string | null>(null);
  const baseline = baselineById(exp.baseline_id);
  const isSignificant = exp.p_value < (1 - exp.confidence_level);

  // Every action calls the backend then re-hydrates — never local-only state.
  const act = async (label: string, fn: () => Promise<unknown | null>) => {
    setGateMsg(null); setBusy(label);
    try { const r = await fn(); if (r == null) throw new Error("backend unavailable"); await onRefresh(); }
    catch (e) { setGateMsg((e as Error).message); }
    finally { setBusy(null); }
  };
  // Promote surfaces the gate result: a 422 block shows WHY rather than failing silently.
  const doPromote = async () => {
    setGateMsg(null); setBusy("promote");
    try {
      const r = await promoteExperiment(exp.id);
      if (r == null) throw new Error("backend unavailable");
      if (!r.ok) { const g = r.gate as { reason?: string } | undefined; setGateMsg(g?.reason ? `Gate blocked — ${g.reason}` : "Promotion blocked by the gate."); }
      else await onRefresh();
    } catch (e) { setGateMsg((e as Error).message); }
    finally { setBusy(null); }
  };
  return (
    <div className="card border border-zbrain-divider overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zbrain-surface text-left">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          {baseline && <BaselineChip id={baseline.id} label={baseline.label || baseline.metric} onClick={onOpenDrill} />}
          <span className="text-xs font-semibold text-zbrain-ink truncate">{exp.candidate}</span>
          <Pill className={changeTypeTone[exp.change_type] ?? ""}>{exp.change_type}</Pill>
        </div>
        <div className="hidden md:flex items-center gap-4 text-[11px]">
          <div>
            <span className="text-zbrain-muted">Sample · </span>
            <span className="font-semibold tabular-nums">{exp.sample_size}</span>
          </div>
          <div>
            <span className="text-zbrain-muted">Target {exp.target_value.toFixed(2)} · Obs </span>
            <span className="font-semibold tabular-nums">{exp.observed_value.toFixed(2)}</span>
            <span className={`ml-1 font-semibold tabular-nums ${exp.accuracy_delta_pct! >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              ({exp.accuracy_delta_pct! >= 0 ? "+" : ""}{exp.accuracy_delta_pct}%)
            </span>
          </div>
          {exp.regression_metric && (
            <div className={`text-[11px] ${(exp.regression_delta ?? 0) < 0 ? "text-rose-700" : "text-emerald-700"}`}>
              {exp.regression_metric} {(exp.regression_delta ?? 0) >= 0 ? "+" : ""}{((exp.regression_delta ?? 0) * 100).toFixed(1)}pp
            </div>
          )}
        </div>
        <Pill className={promoteStatusTone[exp.promote_status] ?? ""}>{exp.promote_status}</Pill>
        <span className="text-[10px] text-zbrain-muted">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="border-t border-zbrain-divider p-4 bg-zbrain-surface/40 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold mb-1">Control prompt</p>
              <pre className="rounded border border-zbrain-divider bg-white p-2 text-[11px] font-mono text-zbrain-ink overflow-x-auto whitespace-pre-wrap">{exp.control_prompt}</pre>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Candidate prompt</p>
                <button onClick={() => setEditing(true)} className="text-[10px] text-zbrain font-semibold hover:underline">Edit</button>
              </div>
              <pre className="rounded border border-emerald-200 bg-emerald-50 p-2 text-[11px] font-mono text-emerald-900 overflow-x-auto whitespace-pre-wrap">{exp.candidate_prompt}</pre>
            </div>
          </div>

          <div className="rounded-md border border-zbrain-divider bg-white p-3">
            <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold mb-2">Backtest results</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-[11px]">
              <div><span className="text-zbrain-muted">Metric:</span> <span className="font-semibold">{exp.backtest_results.metric}</span></div>
              <div><span className="text-zbrain-muted">Control:</span> <span className="font-semibold tabular-nums">{exp.backtest_results.control.toFixed(3)}</span></div>
              <div><span className="text-zbrain-muted">Treatment:</span> <span className="font-semibold tabular-nums text-emerald-700">{exp.backtest_results.treatment.toFixed(3)}</span></div>
              <div><span className="text-zbrain-muted">Δ:</span> <span className="font-semibold tabular-nums">{exp.accuracy_delta_pct}% <span className="text-zbrain-muted font-normal">{exp.accuracy_delta_ci}</span></span></div>
              <div><span className="text-zbrain-muted">p-value:</span> <span className={`font-semibold tabular-nums ${isSignificant ? "text-emerald-700" : "text-amber-700"}`}>{exp.p_value.toFixed(3)}</span></div>
            </div>
            <p className="text-[10px] mt-2 text-zbrain-muted">Started <span className="font-mono">{exp.started_at}</span> · day {exp.days_active} · α = {(1 - exp.confidence_level).toFixed(2)} · {isSignificant ? <span className="text-emerald-700 font-semibold">✓ significant</span> : <span className="text-amber-700 font-semibold">⏳ underpowered</span>}</p>
          </div>

          {gateMsg && <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-700">{gateMsg}</div>}

          <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-zbrain-divider">
            <button onClick={() => baseline && onOpenDrill(baseline.id)} className="text-[11px] text-zbrain font-semibold hover:underline mr-auto">View timeline →</button>
            <button disabled={busy != null} onClick={() => void act("backtest", () => backtestExperiment(exp.id))} className="text-[11px] px-2.5 py-1 rounded-md border border-zbrain-divider text-zbrain-muted hover:bg-zbrain-surface disabled:opacity-50">{busy === "backtest" ? "…" : "↻ Backtest"}</button>
            {exp.promote_status === "promoted" ? (
              <button disabled={busy != null} onClick={() => void act("rollback", () => rollbackConfig(undefined, `Rollback ${exp.candidate}`))} className="text-[11px] px-2.5 py-1 rounded-md border border-rose-200 text-rose-700 font-semibold hover:bg-rose-50 disabled:opacity-50">{busy === "rollback" ? "…" : "↶ Rollback"}</button>
            ) : exp.promote_status === "retired" ? null : (
              <>
                <button disabled={busy != null} onClick={() => void act("retire", () => retireExperiment(exp.id))} className="text-[11px] px-2.5 py-1 rounded-md border border-zbrain-divider text-zbrain-muted hover:bg-zbrain-surface disabled:opacity-50">{busy === "retire" ? "…" : "Retire"}</button>
                <button disabled={busy != null || exp.promote_status !== "ready"} onClick={() => void doPromote()} className="text-[11px] px-2.5 py-1 rounded-md bg-zbrain text-white font-semibold hover:bg-zbrain-700 disabled:opacity-40 disabled:cursor-not-allowed" title={exp.promote_status !== "ready" ? "Backtest must clear the gate (min sample + min effect) before promote" : undefined}>{busy === "promote" ? "…" : "→ Promote"}</button>
              </>
            )}
          </div>
        </div>
      )}

      {editing && <EditCandidateModal exp={exp} onClose={() => setEditing(false)} onRefresh={onRefresh} />}
    </div>
  );
}

function EditCandidateModal({ exp, onClose, onRefresh }: Readonly<{ exp: ABExperiment; onClose: () => void; onRefresh: () => void | Promise<void> }>) {
  const [raw, setRaw] = useState(false);
  const [saving, setSaving] = useState(false);
  // The candidate body is edited locally; the backend re-runs the backtest over the
  // latest Capture data on save (candidate-body persistence is a future enhancement).
  const reBacktest = async () => {
    setSaving(true);
    try { await backtestExperiment(exp.id); await onRefresh(); }
    finally { setSaving(false); onClose(); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-3 border-b border-zbrain-divider">
          <div>
            <h3 className="text-sm font-semibold text-zbrain-ink">Edit candidate · {exp.candidate}</h3>
            <p className="text-[10px] text-zbrain-muted font-mono mt-0.5">change_type: {exp.change_type}</p>
          </div>
          <button onClick={onClose} className="text-zbrain-muted hover:text-zbrain-ink text-xl leading-none">✕</button>
        </div>
        <div className="px-5 py-3 bg-zbrain-50 border-b border-zbrain-divider">
          <p className="text-[11px] text-zbrain-ink">
            <span className="font-semibold">Editing {exp.change_type}</span> — saving creates a new revision and re-runs the backtest. Existing observations are preserved.
          </p>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold">Candidate body</p>
            <button onClick={() => setRaw(!raw)} className="text-[10px] text-zbrain font-semibold hover:underline">{raw ? "Visual" : "Toggle raw JSON"}</button>
          </div>
          {raw ? (
            <textarea defaultValue={exp.candidate_prompt} className="w-full h-64 rounded border border-zbrain-divider bg-zbrain-surface p-2 text-[11px] font-mono resize-none" />
          ) : exp.change_type === "threshold" ? (
            <div className="space-y-2">
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold">Threshold value</span>
                <input type="number" min={0} max={1} step={0.01} defaultValue={exp.target_value} className="mt-1 w-full text-xs border border-zbrain-divider rounded-md px-2 py-1.5 tabular-nums" />
              </label>
              <input type="range" min={0} max={1} step={0.01} defaultValue={exp.target_value} className="w-full" />
            </div>
          ) : exp.change_type === "pattern_list" ? (
            <textarea defaultValue={`["limited time", "30% off", "PDF inside"]`} className="w-full h-32 rounded border border-zbrain-divider bg-zbrain-surface p-2 text-[11px] font-mono resize-none" />
          ) : (
            <textarea defaultValue={exp.candidate_prompt} className="w-full h-48 rounded border border-zbrain-divider bg-zbrain-surface p-2 text-[11px] font-mono resize-none" />
          )}
        </div>
        <div className="px-5 py-3 border-t border-zbrain-divider flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-[11px] px-3 py-1.5 rounded-md border border-zbrain-divider text-zbrain-muted hover:bg-zbrain-surface">Cancel</button>
          <button disabled={saving} onClick={() => void reBacktest()} className="text-[11px] px-3 py-1.5 rounded-md bg-zbrain text-white font-semibold hover:bg-zbrain-700 disabled:opacity-50">{saving ? "Running…" : "Save & re-backtest"}</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PROMOTE TAB — live changes
// ════════════════════════════════════════════════════════════════════════════
function PromoteTab({ baselineFilter, setBaselineFilter, onOpenDrill, onRefresh }: Readonly<{ baselineFilter: number | null; setBaselineFilter: (id: number | null) => void; onOpenDrill: (id: number) => void; onRefresh: () => void | Promise<void> }>) {
  const rows = promoted.filter((p) => baselineFilter == null || p.baseline_id === baselineFilter);
  return (
    <div className="space-y-3">
      <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-zbrain-ink inline-flex items-center gap-1.5">
          Live changes
          <InfoTip text="Each promotion records the operator, the KB entry moved, before vs after, backtest vs realised delta, and any rollback. Use rollback to restore the prior KB version inside the retention window." />
        </h2>
        <BaselineFilterDropdown value={baselineFilter} onChange={setBaselineFilter} />
      </div>

      {rows.length === 0 ? (
        <div className="card p-6 text-sm text-zbrain-muted">No promotions match. Once a Validate-stage experiment passes its gate it shows up here.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((p) => <PromoteCard key={p.id} exp={p} onOpenDrill={onOpenDrill} onRefresh={onRefresh} />)}
        </div>
      )}
    </div>
  );
}

function PromoteCard({ exp, onOpenDrill, onRefresh }: Readonly<{ exp: PromotedExperiment; onOpenDrill: (id: number) => void; onRefresh: () => void | Promise<void> }>) {
  const [busy, setBusy] = useState(false);
  const doRollback = async () => {
    setBusy(true);
    try { await rollbackConfig(undefined, `Rollback ${exp.candidate}`); await onRefresh(); }
    finally { setBusy(false); }
  };
  return (
    <div className="card border border-zbrain-divider p-4">
      <div className="flex items-start justify-between gap-3 mb-3 pb-3 border-b border-zbrain-divider">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <BaselineChip id={exp.baseline_id} label={exp.baseline_label} onClick={onOpenDrill} />
            <span className="text-sm font-semibold text-zbrain-ink">{exp.candidate}</span>
            <Pill className={changeTypeTone[exp.change_type] ?? ""}>{exp.change_type}</Pill>
            <Pill className={exp.auto_rolled_back ? "bg-slate-100 text-slate-600 border-slate-200" : promoteStatusTone[exp.promote_status] ?? ""}>
              {exp.auto_rolled_back ? "auto_rolled_back" : exp.promote_status}
            </Pill>
          </div>
          <p className="text-[11px] text-zbrain-muted mt-1">
            <span className="font-mono">{exp.kb_namespace}.{exp.kb_key}</span> · promoted by <span className="font-semibold text-zbrain-ink">{exp.promoted_by}</span> on <span className="font-mono">{exp.promoted_at}</span>
          </p>
          {exp.promote_note && <p className="text-[11px] text-zbrain-muted mt-1">{exp.promote_note}</p>}
        </div>
        <button onClick={() => onOpenDrill(exp.baseline_id)} className="text-[11px] text-zbrain font-semibold hover:underline whitespace-nowrap">View timeline →</button>
      </div>

      {/* Before / After */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold mb-1">Before</p>
          <pre className="rounded border border-zbrain-divider bg-zbrain-surface p-2 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">{exp.control_prompt}</pre>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold mb-1">After</p>
          <pre className="rounded border border-emerald-200 bg-emerald-50 p-2 text-[11px] font-mono text-emerald-900 overflow-x-auto whitespace-pre-wrap">{exp.candidate_prompt}</pre>
        </div>
      </div>

      {/* Backtest vs Realised */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div className="rounded-md border border-zbrain-divider bg-white p-3">
          <p className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold mb-1">Backtest lift</p>
          <p className="text-xl font-bold tabular-nums text-zbrain-ink">{exp.accuracy_delta_pct >= 0 ? "+" : ""}{exp.accuracy_delta_pct}%</p>
          <p className="text-[10px] text-zbrain-muted">{exp.accuracy_delta_ci}</p>
        </div>
        <div className="rounded-md border border-zbrain-divider bg-white p-3">
          <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold mb-1">Realised lift</p>
          {exp.realised_lift_pct != null ? (
            <>
              <p className="text-xl font-bold tabular-nums text-emerald-700">{exp.realised_lift_pct >= 0 ? "+" : ""}{exp.realised_lift_pct}%</p>
              <p className="text-[10px] text-zbrain-muted">{exp.realised_lift_ci} · n={exp.realised_sample_size} · last <span className="font-mono">{exp.realised_lift_at}</span></p>
              {exp.realised_note && <p className="text-[10px] text-zbrain-muted mt-0.5">{exp.realised_note}</p>}
            </>
          ) : (
            <p className="text-sm text-zbrain-muted italic">Awaiting first realised sample</p>
          )}
        </div>
      </div>

      {/* Rollback status / action */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-zbrain-divider">
        {exp.auto_rolled_back || exp.rolled_back_at ? (
          <div className="text-[11px] text-rose-700">
            <span className="font-semibold">↶ Rolled back</span> by <span className="font-semibold">{exp.rolled_back_by ?? "system"}</span> on <span className="font-mono">{exp.rolled_back_at}</span>
            {exp.rolled_back_note && <span className="text-zbrain-muted"> · {exp.rolled_back_note}</span>}
          </div>
        ) : (
          <>
            <span className="text-[11px] text-emerald-700 font-semibold">● Still live</span>
            <button disabled={busy} onClick={() => void doRollback()} className="text-[11px] px-2.5 py-1 rounded-md border border-rose-200 text-rose-700 font-semibold hover:bg-rose-50 disabled:opacity-50">{busy ? "Rolling back…" : "↶ Rollback"}</button>
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DRILL-THROUGH — timeline panel for one baseline across all 5 loops
// ════════════════════════════════════════════════════════════════════════════
function BaselineDrillthrough({ baselineId, onClose, onJumpToTab }: Readonly<{ baselineId: number | null; onClose: () => void; onJumpToTab: (jump: SubTab, baselineId: number) => void }>) {
  if (baselineId == null) return null;
  const baseline = baselineById(baselineId);
  if (!baseline) return null;
  const timeline = baselineTimelines[baselineId] ?? [];
  const tone = baselineStatusTone[baseline.last_status];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-end" onClick={onClose}>
      <aside className="bg-white shadow-2xl w-full md:max-w-2xl h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-zbrain-divider flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zbrain-muted font-semibold">Baseline drill-through · #{baseline.id}</div>
            <h3 className="text-base font-semibold text-zbrain-ink mt-0.5">{baseline.label || baseline.metric}</h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Pill className={tone.chip}>{baseline.last_status}</Pill>
              <Pill className={baseline.severity === "block_promotion" ? severityTone.high : severityTone.warn}>{baseline.severity}</Pill>
              <span className="text-[10px] font-mono text-zbrain-muted">{baseline.segment}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-zbrain-muted hover:text-zbrain-ink text-xl leading-none">✕</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
            <div><span className="text-zbrain-muted">Direction:</span> <span className="font-semibold">{baseline.direction}</span></div>
            <div><span className="text-zbrain-muted">Target:</span> <span className="font-semibold tabular-nums">{baseline.target_value}</span></div>
            <div><span className="text-zbrain-muted">Tolerance:</span> <span className="font-semibold tabular-nums">±{baseline.drift_pct}</span></div>
            <div><span className="text-zbrain-muted">Observed:</span> <span className="font-semibold tabular-nums">{baseline.last_observed?.toFixed(3) ?? "—"}</span></div>
            <div><span className="text-zbrain-muted">Owner:</span> <span className="font-semibold">{baseline.owner}</span></div>
            <div><span className="text-zbrain-muted">Source:</span> <span className="font-semibold">{baseline.source}</span></div>
            <div className="col-span-2"><span className="text-zbrain-muted">Rationale:</span> <span className="text-zbrain-ink">{baseline.rationale}</span></div>
          </div>

          {/* Jump-to-tab strip */}
          <div className="grid grid-cols-5 gap-1.5">
            {(["feedback", "drift", "tuning", "experiments", "promote"] as SubTab[]).map((t) => (
              <button key={t} onClick={() => onJumpToTab(t, baseline.id)}
                className="text-[10px] px-2 py-1.5 rounded-md border border-zbrain-divider text-zbrain-ink hover:bg-zbrain-50 hover:border-zbrain">
                {t === "feedback" ? "Capture" : t === "drift" ? "Detect" : t === "tuning" ? "Propose" : t === "experiments" ? "Validate" : "Promote"} →
              </button>
            ))}
          </div>

          {/* Timeline */}
          <div>
            <h4 className="text-xs font-semibold text-zbrain-ink mb-2">Timeline · all loops</h4>
            {timeline.length === 0 ? (
              <p className="text-xs text-zbrain-muted italic">No timeline events recorded for this baseline yet.</p>
            ) : (
              <ol className="relative border-l-2 border-zbrain-divider ml-2 space-y-3">
                {timeline.map((e) => (
                  <li key={e.id} className="pl-4 relative">
                    <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-white border-2 border-zbrain" />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Pill className={timelineKindTone[e.kind] ?? ""}>{e.kind}</Pill>
                      <span className="text-[10px] font-mono text-zbrain-muted">{e.ts}</span>
                    </div>
                    <p className="text-xs font-semibold text-zbrain-ink mt-1">{e.label}</p>
                    <p className="text-[11px] text-zbrain-muted leading-snug">{e.detail}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
