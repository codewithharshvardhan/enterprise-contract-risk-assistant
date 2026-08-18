import Anthropic from '@anthropic-ai/sdk'

// Singleton Anthropic client — API key read from environment at startup.
export const anthropic = new Anthropic({
  apiKey: process.env['ANTHROPIC_API_KEY'],
})
