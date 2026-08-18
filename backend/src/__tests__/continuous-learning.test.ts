import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../app'
import { agentConfigService } from '../services/agent-config.service'

const BASE = '/api/v1/continuous-learning'

describe('Continuous Learning API', () => {
  it('GET /overview returns the shape with no fabricated activity', async () => {
    const res = await request(app).get(`${BASE}/overview`)
    expect(res.status).toBe(200)
    expect(res.body.funnel).toBeTruthy()
    expect(res.body.sla).toBeTruthy()
    expect(res.body.dashboard).toBeTruthy()
    expect(res.body.funnel.detect.drift_alerts_open).toBe(0)
  })

  it('GET /baselines returns the 4 seeded quality targets', async () => {
    const res = await request(app).get(`${BASE}/baselines`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThanOrEqual(4)
    const metrics = res.body.map((b: { metric: string }) => b.metric)
    expect(metrics).toContain('extraction_completeness')
    expect(metrics).toContain('json_validity_rate')
  })

  it.each(['feedback', 'drift-alerts', 'opportunities', 'experiments'])(
    'GET /%s returns an empty array',
    async (path) => {
      const res = await request(app).get(`${BASE}/${path}`)
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    },
  )

  it('GET /promoted returns the seeded agent config promotions', async () => {
    const res = await request(app).get(`${BASE}/promoted`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThanOrEqual(11)
  })

  it('GET /timelines returns an empty map', async () => {
    const res = await request(app).get(`${BASE}/timelines`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({})
  })

  it('GET /config returns the tunable config and the promotion gate', async () => {
    const res = await request(app).get(`${BASE}/config`)
    expect(res.status).toBe(200)
    expect(res.body.namespaces).toBeTruthy()
    expect(res.body.gate).toBeTruthy()
    expect(typeof res.body.blocking_breach).toBe('boolean')
  })

  // ─── Quality targets (baselines) — operator-defined CRUD ───────────────────
  it('POST /baselines requires a metric (400)', async () => {
    const res = await request(app).post(`${BASE}/baselines`).send({ direction: 'max' })
    expect(res.status).toBe(400)
  })

  it('POST/PUT/DELETE /baselines round-trips an operator quality target', async () => {
    const created = await request(app)
      .post(`${BASE}/baselines`)
      .send({ metric: 'answer_quality', direction: 'max', target_value: 0.9, severity: 'warn' })
    expect(created.status).toBe(201)
    const id = created.body.id as number
    expect(created.body.metric).toBe('answer_quality')
    expect(created.body.label).toBe('answer_quality') // defaulted from metric
    expect(created.body.last_status).toBe('unknown') // nothing observed yet

    const list = await request(app).get(`${BASE}/baselines`)
    expect(list.body.some((b: { id: number }) => b.id === id)).toBe(true)

    const updated = await request(app).put(`${BASE}/baselines/${id}`).send({ target_value: 0.95 })
    expect(updated.status).toBe(200)
    expect(updated.body.target_value).toBe(0.95)

    const deleted = await request(app).delete(`${BASE}/baselines/${id}`)
    expect(deleted.status).toBe(200)
    const after = await request(app).get(`${BASE}/baselines`)
    expect(after.body.some((b: { id: number }) => b.id === id)).toBe(false)
  })

  it('PUT /baselines/:id 404s for an unknown id', async () => {
    const res = await request(app).put(`${BASE}/baselines/999999`).send({ target_value: 0.5 })
    expect(res.status).toBe(404)
  })

  // ─── Capture — feedback persisted to the shared store, read back live ──────
  it('POST /feedback requires stage and kind (400)', async () => {
    const res = await request(app).post(`${BASE}/feedback`).send({ stage: 'decide' })
    expect(res.status).toBe(400)
  })

  it('POST /feedback persists a signal and it shows up live', async () => {
    const created = await request(app)
      .post(`${BASE}/feedback`)
      .send({ stage: 'decide', kind: 'decide_thumbs_down', subject: 'PO 1', note: 'missed' })
    expect(created.status).toBe(201)
    expect(created.body.id).toBeGreaterThan(0)

    const feed = await request(app).get(`${BASE}/feedback`)
    expect(feed.body[0].kind).toBe('decide_thumbs_down')

    const overview = await request(app).get(`${BASE}/overview`)
    expect(overview.body.dashboard.feedback_summary.thumbs_down).toBeGreaterThanOrEqual(1)
    expect(overview.body.dashboard.feedback_summary.per_stage.decide.thumbs_down).toBeGreaterThanOrEqual(1)
  })

  // ─── Loop D · operator-tunable agent config ────────────────────────────────
  it('POST /promote requires an experiment_id (400)', async () => {
    const res = await request(app).post(`${BASE}/promote`).send({ namespace: 'business_rules' })
    expect(res.status).toBe(400)
  })

  it('POST /promote 422s for an experiment that has not been validated', async () => {
    const res = await request(app).post(`${BASE}/promote`).send({ experiment_id: 999999 })
    expect(res.status).toBe(422)
    expect(res.body.gate.passed).toBe(false)
  })

  // version 0 is always below the minimum valid version (1), so this must 400
  it('POST /rollback 400s when target version is out of range', async () => {
    const res = await request(app).post(`${BASE}/rollback`).send({ version: 0 })
    expect(res.status).toBe(400)
  })
})

describe('agent-config store (Loop D — operator-tunable, not code)', () => {
  it('promotes a gated candidate as a new version and exposes it via getValue', () => {
    const before = agentConfigService.getConfig().version
    const result = agentConfigService.promote(
      { namespace: 'research', key: 'max_results', value: 8, sample_size: 500, delta_pct: 5 },
      { blockingBreach: false },
    )
    expect(result.gate.passed).toBe(true)
    expect(result.version?.version).toBe(before + 1)
    expect(agentConfigService.getValue('research', 'max_results', 0)).toBe(8)
  })

  it('rolls a promoted change back to a prior version', () => {
    agentConfigService.promote(
      { namespace: 'rollback_ns', key: 'k', value: 1, sample_size: 500, delta_pct: 5 },
      { blockingBreach: false },
    )
    const afterFirst = agentConfigService.getConfig().version
    agentConfigService.promote(
      { namespace: 'rollback_ns', key: 'k', value: 2, sample_size: 500, delta_pct: 5 },
      { blockingBreach: false },
    )
    expect(agentConfigService.getValue('rollback_ns', 'k', 0)).toBe(2)
    agentConfigService.rollback(afterFirst)
    expect(agentConfigService.getValue('rollback_ns', 'k', 0)).toBe(1)
  })
})
