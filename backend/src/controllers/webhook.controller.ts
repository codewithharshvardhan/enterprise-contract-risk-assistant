import type { Request, Response } from 'express'
import { runPipeline } from '../services/pipeline'

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const body = req.body as { raw_text?: string; body?: { raw_text?: string } }
  // Accept raw_text at top-level or nested under body (n8n-style webhook format)
  const rawText = body.raw_text ?? body.body?.raw_text
  if (!rawText || typeof rawText !== 'string') {
    res.status(400).json({ error: 'Missing raw_text in webhook payload' })
    return
  }
  const record = await runPipeline(rawText)
  res.json(record)
}
