import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../app'

const CONTRACT_TEXT = `
MASTER SERVICES AGREEMENT

This Master Services Agreement is entered into between Acme Corp and Beta
Inc. Acme agrees to provide managed services. Beta shall pay invoices
within 30 days. Either party may terminate this agreement with 60 days
written notice to the other party.
`.trim()

describe('Governance API', () => {
  it('GET /api/v1/governance/overview returns the overview', async () => {
    const res = await request(app).get('/api/v1/governance/overview')
    expect(res.status).toBe(200)
    expect(res.body).toBeTruthy()
    expect(Array.isArray(res.body.kpis)).toBe(true)
  })

  it('GET /api/v1/governance/audit returns rows and details', async () => {
    const res = await request(app).get('/api/v1/governance/audit')
    expect(res.status).toBe(200)
    expect(res.body).toBeTruthy()
    expect(Array.isArray(res.body.rows)).toBe(true)
    expect(res.body.details).toBeTruthy()
  })

  it('GET /api/v1/governance/fleet returns pipelines and tools', async () => {
    const res = await request(app).get('/api/v1/governance/fleet')
    expect(res.status).toBe(200)
    expect(res.body).toBeTruthy()
    expect(Array.isArray(res.body.allTenantTools)).toBe(true)
  })

  it('GET /api/v1/governance/policies returns rules and patterns', async () => {
    const res = await request(app).get('/api/v1/governance/policies')
    expect(res.status).toBe(200)
    expect(res.body).toBeTruthy()
    expect(Array.isArray(res.body.rules)).toBe(true)
  })

  it('GET /api/v1/governance/compliance returns the compliance object', async () => {
    const res = await request(app).get('/api/v1/governance/compliance')
    expect(res.status).toBe(200)
    expect(res.body).toBeTruthy()
    expect(Array.isArray(res.body.controls)).toBe(true)
  })

  it('GET /api/v1/governance/slo returns the slo object', async () => {
    const res = await request(app).get('/api/v1/governance/slo')
    expect(res.status).toBe(200)
    expect(res.body).toBeTruthy()
    expect(res.body.error_budget).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Dynamic derivation: these numbers must be computed from the real,
// hash-chained audit trail (governance-audit-store) and real review/execution
// state, not hardcoded fixture values. See governance.service.ts's
// computePolicyFires/getPoliciesData/getComplianceData.
// ---------------------------------------------------------------------------

describe('Governance dynamic derivation', () => {
  it('POL-EXT-001/002/003 fires increase by exactly 1 after a pipeline run that reaches node 3', async () => {
    const before = await request(app).get('/api/v1/governance/policies')
    const firesBefore = new Map<string, number>((before.body.rules as Array<{ id: string; fires: number }>).map((r) => [r.id, r.fires]))

    const analyze = await request(app).post('/api/v1/contracts/analyze').send({ contract_text: CONTRACT_TEXT })
    expect(analyze.status).toBe(200)

    const after = await request(app).get('/api/v1/governance/policies')
    const firesAfter = new Map<string, number>((after.body.rules as Array<{ id: string; fires: number }>).map((r) => [r.id, r.fires]))

    for (const id of ['POL-EXT-001', 'POL-EXT-002', 'POL-EXT-003']) {
      expect(firesAfter.get(id)).toBe((firesBefore.get(id) ?? 0) + 1)
    }
  })

  it('a control with zero rules (ASI-07) always grades "none" with zero evidence', async () => {
    const res = await request(app).get('/api/v1/governance/compliance')
    const asi07 = (res.body.controls as Array<{ id: string; grade: string; evidence: number; rules: number }>).find((c) => c.id === 'ASI-07')!
    expect(asi07.rules).toBe(0)
    expect(asi07.grade).toBe('none')
    expect(asi07.evidence).toBe(0)
  })

  it('a control with fired rules grades "strong" with positive evidence', async () => {
    // ASI-04 is the owasp tag on POL-EXT-001/003, which the prior test guarantees have fired at least once.
    const res = await request(app).get('/api/v1/governance/compliance')
    const asi04 = (res.body.controls as Array<{ id: string; grade: string; evidence: number }>).find((c) => c.id === 'ASI-04')!
    expect(asi04.evidence).toBeGreaterThan(0)
    expect(asi04.grade).toBe('strong')
  })

  it('only recognizes strong/moderate/weak/none grade values (matches the frontend vocabulary)', async () => {
    const res = await request(app).get('/api/v1/governance/compliance')
    const grades = (res.body.controls as Array<{ grade: string }>).map((c) => c.grade)
    for (const g of grades) expect(['strong', 'moderate', 'weak', 'none']).toContain(g)
  })

  it('needs_attention only lists controls that are not graded strong', async () => {
    const res = await request(app).get('/api/v1/governance/compliance')
    const controls = res.body.controls as Array<{ id: string; grade: string }>
    const needsAttentionIds = (res.body.needs_attention as Array<{ id: string }>).map((c) => c.id)
    for (const c of controls) {
      expect(needsAttentionIds.includes(c.id)).toBe(c.grade !== 'strong')
    }
  })

  it('the Policies KPI always equals the static rule count, and HITL queue is a non-negative integer', async () => {
    const res = await request(app).get('/api/v1/governance/overview')
    const policies = (res.body.kpis as Array<{ label: string; value: unknown }>).find((k) => k.label === 'Policies')!
    const hitl = (res.body.kpis as Array<{ label: string; value: unknown }>).find((k) => k.label === 'HITL queue')!
    expect(policies.value).toBe(11)
    expect(typeof hitl.value).toBe('number')
    expect(hitl.value as number).toBeGreaterThanOrEqual(0)
  })

  it('HITL queue drops after a completed execution records a final review decision', async () => {
    // Force a fully 'done' execution directly via the store so this test does
    // not depend on a real LLM call succeeding.
    const executionStore = await import('../services/execution-store')
    const id = `gov-hitl-test-${Date.now()}`
    executionStore.save({
      id,
      contractId: id,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 'done',
      nodes: [],
      result: { recommendation: 'READY_FOR_REVIEW' } as never,
    })

    const before = await request(app).get('/api/v1/governance/overview')
    const hitlBefore = (before.body.kpis as Array<{ label: string; value: number }>).find((k) => k.label === 'HITL queue')!.value

    const decision = await request(app).post(`/api/v1/contracts/${id}/review/decision`).send({ decision: 'approved' })
    expect(decision.status).toBe(200)

    const after = await request(app).get('/api/v1/governance/overview')
    const hitlAfter = (after.body.kpis as Array<{ label: string; value: number }>).find((k) => k.label === 'HITL queue')!.value

    expect(hitlAfter).toBe(hitlBefore - 1)
  })
})
