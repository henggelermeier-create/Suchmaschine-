import { Pool } from 'pg'
import { ensureCoreSchema } from '../../database/ensure_schema.mjs'
import { normalizeDbUrl } from '../../database/normalize_db_url.mjs'

const DATABASE_URL = normalizeDbUrl(process.env.DATABASE_URL)
console.log('[worker] Using DB host from DATABASE_URL:', new URL(DATABASE_URL).hostname)
const pool = new Pool({ connectionString: DATABASE_URL })
const interval = Number(process.env.ALERT_CHECK_INTERVAL_SECONDS || 120)
const AI_SEARCH_INTERVAL_SECONDS = Number(process.env.AI_SEARCH_WORKER_INTERVAL_SECONDS || 30)
const TOPPREISE_BASE = 'https://www.toppreise.ch/produktsuche?q='
const TITLE_BRAND_RE = /(Apple|Samsung|Google|Xiaomi|Sony|Nokia|Motorola|Asus|Lenovo|HP|Acer|Dell|MSI|Jabra|Bose|Nothing|Honor|Huawei|Fairphone|Microsoft|DJI|Roborock|Philips|Logitech|Intel|Panasonic|Ecovacs|Dyson|Bambu|Sonos|Corsair)/i
const BASELINE_SEEDS = [
  'iphone 16 pro',
  'samsung galaxy s25',
  'macbook air m4',
  'dyson v15',
  'sony wh 1000xm6',
  'airpods pro',
  'robot vacuum roborock',
  'gaming laptop rtx',
  'oled tv 55 zoll',
  'kaffeevollautomat delonghi',
  'staubsauger akku',
  'smartphone 256 gb',
]

