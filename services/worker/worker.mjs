import { ensureCoreSchema } from '../../database/ensure_schema.mjs'
import { createPgPoolWithFallback } from '../../database/create_pg_pool.mjs'

const { pool, connectionString: DATABASE_URL } = await createPgPoolWithFallback({
  databaseUrl: process.env.DATABASE_URL,
  serviceName: 'worker'
})
console.log('[worker] Using DB host from DATABASE_URL:', new URL(DATABASE_URL).hostname)
const interval = Number(process.env.ALERT_CHECK_INTERVAL_SECONDS || 120)
async function cycle() {
  try {
    await pool.query('INSERT INTO monitoring_events(service_name, level, message) VALUES ($1,$2,$3)', ['worker', 'info', 'Worker-Zyklus erfolgreich'])
    console.log('[worker] ok')
  } catch (err) { console.error(err) }
}
await ensureCoreSchema(pool)
await cycle()
setInterval(cycle, interval * 1000)
