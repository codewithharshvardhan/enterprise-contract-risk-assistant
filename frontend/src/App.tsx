import { Routes, Route, Navigate } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import HomePage from './pages/HomePage'
import AboutPage from './pages/AboutPage'
import NotFoundPage from './pages/NotFoundPage'
import AnalyzePage from './pages/AnalyzePage'
import ExecutionsPage from './pages/ExecutionsPage'
import GovernanceLayout from './pages/governance/GovernanceLayout'
import { Overview } from './pages/governance/Overview'
import { AuditTrail } from './pages/governance/AuditTrail'
import { AgentFleet } from './pages/governance/AgentFleet'
import { PolicyEngine } from './pages/governance/PolicyEngine'
import { Compliance } from './pages/governance/Compliance'
import { SloMonitor } from './pages/governance/SloMonitor'
import { ContinuousLearning } from './pages/continuous-learning/ContinuousLearning'

export default function App() {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/analyze" element={<AnalyzePage />} />
          <Route path="/executions" element={<ExecutionsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/governance" element={<GovernanceLayout />}>
            <Route index element={<Navigate to="/governance/overview" replace />} />
            <Route path="overview" element={<Overview />} />
            <Route path="audit" element={<AuditTrail />} />
            <Route path="agents" element={<AgentFleet />} />
            <Route path="policies" element={<PolicyEngine />} />
            <Route path="compliance" element={<Compliance />} />
            <Route path="slo" element={<SloMonitor />} />
          </Route>
          {/* Continuous Learning workspace — reached by URL only; not in main nav. */}
          <Route path="/continuous-learning" element={<ContinuousLearning />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}
