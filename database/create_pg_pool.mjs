import { Pool } from 'pg'
import { buildDbUrlCandidates } from './normalize_db_url.mjs'

function maskUrl(connectionString) {
  try {
    const u = new URL(connectionString)
    if (u.password) u.password = '***'
    return u.toString()
  } catch {
    return '<invalid DATABASE_URL>'
  }
}

export async function createPgPoolWithFallback({ databaseUrl, serviceName = 'service' } = {}) {
  const candidates = buildDbUrlCandidates(databaseUrl)
  const errors = []

  for (const connectionString of candidates) {
    const pool = new Pool({ connectionString })
    try {
      await pool.query('SELECT 1')
      return { pool, connectionString }
    } catch (err) {
      await pool.end().catch(() => {})
      errors.push({ err, connectionString: maskUrl(connectionString) })

      // Only continue fallback on auth errors.
      if (err?.code !== '28P01') {
        throw err
      }
    }
  }

  const details = errors.map(x => `${x.connectionString} -> ${x.err?.code || 'ERR'}`).join(' | ')
  const finalError = new Error(`[${serviceName}] unable to connect to postgres with available credentials (${details})`)
  finalError.code = 'DB_AUTH_FAILED'
  finalError.cause = errors.at(-1)?.err
  throw finalError
}
