import { readdir, readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const migrationsDir = path.join(__dirname, 'migrations')
const LOCK_KEY = 904211
const DB_READY_ATTEMPTS = Number(process.env.DB_READY_ATTEMPTS || 30)
const DB_READY_DELAY_MS = Number(process.env.DB_READY_DELAY_MS || 2000)

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isRetryableDbError(err) {
  const code = String(err?.code || '')
  const message = String(err?.message || '')
  return [
    code === 'ECONNREFUSED',
    code === 'ECONNRESET',
    code === 'ETIMEDOUT',
    code === '57P03',
    /database system is starting up/i.test(message),
    /the database system is starting up/i.test(message),
    /Connection terminated unexpectedly/i.test(message),
    /connect ECONNREFUSED/i.test(message),
  ].some(Boolean)
}

async function waitForDb(pool) {
  let lastError
  for (let attempt = 1; attempt <= DB_READY_ATTEMPTS; attempt++) {
    try {
      await pool.query('SELECT 1')
      if (attempt > 1) {
        console.log(`[db] PostgreSQL became reachable on attempt ${attempt}/${DB_READY_ATTEMPTS}`)
      }
      return
    } catch (err) {
      lastError = err
      if (!isRetryableDbError(err) || attempt === DB_READY_ATTEMPTS) {
        throw err
      }
      console.log(`[db] PostgreSQL not ready yet (${attempt}/${DB_READY_ATTEMPTS}): ${String(err?.code || err?.message || err)}`)
      await sleep(DB_READY_DELAY_MS)
    }
  }
  throw lastError
}

async function listMigrationFiles() {
  const entries = await readdir(migrationsDir, { withFileTypes: true })
  return entries
    .filter(entry => entry.isFile() && /\.sql$/i.test(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b, 'en'))
}

export async function ensureCoreSchema(pool) {
  await waitForDb(pool)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query('SELECT pg_advisory_lock($1)', [LOCK_KEY])
  try {
    const files = await listMigrationFiles()
    for (const filename of files) {
      const already = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1 LIMIT 1', [filename])
      if (already.rows.length) continue

      const sqlPath = path.join(migrationsDir, filename)
      const sql = await readFile(sqlPath, 'utf8')
      await pool.query(sql)
      await pool.query('INSERT INTO schema_migrations(filename, applied_at) VALUES ($1, NOW())', [filename])
    }
  } finally {
    await pool.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY])
  }
}
