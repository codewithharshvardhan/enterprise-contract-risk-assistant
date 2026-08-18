import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Resolves the proxy target URL for a backend service.
 *
 * Priority order:
 *  1. process.env[urlKey]      — explicit URL injected by the preview orchestrator
 *                                ({SERVICE_NAME_UPPER}_URL) or set via svc.env
 *  2. process.env[portKey]     — ephemeral port injected by the orchestrator
 *                                ({SERVICE_NAME_UPPER}_PORT), constructed into URL
 *  3. env[urlKey]              — URL from the .env file on disk
 *  4. fallback                 — hardcoded default for local dev outside preview
 */
function resolveTarget(
  env: Record<string, string>,
  urlKey: string,
  portKey: string,
  fallback: string,
): string {
  if (process.env[urlKey]) return process.env[urlKey]!
  if (process.env[portKey]) return `http://localhost:${process.env[portKey]}`
  return env[urlKey] ?? fallback
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss()],

    server: {
      port: parseInt(process.env['PORT'] ?? env['PORT'] ?? '5173'),
      host: true,
      allowedHosts: ['.zbrain.ai', 'localhost'],
      hmr: false,
      // Dev-time reverse proxy — keeps backend URLs off the browser and avoids
      // CORS preflight to local services.
      proxy: {
        // BACKEND_1_URL is injected by the orchestrator for the first backend-role
        // dependency in dependsOn[], regardless of what the service is named.
        '/proxy/service1': {
          target: resolveTarget(env, 'BACKEND_URL', 'BACKEND_PORT', 'http://localhost:4000'),
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/proxy\/service1/, ''),
        },
        '/proxy/service2': {
          target: resolveTarget(env, 'BACKEND_2_URL', 'BACKEND_2_PORT', 'http://localhost:4000'),
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/proxy\/service2/, ''),
        },
      },
    },

    test: {
      globals: true,
      environment: 'jsdom',
    },
  }
})
