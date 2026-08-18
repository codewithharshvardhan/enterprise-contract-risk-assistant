import React, { useState } from 'react'
import NodeCard from './NodeCard'
import NodeConnector from './NodeConnector'
import NodeDetailModal from './NodeDetailModal'
import type { NodeOutput, NodeStatus } from '../../types/contract'

interface PipelineNodeDef {
  nodeId: string
  stepId: string
  label: string
}

interface Props {
  pipelineNodes: PipelineNodeDef[]
  nodeStates: Record<string, NodeStatus>
  executionNodes: NodeOutput[]
  isRunning: boolean
}

export default function WorkflowCanvas({ pipelineNodes, nodeStates, executionNodes, isRunning }: Props) {
  const [selectedNode, setSelectedNode] = useState<NodeOutput | null>(null)

  function getNodeOutput(stepId: string): NodeOutput | undefined {
    return executionNodes.find((n) => n.stepId === stepId)
  }

  function getStatus(stepId: string): NodeStatus {
    const state = nodeStates[stepId]
    if (state) return state
    if (isRunning) {
      // Mark the first node without a completed state as running
      const completedIds = new Set(executionNodes.filter((n) => n.status === 'done' || n.status === 'error').map((n) => n.stepId))
      for (const n of pipelineNodes) {
        if (!completedIds.has(n.stepId)) {
          return n.stepId === stepId ? 'running' : 'idle'
        }
      }
    }
    return 'idle'
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Workflow Pipeline</div>
      <div className="flex items-center w-full justify-between pb-2 overflow-x-auto">
        {pipelineNodes.map((nodeDef, i) => {
          const status = getStatus(nodeDef.stepId)
          const nodeOutput = getNodeOutput(nodeDef.stepId)

          return (
            <React.Fragment key={nodeDef.stepId}>
              {i > 0 && (
                <NodeConnector
                  fromStatus={getStatus(pipelineNodes[i - 1]!.stepId)}
                  toStatus={status}
                />
              )}
              <div className="flex flex-col items-center flex-shrink-0">
                <div className="text-[9px] font-mono text-gray-400 mb-1">NODE {i + 1}</div>
                <NodeCard
                  nodeId={nodeDef.nodeId}
                  stepId={nodeDef.stepId}
                  label={nodeDef.label}
                  status={status}
                  output={nodeOutput?.output}
                  error={nodeOutput?.error}
                  durationMs={nodeOutput?.durationMs}
                  onClick={() => {
                    if (nodeOutput) setSelectedNode(nodeOutput)
                  }}
                />
              </div>
            </React.Fragment>
          )
        })}
      </div>
      {isRunning && (
        <div className="flex items-center gap-2 text-sm text-blue-600">
          <div className="w-3 h-3 rounded-full bg-blue-500 animate-bounce" />
          Pipeline executing — please wait…
        </div>
      )}
      <NodeDetailModal node={selectedNode} onClose={() => setSelectedNode(null)} />
    </div>
  )
}
