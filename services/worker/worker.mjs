import { Pool } from 'pg'
import { ensureCoreSchema } from '../../database/ensure_schema.mjs'

function normalizeDbUrl(raw) {
  const fallback = `postgresql://${process.env.POSTGRES_USER || 'kauvio'}:${process.env.POSTGRES_PASSWORD || 'replace_me'}@postgres:5432/${process.env.POSTGRES_DB || 'kauvio'}`
  const input = String(raw || fallback).trim()
  try {
    const url = new URL(input)
    if (!url.hostname || ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
      url.hostname = process.env.POSTGRES_HOST || 'postgres'
    }
    if (!url.port) {
      url.port = String(process.env.POSTGRES_PORT || 5432)
    }
    return url.toString()
  } catch {
    return fallback
  }
}

const DATABASE_URL = normalizeDbUrl(process.env.DATABASE_URL)
console.log('[worker] Using DB host from DATABASE_URL:', new URL(DATABASE_URL).hostname)
const pool = new Pool({ connectionString: DATABASE_URL })
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
