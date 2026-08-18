import axios, { type AxiosInstance } from 'axios'
import type { ContractMetadata, ExecutionRecord, ReviewState, RiskDecision } from '../types/contract'

const SERVICE1_BASE = import.meta.env['VITE_PROD_BACKEND_1_URL'] ?? '/proxy/service1'
const SERVICE2_BASE = import.meta.env['VITE_PROD_BACKEND_2_URL'] ?? '/proxy/service2'

function makeClient(baseURL: string, headers: Record<string, string> = { 'Content-Type': 'application/json' }): AxiosInstance {
  const instance = axios.create({
    baseURL,
    headers,
  })
  instance.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as { detail?: string; message?: string } | undefined
        const message = data?.detail ?? data?.message ?? error.message
        return Promise.reject(new Error(message))
      }
      return Promise.reject(error)
    },
  )
  return instance
}

export const service1Client = makeClient(SERVICE1_BASE)
export const service2Client = makeClient(SERVICE2_BASE)
// No default Content-Type — lets the browser set the multipart boundary
// header itself when the body is a FormData instance.
const service1UploadClient = makeClient(SERVICE1_BASE, {})
export default service1Client

// ─── Contract API ─────────────────────────────────────────────────────────────

export async function analyzeContract(contractText: string): Promise<ExecutionRecord> {
  const res = await service1Client.post<ExecutionRecord>('/api/v1/contracts/analyze', { contract_text: contractText })
  return res.data
}

export async function analyzeContractFile(file: File): Promise<ExecutionRecord> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await service1UploadClient.post<ExecutionRecord>('/api/v1/contracts/analyze-file', formData)
  return res.data
}

export async function fetchExecutions(): Promise<ExecutionRecord[]> {
  const res = await service1Client.get<ExecutionRecord[]>('/api/v1/contracts/executions')
  return res.data
}

export async function fetchExecution(id: string): Promise<ExecutionRecord> {
  const res = await service1Client.get<ExecutionRecord>(`/api/v1/contracts/executions/${id}`)
  return res.data
}

export async function submitFeedback(stage: string, kind: string, contractId: string, data?: Record<string, string | number>): Promise<void> {
  await service1Client.post('/api/v1/contracts/feedback', { stage, kind, contract_id: contractId, data })
}

// ─── Review workflow (PRD §6.10) ───────────────────────────────────────────────

export interface ReviewView {
  execution: ExecutionRecord
  review: ReviewState
}

export async function fetchReview(contractId: string): Promise<ReviewView> {
  const res = await service1Client.get<ReviewView>(`/api/v1/contracts/${contractId}/review`)
  return res.data
}

export async function updateReviewMetadata(contractId: string, patch: Partial<ContractMetadata>): Promise<ReviewState> {
  const res = await service1Client.patch<ReviewState>(`/api/v1/contracts/${contractId}/review/metadata`, patch)
  return res.data
}

export async function setRiskDecision(contractId: string, riskId: string, decision: RiskDecision): Promise<ReviewState> {
  const res = await service1Client.post<ReviewState>(`/api/v1/contracts/${contractId}/review/risk-decision`, { riskId, decision })
  return res.data
}

export async function addReviewComment(contractId: string, text: string, author?: string): Promise<ReviewState> {
  const res = await service1Client.post<ReviewState>(`/api/v1/contracts/${contractId}/review/comment`, { text, author })
  return res.data
}

export async function setFinalDecision(contractId: string, decision: 'approved' | 'rejected' | 'needs_revision', decidedBy?: string): Promise<ReviewState> {
  const res = await service1Client.post<ReviewState>(`/api/v1/contracts/${contractId}/review/decision`, { decision, decidedBy })
  return res.data
}
