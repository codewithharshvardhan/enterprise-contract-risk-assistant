import type { NodeOutput } from '../../types/contract'

interface Props {
  node: NodeOutput | null
  onClose: () => void
}

export default function NodeDetailModal({ node, onClose }: Props) {
  if (!node) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 p-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{node.label}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm mb-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs font-medium text-gray-500 mb-1">Step ID</div>
            <div className="font-mono text-gray-800 text-xs">{node.stepId}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs font-medium text-gray-500 mb-1">Status</div>
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${node.status === 'done' ? 'bg-green-100 text-green-700' : node.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
              {node.status}
            </span>
          </div>
          {node.durationMs != null && (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs font-medium text-gray-500 mb-1">Duration</div>
              <div className="font-mono text-gray-800 text-xs">{node.durationMs}ms</div>
            </div>
          )}
          {node.completedAt && (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs font-medium text-gray-500 mb-1">Completed At</div>
              <div className="font-mono text-gray-800 text-xs">{new Date(node.completedAt).toLocaleTimeString()}</div>
            </div>
          )}
        </div>
        {node.output && (
          <div className="mb-4">
            <div className="text-xs font-medium text-gray-500 mb-2">Output</div>
            <pre className="bg-gray-900 text-green-400 rounded-lg p-4 text-xs overflow-x-auto whitespace-pre-wrap font-mono">{node.output}</pre>
          </div>
        )}
        {node.error && (
          <div>
            <div className="text-xs font-medium text-red-500 mb-2">Error</div>
            <pre className="bg-red-50 text-red-800 rounded-lg p-4 text-xs overflow-x-auto whitespace-pre-wrap font-mono">{node.error}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
