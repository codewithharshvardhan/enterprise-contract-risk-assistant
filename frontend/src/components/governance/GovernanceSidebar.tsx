import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/governance/overview",   label: "Overview" },
  { to: "/governance/audit",      label: "Audit Trail" },
  { to: "/governance/agents",     label: "Agent Fleet" },
  { to: "/governance/policies",   label: "Policy Engine" },
  { to: "/governance/compliance", label: "Compliance" },
  { to: "/governance/slo",        label: "SLO Monitor" },
];

export function GovernanceSidebar() {
  return (
    <aside className="w-[220px] shrink-0 bg-white border-r border-zbrain-divider px-3 py-4 min-h-screen">
      <div className="px-3 pb-2 mb-1 border-b border-zbrain-divider">
        <div className="text-[13px] font-semibold text-zbrain-ink">Governance</div>
      </div>
      <nav className="flex flex-col gap-0.5 mt-2">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end
            className={({ isActive }) =>
              "px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors " +
              (isActive
                ? "bg-zbrain-50 text-zbrain"
                : "text-zbrain-ink/80 hover:text-zbrain-ink hover:bg-zbrain-50/60")
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
