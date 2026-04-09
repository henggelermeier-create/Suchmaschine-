import { readdir, readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const migrationsDir = path.join(__dirname, 'migrations')
const LOCK_KEY = 904211

async function listMigrationFiles() {
  const entries = await readdir(migrationsDir, { withFileTypes: true })
  return entries
    .filter(entry => entry.isFile() && /\.sql$/i.test(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b, 'en'))
}

export async function ensureCoreSchema(pool) {
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
