export function normalizeSearchText(input = '') {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function canonicalModelKey({ brand = '', title = '', specs = '' } = {}) {
  return normalizeSearchText(`${brand} ${title} ${specs}`)
    .replace(/\b(5g|lte|wifi|bluetooth|dual sim|esim|smartphone|notebook|headphones|kopfhorer|kopfhörer|staubsauger|black|white|blue|green|gray|grey|silver|gold)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferIntent(query = '') {
  const q = normalizeSearchText(query)
  const tags = []
  if (/(iphone|galaxy|pixel|smartphone|handy|mobile)/.test(q)) tags.push('mobile', 'electronics')
  if (/(macbook|notebook|laptop|ultrabook|thinkpad)/.test(q)) tags.push('computing', 'electronics')
  if (/(kopfhorer|kopfhorer|headphones|earbuds|airpods|soundbar|speaker|lautsprecher)/.test(q)) tags.push('audio', 'electronics')
  if (/(dyson|staubsauger|vacuum|haushalt|washer|dryer|kuhlschrank|appliances)/.test(q)) tags.push('home', 'appliances')
  if (!tags.length) tags.push('electronics')
  return [...new Set(tags)]
}

function sourceScore(source, intentTags = []) {
  const categories = Array.isArray(source.categories_json) ? source.categories_json : []
  let score = Number(source.priority || 0)
  for (const tag of intentTags) {
    if (categories.includes(tag)) score += 25
  }
  if (source.provider_kind === 'comparison_source') score += 20
  if (source.source_kind === 'comparison_search') score += 15
  if (source.source_kind === 'shop_catalog') score += 8
  return score
}

function plannerReason(source, intentTags = []) {
  const matches = (Array.isArray(source.categories_json) ? source.categories_json : []).filter((tag) => intentTags.includes(tag))
  if (matches.length) return `Passend für ${matches.join(', ')}`
  if (source.provider_kind === 'comparison_source') return 'Vergleichsquelle für schnelle Discovery'
  return 'Schweizer Shopquelle für breites Discovery'
}

async function loadPlannerSources(pool) {
  const result = await pool.query(
    `SELECT id, source_key, display_name, provider_kind, source_kind, base_url, search_url_template, sitemap_url, seed_urls_json, categories_json, priority, confidence_score, refresh_interval_minutes
     FROM swiss_sources
     WHERE is_active = true
     ORDER BY priority DESC, confidence_score DESC, display_name ASC`
  ).catch(() => ({ rows: [] }))
  return result.rows
}

function buildSeedValue(source, query) {
  if (source.source_kind === 'comparison_search') return query
  if (source.search_url_template) return source.search_url_template.replace('{query}', encodeURIComponent(query))
  if (source.sitemap_url) return source.sitemap_url
  if (source.base_url) return source.base_url
  return query
}

export async function enqueueLiveSearchTask(pool, query, requestedBy = 'public') {
  const normalized = normalizeSearchText(query)
  if (!normalized) return null

  await pool.query(
    `INSERT INTO query_gap_log(query, normalized_query, local_result_count, live_task_created)
     VALUES ($1,$2,0,true)`,
    [query, normalized]
  ).catch(() => {})

  const existing = await pool.query(
    `SELECT id, query, normalized_query, status, strategy, user_visible_note, result_count, discovered_count, imported_count, created_at
     FROM search_tasks
     WHERE normalized_query = $1
       AND status IN ('pending', 'running')
       AND created_at >= NOW() - INTERVAL '30 minutes'
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalized]
  ).catch(() => ({ rows: [] }))
  if (existing.rows?.length) return existing.rows[0]

  const inserted = await pool.query(
    `INSERT INTO search_tasks(query, normalized_query, trigger_type, status, strategy, user_visible_note, task_priority, source_budget, requested_by)
     VALUES ($1,$2,'query_miss','pending','swiss_ai_live','Wir bereiten gerade Live-Ergebnisse aus Schweizer Quellen auf.',60,25,$3)
     RETURNING id, query, normalized_query, status, strategy, user_visible_note, result_count, discovered_count, imported_count, created_at`,
    [query, normalized, requestedBy]
  )

  const task = inserted.rows[0]
  const intentTags = inferIntent(query)
  const sources = await loadPlannerSources(pool)
  const planned = sources
    .map((source) => ({ source, score: sourceScore(source, intentTags), reason: plannerReason(source, intentTags) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  if (!planned.length) {
    await pool.query(
      `INSERT INTO search_task_sources(search_task_id, provider, source_kind, seed_value, status, planner_reason, source_priority)
       VALUES ($1,$2,$3,$4,'pending',$5,$6)`,
      [task.id, 'toppreise', 'comparison_search', query, 'Fallback ohne Registry', 100]
    ).catch(() => {})
    return task
  }

  for (const item of planned) {
    await pool.query(
      `INSERT INTO search_task_sources(search_task_id, provider, source_kind, seed_value, status, swiss_source_id, planner_reason, source_priority)
       VALUES ($1,$2,$3,$4,'pending',$5,$6,$7)`,
      [task.id, item.source.source_key, item.source.source_kind, buildSeedValue(item.source, query), item.source.id, item.reason, item.score]
    ).catch(() => {})
  }
  return task
}
