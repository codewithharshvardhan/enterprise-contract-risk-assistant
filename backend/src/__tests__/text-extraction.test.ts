import { describe, it, expect } from 'vitest'
import { extractTextFromFile, SUPPORTED_EXTENSIONS } from '../services/text-extraction'

describe('extractTextFromFile', () => {
  it('returns raw utf-8 text for a .txt file', async () => {
    const buffer = Buffer.from('Hello, contract world.', 'utf-8')
    const text = await extractTextFromFile(buffer, 'text/plain', 'contract.txt')
    expect(text).toBe('Hello, contract world.')
  })

  it('falls back to mimetype when the filename has no extension', async () => {
    const buffer = Buffer.from('No extension here.', 'utf-8')
    const text = await extractTextFromFile(buffer, 'text/plain', 'contract')
    expect(text).toBe('No extension here.')
  })

  it('throws a descriptive error for an unsupported extension', async () => {
    const buffer = Buffer.from('irrelevant', 'utf-8')
    await expect(extractTextFromFile(buffer, 'application/octet-stream', 'malware.exe')).rejects.toThrow(/Unsupported file type/)
  })

  it('throws for an unsupported extension even with no recognizable mimetype', async () => {
    const buffer = Buffer.from('irrelevant', 'utf-8')
    await expect(extractTextFromFile(buffer, '', 'archive.zip')).rejects.toThrow(/Unsupported file type/)
  })

  it('exports the three documented supported extensions', () => {
    expect(SUPPORTED_EXTENSIONS).toEqual(['.pdf', '.docx', '.txt'])
  })
})
