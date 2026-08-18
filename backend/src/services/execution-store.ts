import type { ExecutionRecord } from '../types/contract'

// In-memory circular buffer capped at 50 executions, keyed by UUID.
const MAX_SIZE = 50
const store = new Map<string, ExecutionRecord>()
const order: string[] = []

export function save(record: ExecutionRecord): void {
  if (store.has(record.id)) {
    store.set(record.id, record)
    return
  }
  if (order.length >= MAX_SIZE) {
    const oldest = order.shift()!
    store.delete(oldest)
  }
  order.push(record.id)
  store.set(record.id, record)
}

export function get(id: string): ExecutionRecord | undefined {
  return store.get(id)
}

export function list(): ExecutionRecord[] {
  return [...order].reverse().map((id) => store.get(id)!)
}

export function count(): number {
  return store.size
}

export function countByStatus(status: ExecutionRecord['status']): number {
  let n = 0
  for (const r of store.values()) if (r.status === status) n++
  return n
}

// Only matches originals (not prior duplicates) so duplicate chains resolve
// back to the first real analysis rather than to each other.
export function findByTextHash(hash: string): ExecutionRecord | undefined {
  let match: ExecutionRecord | undefined
  for (const r of store.values()) {
    if (r.textHash === hash && !r.duplicateOfId) match = r
  }
  return match
}

export function stageCounts(): { total: number; webhookOk: number; inputOk: number; extractorOk: number; riskOk: number; formatterOk: number } {
  let webhookOk = 0; let inputOk = 0; let extractorOk = 0; let riskOk = 0; let formatterOk = 0
  for (const r of store.values()) {
    const nodeMap: Record<string, string> = {}
    for (const n of r.nodes) nodeMap[n.stepId] = n.status
    if ((nodeMap['Node_1_Webhook'] ?? 'idle') === 'done') webhookOk++
    if ((nodeMap['Node_2_Contract_Input'] ?? 'idle') === 'done') inputOk++
    if ((nodeMap['Extractor_and_Absence_Agent'] ?? 'idle') === 'done') extractorOk++
    if ((nodeMap['Risk_Matrix_Evaluator'] ?? 'idle') === 'done') riskOk++
    if ((nodeMap['JSON_Guardrail_Formatter'] ?? 'idle') === 'done') formatterOk++
  }
  return { total: store.size, webhookOk, inputOk, extractorOk, riskOk, formatterOk }
}

export function recentRuns(n = 5): Array<{ time: string; text: string }> {
  return list()
    .slice(0, n)
    .map((r) => {
      const ts = new Date(r.startedAt)
      const hhmm = ts.toTimeString().slice(0, 5)
      const label = r.status === 'done' ? `Contract analysis completed — ${r.result?.recommendation ?? 'N/A'} in ${r.durationMs ?? 0}ms` : r.status === 'error' ? `Contract analysis failed — ${r.error?.slice(0, 60) ?? 'unknown error'}` : `Contract analysis in progress — ${r.id.slice(0, 8)}`
      return { time: hhmm, text: label }
    })
}
