import type { NodeOutput } from '../../types/contract'
import * as auditStore from '../governance-audit-store'

// Raised from the original 8,000-char cap so realistic MSAs/vendor agreements
// (which regularly run 10-30 pages) aren't silently cut mid-clause. Still bounded
// to keep prompt/token cost predictable — PRD's "support lengthy contracts"
// requirement is met by raising the ceiling and being explicit when it's hit,
// not by removing the ceiling entirely.
const MAX_CHARS = 60000

export function runNode2ContractInput(rawText: string, contractId: string): { node: NodeOutput; formattedText: string; truncated: boolean } {
  const startedAt = new Date().toISOString()

  // Sanitize: strip null bytes, normalize whitespace, truncate
  let text = rawText
    .replace(/\0/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const truncated = text.length > MAX_CHARS
  if (truncated) {
    text = text.slice(0, MAX_CHARS)
  }

  auditStore.record('Node_2_Contract_Input', 'text_sanitized', 'Success', { contractId, originalLength: rawText.length, formattedLength: text.length, truncated })
  if (truncated) {
    auditStore.record('Node_2_Contract_Input', 'text_truncated', 'Blocked', { contractId, originalLength: rawText.length, limit: MAX_CHARS })
  }

  const node: NodeOutput = {
    nodeId: 'node-2',
    stepId: 'Node_2_Contract_Input',
    label: 'Text Formatter',
    status: 'done',
    output: `Sanitized and formatted (${text.length} chars${truncated ? `, truncated from ${rawText.length} — analysis reflects only the first ${MAX_CHARS} chars` : ''})`,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: 1,
  }

  return { node, formattedText: text, truncated }
}
