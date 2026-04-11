export async function buildGoLiveReadiness(pool, config = {}) {
  const checks = []

  const add = (key, ok, detail) => {
    checks.push({ key, ok: !!ok, detail })
  }

  const count = async (sql, fallback = 0) => {
    try {
      const r = await pool.query(sql)
      return Number(r.rows?.[0]?.c || fallback)
    } catch {
      return fallback
    }
  }

  const products = await count('SELECT COUNT(*)::int AS c FROM products')
  const offers = await count('SELECT COUNT(*)::int AS c FROM product_offers')
  const canonical = await count('SELECT COUNT(*)::int AS c FROM canonical_products')
  const activeSwissSources = await count("SELECT COUNT(*)::int AS c FROM swiss_sources WHERE is_active = true")
  const aiControls = await count('SELECT COUNT(*)::int AS c FROM ai_runtime_controls')
  const pendingSearchTasks = await count("SELECT COUNT(*)::int AS c FROM search_tasks WHERE status IN ('pending','running')")
  const failedSearchTasks24h = await count("SELECT COUNT(*)::int AS c FROM search_tasks WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours'")
  const learnedQueries = await count('SELECT COUNT(*)::int AS c FROM ai_query_memory')
  const autonomousSeeds = await count('SELECT COUNT(*)::int AS c FROM ai_seed_candidates')

  add('jwt_secret', !!config.jwtSecret && config.jwtSecret !== 'replace_me_with_long_secret', config.jwtSecret ? 'JWT Secret gesetzt' : 'JWT Secret fehlt')
  add('admin_password', !!config.adminPassword && config.adminPassword !== 'changeme123', config.adminPassword ? 'Admin-Passwort gesetzt' : 'Admin-Passwort fehlt')
  add('ai_service_url', !!config.aiServiceUrl, config.aiServiceUrl || 'AI Service URL fehlt')
  add('products_seeded', products >= 50, `${products} Produkte vorhanden`)
  add('offers_seeded', offers >= 50, `${offers} Angebote vorhanden`)
  add('canonical_seeded', canonical >= 10, `${canonical} Canonical-Produkte vorhanden`)
  add('swiss_sources', activeSwissSources >= 5, `${activeSwissSources} aktive Schweizer Quellen`)
  add('ai_controls', aiControls >= 4, `${aiControls} AI-Controls vorhanden`)
  add('query_learning', learnedQueries >= 1, `${learnedQueries} gelernte Suchanfragen vorhanden`)
  add('autonomous_seeds', autonomousSeeds >= 5, `${autonomousSeeds} autonome Seed-Kandidaten vorhanden`)
  add('queue_pressure', pendingSearchTasks <= 200, `${pendingSearchTasks} offene/running Suchjobs`)
  add('recent_failures', failedSearchTasks24h <= 50, `${failedSearchTasks24h} fehlgeschlagene Suchjobs in 24h`)

  const passed = checks.filter((x) => x.ok).length
  const score = Math.round((passed / Math.max(checks.length, 1)) * 100)
  return {
    ready: score >= 80,
    score,
    summary: `${passed}/${checks.length} Go-Live-Checks bestanden`,
    metrics: {
      products,
      offers,
      canonical,
      activeSwissSources,
      aiControls,
      learnedQueries,
      autonomousSeeds,
      pendingSearchTasks,
      failedSearchTasks24h,
    },
    checks,
  }
}
