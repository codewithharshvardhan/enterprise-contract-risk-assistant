import { useState, useCallback } from 'react'
import { analyzeContract, analyzeContractFile } from '../lib/api'
import type { ExecutionRecord, NodeOutput, NodeStatus } from '../types/contract'

export interface AnalysisState {
  isRunning: boolean
  execution: ExecutionRecord | null
  nodeStates: Record<string, NodeStatus>
  error: string | null
}

const PIPELINE_NODES: Array<{ nodeId: string; stepId: string; label: string }> = [
  { nodeId: 'node-1', stepId: 'Node_1_Webhook', label: 'Webhook Receiver' },
  { nodeId: 'node-2', stepId: 'Node_2_Contract_Input', label: 'Text Formatter' },
  { nodeId: 'node-3', stepId: 'Extractor_and_Absence_Agent', label: 'Extractor & Absence Agent' },
  { nodeId: 'node-4', stepId: 'Risk_Matrix_Evaluator', label: 'Risk Matrix Evaluator' },
  { nodeId: 'node-5', stepId: 'JSON_Guardrail_Formatter', label: 'JSON Guardrail Formatter' },
]

export function useContractAnalysis() {
  const [state, setState] = useState<AnalysisState>({
    isRunning: false,
    execution: null,
    nodeStates: {},
    error: null,
  })

  const run = useCallback(async (contractText: string) => {
    setState({ isRunning: true, execution: null, nodeStates: {}, error: null })

    try {
      const result = await analyzeContract(contractText)
      const nodeStates: Record<string, NodeStatus> = {}
      for (const n of result.nodes) nodeStates[n.stepId] = n.status
      setState({ isRunning: false, execution: result, nodeStates, error: result.error ?? null })
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isRunning: false,
        error: err instanceof Error ? err.message : 'Analysis failed',
      }))
    }
  }, [])

  const runFile = useCallback(async (file: File) => {
    setState({ isRunning: true, execution: null, nodeStates: {}, error: null })

    try {
      const result = await analyzeContractFile(file)
      const nodeStates: Record<string, NodeStatus> = {}
      for (const n of result.nodes) nodeStates[n.stepId] = n.status
      setState({ isRunning: false, execution: result, nodeStates, error: result.error ?? null })
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isRunning: false,
        error: err instanceof Error ? err.message : 'Upload failed',
      }))
    }
  }, [])

  const reset = useCallback(() => {
    setState({ isRunning: false, execution: null, nodeStates: {}, error: null })
  }, [])

  return { state, run, runFile, reset, pipelineNodes: PIPELINE_NODES }
}
