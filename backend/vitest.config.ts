import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    // Force the "no API key" path regardless of what's in backend/.env, so
    // nodes 3-5 fail fast and deterministically instead of making real, slow
    // network calls during test runs. Applied before any test file/module
    // (including config.ts's dotenv/config()) loads; dotenv does not
    // override env vars that are already defined, even as ''.
    env: {
      OPENROUTER_API_KEY: '',
      OPENAI_API_KEY: '',
    },
  },
})
