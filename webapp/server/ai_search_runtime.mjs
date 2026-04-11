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

export function inferIntent(query = '') {
  const q = normalizeSearchText(query)
  const tags = []
  if (/(iphone|galaxy|pixel|smartphone|handy|mobile)/.test(q)) tags.push('mobile', 'electronics')
  if (/(macbook|notebook|laptop|ultrabook|thinkpad)/.test(q)) tags.push('computing', 'electronics')
  if (/(kopfhorer|kopfhörer|headphones|earbuds|airpods|soundbar|speaker|lautsprecher)/.test(q)) tags.push('audio', 'electronics')
  if (/(dyson|staubsauger|vacuum|haushalt|washer|dryer|kuhlschrank|appliances)/.test(q)) tags.push('home', 'appliances')
  if (!tags.length) tags.push('electronics')
  return [...new Set(tags)]
}

async function loadPlannerSources(pool) {
  const result = await pool.query(
    `SELECT id, source_key, display_name, provider_kind, source_kind, base_url, search_url_template, sitemap_url, seed_urls_json, categories_json,
            priority, confidence_score, refresh_interval_minutes, source_size, is_small_shop, discovery_weight, runtime_score, manual_boost
     FROM swiss_sources
     WHERE is_active = true
     ORDER BY priority DESC, confidence_score DESC, display_name ASC`
  ).catch(() => ({ rows: [] }))
  return result.rows
}

async function loadRuntimeControls(pool) {
  const result = await pool.query(`SELECT control_key, is_enabled, control_value_json FROM ai_runtime_controls`).catch(() => ({ rows: [] }))
  const map = new Map()
  for (const row of result.rows) map.set(row.control_key, row)
  return map
}

async function loadQueryMemory(pool, normalizedQuery) {
  if (!normalizedQuery) return null
  const result = await pool.query(
    `SELECT normalized_query, raw_query, success_count, failure_count, total_result_count, last_source_keys_json, learned_tags_json, updated_at
     FROM ai_query_memory
     WHERE normalized_query = $1
     LIMIT 1`,
    [normalizedQuery]
  ).catch(() => ({ rows: [] }))
  return result.rows[0] || null
}

function sourceScore(source, intentTags = [], controlMap = new Map(), memory = null) {
  const categories = Array.isArray(source.categories_json) ? source.categories_json : []
  let score = Number(source.priority || 0)
  for (const tag of intentTags) {
    if (categories.includes(tag)) score += 25
  }
  if (source.provider_kind === 'comparison_source') score += 20
  if (source.source_kind === 'comparison_search') score += 15
  if (source.source_kind === 'shop_catalog') score += 8
  score += Number(source.discovery_weight || 1) * 10
  score += Number(source.runtime_score || 1) * 12
  score += Number(source.manual_boost || 0) * 10

  const balance = controlMap.get('small_shop_balance')
  if (balance?.is_enabled && source.is_small_shop) {
    score += Number(balance.control_value_json?.boost || 18)
  }

  const learning = controlMap.get('query_learning')
  if (learning?.is_enabled && memory) {
    const memorySources = Array.isArray(memory.last_source_keys_json) ? memory.last_source_keys_json : []
    const learnedTags = Array.isArray(memory.learned_tags_json) ? memory.learned_tags_json : []
    if (memorySources.includes(source.source_key)) score += Number(learning.control_value_json?.source_boost || 35)
    if (learnedTags.some((tag) => categories.includes(tag))) score += Number(learning.control_value_json?.tag_boost || 10)
    score += Math.min(25, Number(memory.success_count || 0) * 2)
  }
  return score
}

function plannerReason(source, intentTags = [], controlMap = new Map(), memory = null) {
  const matches = (Array.isArray(source.categories_json) ? source.categories_json : []).filter((tag) => intentTags.includes(tag))
  const balance = controlMap.get('small_shop_balance')
  if (memory && Array.isArray(memory.last_source_keys_json) && memory.last_source_keys_json.includes(source.source_key)) {
    return 'Früher erfolgreiche Quelle für ähnliche Suche'
  }
  if (source.is_small_shop && balance?.is_enabled) return 'Kleiner Schweizer Shop wird bewusst mitberücksichtigt'
  if (matches.length) return `Passend für ${matches.join(', ')}`
  if (source.provider_kind === 'comparison_source') return 'Vergleichsquelle für schnelle Discovery'
  return 'Schweizer Shopquelle für breites Discovery'
}

function buildSeedValue(source, query) {
  if (source.source_kind === 'comparison_search') return query
  if (source.search_url_template) return source.search_url_template.replace('{query}', encodeURIComponent(query))
  if (source.sitemap_url) return source.sitemap_url
  if (source.base_url) return source.base_url
  return query
}

function pickDiverseSources(planned = [], controlMap = new Map()) {
  const balance = controlMap.get('small_shop_balance')
  const minSmall = balance?.is_enabled ? Number(balance.control_value_json?.min_small_shops || 2) : 0
  const sorted = [...planned].sort((a, b) => b.score - a.score)
  const selected = []
  const used = new Set()
  const small = sorted.filter((item) => item.source.is_small_shop)
  const regular = sorted.filter((item) => !item.source.is_small_shop)

  for (const item of small.slice(0, minSmall)) {
    selected.push(item)
    used.add(item.source.source_key)
  }
  for (const item of regular) {
    if (selected.length >= 8) break
    if (used.has(item.source.source_key)) continue
    selected.push(item)
    used.add(item.source.source_key)
  }
  for (const item of small) {
    if (selected.length >= 8) break
    if (used.has(item.source.source_key)) continue
    selected.push(item)
    used.add(item.source.source_key)
  }
  return selected.length ? selected : sorted.slice(0, 8)
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
  const [sources, controlMap, memory] = await Promise.all([
    loadPlannerSources(pool),
    loadRuntimeControls(pool),
    loadQueryMemory(pool, normalized),
  ])
  const planned = sources.map((source) => ({
    source,
    score: sourceScore(source, intentTags, controlMap, memory),
    reason: plannerReason(source, intentTags, controlMap, memory),
  }))
  const selected = pickDiverseSources(planned, controlMap)

  if (!selected.length) {
    await pool.query(
      `INSERT INTO search_task_sources(search_task_id, provider, source_kind, seed_value, status, planner_reason, source_priority)
       VALUES ($1,$2,$3,$4,'pending',$5,$6)`,
      [task.id, 'toppreise', 'comparison_search', query, 'Fallback ohne Registry', 100]
    ).catch(() => {})
    return task
  }

  for (const item of selected) {
    await pool.query(
      `INSERT INTO search_task_sources(search_task_id, provider, source_kind, seed_value, status, swiss_source_id, planner_reason, source_priority)
       VALUES ($1,$2,$3,$4,'pending',$5,$6,$7)`,
      [task.id, item.source.source_key, item.source.source_kind, buildSeedValue(item.source, query), item.source.id, item.reason, item.score]
    ).catch(() => {})
  }
  return task
}
