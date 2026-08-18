import type { NodeOutput } from '../../types/contract'
import * as auditStore from '../governance-audit-store'

export interface Node1Payload {
  raw_text: string
}

/**
 * Node 1 — Webhook receiver. Validates the incoming payload shape and hands the
 * raw contract text down the pipeline. This is a pure ingestion gate: no
 * sanitization or truncation happens here (that's Node 2's job).
 */
export function runNode1Webhook(payload: Node1Payload, contractId: string): { node: NodeOutput; rawText: string } {
  const startedAt = new Date().toISOString()
  const rawText = payload?.raw_text

  if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
    auditStore.record('Node_1_Webhook', 'payload_validation', 'Blocked', { contractId, reason: 'missing raw_text' })
    throw new Error('raw_text is required and must be a non-empty string')
  }

  auditStore.record('Node_1_Webhook', 'payload_received', 'Success', { contractId, inputLength: rawText.length })

  const node: NodeOutput = {
    nodeId: 'node-1',
    stepId: 'Node_1_Webhook',
    label: 'Webhook Receiver',
    status: 'done',
    output: `Received contract payload (${rawText.length} chars)`,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: 1,
  }

  return { node, rawText }
}
