import { useExecutions } from '../hooks/useExecutions'
import ExecutionList from '../components/executions/ExecutionList'

export default function ExecutionsPage() {
  const { executions, loading, error, refresh } = useExecutions()

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Recent Executions</h1>
          <p className="text-sm text-gray-500 mt-1">Last 50 contract analyses — click to view details</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Refresh
        </button>
      </div>

      {loading && <div className="text-sm text-gray-400 py-8 text-center">Loading executions…</div>}
      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">{error}</div>}
      {!loading && !error && <ExecutionList executions={executions} />}
    </div>
  )
}
