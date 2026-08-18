import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../app'

describe('Items API', () => {
  it('GET /api/v1/items returns empty array initially', async () => {
    const res = await request(app).get('/api/v1/items')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('POST /api/v1/items creates an item', async () => {
    const res = await request(app)
      .post('/api/v1/items')
      .send({ name: 'Widget', description: 'A test widget' })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ name: 'Widget', description: 'A test widget' })
    expect(typeof res.body.id).toBe('string')
    expect(typeof res.body.createdAt).toBe('string')
  })

  it('GET /api/v1/items/:id returns the item', async () => {
    const create = await request(app)
      .post('/api/v1/items')
      .send({ name: 'Gadget', description: '' })
    const id: string = create.body.id as string

    const res = await request(app).get(`/api/v1/items/${id}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(id)
  })

  it('GET /api/v1/items/:id returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/v1/items/does-not-exist')
    expect(res.status).toBe(404)
  })

  it('PUT /api/v1/items/:id updates the item', async () => {
    const create = await request(app)
      .post('/api/v1/items')
      .send({ name: 'Old', description: '' })
    const id: string = create.body.id as string

    const res = await request(app).put(`/api/v1/items/${id}`).send({ name: 'New' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('New')
  })

  it('DELETE /api/v1/items/:id deletes the item', async () => {
    const create = await request(app)
      .post('/api/v1/items')
      .send({ name: 'Temp', description: '' })
    const id: string = create.body.id as string

    const del = await request(app).delete(`/api/v1/items/${id}`)
    expect(del.status).toBe(204)

    const get = await request(app).get(`/api/v1/items/${id}`)
    expect(get.status).toBe(404)
  })

  it('POST /api/v1/items returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/v1/items').send({ description: 'No name' })
    expect(res.status).toBe(400)
  })
})
