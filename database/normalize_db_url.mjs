export function normalizeDbUrl(raw) {
  const envUser = process.env.POSTGRES_USER || 'kauvio'
  const envPassword = process.env.POSTGRES_PASSWORD || 'replace_me'
  const envDb = process.env.POSTGRES_DB || 'kauvio'
  const envHost = process.env.POSTGRES_HOST || 'postgres'
  const envPort = String(process.env.POSTGRES_PORT || 5432)

  const fallback = `postgresql://${envUser}:${envPassword}@${envHost}:${envPort}/${envDb}`
  const input = String(raw || fallback).trim()

  try {
    const url = new URL(input)

    if (!url.hostname || ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
      url.hostname = envHost
    }
    if (!url.port) {
      url.port = envPort
    }

    // If explicit POSTGRES_* credentials are available, prefer them over possibly stale DATABASE_URL credentials.
    if (process.env.POSTGRES_USER) {
      url.username = process.env.POSTGRES_USER
    }
    if (process.env.POSTGRES_PASSWORD) {
      url.password = process.env.POSTGRES_PASSWORD
    }
    if (process.env.POSTGRES_DB) {
      url.pathname = `/${process.env.POSTGRES_DB}`
    }

    return url.toString()
  } catch {
    return fallback
  }
}
