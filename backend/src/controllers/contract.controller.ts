import crypto from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import type { Request, Response } from 'express'
import { runPipeline } from '../services/pipeline'
import * as executionStore from '../services/execution-store'
import * as feedbackStore from '../services/feedback-store'
import * as auditStore from '../services/governance-audit-store'
import * as reviewStore from '../services/review-store'
import { extractTextFromFile } from '../services/text-extraction'
import type { ExecutionRecord, RiskDecision } from '../types/contract'

export async function analyzeContract(req: Request, res: Response): Promise<void> {
  const { contract_text } = req.body as { contract_text?: string }
  if (!contract_text || typeof contract_text !== 'string') {
    res.status(400).json({ error: 'contract_text is required' })
    return
  }
  const record = await runPipeline(contract_text)
  res.json(record)
}

export async function analyzeContractFile(req: Request, res: Response): Promise<void> {
  const file = req.file
  if (!file) {
    res.status(400).json({ error: 'file is required (multipart field "file")' })
    return
  }

  let text: string
  try {
    text = await extractTextFromFile(file.buffer, file.mimetype, file.originalname)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(400).json({ error: message })
    return
  }

  if (!text.trim()) {
    res.status(400).json({ error: `No extractable text found in "${file.originalname}". The file may be a scanned image without an OCR text layer.` })
    return
  }

  const textHash = crypto.createHash('sha256').update(text).digest('hex')
  const existing = executionStore.findByTextHash(textHash)

  if (existing) {
    const duplicateContractId = uuidv4()
    const duplicateRecord: ExecutionRecord = {
      ...existing,
      id: duplicateContractId,
      contractId: duplicateContractId,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      sourceFilename: file.originalname,
      textHash,
      duplicateOfId: existing.id,
    }
    executionStore.save(duplicateRecord)
    auditStore.record('pipeline', 'duplicate_upload_detected', 'Blocked', { contractId: duplicateContractId, duplicateOfId: existing.id, sourceFilename: file.originalname, textHash })
    res.json(duplicateRecord)
    return
  }

  const record = await runPipeline(text, { sourceFilename: file.originalname, textHash })
  res.json(record)
}

export function listExecutions(_req: Request, res: Response): void {
  res.json(executionStore.list())
}

export function getExecution(req: Request, res: Response): void {
  const { id } = req.params as { id: string }
  const record = executionStore.get(id)
  if (!record) {
    res.status(404).json({ error: 'Execution not found' })
    return
  }
  res.json(record)
}

export async function submitFeedback(req: Request, res: Response): Promise<void> {
  const body = req.body as { stage?: string; kind?: string; contract_id?: string; data?: Record<string, string | number> }
  if (!body.stage || !body.kind) {
    res.status(400).json({ error: 'stage and kind are required' })
    return
  }
  const entry = feedbackStore.recordFeedback({
    stage: body.stage,
    kind: body.kind,
    data: body.data ? { ...(body.data as Record<string, string | number>), contract_id: body.contract_id ?? '' } : { contract_id: body.contract_id ?? '' },
  })
  res.json(entry)
}

function findExecutionOr404(req: Request, res: Response): ExecutionRecord | undefined {
  const { id } = req.params as { id: string }
  const record = executionStore.get(id)
  if (!record) {
    res.status(404).json({ error: 'Execution not found' })
    return undefined
  }
  return record
}

export function getReview(req: Request, res: Response): void {
  const record = findExecutionOr404(req, res)
  if (!record) return
  const review = reviewStore.getOrCreate(record.contractId)
  res.json({ execution: record, review })
}

export function updateReviewMetadata(req: Request, res: Response): void {
  const record = findExecutionOr404(req, res)
  if (!record) return
  const patch = req.body as Record<string, string>
  const before = reviewStore.get(record.contractId)?.editedMetadata ?? {}
  const review = reviewStore.editMetadata(record.contractId, patch)
  auditStore.record('reviewer', 'metadata_edited', 'Success', { contractId: record.contractId, before, after: review.editedMetadata })
  res.json(review)
}

export function setRiskDecision(req: Request, res: Response): void {
  const record = findExecutionOr404(req, res)
  if (!record) return
  const { riskId, decision } = req.body as { riskId?: string; decision?: RiskDecision }
  if (!riskId || (decision !== 'accepted' && decision !== 'rejected')) {
    res.status(400).json({ error: 'riskId and decision ("accepted" | "rejected") are required' })
    return
  }
  const review = reviewStore.setRiskDecision(record.contractId, riskId, decision)
  auditStore.record('reviewer', 'risk_decision_recorded', 'Success', { contractId: record.contractId, riskId, decision })
  res.json(review)
}

export function addReviewComment(req: Request, res: Response): void {
  const record = findExecutionOr404(req, res)
  if (!record) return
  const { text, author } = req.body as { text?: string; author?: string }
  if (!text || !text.trim()) {
    res.status(400).json({ error: 'text is required' })
    return
  }
  const review = reviewStore.addComment(record.contractId, text, author)
  auditStore.record('reviewer', 'comment_added', 'Success', { contractId: record.contractId, author })
  res.json(review)
}

export function setFinalDecision(req: Request, res: Response): void {
  const record = findExecutionOr404(req, res)
  if (!record) return
  const { decision, decidedBy } = req.body as { decision?: string; decidedBy?: string }
  if (decision !== 'approved' && decision !== 'rejected' && decision !== 'needs_revision') {
    res.status(400).json({ error: 'decision must be one of "approved" | "rejected" | "needs_revision"' })
    return
  }
  const review = reviewStore.setFinalDecision(record.contractId, decision, decidedBy)
  auditStore.record('reviewer', 'final_decision_recorded', 'Success', { contractId: record.contractId, decision, decidedBy })
  res.json(review)
}
