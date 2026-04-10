import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const MIN_PASSWORD_LENGTH = Number(process.env.ADMIN_PASSWORD_MIN_LENGTH || 10)

function normalizeAdminEmail(value = '') {
  return String(value || '').trim().toLowerCase()
}

function hashAdminPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(password || ''), salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

function verifyAdminPassword(password, storedHash = '') {
  const [algorithm, salt, digest] = String(storedHash || '').split(':')
  if (algorithm !== 'scrypt' || !salt || !digest) return false
  try {
    const actual = scryptSync(String(password || ''), salt, 64)
    const expected = Buffer.from(digest, 'hex')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

async function ensureAdminAuthTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_auth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

async function getStoredAdminAuth(pool) {
  await ensureAdminAuthTable(pool)
  const result = await pool.query(
    'SELECT id, email, password_hash, created_at, updated_at FROM admin_auth WHERE id = 1 LIMIT 1'
  )
  return result.rows[0] || null
}

export async function ensureAdminAuthSeeded(pool, { email, password, forceReset = false }) {
  await ensureAdminAuthTable(pool)

  const nextEmail = normalizeAdminEmail(email)
  const nextPassword = String(password || '')
  const nextHash = hashAdminPassword(nextPassword)
  const existing = await getStoredAdminAuth(pool)

  if (!existing) {
    await pool.query(
      `INSERT INTO admin_auth(id, email, password_hash, created_at, updated_at)
       VALUES (1, $1, $2, NOW(), NOW())`,
      [nextEmail, nextHash]
    )
    return { email: nextEmail, seeded: true, resetApplied: false }
  }

  if (forceReset) {
    await pool.query(
      `UPDATE admin_auth
       SET email = $1, password_hash = $2, updated_at = NOW()
       WHERE id = 1`,
      [nextEmail, nextHash]
    )
    return { email: nextEmail, seeded: false, resetApplied: true }
  }

  return { email: normalizeAdminEmail(existing.email), seeded: false, resetApplied: false }
}

export async function verifyAdminCredentials(pool, { email, password, fallbackEmail, fallbackPassword }) {
  const normalizedEmail = normalizeAdminEmail(email)
  const candidatePassword = String(password || '')
  const stored = await getStoredAdminAuth(pool)

  const expectedEmail = normalizeAdminEmail(stored?.email || fallbackEmail)
  const passwordOk = stored?.password_hash
    ? verifyAdminPassword(candidatePassword, stored.password_hash)
    : candidatePassword === String(fallbackPassword || '')

  if (normalizedEmail !== expectedEmail || !passwordOk) return null
  return { email: expectedEmail }
}

export async function changeAdminPassword(pool, { email, currentPassword, newPassword, fallbackEmail, fallbackPassword }) {
  const normalizedEmail = normalizeAdminEmail(email)
  const current = String(currentPassword || '')
  const next = String(newPassword || '')

  if (!current || !next) {
    throw new Error('Bitte aktuelles und neues Passwort angeben.')
  }
  if (next.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Das neue Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.`)
  }

  const stored = await getStoredAdminAuth(pool)
  const expectedEmail = normalizeAdminEmail(stored?.email || fallbackEmail)
  if (normalizedEmail !== expectedEmail) {
    throw new Error('Admin-Konto nicht gefunden.')
  }

  const currentOk = stored?.password_hash
    ? verifyAdminPassword(current, stored.password_hash)
    : current === String(fallbackPassword || '')

  if (!currentOk) {
    throw new Error('Aktuelles Passwort ist falsch.')
  }
  if (current === next) {
    throw new Error('Bitte ein neues Passwort verwenden.')
  }

  await pool.query(
    `INSERT INTO admin_auth(id, email, password_hash, created_at, updated_at)
     VALUES (1, $1, $2, NOW(), NOW())
     ON CONFLICT (id)
     DO UPDATE SET
       email = EXCLUDED.email,
       password_hash = EXCLUDED.password_hash,
       updated_at = NOW()`,
    [expectedEmail, hashAdminPassword(next)]
  )

  return { email: expectedEmail }
}
