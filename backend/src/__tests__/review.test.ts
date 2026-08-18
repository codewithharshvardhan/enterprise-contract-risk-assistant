/**
 * Tests for the human-review workflow endpoints (PRD §6.10):
 *   GET   /api/v1/contracts/:id/review
 *   PATCH /api/v1/contracts/:id/review/metadata
 *   POST  /api/v1/contracts/:id/review/risk-decision
 *   POST  /api/v1/contracts/:id/review/comment
 *   POST  /api/v1/contracts/:id/review/decision
 *
 * These endpoints only require an execution record to exist — they don't
 * depend on the pipeline having reached a 'done' status — so they work
 * deterministically in CI without a real OPENROUTER_API_KEY.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../app'

const SAMPLE_CONTRACT = `
SERVICE AGREEMENT

This Service Agreement is entered into between Acme Corp ("Provider") and
Beta Inc ("Client"). Provider agrees to deliver consulting services. Client
shall pay $5,000 per month. Either party may terminate with 30 days notice.
`.trim()

async function createExecution(): Promise<string> {
  const res = await request(app).post('/api/v1/contracts/analyze').send({ contract_text: SAMPLE_CONTRACT })
  return (res.body as { id: string }).id
}

describe('Review workflow', () => {
  let contractId: string

  beforeAll(async () => {
    contractId = await createExecution()
  })

  describe('GET /api/v1/contracts/:id/review', () => {
    it('returns 404 for a non-existent execution', async () => {
      const res = await request(app).get('/api/v1/contracts/does-not-exist/review')
      expect(res.status).toBe(404)
    })

    it('returns the execution and an empty-shaped review for a fresh execution', async () => {
      const res = await request(app).get(`/api/v1/contracts/${contractId}/review`)
      expect(res.status).toBe(200)
      expect(res.body.execution.id).toBe(contractId)
      expect(res.body.review.contractId).toBe(contractId)
      expect(res.body.review.editedMetadata).toEqual({})
      expect(res.body.review.riskDecisions).toEqual({})
      expect(res.body.review.comments).toEqual([])
      expect(res.body.review.finalDecision).toBeUndefined()
    })
  })

  describe('PATCH /api/v1/contracts/:id/review/metadata', () => {
    it('returns 404 for a non-existent execution', async () => {
      const res = await request(app).patch('/api/v1/contracts/does-not-exist/review/metadata').send({ title: 'x' })
      expect(res.status).toBe(404)
    })

    it('merges a metadata patch into editedMetadata and persists it', async () => {
      const res = await request(app)
        .patch(`/api/v1/contracts/${contractId}/review/metadata`)
        .send({ title: 'Amended Title', governing_law: 'Delaware' })
      expect(res.status).toBe(200)
      expect(res.body.editedMetadata).toMatchObject({ title: 'Amended Title', governing_law: 'Delaware' })

      const second = await request(app)
        .patch(`/api/v1/contracts/${contractId}/review/metadata`)
        .send({ jurisdiction: 'Delaware' })
      expect(second.status).toBe(200)
      // Previous fields survive a second, partial patch (merge, not replace).
      expect(second.body.editedMetadata).toMatchObject({ title: 'Amended Title', governing_law: 'Delaware', jurisdiction: 'Delaware' })
    })
  })

  describe('POST /api/v1/contracts/:id/review/risk-decision', () => {
    it('returns 404 for a non-existent execution', async () => {
      const res = await request(app).post('/api/v1/contracts/does-not-exist/review/risk-decision').send({ riskId: 'r1', decision: 'accepted' })
      expect(res.status).toBe(404)
    })

    it('returns 400 when riskId is missing', async () => {
      const res = await request(app).post(`/api/v1/contracts/${contractId}/review/risk-decision`).send({ decision: 'accepted' })
      expect(res.status).toBe(400)
    })

    it('returns 400 when decision is not accepted/rejected', async () => {
      const res = await request(app).post(`/api/v1/contracts/${contractId}/review/risk-decision`).send({ riskId: 'r1', decision: 'maybe' })
      expect(res.status).toBe(400)
    })

    it('records a valid risk decision', async () => {
      const res = await request(app).post(`/api/v1/contracts/${contractId}/review/risk-decision`).send({ riskId: 'risk-1', decision: 'accepted' })
      expect(res.status).toBe(200)
      expect(res.body.riskDecisions).toMatchObject({ 'risk-1': 'accepted' })
    })

    it('overwrites a prior decision for the same riskId', async () => {
      const res = await request(app).post(`/api/v1/contracts/${contractId}/review/risk-decision`).send({ riskId: 'risk-1', decision: 'rejected' })
      expect(res.status).toBe(200)
      expect(res.body.riskDecisions).toMatchObject({ 'risk-1': 'rejected' })
    })
  })

  describe('POST /api/v1/contracts/:id/review/comment', () => {
    it('returns 404 for a non-existent execution', async () => {
      const res = await request(app).post('/api/v1/contracts/does-not-exist/review/comment').send({ text: 'hi' })
      expect(res.status).toBe(404)
    })

    it('returns 400 when text is missing or blank', async () => {
      const res1 = await request(app).post(`/api/v1/contracts/${contractId}/review/comment`).send({})
      expect(res1.status).toBe(400)
      const res2 = await request(app).post(`/api/v1/contracts/${contractId}/review/comment`).send({ text: '   ' })
      expect(res2.status).toBe(400)
    })

    it('appends a comment with an id and timestamp', async () => {
      const res = await request(app).post(`/api/v1/contracts/${contractId}/review/comment`).send({ text: 'Looks fine to me.', author: 'reviewer@example.com' })
      expect(res.status).toBe(200)
      expect(res.body.comments).toHaveLength(1)
      expect(res.body.comments[0]).toMatchObject({ text: 'Looks fine to me.', author: 'reviewer@example.com' })
      expect(typeof res.body.comments[0].id).toBe('string')
      expect(typeof res.body.comments[0].ts).toBe('string')
    })

    it('appends subsequent comments without dropping earlier ones', async () => {
      const res = await request(app).post(`/api/v1/contracts/${contractId}/review/comment`).send({ text: 'Second comment.' })
      expect(res.status).toBe(200)
      expect(res.body.comments).toHaveLength(2)
    })
  })

  describe('POST /api/v1/contracts/:id/review/decision', () => {
    it('returns 404 for a non-existent execution', async () => {
      const res = await request(app).post('/api/v1/contracts/does-not-exist/review/decision').send({ decision: 'approved' })
      expect(res.status).toBe(404)
    })

    it('returns 400 for an invalid decision value', async () => {
      const res = await request(app).post(`/api/v1/contracts/${contractId}/review/decision`).send({ decision: 'maybe' })
      expect(res.status).toBe(400)
    })

    it('records a final decision with decidedBy and decidedAt', async () => {
      const res = await request(app).post(`/api/v1/contracts/${contractId}/review/decision`).send({ decision: 'approved', decidedBy: 'reviewer@example.com' })
      expect(res.status).toBe(200)
      expect(res.body.finalDecision).toBe('approved')
      expect(res.body.decidedBy).toBe('reviewer@example.com')
      expect(typeof res.body.decidedAt).toBe('string')
    })
  })

  it('the full review state accumulated above is retrievable via GET .../review', async () => {
    const res = await request(app).get(`/api/v1/contracts/${contractId}/review`)
    expect(res.status).toBe(200)
    expect(res.body.review.editedMetadata).toMatchObject({ title: 'Amended Title' })
    expect(res.body.review.riskDecisions).toMatchObject({ 'risk-1': 'rejected' })
    expect(res.body.review.comments).toHaveLength(2)
    expect(res.body.review.finalDecision).toBe('approved')
  })
})
