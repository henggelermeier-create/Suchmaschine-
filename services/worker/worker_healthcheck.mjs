import { Pool } from 'pg'

const DATABASE_URL = process.env.DATABASE_URL
const MAX_AGE_SECONDS = Number(process.env.WORKER_HEARTBEAT_MAX_AGE_SECONDS || 600)

if (!DATABASE_URL) {
  console.error('[worker-healthcheck] DATABASE_URL missing')
  process.exit(1)
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 5000,
})

try {
  const result = await pool.query(
    `SELECT created_at
     FROM monitoring_events
     WHERE service_name = 'worker'
     ORDER BY created_at DESC
     LIMIT 1`
  )
  const row = result.rows?.[0]
  if (!row?.created_at) {
    console.error('[worker-healthcheck] no worker heartbeat found')
    process.exit(1)
  }
  const ageSeconds = Math.max(0, Math.round((Date.now() - new Date(row.created_at).getTime()) / 1000))
  if (ageSeconds > MAX_AGE_SECONDS) {
    console.error(`[worker-healthcheck] stale worker heartbeat: ${ageSeconds}s old`)
    process.exit(1)
  }
  console.log(`[worker-healthcheck] ok (${ageSeconds}s)`)
  process.exit(0)
} catch (err) {
  console.error('[worker-healthcheck] failed:', String(err?.message || err))
  process.exit(1)
} finally {
  await pool.end().catch(() => {})
}
