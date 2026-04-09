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

    return url.toString()
  } catch {
    return fallback
  }
}

export function buildDbUrlCandidates(raw) {
  const normalizedPrimary = normalizeDbUrl(raw)
  const candidates = [normalizedPrimary]

  const hasEnvCredentials = Boolean(process.env.POSTGRES_USER || process.env.POSTGRES_PASSWORD || process.env.POSTGRES_DB)
  if (hasEnvCredentials) {
    try {
      const alt = new URL(normalizedPrimary)
      if (process.env.POSTGRES_USER) alt.username = process.env.POSTGRES_USER
      if (process.env.POSTGRES_PASSWORD) alt.password = process.env.POSTGRES_PASSWORD
      if (process.env.POSTGRES_DB) alt.pathname = `/${process.env.POSTGRES_DB}`
      candidates.push(alt.toString())
    } catch {
      // ignore malformed URL candidate and keep primary
    }
  }

  return [...new Set(candidates)]
}
