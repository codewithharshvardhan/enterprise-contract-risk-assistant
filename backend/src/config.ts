import 'dotenv/config'

export interface Config {
  port: number
  corsOrigins: string[]
  nodeEnv: string
  /** Generic DB connection string for when you replace the in-memory store stub
   *  (src/db/database.ts) with a real DB — a path for file DBs, or credentials for a
   *  server (e.g. postgres://user:pass@host/db). Unused by the stub. */
  databaseUrl: string
}

function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return ['http://localhost:5173', 'http://localhost:3000']
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

const config: Config = {
  port: parseInt(process.env['PORT'] ?? '4000', 10),
  corsOrigins: parseOrigins(process.env['CORS_ORIGINS']),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  databaseUrl: process.env['DATABASE_URL'] ?? '',
}

export default config
