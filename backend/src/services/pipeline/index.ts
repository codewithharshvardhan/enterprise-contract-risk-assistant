import { v4 as uuidv4 } from 'uuid'
import { runNode1Webhook } from './node1-webhook'
import { runNode2ContractInput } from './node2-input'
import { runNode3Extractor } from './node3-extractor'
import { runNode4Risk } from './node4-risk'
import { runNode5Guardrail } from './node5-guardrail'
import * as executionStore from '../execution-store'
import * as auditStore from '../governance-audit-store'
import type { ExecutionRecord, NodeOutput } from '../../types/contract'

export interface RunPipelineMeta {
  sourceFilename?: string
  textHash?: string
}

export async function runPipeline(rawText: string, meta?: RunPipelineMeta): Promise<ExecutionRecord> {
  const contractId = uuidv4()
  const startedAt = new Date().toISOString()
  const startMs = Date.now()

  auditStore.record('pipeline', 'pipeline_run_started', 'Success', { contractId, inputLength: rawText.length, sourceFilename: meta?.sourceFilename })

  const nodes: NodeOutput[] = []
  const record: ExecutionRecord = {
    id: contractId,
    contractId,
    startedAt,
    status: 'running',
    nodes,
    rawTextExcerpt: rawText.slice(0, 200),
    sourceFilename: meta?.sourceFilename,
    textHash: meta?.textHash,
  }
  executionStore.save(record)

  const mkErrorNode = (nodeId: string, stepId: string, label: string, error: string, startedAt: string): NodeOutput => ({
    nodeId, stepId, label, status: 'error', error, startedAt, completedAt: new Date().toISOString(), durationMs: 0,
  })

  try {
    // Node 1: Webhook
    const { node: n1, rawText: raw } = runNode1Webhook({ raw_text: rawText }, contractId)
    nodes.push(n1)
    executionStore.save({ ...record, nodes: [...nodes] })

    // Node 2: Text Formatter
    const { node: n2, formattedText, truncated } = runNode2ContractInput(raw, contractId)
    nodes.push(n2)
    record.truncated = truncated
    executionStore.save({ ...record, nodes: [...nodes] })

    // Node 3: Extractor & Absence Agent
    const { node: n3, extractorOutput } = await runNode3Extractor(formattedText, contractId)
    nodes.push(n3)
    executionStore.save({ ...record, nodes: [...nodes] })

    // Node 4: Risk Matrix Evaluator
    const { node: n4, riskOutput } = await runNode4Risk(extractorOutput, contractId)
    nodes.push(n4)
    executionStore.save({ ...record, nodes: [...nodes] })

    // Node 5: JSON Guardrail Formatter
    const { node: n5, result } = await runNode5Guardrail(extractorOutput, riskOutput, contractId)
    nodes.push(n5)

    const durationMs = Date.now() - startMs
    const completed: ExecutionRecord = {
      ...record,
      nodes: [...nodes],
      status: 'done',
      result,
      completedAt: new Date().toISOString(),
      durationMs,
    }
    executionStore.save(completed)
    auditStore.record('pipeline', 'pipeline_run_completed', 'Success', { contractId, totalLatencyMs: durationMs, recommendation: result.recommendation })
    return completed
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    const durationMs = Date.now() - startMs

    // Find which stage failed and mark remaining as idle
    const stageMap = ['Node_1_Webhook', 'Node_2_Contract_Input', 'Extractor_and_Absence_Agent', 'Risk_Matrix_Evaluator', 'JSON_Guardrail_Formatter']
    const completedStepIds = new Set(nodes.map((n) => n.stepId))
    for (const stepId of stageMap) {
      if (!completedStepIds.has(stepId)) {
        nodes.push(mkErrorNode(`node-${stageMap.indexOf(stepId) + 1}`, stepId, stepId.replace(/_/g, ' '), error, new Date().toISOString()))
        break
      }
    }

    const failed: ExecutionRecord = {
      ...record,
      nodes: [...nodes],
      status: 'error',
      error,
      completedAt: new Date().toISOString(),
      durationMs,
    }
    executionStore.save(failed)
    auditStore.record('pipeline', 'pipeline_run_completed', 'Blocked', { contractId, totalLatencyMs: durationMs, error: error.slice(0, 200) })
    return failed
  }
}
