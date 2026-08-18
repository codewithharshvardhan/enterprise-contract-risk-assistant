import { Link } from 'react-router-dom'
import type { ExecutionRecord } from '../../types/contract'

interface Props {
  executions: ExecutionRecord[]
  compact?: boolean
}

const statusBadge: Record<string, string> = {
  done: 'bg-green-100 text-green-700',
  running: 'bg-blue-100 text-blue-700',
  error: 'bg-red-100 text-red-700',
}

const recBadge: Record<string, string> = {
  APPROVED: 'bg-green-100 text-green-700',
  NEEDS_REDLINE: 'bg-yellow-100 text-yellow-700',
  REJECTED: 'bg-red-100 text-red-700',
}

export default function ExecutionList({ executions, compact = false }: Props) {
  if (executions.length === 0) {
    return <div className="text-sm text-gray-400 py-4 text-center">No executions yet. Run your first analysis to see results here.</div>
  }

  return (
    <div className="flex flex-col gap-2">
      {executions.slice(0, compact ? 5 : undefined).map((ex) => (
        <Link
          key={ex.id}
          to={`/analyze?id=${ex.id}`}
          className="rounded-xl border border-gray-100 bg-white p-3 hover:bg-gray-50 transition-colors flex items-center gap-3 group"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBadge[ex.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {ex.status}
              </span>
              {ex.result?.recommendation && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${recBadge[ex.result.recommendation] ?? ''}`}>
                  {ex.result.recommendation}
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 font-mono truncate">{ex.id.slice(0, 8)}…</div>
            <div className="text-[10px] text-gray-400">
              {new Date(ex.startedAt).toLocaleString()} {ex.durationMs != null ? `· ${ex.durationMs}ms` : ''}
            </div>
          </div>
          {ex.result?.risk_matrix && (
            <div className="text-right">
              <div className="text-sm font-bold text-gray-700">{ex.result.risk_matrix.overall_score.toFixed(1)}</div>
              <div className="text-[10px] text-gray-400">overall</div>
            </div>
          )}
          <div className="text-gray-300 group-hover:text-gray-400">→</div>
        </Link>
      ))}
    </div>
  )
}
