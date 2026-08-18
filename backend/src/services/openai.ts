import OpenAI from 'openai'

const apiKey = process.env['OPENROUTER_API_KEY'] || process.env['OPENAI_API_KEY']

if (!apiKey) {
  console.warn('⚠️  WARNING: OPENROUTER_API_KEY is missing from your environment — nodes 3-5 will fail until it is set (see backend/.env.example).')
}

export const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: apiKey || '',
  defaultHeaders: {
    'HTTP-Referer': 'https://zbrain.ai',
    'X-Title': 'Enterprise Contract Risk Assistant',
  },
})

// OpenRouter's free-tier lineup changes over time — override via OPENROUTER_MODEL
// in backend/.env if this default is unavailable or rate-limited.
export const MODEL = process.env['OPENROUTER_MODEL'] || 'google/gemma-4-26b-a4b-it:free'

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1]!.trim() : trimmed
}

export interface CallJsonLLMOptions {
  systemPrompt: string
  userPrompt: string
  temperature?: number
  maxTokens?: number
}

/**
 * Calls the configured OpenRouter model expecting a single JSON object back.
 * Retries with a self-correction message if a response isn't valid JSON
 * (up to 3 attempts total — free-tier OpenRouter routing occasionally lands
 * on a provider that truncates output well under the requested max_tokens,
 * so a couple of retries meaningfully raises the success rate), then throws
 * — the pipeline's existing try/catch turns that into a graceful
 * `status: 'error'` execution rather than a crash.
 */
export async function callJsonLLM<T = unknown>(opts: CallJsonLLMOptions): Promise<T> {
  const { systemPrompt, userPrompt, temperature = 0.2, maxTokens = 2000 } = opts
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  let lastRawContent = ''
  const MAX_ATTEMPTS = 3
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature,
      max_tokens: maxTokens,
      messages,
    })
    const content = completion.choices[0]?.message?.content ?? ''
    lastRawContent = content
    try {
      return JSON.parse(stripCodeFence(content)) as T
    } catch {
      messages.push({ role: 'assistant', content })
      messages.push({
        role: 'user',
        content: 'Your last response was not valid JSON. Respond again with ONLY a single valid JSON object — no markdown fences, no commentary, no trailing text.',
      })
    }
  }
  throw new Error(`LLM did not return valid JSON after ${MAX_ATTEMPTS} attempts. Last response: ${lastRawContent.slice(0, 300)}`)
}
