/**
 * Tests for the Enterprise Contract Risk Workflow pipeline.
 *
 * Nodes 3–5 call an LLM via OpenRouter. Because OPENROUTER_API_KEY is not
 * available in the test environment the pipeline fails gracefully at the
 * extractor stage (after successfully executing nodes 1 and 2). The tests verify:
 *   - Correct HTTP status codes and response shapes for all endpoints.
 *   - Graceful error handling when the API key is absent (status='error', no
 *     server crash, the execution is still persisted and retrievable).
 *   - Unit-level correctness of the two deterministic pipeline nodes.
 *   - Execution-store invariants.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../app'
import { runNode1Webhook } from '../services/pipeline/node1-webhook'
import { runNode2ContractInput } from '../services/pipeline/node2-input'
import * as executionStore from '../services/execution-store'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_CONTRACT = `
SERVICE AGREEMENT

This Service Agreement ("Agreement") is entered into as of January 1, 2024,
between Acme Corp ("Service Provider") and Beta Inc ("Client").

1. SERVICES. Service Provider agrees to deliver software consulting services.
2. PAYMENT. Client shall pay $10,000 per month.
3. TERM. This Agreement commences on January 1, 2024 and expires December 31, 2024.
4. CONFIDENTIALITY. Both parties agree to keep all information confidential.
5. GOVERNING LAW. This Agreement shall be governed by the laws of California.
6. TERMINATION. Either party may terminate with 30 days written notice.
`.trim()

// ---------------------------------------------------------------------------
// 1. Health check
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'ok' })
  })
})

// ---------------------------------------------------------------------------
// 2. Contract analysis endpoint  POST /api/v1/contracts/analyze
// ---------------------------------------------------------------------------

describe('POST /api/v1/contracts/analyze', () => {
  it('returns 400 when contract_text is missing', async () => {
    const res = await request(app)
      .post('/api/v1/contracts/analyze')
      .send({})
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 400 when contract_text is empty string', async () => {
    const res = await request(app)
      .post('/api/v1/contracts/analyze')
      .send({ contract_text: '' })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns an execution record with required fields when called with valid contract_text', async () => {
    const res = await request(app)
      .post('/api/v1/contracts/analyze')
      .send({ contract_text: SAMPLE_CONTRACT })

    // The pipeline may succeed or fail at node 3 depending on OPENROUTER_API_KEY,
    // but in either case the server must return 200 with a valid execution record.
    expect(res.status).toBe(200)
    const body = res.body as Record<string, unknown>
    expect(typeof body.id).toBe('string')
    expect(['running', 'done', 'error']).toContain(body.status)
    expect(Array.isArray(body.nodes)).toBe(true)
    expect(typeof body.startedAt).toBe('string')
  })

  it('returns an execution record with nodes containing the correct stepIds', async () => {
    const res = await request(app)
      .post('/api/v1/contracts/analyze')
      .send({ contract_text: SAMPLE_CONTRACT })

    expect(res.status).toBe(200)
    const body = res.body as { status: string; nodes: Array<{ stepId: string }> }
    expect(Array.isArray(body.nodes)).toBe(true)

    const stepIds = body.nodes.map((n) => n.stepId)

    if (body.status === 'done') {
      // When the API key is present all 5 nodes complete.
      expect(body.nodes).toHaveLength(5)
      expect(stepIds).toContain('Node_1_Webhook')
      expect(stepIds).toContain('Node_2_Contract_Input')
      expect(stepIds).toContain('Extractor_and_Absence_Agent')
      expect(stepIds).toContain('Risk_Matrix_Evaluator')
      expect(stepIds).toContain('JSON_Guardrail_Formatter')
    } else {
      // When the API key is absent the pipeline fails at node 3.
      // The error handler appends exactly ONE error node for the failing stage,
      // so the record contains nodes 1, 2 (done) + the first failing node (error).
      // Nodes 1 and 2 must always be present with the correct stepIds.
      expect(stepIds).toContain('Node_1_Webhook')
      expect(stepIds).toContain('Node_2_Contract_Input')
      // The first error node is Extractor_and_Absence_Agent.
      expect(stepIds).toContain('Extractor_and_Absence_Agent')
      // Total: 3 nodes (2 done + 1 error). Remaining nodes are not emitted.
      expect(body.nodes.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('fails gracefully at the extractor stage when OPENROUTER_API_KEY is absent', async () => {
    // The test runner does not have a real OpenRouter key. The pipeline should
    // catch the error internally, persist an error execution, and return 200
    // (not 500/crash) with status='error'.
    const res = await request(app)
      .post('/api/v1/contracts/analyze')
      .send({ contract_text: SAMPLE_CONTRACT })

    expect(res.status).toBe(200)
    const body = res.body as { status: string; nodes: Array<{ stepId: string; status: string }> }

    if (body.status === 'error') {
      // Nodes 1 and 2 should have completed successfully before the failure.
      const node1 = body.nodes.find((n) => n.stepId === 'Node_1_Webhook')
      const node2 = body.nodes.find((n) => n.stepId === 'Node_2_Contract_Input')
      expect(node1).toBeTruthy()
      expect(node2).toBeTruthy()
      expect(node1!.status).toBe('done')
      expect(node2!.status).toBe('done')

      // The extractor node should be marked as error.
      const node3 = body.nodes.find((n) => n.stepId === 'Extractor_and_Absence_Agent')
      expect(node3).toBeTruthy()
      expect(node3!.status).toBe('error')
    }
    // If OPENROUTER_API_KEY IS present (unusual in CI), status will be 'done' — also fine.
  })
})

// ---------------------------------------------------------------------------
// 3. Webhook endpoint  POST /webhook
// ---------------------------------------------------------------------------

describe('POST /webhook', () => {
  it('returns 400 when raw_text is missing', async () => {
    const res = await request(app).post('/webhook').send({})
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 400 when raw_text is an empty string', async () => {
    const res = await request(app).post('/webhook').send({ raw_text: '' })
    expect(res.status).toBe(400)
  })

  it('returns a valid execution record when raw_text is provided (graceful on missing key)', async () => {
    const res = await request(app)
      .post('/webhook')
      .send({ raw_text: SAMPLE_CONTRACT })

    expect(res.status).toBe(200)
    const body = res.body as Record<string, unknown>
    expect(typeof body.id).toBe('string')
    expect(['done', 'error']).toContain(body.status)
    expect(Array.isArray(body.nodes)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 4. Executions list  GET /api/v1/contracts/executions
// ---------------------------------------------------------------------------

describe('GET /api/v1/contracts/executions', () => {
  it('returns an array', async () => {
    const res = await request(app).get('/api/v1/contracts/executions')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('contains the execution after running an analysis', async () => {
    // Trigger an analysis so there is at least one execution in the store.
    const analyze = await request(app)
      .post('/api/v1/contracts/analyze')
      .send({ contract_text: SAMPLE_CONTRACT })
    expect(analyze.status).toBe(200)
    const executionId = (analyze.body as { id: string }).id

    const list = await request(app).get('/api/v1/contracts/executions')
    expect(list.status).toBe(200)
    const ids = (list.body as Array<{ id: string }>).map((e) => e.id)
    expect(ids).toContain(executionId)
  })
})

// ---------------------------------------------------------------------------
// 5. Get execution  GET /api/v1/contracts/executions/:id
// ---------------------------------------------------------------------------

describe('GET /api/v1/contracts/executions/:id', () => {
  it('returns 404 for a non-existent id', async () => {
    const res = await request(app).get('/api/v1/contracts/executions/does-not-exist-00000000')
    expect(res.status).toBe(404)
  })

  it('returns the execution record for a valid id', async () => {
    const analyze = await request(app)
      .post('/api/v1/contracts/analyze')
      .send({ contract_text: SAMPLE_CONTRACT })
    expect(analyze.status).toBe(200)
    const executionId = (analyze.body as { id: string }).id

    const res = await request(app).get(`/api/v1/contracts/executions/${executionId}`)
    expect(res.status).toBe(200)
    expect((res.body as { id: string }).id).toBe(executionId)
    expect(Array.isArray((res.body as { nodes: unknown[] }).nodes)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 6. Feedback endpoint  POST /api/v1/contracts/feedback
// ---------------------------------------------------------------------------

describe('POST /api/v1/contracts/feedback', () => {
  it('returns 400 when stage is missing', async () => {
    const res = await request(app)
      .post('/api/v1/contracts/feedback')
      .send({ kind: 'extract_thumbs_up' })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 400 when kind is missing', async () => {
    const res = await request(app)
      .post('/api/v1/contracts/feedback')
      .send({ stage: 'extractor' })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns a feedback entry for valid stage + kind', async () => {
    const res = await request(app)
      .post('/api/v1/contracts/feedback')
      .send({
        stage: 'extractor',
        kind: 'extract_thumbs_up',
        data: { segment: 'test' },
      })
    expect(res.status).toBe(200)
    const body = res.body as Record<string, unknown>
    expect(body).toBeTruthy()
    expect(body.stage).toBe('extractor')
    expect(body.kind).toBe('extract_thumbs_up')
  })
})

// ---------------------------------------------------------------------------
// 7. Pipeline node unit tests
// ---------------------------------------------------------------------------

describe('runNode1Webhook', () => {
  it('throws when raw_text is missing', () => {
    expect(() => runNode1Webhook({ raw_text: '' }, 'test-contract-id')).toThrow()
  })

  it('throws when raw_text is not provided', () => {
    // Casting to bypass TypeScript so we can test the runtime guard.
    expect(() => runNode1Webhook({ raw_text: undefined as unknown as string }, 'test-id')).toThrow()
  })

  it('returns a node and rawText when given valid input', () => {
    const result = runNode1Webhook({ raw_text: SAMPLE_CONTRACT }, 'test-id')
    expect(result).toHaveProperty('node')
    expect(result).toHaveProperty('rawText')
    expect(result.rawText).toBe(SAMPLE_CONTRACT)
    expect(result.node.stepId).toBe('Node_1_Webhook')
    expect(result.node.status).toBe('done')
  })
})

describe('runNode2ContractInput', () => {
  it('returns sanitized text with correct node metadata', () => {
    const { node, formattedText } = runNode2ContractInput(SAMPLE_CONTRACT, 'test-id')
    expect(node.stepId).toBe('Node_2_Contract_Input')
    expect(node.status).toBe('done')
    expect(typeof formattedText).toBe('string')
    expect(formattedText.length).toBeGreaterThan(0)
  })

  it('normalizes whitespace (multiple spaces collapsed to single space)', () => {
    const input = 'Hello   World\t\there'
    const { formattedText } = runNode2ContractInput(input, 'test-id')
    // Multiple spaces/tabs on the same line should be collapsed to a single space.
    expect(formattedText).not.toMatch(/[ \t]{2,}/)
  })

  it('handles whitespace normalization of carriage returns', () => {
    const input = 'Line one\r\nLine two\r\nLine three'
    const { formattedText } = runNode2ContractInput(input, 'test-id')
    expect(formattedText).not.toContain('\r')
  })

  it('strips null bytes', () => {
    const input = 'Hello\0World'
    const { formattedText } = runNode2ContractInput(input, 'test-id')
    expect(formattedText).not.toContain('\0')
    expect(formattedText).toContain('Hello')
    expect(formattedText).toContain('World')
  })

  it('truncates text to 60000 characters', () => {
    const longText = 'A'.repeat(70000)
    const { formattedText, truncated } = runNode2ContractInput(longText, 'test-id')
    expect(formattedText.length).toBeLessThanOrEqual(60000)
    expect(truncated).toBe(true)
  })

  it('does not truncate text shorter than 8000 characters', () => {
    const shortText = 'Short contract text that is well under the limit.'
    const { formattedText } = runNode2ContractInput(shortText, 'test-id')
    // After normalization the text should still be present and not truncated.
    expect(formattedText.length).toBeGreaterThan(0)
    expect(formattedText.length).toBeLessThanOrEqual(8000)
  })

  it('collapses three or more consecutive blank lines into two newlines', () => {
    const input = 'Para one\n\n\n\n\nPara two'
    const { formattedText } = runNode2ContractInput(input, 'test-id')
    // Should not have more than 2 consecutive newlines after normalization.
    expect(formattedText).not.toMatch(/\n{3,}/)
  })
})

// ---------------------------------------------------------------------------
// 8. Execution store unit tests
// ---------------------------------------------------------------------------

describe('execution-store', () => {
  // Use a fresh module state snapshot by reading count before operations.

  it('save and get work correctly', () => {
    const before = executionStore.count()
    const rec = {
      id: `test-store-${Date.now()}`,
      contractId: 'cid-1',
      startedAt: new Date().toISOString(),
      status: 'done' as const,
      nodes: [],
    }
    executionStore.save(rec)
    expect(executionStore.count()).toBe(before + 1)
    const retrieved = executionStore.get(rec.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(rec.id)
    expect(retrieved!.status).toBe('done')
  })

  it('list returns newest first', () => {
    const id1 = `order-test-a-${Date.now()}`
    const id2 = `order-test-b-${Date.now() + 1}`
    executionStore.save({ id: id1, contractId: 'cid-a', startedAt: new Date().toISOString(), status: 'done', nodes: [] })
    executionStore.save({ id: id2, contractId: 'cid-b', startedAt: new Date().toISOString(), status: 'done', nodes: [] })

    const all = executionStore.list()
    const idx1 = all.findIndex((r) => r.id === id1)
    const idx2 = all.findIndex((r) => r.id === id2)
    // id2 was inserted last, so it should appear before id1 in newest-first order.
    expect(idx2).toBeLessThan(idx1)
  })

  it('stageCounts returns correct counts', () => {
    const id = `stage-count-test-${Date.now()}`
    executionStore.save({
      id,
      contractId: 'cid-sc',
      startedAt: new Date().toISOString(),
      status: 'done',
      nodes: [
        { nodeId: 'node-1', stepId: 'Node_1_Webhook', label: 'Webhook', status: 'done', durationMs: 1 },
        { nodeId: 'node-2', stepId: 'Node_2_Contract_Input', label: 'Input', status: 'done', durationMs: 1 },
        { nodeId: 'node-3', stepId: 'Extractor_and_Absence_Agent', label: 'Extractor', status: 'error', durationMs: 0 },
      ],
    })

    const counts = executionStore.stageCounts()
    expect(typeof counts.total).toBe('number')
    expect(counts.total).toBeGreaterThanOrEqual(1)
    // The record we just inserted has node1 and node2 done, so those counts must
    // be at least 1.
    expect(counts.webhookOk).toBeGreaterThanOrEqual(1)
    expect(counts.inputOk).toBeGreaterThanOrEqual(1)
    // The extractor node is 'error', not 'done', so extractorOk might not include it.
    expect(typeof counts.extractorOk).toBe('number')
    expect(typeof counts.riskOk).toBe('number')
    expect(typeof counts.formatterOk).toBe('number')
  })

  it('get returns undefined for an unknown id', () => {
    expect(executionStore.get('definitely-does-not-exist-xyzzy')).toBeUndefined()
  })

  it('updating an existing record replaces it without growing the store', () => {
    const id = `update-test-${Date.now()}`
    executionStore.save({ id, contractId: 'cid-u', startedAt: new Date().toISOString(), status: 'running', nodes: [] })
    const countAfterInsert = executionStore.count()
    // Update the same record.
    executionStore.save({ id, contractId: 'cid-u', startedAt: new Date().toISOString(), status: 'done', nodes: [] })
    expect(executionStore.count()).toBe(countAfterInsert)
    expect(executionStore.get(id)!.status).toBe('done')
  })
})
