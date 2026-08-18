/**
 * Tests for POST /api/v1/contracts/analyze-file: text extraction routing,
 * unsupported-type rejection, and SHA-256-based duplicate detection.
 */

import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../app'

const CONTRACT_TEXT = `
NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement is entered into between Acme Corp and Beta
Inc for the purpose of evaluating a potential business relationship. Both
parties agree to keep all shared information strictly confidential.
`.trim()

// Each hash-sensitive scenario below gets its own distinct contract text so
// SHA-256 hashes never collide across tests (execution-store persists for
// the whole suite run, so reusing text would make an unrelated test's
// upload look like a duplicate of this one).
const DUPLICATE_TEST_TEXT = `${CONTRACT_TEXT} Reference: DUPLICATE-DETECTION-TEST.`
const DISTINCT_TEXT_A = `${CONTRACT_TEXT} Reference: DISTINCT-TEST-A.`
const DISTINCT_TEXT_B = `${CONTRACT_TEXT} Reference: DISTINCT-TEST-B.`

describe('POST /api/v1/contracts/analyze-file', () => {
  it('returns 400 when no file is attached', async () => {
    const res = await request(app).post('/api/v1/contracts/analyze-file')
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 400 for an unsupported file extension', async () => {
    const res = await request(app)
      .post('/api/v1/contracts/analyze-file')
      .attach('file', Buffer.from('binary garbage'), 'notes.exe')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Unsupported file type/)
  })

  it('accepts a .txt file and returns an execution record', async () => {
    const res = await request(app)
      .post('/api/v1/contracts/analyze-file')
      .attach('file', Buffer.from(CONTRACT_TEXT, 'utf-8'), 'nda.txt')
    expect(res.status).toBe(200)
    expect(typeof res.body.id).toBe('string')
    expect(res.body.sourceFilename).toBe('nda.txt')
    expect(typeof res.body.textHash).toBe('string')
    expect(res.body.duplicateOfId).toBeUndefined()
  })

  it('returns 400 for an empty file with no extractable text', async () => {
    const res = await request(app)
      .post('/api/v1/contracts/analyze-file')
      .attach('file', Buffer.from('   \n\n  ', 'utf-8'), 'empty.txt')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/No extractable text/)
  })

  it('flags a second upload with identical content as a duplicate of the first', async () => {
    const first = await request(app)
      .post('/api/v1/contracts/analyze-file')
      .attach('file', Buffer.from(DUPLICATE_TEST_TEXT, 'utf-8'), 'nda-original.txt')
    expect(first.status).toBe(200)
    const originalId = first.body.id as string

    const second = await request(app)
      .post('/api/v1/contracts/analyze-file')
      .attach('file', Buffer.from(DUPLICATE_TEST_TEXT, 'utf-8'), 'nda-copy.txt')
    expect(second.status).toBe(200)
    expect(second.body.id).not.toBe(originalId)
    expect(second.body.duplicateOfId).toBe(originalId)
    expect(second.body.sourceFilename).toBe('nda-copy.txt')
    // The duplicate short-circuits the pipeline and reuses the original's result/status.
    expect(second.body.status).toBe(first.body.status)
  })

  it('does not flag two uploads with different content as duplicates', async () => {
    const a = await request(app)
      .post('/api/v1/contracts/analyze-file')
      .attach('file', Buffer.from(DISTINCT_TEXT_A, 'utf-8'), 'a.txt')
    const b = await request(app)
      .post('/api/v1/contracts/analyze-file')
      .attach('file', Buffer.from(DISTINCT_TEXT_B, 'utf-8'), 'b.txt')
    expect(a.body.duplicateOfId).toBeUndefined()
    expect(b.body.duplicateOfId).toBeUndefined()
    expect(a.body.textHash).not.toBe(b.body.textHash)
  })
})
