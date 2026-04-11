import { Pool } from 'pg'
import { ensureCoreSchema } from '../../database/ensure_schema.mjs'
import { normalizeDbUrl } from '../../database/normalize_db_url.mjs'
import { canonicalModelKey } from '../../webapp/server/ai_search_runtime.mjs'

const DATABASE_URL = normalizeDbUrl(process.env.DATABASE_URL)
console.log('[worker] Using DB host from DATABASE_URL:', new URL(DATABASE_URL).hostname)
const pool = new Pool({ connectionString: DATABASE_URL })
const interval = Number(process.env.ALERT_CHECK_INTERVAL_SECONDS || 120)
const AI_SEARCH_INTERVAL_SECONDS = Number(process.env.AI_SEARCH_WORKER_INTERVAL_SECONDS || 30)
const TOPPREISE_BASE = 'https://www.toppreise.ch/produktsuche?q='
const TITLE_BRAND_RE = /(Apple|Samsung|Google|Xiaomi|Sony|Nokia|Motorola|Asus|Lenovo|HP|Acer|Dell|MSI|Jabra|Bose|Nothing|Honor|Huawei|Fairphone|Microsoft|DJI|Roborock|Philips|Logitech|Intel|Panasonic|Ecovacs|Dyson|Bambu|Sonos|Corsair)/i

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

async function cycle() {
  try {
    await pool.query('INSERT INTO monitoring_events(service_name, level, message) VALUES ($1,$2,$3)', ['worker', 'info', 'Worker-Zyklus erfolgreich'])
    console.log('[worker] ok')
  } catch (err) {
    console.error(err)
  }
}

async function claimSearchTask() {
  const result = await pool.query(
    `UPDATE search_tasks
     SET status = 'running', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
     WHERE id = (
       SELECT id FROM search_tasks
       WHERE status = 'pending'
       ORDER BY task_priority DESC, created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`
  ).catch(() => ({ rows: [] }))
  return result.rows[0] || null
}

async function claimTaskSource(taskId) {
  const result = await pool.query(
    `UPDATE search_task_sources
     SET status = 'running', updated_at = NOW()
     WHERE id = (
       SELECT id FROM search_task_sources
       WHERE search_task_id = $1 AND status = 'pending'
       ORDER BY source_priority DESC, created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [taskId]
  ).catch(() => ({ rows: [] }))
  return result.rows[0] || null
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
    return { discovered: inserted, imported: inserted }
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
  return { discovered, imported: 0 }
}

async function ensureCanonicalFromOffers(limit = 250) {
  const offers = await pool.query(`SELECT id, provider, offer_title, brand, category, model_key, image_url, price, currency FROM source_offers_v2 WHERE canonical_product_id IS NULL ORDER BY updated_at DESC LIMIT $1`, [limit]).catch(() => ({ rows: [] }))
  let merged = 0
  for (const offer of offers.rows) {
    const modelKey = offer.model_key || canonicalModelKey({ brand: offer.brand, title: offer.offer_title })
    if (!modelKey) continue
    const existing = await pool.query(`SELECT id FROM canonical_products WHERE model_key = $1 LIMIT 1`, [modelKey]).catch(() => ({ rows: [] }))
    let canonicalId = existing.rows[0]?.id
    if (!canonicalId) {
      const inserted = await pool.query(`INSERT INTO canonical_products(canonical_key, title, brand, category, model_key, image_url, best_price, best_price_currency, offer_count, source_count, confidence_score, created_at, updated_at, last_seen_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,0,0.72,NOW(),NOW(),NOW()) RETURNING id`, [modelKey, offer.offer_title, offer.brand || null, offer.category || null, modelKey, offer.image_url || null, offer.price || null, offer.currency || 'CHF']).catch(() => ({ rows: [] }))
      canonicalId = inserted.rows[0]?.id
    }
    if (!canonicalId) continue
    await pool.query(`UPDATE source_offers_v2 SET canonical_product_id = $1, model_key = $2, updated_at = NOW() WHERE id = $3`, [canonicalId, modelKey, offer.id]).catch(() => {})
    await pool.query(`UPDATE canonical_products cp SET offer_count = stats.offer_count, source_count = stats.source_count, best_price = stats.best_price, best_price_currency = COALESCE(stats.best_price_currency, cp.best_price_currency), image_url = COALESCE(cp.image_url, $2), updated_at = NOW(), last_seen_at = NOW() FROM (SELECT canonical_product_id, COUNT(*)::int AS offer_count, COUNT(DISTINCT provider)::int AS source_count, MIN(price) AS best_price, (ARRAY_AGG(currency ORDER BY price ASC NULLS LAST, updated_at DESC))[1] AS best_price_currency FROM source_offers_v2 WHERE canonical_product_id = $1 GROUP BY canonical_product_id) stats WHERE cp.id = stats.canonical_product_id`, [canonicalId, offer.image_url || null]).catch(() => {})
    await pool.query(`INSERT INTO ai_merge_jobs(job_type, status, canonical_product_id, source_offer_id, input_json, output_json, confidence_score, requested_by, started_at, finished_at, created_at, updated_at) VALUES ('canonical_merge','success',$1,$2,$3,$4,0.72,'worker',NOW(),NOW(),NOW(),NOW())`, [canonicalId, offer.id, JSON.stringify({ offerId: offer.id }), JSON.stringify({ canonicalId, modelKey })]).catch(() => {})
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

async function processSearchTask(task) {
  let discovered = 0
  let imported = 0
  while (true) {
    const source = await claimTaskSource(task.id)
    if (!source) break
    try {
      const result = await processTaskSource(task, source)
      discovered += result.discovered
      imported += result.imported
    } catch (err) {
      await pool.query(`UPDATE search_task_sources SET status = 'failed', updated_at = NOW(), error_message = $2 WHERE id = $1`, [source.id, String(err.message || err)]).catch(() => {})
    }
  }
  const merged = await ensureCanonicalFromOffers(300)
  await refreshCanonicalPopularity()
  const finalImported = imported + merged
  const status = (finalImported > 0 || discovered > 0) ? 'success' : 'failed'
  await pool.query(`UPDATE search_tasks SET status = $2, finished_at = NOW(), updated_at = NOW(), discovered_count = COALESCE(discovered_count,0) + $3, imported_count = COALESCE(imported_count,0) + $4, result_count = COALESCE(result_count,0) + $4, error_message = CASE WHEN $2 = 'failed' THEN 'Keine verwertbaren Treffer aus den aktuellen Quellen gefunden.' ELSE NULL END WHERE id = $1`, [task.id, status, discovered, finalImported]).catch(() => {})
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
setInterval(cycle, interval * 1000)
setInterval(() => { tickAiSearch().catch(console.error) }, AI_SEARCH_INTERVAL_SECONDS * 1000)
tickAiSearch().catch(console.error)
