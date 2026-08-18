import { createHash } from 'crypto'

export interface AuditEvent {
  idx: number
  time: string
  agent: string
  event: string
  outcome: 'Success' | 'Denied' | 'Blocked' | 'Retry'
  chain: 'verified' | 'pending'
  detail?: Record<string, unknown>
  prevHash: string
  entryHash: string
}

const MAX_EVENTS = 200
let prevHash = '0000000000000000'
let seq = 0
const events: AuditEvent[] = []

function hashEntry(prev: string, entry: object): string {
  return createHash('sha256').update(prev + JSON.stringify(entry)).digest('hex').slice(0, 8) + '…' + createHash('sha256').update(prev + JSON.stringify(entry)).digest('hex').slice(-4)
}

export function record(agent: string, event: string, outcome: AuditEvent['outcome'], detail?: Record<string, unknown>): void {
  seq++
  const now = new Date()
  const time = now.toTimeString().slice(0, 8)
  const partial = { idx: seq, time, agent, event, outcome, chain: 'verified' as const, detail }
  const entryHash = hashEntry(prevHash, partial)
  const full: AuditEvent = { ...partial, prevHash, entryHash }
  prevHash = entryHash
  events.unshift(full)
  if (events.length > MAX_EVENTS) events.pop()
}

export function list(): AuditEvent[] {
  return events.slice()
}

export function recent(n = 8): AuditEvent[] {
  return events.slice(0, n)
}