function normalizeSearchText(input = '') {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function canonicalModelKey({ brand = '', title = '', specs = '' } = {}) {
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
  if (/(kopfhorer|kopfhörer|headphones|earbuds|airpods|soundbar|speaker|lautsprecher)/.test(q)) tags.push('audio', 'electronics')
  if (/(dyson|staubsauger|vacuum|haushalt|washer|dryer|kuhlschrank|appliances|kaffeevollautomat)/.test(q)) tags.push('home', 'appliances')
  if (!tags.length) tags.push('electronics')
  return [...new Set(tags)]
}

function htmlToLines(html = '') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function clean(input = '') {
  return String(input || '').replace(/\s+/g, ' ').trim()
}

function normalizePrice(raw) {
  const cleaned = String(raw || '')
    .replace(/CHF/gi, '')
    .replace(/inkl\..*$/i, '')
    .replace(/zzgl\..*$/i, '')
    .replace(/'/g, '')
    .replace(/–/g, '')
    .replace(/[^\d.,]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
  const value = Number.parseFloat(cleaned)
  return Number.isFinite(value) ? value : null
}

function brandFromTitle(title = '') {
  return clean(title).split(/\s+/)[0] || null
}

function tokenize(str = '') {
  return normalizeSearchText(str).split(' ').filter(Boolean)
}

function similarity(a = '', b = '') {
  const sa = new Set(tokenize(a))
  const sb = new Set(tokenize(b))
  if (!sa.size || !sb.size) return 0
  let inter = 0
  for (const t of sa) if (sb.has(t)) inter += 1
  const union = new Set([...sa, ...sb]).size || 1
  return inter / union
}

async function cycle() {
  try {
    await pool.query('INSERT INTO monitoring_events(service_name, level, message) VALUES ($1,$2,$3)', ['worker', 'info', 'Worker-Zyklus erfolgreich'])
    console.log('[worker] ok')
  } catch (err) {
    console.error(err)
  }
}

async function loadRuntimeControls() {
  const result = await pool.query(`SELECT control_key, is_enabled, control_value_json FROM ai_runtime_controls`).catch(() => ({ rows: [] }))
  const map = new Map()
  for (const row of result.rows) map.set(row.control_key, row)
  return map
}

async function loadPlannerSources() {
  const result = await pool.query(
    `SELECT id, source_key, display_name, provider_kind, source_kind, base_url, search_url_template, sitemap_url, seed_urls_json, categories_json,
            priority, confidence_score, refresh_interval_minutes, source_size, is_small_shop, discovery_weight, runtime_score, manual_boost
     FROM swiss_sources
     WHERE is_active = true
     ORDER BY priority DESC, confidence_score DESC, display_name ASC`
  ).catch(() => ({ rows: [] }))
  return result.rows
}

async function loadQueryMemory(normalizedQuery) {
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
  for (const tag of intentTags) if (categories.includes(tag)) score += 25
  if (source.provider_kind === 'comparison_source') score += 20
  if (source.source_kind === 'comparison_search') score += 15
  if (source.source_kind === 'shop_catalog') score += 8
  score += Number(source.discovery_weight || 1) * 10
  score += Number(source.runtime_score || 1) * 12
  score += Number(source.manual_boost || 0) * 10
  const balance = controlMap.get('small_shop_balance')
  if (balance?.is_enabled && source.is_small_shop) score += Number(balance.control_value_json?.boost || 18)
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
  if (memory && Array.isArray(memory.last_source_keys_json) && memory.last_source_keys_json.includes(source.source_key)) return 'Früher erfolgreiche Quelle für ähnliche Suche'
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

async function createSearchTask(query, requestedBy = 'worker_autonomous', triggerType = 'autonomous_seed') {
  const normalized = normalizeSearchText(query)
  if (!normalized) return null
  const existing = await pool.query(
    `SELECT id, query, normalized_query, status, strategy, user_visible_note, result_count, discovered_count, imported_count, created_at
     FROM search_tasks
     WHERE normalized_query = $1
       AND status IN ('pending', 'running')
       AND created_at >= NOW() - INTERVAL '45 minutes'
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalized]
  ).catch(() => ({ rows: [] }))
  if (existing.rows?.length) return existing.rows[0]

  const inserted = await pool.query(
    `INSERT INTO search_tasks(query, normalized_query, trigger_type, status, strategy, user_visible_note, task_priority, source_budget, requested_by)
     VALUES ($1,$2,$3,'pending','swiss_ai_live','Wir bereiten gerade Live-Ergebnisse aus Schweizer Quellen auf.',70,25,$4)
     RETURNING id, query, normalized_query, status, strategy, user_visible_note, result_count, discovered_count, imported_count, created_at`,
    [query, normalized, triggerType, requestedBy]
  )
  const task = inserted.rows[0]
  const intentTags = inferIntent(query)
  const [sources, controlMap, memory] = await Promise.all([
    loadPlannerSources(),
    loadRuntimeControls(),
    loadQueryMemory(normalized),
  ])
  const planned = sources.map((source) => ({
    source,
    score: sourceScore(source, intentTags, controlMap, memory),
    reason: plannerReason(source, intentTags, controlMap, memory),
  }))
  const selected = pickDiverseSources(planned, controlMap)
  for (const item of (selected.length ? selected : [{ source: { id: null, source_key: 'toppreise', source_kind: 'comparison_search' }, score: 100, reason: 'Fallback ohne Registry' }])) {
    await pool.query(
      `INSERT INTO search_task_sources(search_task_id, provider, source_kind, seed_value, status, swiss_source_id, planner_reason, source_priority)
       VALUES ($1,$2,$3,$4,'pending',$5,$6,$7)`,
      [task.id, item.source.source_key, item.source.source_kind, buildSeedValue(item.source, query), item.source.id, item.reason, item.score]
    ).catch(() => {})
  }
  return task
}

async function ensureSeedCandidate(query, seedSource = 'system', priority = 50, notes = null) {
  const normalized = normalizeSearchText(query)
  if (!normalized) return
  await pool.query(
    `INSERT INTO ai_seed_candidates(query, normalized_query, seed_source, priority, status, notes, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'pending',$5,NOW(),NOW())
     ON CONFLICT (normalized_query)
     DO UPDATE SET priority = GREATEST(ai_seed_candidates.priority, EXCLUDED.priority), updated_at = NOW()`,
    [query, normalized, seedSource, priority, notes]
  ).catch(() => {})
}

async function seedBaselineCandidates(limit = 12) {
  for (const query of BASELINE_SEEDS.slice(0, limit)) {
    await ensureSeedCandidate(query, 'baseline', 65, 'Baseline Schweizer Top-Produkte')
  }
}

async function seedTrendingCandidates(limit = 20) {
  const results = await pool.query(
    `SELECT query, COUNT(*)::int AS searches
     FROM search_logs
     WHERE query IS NOT NULL AND LENGTH(TRIM(query)) >= 3 AND created_at >= NOW() - INTERVAL '14 days'
     GROUP BY query
     ORDER BY searches DESC, MAX(created_at) DESC
     LIMIT $1`,
    [limit]
  ).catch(() => ({ rows: [] }))
  for (const row of results.rows) {
    await ensureSeedCandidate(row.query, 'trending_search_log', 50 + Math.min(30, Number(row.searches || 0)), 'Aus Suchlogs gelernt')
  }
  const canonical = await pool.query(
    `SELECT title, popularity_score
     FROM canonical_products
     WHERE title IS NOT NULL
     ORDER BY popularity_score DESC NULLS LAST, updated_at DESC
     LIMIT $1`,
    [Math.max(5, Math.floor(limit / 2))]
  ).catch(() => ({ rows: [] }))
  for (const row of canonical.rows) {
    await ensureSeedCandidate(row.title, 'popular_canonical', 45 + Math.min(20, Number(row.popularity_score || 0)), 'Aus Canonical-Popularität gelernt')
  }
}

async function claimSeedCandidate() {
  const result = await pool.query(
    `UPDATE ai_seed_candidates
     SET status = 'running', updated_at = NOW(), last_run_at = NOW()
     WHERE id = (
       SELECT id FROM ai_seed_candidates
       WHERE status = 'pending'
       ORDER BY priority DESC, updated_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`
  ).catch(() => ({ rows: [] }))
  return result.rows[0] || null
}

async function processAutonomousSeedCandidate(seed) {
  const task = await createSearchTask(seed.query, 'worker_autonomous', 'autonomous_seed')
  await pool.query(
    `UPDATE ai_seed_candidates
     SET status = 'completed', last_enqueued_task_id = $2, updated_at = NOW()
     WHERE id = $1`,
    [seed.id, task?.id || null]
  ).catch(() => {})
}

async function tickAutonomousBuilder() {
  const controls = await loadRuntimeControls()
  const autonomous = controls.get('autonomous_builder')
  if (autonomous?.is_enabled === false) return
  const baselineLimit = Number(autonomous?.control_value_json?.baseline_limit || 12)
  const trendingLimit = Number(autonomous?.control_value_json?.trending_limit || 20)
  const enqueuePerTick = Number(autonomous?.control_value_json?.enqueue_per_tick || 1)
  await seedBaselineCandidates(baselineLimit)
  await seedTrendingCandidates(trendingLimit)
  for (let i = 0; i < enqueuePerTick; i++) {
    const seed = await claimSeedCandidate()
    if (!seed) break
    await processAutonomousSeedCandidate(seed)
  }
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
      'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8'
    }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return await res.text()
}

function parseToppreiseResults(html = '', query = '', pageUrl = '') {
  const lines = htmlToLines(html)
  const items = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!/Angebote ab CHF/i.test(line)) continue
    const price = normalizePrice(line)
    if (!price) continue
    let title = ''
    for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
      const candidate = lines[j]
      if (!candidate || candidate.length > 180) continue
      if (/Produkt bewerten|Preisalarm hinzufügen|zum Vergleich hinzufügen|zur Wunschliste hinzufügen|günstigste Variante|weitere \d+ Produktvarianten anzeigen/i.test(candidate)) continue
      if (TITLE_BRAND_RE.test(candidate)) {
        title = candidate
        break
      }
    }
    if (!title) continue
    const brand = brandFromTitle(title)
    const model_key = canonicalModelKey({ brand, title })
    items.push({
      provider: 'toppreise',
      provider_group: 'swiss_search',
      offer_title: title,
      brand,
      category: null,
      model_key,
      ean_gtin: null,
      mpn: null,
      price,
      currency: 'CHF',
      availability: null,
      condition_text: null,
      image_url: null,
      deeplink_url: null,
      source_product_url: pageUrl,
      confidence_score: 0.72,
      extraction_method: 'toppreise_search_lines',
      extracted_json: { query, line, source: 'toppreise_search' }
    })
  }
  return items
}

async function loadSwissSource(sourceId) {
  if (!sourceId) return null
  const result = await pool.query(`SELECT id, source_key, display_name, provider_kind, source_kind, base_url, search_url_template, sitemap_url, seed_urls_json, categories_json FROM swiss_sources WHERE id = $1 LIMIT 1`, [sourceId]).catch(() => ({ rows: [] }))
  return result.rows[0] || null
}

function pageTypeFromUrl(url = '') {
  const value = String(url).toLowerCase()
  if (/\/product|\/p\//.test(value)) return 'product'
  if (/sitemap|robots/.test(value)) return 'sitemap'
  if (/search|suche|produktsuche/.test(value)) return 'search_results'
  return 'catalog'
}

function sourceDiscoveryUrls(swissSource, seedValue) {
  const urls = []
  if (seedValue && /^https?:\/\//i.test(seedValue)) urls.push(seedValue)
  if (swissSource?.sitemap_url) urls.push(swissSource.sitemap_url)
  if (Array.isArray(swissSource?.seed_urls_json)) urls.push(...swissSource.seed_urls_json.filter((x) => /^https?:\/\//i.test(String(x))))
  if (swissSource?.base_url) urls.push(swissSource.base_url)
  return [...new Set(urls)]
}

async function ensureSourcePage(provider, pageUrl, sourceKind, pageType, rawPayload = {}) {
  const result = await pool.query(
    `INSERT INTO source_pages(provider, source_kind, page_url, normalized_url, page_type, crawl_status, raw_payload_json, extracted_json, first_seen_at, last_seen_at, created_at, updated_at, last_crawled_at)
     VALUES ($1,$2,$3,$3,$4,'pending',$5,$6,NOW(),NOW(),NOW(),NOW(),NOW())
     ON CONFLICT (provider, page_url)
     DO UPDATE SET source_kind = EXCLUDED.source_kind, page_type = EXCLUDED.page_type, raw_payload_json = EXCLUDED.raw_payload_json, extracted_json = EXCLUDED.extracted_json, last_seen_at = NOW(), updated_at = NOW()
     RETURNING id`,
    [provider, sourceKind, pageUrl, pageType, JSON.stringify(rawPayload), JSON.stringify(rawPayload)]
  ).catch(() => ({ rows: [] }))
  return result.rows[0]?.id || null
}

async function storeSourceOffers(taskId, source, offers, pageUrl) {
  const sourcePageId = await ensureSourcePage(source.provider, pageUrl, source.source_kind, 'search_results', { query: source.seed_value, provider: source.provider })
  let inserted = 0
  for (const offer of offers) {
    await pool.query(
      `INSERT INTO source_offers_v2(canonical_product_id, source_page_id, provider, provider_group, offer_title, brand, category, model_key, ean_gtin, mpn, price, currency, availability, condition_text, image_url, deeplink_url, source_product_url, confidence_score, extraction_method, extracted_json, is_active, first_seen_at, last_seen_at, created_at, updated_at)
       VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,true,NOW(),NOW(),NOW(),NOW())`,
      [sourcePageId, offer.provider, offer.provider_group, offer.offer_title, offer.brand, offer.category, offer.model_key, offer.ean_gtin, offer.mpn, offer.price, offer.currency, offer.availability, offer.condition_text, offer.image_url, offer.deeplink_url, offer.source_product_url, offer.confidence_score, offer.extraction_method, JSON.stringify({ ...offer.extracted_json, taskId })]
    ).catch(() => {})
    inserted += 1
  }
  return inserted
}

async function processTaskSource(task, source) {
  const swissSource = await loadSwissSource(source.swiss_source_id)
  if (source.provider === 'toppreise' && source.source_kind === 'comparison_search') {
    const url = `${TOPPREISE_BASE}${encodeURIComponent(task.query || source.seed_value)}`
    const html = await fetchText(url)
    const offers = parseToppreiseResults(html, task.query || source.seed_value, url)
    const inserted = await storeSourceOffers(task.id, source, offers, url)
    await pool.query(`UPDATE search_task_sources SET status = 'success', discovered_count = $2, imported_count = $2, updated_at = NOW(), error_message = NULL WHERE id = $1`, [source.id, inserted]).catch(() => {})
    return { discovered: inserted, imported: inserted, sourceKey: source.provider }
  }
  const urls = sourceDiscoveryUrls(swissSource, source.seed_value)
  let discovered = 0
  for (const url of urls) {
    const sourcePageId = await ensureSourcePage(source.provider, url, source.source_kind, pageTypeFromUrl(url), {
      query: task.query,
      planner_reason: source.planner_reason,
      swiss_source_id: source.swiss_source_id,
      source_kind: source.source_kind,
    })
    if (sourcePageId) discovered += 1
  }
  await pool.query(`UPDATE search_task_sources SET status = 'success', discovered_count = $2, imported_count = 0, updated_at = NOW(), error_message = NULL WHERE id = $1`, [source.id, discovered]).catch(() => {})
  return { discovered, imported: 0, sourceKey: swissSource?.source_key || source.provider }
}

async function findCanonicalCandidate(offer) {
  const brand = offer.brand || brandFromTitle(offer.offer_title || '')
  const result = await pool.query(
    `SELECT id, title, brand, model_key
     FROM canonical_products
     WHERE ($1::text IS NULL OR brand = $1 OR brand ILIKE $2)
     ORDER BY updated_at DESC
     LIMIT 40`,
    [brand || null, brand ? `%${brand}%` : null]
  ).catch(() => ({ rows: [] }))
  let best = null
  let bestScore = 0
  for (const row of result.rows) {
    const score = Math.max(
      similarity(`${offer.brand || ''} ${offer.offer_title || ''}`, `${row.brand || ''} ${row.title || ''}`),
      row.model_key && offer.model_key && row.model_key === offer.model_key ? 1 : 0,
    )
    if (score > bestScore) {
      best = row
      bestScore = score
    }
  }
  return bestScore >= 0.78 ? best : null
}

async function ensureCanonicalFromOffers(limit = 250) {
  const offers = await pool.query(`SELECT id, provider, offer_title, brand, category, model_key, image_url, price, currency FROM source_offers_v2 WHERE canonical_product_id IS NULL ORDER BY updated_at DESC LIMIT $1`, [limit]).catch(() => ({ rows: [] }))
  let merged = 0
  for (const offer of offers.rows) {
    const modelKey = offer.model_key || canonicalModelKey({ brand: offer.brand, title: offer.offer_title })
    if (!modelKey) continue
    const existing = await pool.query(`SELECT id, title, brand, model_key FROM canonical_products WHERE model_key = $1 LIMIT 1`, [modelKey]).catch(() => ({ rows: [] }))
    let canonicalId = existing.rows[0]?.id
    if (!canonicalId) {
      const fuzzy = await findCanonicalCandidate({ ...offer, model_key: modelKey })
      canonicalId = fuzzy?.id || null
    }
    if (!canonicalId) {
      const inserted = await pool.query(`INSERT INTO canonical_products(canonical_key, title, brand, category, model_key, image_url, best_price, best_price_currency, offer_count, source_count, confidence_score, created_at, updated_at, last_seen_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,0,0.72,NOW(),NOW(),NOW()) RETURNING id`, [modelKey, offer.offer_title, offer.brand || null, offer.category || null, modelKey, offer.image_url || null, offer.price || null, offer.currency || 'CHF']).catch(() => ({ rows: [] }))
      canonicalId = inserted.rows[0]?.id
    }
    if (!canonicalId) continue
    await pool.query(`UPDATE source_offers_v2 SET canonical_product_id = $1, model_key = $2, updated_at = NOW() WHERE id = $3`, [canonicalId, modelKey, offer.id]).catch(() => {})
    await pool.query(`UPDATE canonical_products cp SET offer_count = stats.offer_count, source_count = stats.source_count, best_price = stats.best_price, best_price_currency = COALESCE(stats.best_price_currency, cp.best_price_currency), image_url = COALESCE(cp.image_url, $2), title = CASE WHEN LENGTH(COALESCE(cp.title, '')) >= LENGTH($3) THEN cp.title ELSE $3 END, brand = COALESCE(cp.brand, $4), updated_at = NOW(), last_seen_at = NOW() FROM (SELECT canonical_product_id, COUNT(*)::int AS offer_count, COUNT(DISTINCT provider)::int AS source_count, MIN(price) AS best_price, (ARRAY_AGG(currency ORDER BY price ASC NULLS LAST, updated_at DESC))[1] AS best_price_currency FROM source_offers_v2 WHERE canonical_product_id = $1 GROUP BY canonical_product_id) stats WHERE cp.id = stats.canonical_product_id`, [canonicalId, offer.image_url || null, offer.offer_title, offer.brand || null]).catch(() => {})
    await pool.query(`INSERT INTO ai_merge_jobs(job_type, status, canonical_product_id, source_offer_id, input_json, output_json, confidence_score, requested_by, started_at, finished_at, created_at, updated_at) VALUES ('canonical_merge','success',$1,$2,$3,$4,0.76,'worker',NOW(),NOW(),NOW(),NOW())`, [canonicalId, offer.id, JSON.stringify({ offerId: offer.id }), JSON.stringify({ canonicalId, modelKey })]).catch(() => {})
    merged += 1
  }
  return merged
}

async function refreshCanonicalPopularity() {
  await pool.query(
    `WITH click_stats AS (
       SELECT NULLIF(REPLACE(product_slug, 'canonical-', ''), '')::bigint AS canonical_product_id, COUNT(*)::int AS clicks
       FROM outbound_clicks
       WHERE product_slug LIKE 'canonical-%'
       GROUP BY 1
     )
     UPDATE canonical_products cp
     SET popularity_score = COALESCE(cs.clicks, 0) * 5 + COALESCE(cp.source_count, 0) * 2 + COALESCE(cp.offer_count, 0),
         freshness_priority = CASE WHEN cp.last_seen_at >= NOW() - INTERVAL '2 hours' THEN 100 WHEN cp.last_seen_at >= NOW() - INTERVAL '12 hours' THEN 60 ELSE 20 END,
         updated_at = NOW()
     FROM click_stats cs
     WHERE cp.id = cs.canonical_product_id`
  ).catch(() => {})
}

async function rememberQueryLearning(task, successfulSourceKeys, resultCount, status) {
  const normalized = normalizeSearchText(task.normalized_query || task.query || '')
  if (!normalized) return
  const learnedTags = inferIntent(task.query || '')
  await pool.query(
    `INSERT INTO ai_query_memory(normalized_query, raw_query, success_count, failure_count, total_result_count, last_success_at, last_failure_at, last_source_keys_json, learned_tags_json, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
     ON CONFLICT (normalized_query)
     DO UPDATE SET
       raw_query = EXCLUDED.raw_query,
       success_count = ai_query_memory.success_count + EXCLUDED.success_count,
       failure_count = ai_query_memory.failure_count + EXCLUDED.failure_count,
       total_result_count = EXCLUDED.total_result_count,
       last_success_at = COALESCE(EXCLUDED.last_success_at, ai_query_memory.last_success_at),
       last_failure_at = COALESCE(EXCLUDED.last_failure_at, ai_query_memory.last_failure_at),
       last_source_keys_json = EXCLUDED.last_source_keys_json,
       learned_tags_json = EXCLUDED.learned_tags_json,
       updated_at = NOW()`,
    [
      normalized,
      task.query || normalized,
      status === 'success' ? 1 : 0,
      status === 'failed' ? 1 : 0,
      resultCount,
      status === 'success' ? new Date().toISOString() : null,
      status === 'failed' ? new Date().toISOString() : null,
      JSON.stringify([...new Set(successfulSourceKeys)]),
      JSON.stringify(learnedTags),
    ]
  ).catch(() => {})
}

async function processSearchTask(task) {
  let discovered = 0
  let imported = 0
  const successfulSourceKeys = []
  while (true) {
    const source = await claimTaskSource(task.id)
    if (!source) break
    try {
      const result = await processTaskSource(task, source)
      discovered += result.discovered
      imported += result.imported
      if (result.sourceKey) successfulSourceKeys.push(result.sourceKey)
    } catch (err) {
      await pool.query(`UPDATE search_task_sources SET status = 'failed', updated_at = NOW(), error_message = $2 WHERE id = $1`, [source.id, String(err.message || err)]).catch(() => {})
    }
  }
  const merged = await ensureCanonicalFromOffers(300)
  await refreshCanonicalPopularity()
  const finalImported = imported + merged
  const status = (finalImported > 0 || discovered > 0) ? 'success' : 'failed'
  await pool.query(`UPDATE search_tasks SET status = $2, finished_at = NOW(), updated_at = NOW(), discovered_count = COALESCE(discovered_count,0) + $3, imported_count = COALESCE(imported_count,0) + $4, result_count = COALESCE(result_count,0) + $4, error_message = CASE WHEN $2 = 'failed' THEN 'Keine verwertbaren Treffer aus den aktuellen Quellen gefunden.' ELSE NULL END WHERE id = $1`, [task.id, status, discovered, finalImported]).catch(() => {})
  await rememberQueryLearning(task, successfulSourceKeys, finalImported, status)
}

async function tickAiSearch() {
  const task = await claimSearchTask()
  if (!task) return
  try {
    await processSearchTask(task)
  } catch (err) {
    await pool.query(`UPDATE search_tasks SET status = 'failed', finished_at = NOW(), updated_at = NOW(), error_message = $2 WHERE id = $1`, [task.id, String(err.message || err)]).catch(() => {})
  }
}

await ensureCoreSchema(pool)
await cycle()
await tickAutonomousBuilder().catch(console.error)
await tickAiSearch().catch(console.error)
setInterval(cycle, interval * 1000)
setInterval(() => { tickAutonomousBuilder().catch(console.error) }, Math.max(30, AI_SEARCH_INTERVAL_SECONDS) * 1000)
setInterval(() => { tickAiSearch().catch(console.error) }, AI_SEARCH_INTERVAL_SECONDS * 1000)
