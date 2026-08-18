/**
 * Unit tests for callJsonLLM's retry-on-invalid-JSON behavior, using a
 * mocked `openai` client so this suite is deterministic and needs no real
 * OPENROUTER_API_KEY or network access.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }))

vi.mock('openai', () => {
  class MockOpenAI {
    chat = { completions: { create: createMock } }
  }
  return { __esModule: true, default: MockOpenAI }
})

import { callJsonLLM } from '../services/openai'

function completionWith(content: string) {
  return { choices: [{ message: { content } }] }
}

describe('callJsonLLM', () => {
  beforeEach(() => {
    createMock.mockReset()
  })

  it('parses valid JSON on the first attempt without retrying', async () => {
    createMock.mockResolvedValueOnce(completionWith('{"a":1}'))
    const result = await callJsonLLM({ systemPrompt: 'sys', userPrompt: 'user' })
    expect(result).toEqual({ a: 1 })
    expect(createMock).toHaveBeenCalledTimes(1)
  })

  it('strips markdown code fences before parsing', async () => {
    createMock.mockResolvedValueOnce(completionWith('```json\n{"b":2}\n```'))
    const result = await callJsonLLM({ systemPrompt: 'sys', userPrompt: 'user' })
    expect(result).toEqual({ b: 2 })
  })

  it('retries with a self-correction message after invalid JSON, then succeeds', async () => {
    createMock
      .mockResolvedValueOnce(completionWith('this is not json'))
      .mockResolvedValueOnce(completionWith('{"c":3}'))
    const result = await callJsonLLM({ systemPrompt: 'sys', userPrompt: 'user' })
    expect(result).toEqual({ c: 3 })
    expect(createMock).toHaveBeenCalledTimes(2)

    // The second call's message list must include the failed assistant reply
    // plus a corrective user message, on top of the original system/user pair.
    const secondCallArgs = createMock.mock.calls[1]![0] as { messages: Array<{ role: string; content: string }> }
    expect(secondCallArgs.messages).toHaveLength(4)
    expect(secondCallArgs.messages[2]).toMatchObject({ role: 'assistant', content: 'this is not json' })
    expect(secondCallArgs.messages[3]!.role).toBe('user')
    expect(secondCallArgs.messages[3]!.content).toMatch(/not valid JSON/)
  })

  it('throws after exhausting all 3 attempts on persistently invalid JSON', async () => {
    createMock.mockResolvedValue(completionWith('still not json'))
    await expect(callJsonLLM({ systemPrompt: 'sys', userPrompt: 'user' })).rejects.toThrow(/did not return valid JSON after 3 attempts/)
    expect(createMock).toHaveBeenCalledTimes(3)
  })

  it('passes temperature and maxTokens through to the completion call', async () => {
    createMock.mockResolvedValueOnce(completionWith('{"ok":true}'))
    await callJsonLLM({ systemPrompt: 'sys', userPrompt: 'user', temperature: 0.5, maxTokens: 1234 })
    const args = createMock.mock.calls[0]![0] as { temperature: number; max_tokens: number }
    expect(args.temperature).toBe(0.5)
    expect(args.max_tokens).toBe(1234)
  })
})
