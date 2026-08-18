import { v4 as uuidv4 } from 'uuid'
import type { ContractMetadata, ReviewComment, ReviewState, RiskDecision } from '../types/contract'

const store = new Map<string, ReviewState>()

function ensure(contractId: string): ReviewState {
  let state = store.get(contractId)
  if (!state) {
    state = { contractId, editedMetadata: {}, riskDecisions: {}, comments: [] }
    store.set(contractId, state)
  }
  return state
}

export function get(contractId: string): ReviewState | undefined {
  return store.get(contractId)
}

export function getOrCreate(contractId: string): ReviewState {
  return ensure(contractId)
}

export function editMetadata(contractId: string, patch: Partial<ContractMetadata>): ReviewState {
  const state = ensure(contractId)
  state.editedMetadata = { ...state.editedMetadata, ...patch }
  return state
}

export function setRiskDecision(contractId: string, riskId: string, decision: RiskDecision): ReviewState {
  const state = ensure(contractId)
  state.riskDecisions = { ...state.riskDecisions, [riskId]: decision }
  return state
}

export function addComment(contractId: string, text: string, author?: string): ReviewState {
  const state = ensure(contractId)
  const comment: ReviewComment = { id: uuidv4(), text, author, ts: new Date().toISOString() }
  state.comments = [...state.comments, comment]
  return state
}

export function setFinalDecision(contractId: string, decision: 'approved' | 'rejected' | 'needs_revision', decidedBy?: string): ReviewState {
  const state = ensure(contractId)
  state.finalDecision = decision
  state.decidedBy = decidedBy
  state.decidedAt = new Date().toISOString()
  return state
}

export function countPendingDecisions(contractIds: string[]): number {
  let n = 0
  for (const id of contractIds) {
    const state = store.get(id)
    if (!state || !state.finalDecision) n++
  }
  return n
}
