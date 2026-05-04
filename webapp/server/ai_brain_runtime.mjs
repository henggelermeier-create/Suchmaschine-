async function safeCount(pool, sql, params = []) {
  try {
    const result = await pool.query(sql, params)
    return Number(result.rows?.[0]?.c || 0)
  } catch {
    return 0
  }
}

async function safeRows(pool, sql, params = []) {
  try {
    const result = await pool.query(sql, params)
    return result.rows || []
  } catch {
    return []
  }
}

function percent(value, total) {
  if (!total) return 0
  return Math.round((Number(value || 0) / Number(total || 1)) * 100)
}

export async function buildAiBrainRuntime(pool) {
  const [
    products,
    productsWithImages,
    offers,
    offersWithImages,
    activeSources,
    smallShops,
    pendingTasks,
    runningTasks,
    successfulTasks,
    failedTasks,
    pendingSeeds,
    runningSeeds,
    learnedQueries,
  ] = await Promise.all([
    safeCount(pool, 'SELECT COUNT(*)::int AS c FROM canonical_products'),
    safeCount(pool, 'SELECT COUNT(*)::int AS c FROM canonical_products WHERE image_url IS NOT NULL AND LENGTH(TRIM(image_url)) > 0'),
    safeCount(pool, 'SELECT COUNT(*)::int AS c FROM source_offers_v2 WHERE is_active = true'),
    safeCount(pool, 'SELECT COUNT(*)::int AS c FROM source_offers_v2 WHERE is_active = true AND image_url IS NOT NULL AND LENGTH(TRIM(image_url)) > 0'),
    safeCount(pool, 'SELECT COUNT(*)::int AS c FROM swiss_sources WHERE is_active = true'),
    safeCount(pool, 'SELECT COUNT(*)::int AS c FROM swiss_sources WHERE is_active = true AND is_small_shop = true'),
    safeCount(pool, "SELECT COUNT(*)::int AS c FROM search_tasks WHERE status = 'pending'"),
    safeCount(pool, "SELECT COUNT(*)::int AS c FROM search_tasks WHERE status = 'running'"),
    safeCount(pool, "SELECT COUNT(*)::int AS c FROM search_tasks WHERE status = 'success' AND created_at >= NOW() - INTERVAL '24 hours'"),
    safeCount(pool, "SELECT COUNT(*)::int AS c FROM search_tasks WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours'"),
    safeCount(pool, "SELECT COUNT(*)::int AS c FROM ai_seed_candidates WHERE status = 'pending'"),
    safeCount(pool, "SELECT COUNT(*)::int AS c FROM ai_seed_candidates WHERE status = 'running'"),
    safeCount(pool, 'SELECT COUNT(*)::int AS c FROM ai_query_memory'),
  ])

  const [recentTasks, topSources, controls] = await Promise.all([
    safeRows(pool, `
      SELECT id, query, status, result_count, discovered_count, imported_count, created_at, updated_at
      FROM search_tasks
      ORDER BY created_at DESC
      LIMIT 8
    `),
    safeRows(pool, `
      SELECT source_key, display_name, provider_kind, source_kind, is_small_shop, runtime_score, manual_boost, last_runtime_status, last_runtime_at
      FROM swiss_sources
      WHERE is_active = true
      ORDER BY COALESCE(runtime_score, 0) DESC, priority DESC, confidence_score DESC
      LIMIT 8
    `),
    safeRows(pool, `
      SELECT control_key, is_enabled, control_value_json, updated_at
      FROM ai_runtime_controls
      ORDER BY control_key ASC
      LIMIT 20
    `),
  ])

  const imageCoverage = percent(productsWithImages, products)
  const offerImageCoverage = percent(offersWithImages, offers)
  const queueLoad = pendingTasks + runningTasks
  const aiMode = controls.find(item => item.control_key === 'engine_runtime')
  const autonomousMode = controls.find(item => item.control_key === 'autonomous_builder')

  return {
    summary: {
      aiMode: aiMode?.is_enabled === false ? 'paused' : String(aiMode?.control_value_json?.mode || 'run'),
      autonomousEnabled: autonomousMode?.is_enabled !== false,
      products,
      productsWithImages,
      imageCoverage,
      offers,
      offersWithImages,
      offerImageCoverage,
      activeSources,
      smallShops,
      pendingTasks,
      runningTasks,
      queueLoad,
      successfulTasks24h: successfulTasks,
      failedTasks24h: failedTasks,
      pendingSeeds,
      runningSeeds,
      learnedQueries,
    },
    cards: [
      { label: 'KI Modus', value: aiMode?.is_enabled === false ? 'Pause' : 'Auto', tone: aiMode?.is_enabled === false ? 'tone-hot' : 'tone-mint' },
      { label: 'DB Produkte', value: products, tone: 'tone-mint' },
      { label: 'Bildquote', value: `${imageCoverage}%`, tone: imageCoverage >= 60 ? 'tone-mint' : 'tone-hot' },
      { label: 'Aktive Shops', value: activeSources, tone: 'tone-violet' },
      { label: 'Queue', value: queueLoad, tone: queueLoad > 0 ? 'tone-hot' : 'tone-mint' },
      { label: 'Gelernt', value: learnedQueries, tone: 'tone-violet' },
    ],
    recentTasks,
    topSources,
    controls,
  }
}
