import { Outlet } from "react-router-dom";
import { GovernanceSidebar } from "../../components/governance/GovernanceSidebar";

export default function GovernanceLayout() {
  return (
    <div className="flex bg-zbrain-surface min-h-full">
      <GovernanceSidebar />
      {/* NOT <main> — App already provides a <main> wrapper */}
      <div className="flex-1 min-w-0 overflow-x-hidden">
        <div className="max-w-[1400px] mx-auto px-6 py-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
