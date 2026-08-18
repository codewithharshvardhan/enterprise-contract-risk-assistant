import type { NodeStatus } from '../../types/contract'

interface Props {
  nodeId: string
  stepId: string
  label: string
  status: NodeStatus
  output?: string
  error?: string
  durationMs?: number
  onClick: () => void
}

const statusColors: Record<NodeStatus, string> = {
  idle: 'bg-gray-100 border-gray-200 text-gray-500',
  running: 'bg-blue-50 border-blue-400 text-blue-700 animate-pulse',
  done: 'bg-green-50 border-green-400 text-green-800',
  error: 'bg-red-50 border-red-400 text-red-800',
}

const statusDot: Record<NodeStatus, string> = {
  idle: 'bg-gray-300',
  running: 'bg-blue-500 animate-ping',
  done: 'bg-green-500',
  error: 'bg-red-500',
}

const statusLabel: Record<NodeStatus, string> = {
  idle: 'Idle',
  running: 'Running…',
  done: 'Done',
  error: 'Error',
}

const nodeIcons: Record<string, string> = {
  Node_1_Webhook: '🔗',
  Node_2_Contract_Input: '📝',
  Extractor_and_Absence_Agent: '🔍',
  Risk_Matrix_Evaluator: '⚖️',
  JSON_Guardrail_Formatter: '{}',
}

export default function NodeCard({ stepId, label, status, output, error, durationMs, onClick }: Props) {
  const colorClass = statusColors[status]
  const icon = nodeIcons[stepId] ?? '▪'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-44 min-h-28 rounded-xl border-2 p-3 text-left shadow-sm transition-all hover:shadow-md cursor-pointer ${colorClass} flex flex-col gap-1`}
    >
      <div className="flex items-center justify-between">
        <span className="text-lg">{icon}</span>
        <span className="relative flex h-2.5 w-2.5">
          <span className={`inline-flex rounded-full h-2.5 w-2.5 ${statusDot[status]}`} />
        </span>
      </div>
      <div className="text-xs font-semibold leading-tight">{label}</div>
      <div className="text-[10px] font-medium opacity-70">{statusLabel[status]}{durationMs != null && status === 'done' ? ` · ${durationMs}ms` : ''}</div>
      {(output || error) && (
        <div className="text-[9px] mt-1 opacity-60 line-clamp-3 font-mono leading-tight">
          {error ?? output}
        </div>
      )}
    </button>
  )
}
