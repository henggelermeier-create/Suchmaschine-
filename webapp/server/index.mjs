import express from 'express'
import cors from 'cors'
import path from 'path'
import jwt from 'jsonwebtoken'
import { Pool } from 'pg'
import { fileURLToPath } from 'url'
import { ensureCoreSchema } from '../../database/ensure_schema.mjs'
import { normalizeDbUrl } from '../../database/normalize_db_url.mjs'
import { enqueueLiveSearchTask } from './ai_search_runtime.mjs'
import { fetchCanonicalProductBySlug, fetchCanonicalSearchResults, mergeSearchResults, resolveCanonicalRedirect } from './canonical_search_runtime.mjs'
import { buildGoLiveReadiness } from './go_live_readiness.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')

const app = express()
app.use(cors())
app.use(express.json())

const PORT = Number(process.env.PORT || 3002)
const JWT_SECRET = process.env.JWT_SECRET || 'replace_me_with_long_secret'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@kauvio.ch'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123'
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai_service:3010'
const AFFILIATE_DEFAULT_TAG = process.env.AFFILIATE_DEFAULT_TAG || 'kauvio-default'

const DATABASE_URL = normalizeDbUrl(process.env.DATABASE_URL)
console.log('Using DB host from DATABASE_URL:', new URL(DATABASE_URL).hostname)
const pool = new Pool({ connectionString: DATABASE_URL })

function auth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'Nicht eingeloggt' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ error: 'Ungültiger Token' })
  }
}

function normalizeJsonInput(value, fallback = {}) {
  if (value && typeof value === 'object') return value
  if (typeof value === 'string' && value.trim()) {
    try { return JSON.parse(value) } catch { return fallback }
  }
  return fallback
}

function withAffiliate(url) {
  if (!url) return null
  if (/([?&](tag|ref|utm_source)=)/i.test(url)) return url
  try {
    const u = new URL(url)
    if (/amazon\./i.test(u.hostname)) {
      u.searchParams.set('tag', AFFILIATE_DEFAULT_TAG)
      return u.toString()
    }
    u.searchParams.set('utm_source', 'kauvio')
    return u.toString()
  } catch {
    return url
  }
}

function normalizeOffer(row) {
  const baseUrl = row.affiliate_url || row.product_url
  return {
    ...row,
    price: row.price != null ? Number(row.price) : null,
    affiliate_url: row.affiliate_url || null,
    is_hidden: !!row.is_hidden,
    redirect_url: withAffiliate(baseUrl),
  }
}

function normalizeTextForMatch(input = '') {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(5g|lte|wifi|dual sim|esim|nano sim|smartphone|handy|notebook|laptop|kopfhörer|headphones|bluetooth|apple|samsung)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenSet(str = '') {
  return new Set(normalizeTextForMatch(str).split(' ').filter(Boolean))
}

function scoreProductSimilarity(a, b) {
  const at = tokenSet(`${a.brand || ''} ${a.title || ''}`)
  const bt = tokenSet(`${b.brand || ''} ${b.title || ''}`)
  if (!at.size || !bt.size) return 0
  let inter = 0
  for (const t of at) if (bt.has(t)) inter++
  const union = new Set([...at, ...bt]).size || 1
  let score = inter / union
  const memA = String(a.title || '').match(/\b(64|128|256|512|1024)\s?gb\b/i)?.[1]
  const memB = String(b.title || '').match(/\b(64|128|256|512|1024)\s?gb\b/i)?.[1]
  if (memA && memB && memA === memB) score += 0.15
  if ((a.brand || '').toLowerCase() === (b.brand || '').toLowerCase()) score += 0.15
  return Math.min(1, score)
}

async function dbCount(sql) {
  try {
    const r = await pool.query(sql)
    return Number(r.rows?.[0]?.c || 0)
  } catch {
    return 0
  }
}

async function getAiControls() {
  const result = await pool.query(`SELECT control_key, is_enabled, control_value_json, description, updated_by, updated_at FROM ai_runtime_controls ORDER BY control_key ASC`).catch(() => ({ rows: [] }))
  return result.rows
}

async function getSwissSourcesAdmin() {
  const result = await pool.query(`SELECT source_key, display_name, provider_kind, source_kind, country_code, language_code, base_url, priority, confidence_score, refresh_interval_minutes, is_active, source_size, is_small_shop, discovery_weight, runtime_score, manual_boost, last_runtime_status, last_runtime_error, last_runtime_at, categories_json, notes, updated_at FROM swiss_sources ORDER BY priority DESC, confidence_score DESC, display_name ASC`).catch(() => ({ rows: [] }))
  return result.rows
}

async function getAiRuntimeEvents(limit = 50) {
  const result = await pool.query(`SELECT id, event_type, source_key, severity, event_payload_json, created_by, created_at FROM ai_runtime_events ORDER BY created_at DESC LIMIT $1`, [limit]).catch(() => ({ rows: [] }))
  return result.rows
}

async function logAiRuntimeEvent(eventType, sourceKey, severity = 'info', payload = {}, createdBy = 'system') {
  await pool.query(`INSERT INTO ai_runtime_events(event_type, source_key, severity, event_payload_json, created_by, created_at) VALUES ($1,$2,$3,$4,$5,NOW())`, [eventType, sourceKey || null, severity, JSON.stringify(payload || {}), createdBy]).catch(() => {})
}

async function buildSystemHealth() {
  const checks = {}
  const add = async (name, sql) => {
    try {
      const r = await pool.query(sql)
      checks[name] = { ok: true, count: Number(r.rows?.[0]?.c || 0) }
    } catch (err) {
      checks[name] = { ok: false, error: String(err.message || err) }
    }
  }
  await add('products', 'SELECT COUNT(*)::int AS c FROM products')
  await add('offers', 'SELECT COUNT(*)::int AS c FROM product_offers')
  await add('search_tasks', 'SELECT COUNT(*)::int AS c FROM search_tasks')
  await add('canonical_products', 'SELECT COUNT(*)::int AS c FROM canonical_products')
  await add('swiss_sources', 'SELECT COUNT(*)::int AS c FROM swiss_sources')
  await add('ai_runtime_controls', 'SELECT COUNT(*)::int AS c FROM ai_runtime_controls')
  await add('ai_runtime_events', 'SELECT COUNT(*)::int AS c FROM ai_runtime_events')
  await add('source_pages', 'SELECT COUNT(*)::int AS c FROM source_pages')
  await add('source_offers_v2', 'SELECT COUNT(*)::int AS c FROM source_offers_v2')
  return checks
}

function buildAssistantPlan(message = '') {
  const text = String(message || '').toLowerCase().trim()
  if (!text) return { summary: 'Keine Eingabe', actions: [] }
  const actions = []
  if (/(status|health|go live|launch|bereit|readiness)/.test(text)) actions.push({ type: 'go_live_readiness' })
  if (/(kleine shops|small shops).*(stärker|boosten|mehr)/.test(text)) actions.push({ type: 'set_ai_control', control_key: 'small_shop_balance', patch: { min_small_shops: 3, boost: 24 } })
  if (/(runtime|laufzeit).*(notiz|note|merken)/.test(text)) actions.push({ type: 'log_runtime_note', note: message })
  if (/(duplikat|doppelt|merge)/.test(text)) actions.push({ type: 'scan_duplicates' })
  return {
    summary: actions.length ? 'Sichere AI-Backend-Aktionen erkannt.' : 'Keine sichere Aktion erkannt. Formuliere z. B. „Go-Live-Status prüfen“ oder „Kleine Shops stärker gewichten“.',
    actions,
  }
}

async function executeAssistantAction(action, requestedBy = 'admin') {
  if (action.type === 'go_live_readiness') {
    const readiness = await buildGoLiveReadiness(pool, { jwtSecret: JWT_SECRET, adminPassword: ADMIN_PASSWORD, aiServiceUrl: AI_SERVICE_URL })
    await logAiRuntimeEvent('assistant_go_live_readiness', null, readiness.ready ? 'info' : 'warning', readiness, requestedBy)
    return { ok: true, type: action.type, readiness }
  }
  if (action.type === 'set_ai_control') {
    const existing = await pool.query(`SELECT control_value_json FROM ai_runtime_controls WHERE control_key = $1 LIMIT 1`, [action.control_key]).catch(() => ({ rows: [] }))
    const current = normalizeJsonInput(existing.rows[0]?.control_value_json, {})
    const next = { ...current, ...normalizeJsonInput(action.patch, {}) }
    const updated = await pool.query(`UPDATE ai_runtime_controls SET control_value_json = $2, updated_by = $3, updated_at = NOW() WHERE control_key = $1 RETURNING control_key, is_enabled, control_value_json, description, updated_by, updated_at`, [action.control_key, JSON.stringify(next), requestedBy]).catch(() => ({ rows: [] }))
    await logAiRuntimeEvent('assistant_set_ai_control', action.control_key, 'info', { patch: action.patch, next }, requestedBy)
    return { ok: true, type: action.type, control: updated.rows[0] || null }
  }
  if (action.type === 'log_runtime_note') {
    await logAiRuntimeEvent('assistant_runtime_note', null, 'info', { note: action.note || '' }, requestedBy)
    return { ok: true, type: action.type }
  }
  if (action.type === 'scan_duplicates') {
    const rows = await pool.query(`SELECT slug, title, brand, category FROM products ORDER BY updated_at DESC LIMIT 120`).catch(() => ({ rows: [] }))
    const items = rows.rows
    const matches = []
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const score = scoreProductSimilarity(items[i], items[j])
        if (score >= 0.62) matches.push({ left: items[i].slug, right: items[j].slug, score: Number(score.toFixed(2)) })
      }
    }
    await logAiRuntimeEvent('assistant_scan_duplicates', null, 'info', { matches: matches.slice(0, 20) }, requestedBy)
    return { ok: true, type: action.type, matches: matches.slice(0, 40) }
  }
  return { ok: false, type: action.type, error: 'Unbekannte Aktion' }
}

app.get('/api/health', async (_req, res) => {
  const db = await pool.query('SELECT NOW() AS now')
  res.json({ ok: true, service: 'webapp', dbTime: db.rows[0].now })
})

app.get('/api/ready', async (_req, res) => {
  const readiness = await buildGoLiveReadiness(pool, { jwtSecret: JWT_SECRET, adminPassword: ADMIN_PASSWORD, aiServiceUrl: AI_SERVICE_URL })
  res.status(readiness.ready ? 200 : 503).json(readiness)
})

app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body || {}
  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Login fehlgeschlagen. Prüfe E-Mail und Passwort.' })
  const token = jwt.sign({ email, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' })
  res.json({ token, user: { email, role: 'admin' } })
})

app.get('/api/products', async (req, res) => {
  const q = String(req.query.q || '').trim()
  const params = []
  let where = ''
  if (q) {
    params.push(`%${q}%`)
    where = 'WHERE p.title ILIKE $1 OR p.brand ILIKE $1 OR p.category ILIKE $1'
  }
  const result = await pool.query(`SELECT p.slug, p.title, p.brand, p.category, p.ai_summary, p.deal_score, p.image_url, COALESCE(MIN(o.price), p.price) AS price, COALESCE((ARRAY_AGG(o.shop_name ORDER BY o.price ASC, o.updated_at DESC))[1], p.shop_name) AS shop_name, COUNT(o.*)::int AS offer_count, MAX(p.updated_at) AS updated_at FROM products p LEFT JOIN product_offers o ON o.product_slug = p.slug AND COALESCE(o.is_hidden, false) = false ${where} GROUP BY p.slug, p.title, p.brand, p.category, p.ai_summary, p.deal_score, p.price, p.shop_name, p.image_url ORDER BY updated_at DESC, price ASC NULLS LAST LIMIT 100`, params)
  const productItems = result.rows.map((r) => ({ ...r, price: r.price != null ? Number(r.price) : null, decision: r.deal_score >= 88 ? { label: 'Jetzt kaufen' } : r.deal_score >= 78 ? { label: 'Guter Kauf' } : { label: 'Live Preis' } }))
  const canonicalItems = await fetchCanonicalSearchResults(pool, q, 60).catch(() => [])
  const items = mergeSearchResults(productItems, canonicalItems, 100)
  await pool.query('INSERT INTO search_logs(query, result_count) VALUES ($1,$2)', [q, items.length]).catch(() => {})
  let liveSearch = null
  if (q && items.length === 0) liveSearch = await enqueueLiveSearchTask(pool, q, 'public_search').catch(() => null)
  res.json({ items, liveSearch: liveSearch ? { id: liveSearch.id, status: liveSearch.status, strategy: liveSearch.strategy, userVisibleNote: liveSearch.user_visible_note || 'Wir bereiten gerade Live-Ergebnisse aus Schweizer Quellen auf.' } : null })
})

app.get('/api/products/:slug', async (req, res) => {
  const canonical = await fetchCanonicalProductBySlug(pool, req.params.slug).catch(() => null)
  if (canonical) return res.json(canonical)
  const product = await pool.query('SELECT * FROM products WHERE slug = $1 LIMIT 1', [req.params.slug])
  if (!product.rows.length) return res.status(404).json({ error: 'Produkt nicht gefunden' })
  const offers = await pool.query('SELECT shop_name, price, currency, product_url, affiliate_url, image_url, updated_at, is_hidden FROM product_offers WHERE product_slug = $1 AND COALESCE(is_hidden, false) = false ORDER BY price ASC, updated_at DESC', [req.params.slug])
  const enrichedOffers = offers.rows.map(normalizeOffer)
  const cheapest = enrichedOffers[0] || null
  res.json({ ...product.rows[0], price: cheapest ? Number(cheapest.price) : product.rows[0].price, shop_name: cheapest?.shop_name || product.rows[0].shop_name, product_url: cheapest?.product_url || product.rows[0].product_url, redirect_url: cheapest?.redirect_url || withAffiliate(product.rows[0].product_url), offers: enrichedOffers })
})

app.post('/api/alerts', async (req, res) => {
  const { email, productSlug, targetPrice } = req.body || {}
  if (!email || !productSlug || !targetPrice) return res.status(400).json({ error: 'Bitte E-Mail, Produkt und Zielpreis angeben.' })
  await pool.query('INSERT INTO alerts(email, product_slug, target_price) VALUES ($1,$2,$3)', [email, productSlug, targetPrice])
  res.json({ ok: true })
})

app.get('/r/:slug/:shop?', async (req, res) => {
  const { slug, shop } = req.params
  const canonicalTarget = await resolveCanonicalRedirect(pool, slug, shop).catch(() => null)
  if (canonicalTarget?.target_url) {
    const target = withAffiliate(canonicalTarget.target_url)
    await pool.query(`INSERT INTO outbound_clicks(product_slug, shop_name, target_url, ip_address, user_agent, referer) VALUES ($1,$2,$3,$4,$5,$6)`, [slug, canonicalTarget.shop_name || null, target, req.socket?.remoteAddress || null, req.headers['user-agent'] || null, req.headers.referer || req.headers.referrer || null]).catch(() => {})
    return res.redirect(target)
  }
  let row
  if (shop) row = await pool.query('SELECT shop_name, product_url, affiliate_url FROM product_offers WHERE product_slug = $1 AND LOWER(shop_name) = LOWER($2) AND COALESCE(is_hidden, false) = false LIMIT 1', [slug, shop])
  if (!row?.rows?.length) row = await pool.query('SELECT shop_name, product_url, affiliate_url FROM product_offers WHERE product_slug = $1 AND COALESCE(is_hidden, false) = false ORDER BY price ASC, updated_at DESC LIMIT 1', [slug])
  const chosen = row.rows[0] || null
  if (!chosen || !(chosen.affiliate_url || chosen.product_url)) return res.status(404).send('Ziel nicht gefunden')
  const target = withAffiliate(chosen.affiliate_url || chosen.product_url)
  await pool.query(`INSERT INTO outbound_clicks(product_slug, shop_name, target_url, ip_address, user_agent, referer) VALUES ($1,$2,$3,$4,$5,$6)`, [slug, chosen.shop_name || null, target, req.socket?.remoteAddress || null, req.headers['user-agent'] || null, req.headers.referer || req.headers.referrer || null]).catch(() => {})
  res.redirect(target)
})

app.get('/api/admin/dashboard', auth, async (_req, res) => {
  const readiness = await buildGoLiveReadiness(pool, { jwtSecret: JWT_SECRET, adminPassword: ADMIN_PASSWORD, aiServiceUrl: AI_SERVICE_URL })
  const stats = {
    products: await dbCount('SELECT COUNT(*)::int AS c FROM products'),
    offers: await dbCount('SELECT COUNT(*)::int AS c FROM product_offers'),
    searches: await dbCount('SELECT COUNT(*)::int AS c FROM search_logs'),
    clicks: await dbCount('SELECT COUNT(*)::int AS c FROM outbound_clicks'),
    clicks24h: await dbCount("SELECT COUNT(*)::int AS c FROM outbound_clicks WHERE created_at >= NOW() - INTERVAL '24 hours'"),
  }
  const recentClicks = await pool.query(`SELECT product_slug, COALESCE(shop_name, 'Unbekannt') AS shop_name, created_at FROM outbound_clicks ORDER BY created_at DESC LIMIT 20`).catch(() => ({ rows: [] }))
  res.json({ stats, readiness, recentClicks: recentClicks.rows, crawlJobs: [], crawlerRuns: [], discoveryQueue: [], topClickedProducts: [], topClickedShops: [] })
})

app.get('/api/admin/system-health', auth, async (_req, res) => res.json({ ok: true, checks: await buildSystemHealth() }))
app.get('/api/admin/go-live-readiness', auth, async (_req, res) => res.json(await buildGoLiveReadiness(pool, { jwtSecret: JWT_SECRET, adminPassword: ADMIN_PASSWORD, aiServiceUrl: AI_SERVICE_URL })))
app.get('/api/admin/search-tasks', auth, async (_req, res) => {
  const result = await pool.query(`SELECT st.id, st.query, st.status, st.strategy, st.user_visible_note, st.result_count, st.discovered_count, st.imported_count, st.error_message, st.created_at, COUNT(ss.*)::int AS source_count FROM search_tasks st LEFT JOIN search_task_sources ss ON ss.search_task_id = st.id GROUP BY st.id ORDER BY st.created_at DESC LIMIT 100`).catch(() => ({ rows: [] }))
  res.json({ items: result.rows })
})
app.get('/api/admin/canonical-products', auth, async (req, res) => {
  const q = String(req.query.q || '').trim()
  const params = []
  let where = ''
  if (q) { params.push(`%${q}%`); where = 'WHERE title ILIKE $1 OR brand ILIKE $1 OR category ILIKE $1' }
  const result = await pool.query(`SELECT id, canonical_key, title, brand, category, image_url, best_price, best_price_currency, offer_count, source_count, popularity_score, freshness_priority, updated_at FROM canonical_products ${where} ORDER BY popularity_score DESC, updated_at DESC LIMIT 100`, params).catch(() => ({ rows: [] }))
  res.json({ items: result.rows.map((r) => ({ ...r, best_price: r.best_price != null ? Number(r.best_price) : null })) })
})
app.get('/api/admin/ai/controls', auth, async (_req, res) => res.json({ items: await getAiControls() }))
app.put('/api/admin/ai/controls/:controlKey', auth, async (req, res) => {
  const controlKey = String(req.params.controlKey || '').trim()
  const isEnabled = typeof req.body?.is_enabled === 'boolean' ? req.body.is_enabled : true
  const controlValueJson = normalizeJsonInput(req.body?.control_value_json, {})
  const result = await pool.query(`UPDATE ai_runtime_controls SET is_enabled = $2, control_value_json = $3, updated_by = $4, updated_at = NOW() WHERE control_key = $1 RETURNING control_key, is_enabled, control_value_json, description, updated_by, updated_at`, [controlKey, isEnabled, JSON.stringify(controlValueJson), req.user?.email || 'admin']).catch(() => ({ rows: [] }))
  if (!result.rows.length) return res.status(404).json({ error: 'AI-Control nicht gefunden.' })
  await logAiRuntimeEvent('control_updated', controlKey, 'info', { is_enabled: isEnabled, control_value_json: controlValueJson }, req.user?.email || 'admin')
  res.json({ ok: true, item: result.rows[0] })
})
app.get('/api/admin/ai/runtime-events', auth, async (_req, res) => res.json({ items: await getAiRuntimeEvents() }))
app.post('/api/admin/ai/runtime-events', auth, async (req, res) => {
  const eventType = String(req.body?.event_type || 'manual_note').trim()
  const sourceKey = String(req.body?.source_key || '').trim() || null
  const severity = String(req.body?.severity || 'info').trim() || 'info'
  const payload = normalizeJsonInput(req.body?.event_payload_json, { note: String(req.body?.note || '') })
  await logAiRuntimeEvent(eventType, sourceKey, severity, payload, req.user?.email || 'admin')
  res.json({ ok: true })
})
app.get('/api/admin/swiss-sources', auth, async (_req, res) => res.json({ items: await getSwissSourcesAdmin() }))
app.put('/api/admin/swiss-sources/:sourceKey', auth, async (req, res) => {
  const sourceKey = String(req.params.sourceKey || '').trim().toLowerCase()
  const body = req.body || {}
  const result = await pool.query(`UPDATE swiss_sources SET priority = COALESCE($2, priority), confidence_score = COALESCE($3, confidence_score), refresh_interval_minutes = COALESCE($4, refresh_interval_minutes), is_active = COALESCE($5, is_active), source_size = COALESCE(NULLIF($6, ''), source_size), is_small_shop = COALESCE($7, is_small_shop), discovery_weight = COALESCE($8, discovery_weight), runtime_score = COALESCE($9, runtime_score), manual_boost = COALESCE($10, manual_boost), last_runtime_status = COALESCE(NULLIF($11, ''), last_runtime_status), last_runtime_error = $12, last_runtime_at = CASE WHEN $11 IS NOT NULL OR $12 IS NOT NULL THEN NOW() ELSE last_runtime_at END, updated_at = NOW() WHERE source_key = $1 RETURNING source_key, display_name, provider_kind, source_kind, country_code, language_code, base_url, priority, confidence_score, refresh_interval_minutes, is_active, source_size, is_small_shop, discovery_weight, runtime_score, manual_boost, last_runtime_status, last_runtime_error, last_runtime_at, categories_json, notes, updated_at`, [sourceKey, body.priority != null ? Number(body.priority) : null, body.confidence_score != null ? Number(body.confidence_score) : null, body.refresh_interval_minutes != null ? Number(body.refresh_interval_minutes) : null, typeof body.is_active === 'boolean' ? body.is_active : null, body.source_size ?? null, typeof body.is_small_shop === 'boolean' ? body.is_small_shop : null, body.discovery_weight != null ? Number(body.discovery_weight) : null, body.runtime_score != null ? Number(body.runtime_score) : null, body.manual_boost != null ? Number(body.manual_boost) : null, body.last_runtime_status ?? null, body.last_runtime_error ?? null]).catch(() => ({ rows: [] }))
  if (!result.rows.length) return res.status(404).json({ error: 'Schweizer Quelle nicht gefunden.' })
  await logAiRuntimeEvent('source_tuned', sourceKey, 'info', body, req.user?.email || 'admin')
  res.json({ ok: true, item: result.rows[0] })
})
app.post('/api/admin/assistant/plan', auth, async (req, res) => res.json(buildAssistantPlan(String(req.body?.message || ''))))
app.post('/api/admin/assistant/execute', auth, async (req, res) => {
  const actions = Array.isArray(req.body?.actions) ? req.body.actions : []
  const results = []
  for (const action of actions) results.push(await executeAssistantAction(action, req.user?.email || 'admin'))
  res.json({ ok: true, results })
})

app.get('/api/admin/products', auth, async (req, res) => {
  const q = String(req.query.q || '').trim()
  const params = []
  let where = ''
  if (q) { params.push(`%${q}%`); where = 'WHERE p.title ILIKE $1 OR p.slug ILIKE $1 OR p.brand ILIKE $1' }
  const result = await pool.query(`SELECT p.slug, p.title, p.brand, COUNT(o.*)::int AS offer_count, MIN(o.price) AS best_price, MAX(p.updated_at) AS updated_at FROM products p LEFT JOIN product_offers o ON o.product_slug = p.slug AND COALESCE(o.is_hidden, false) = false ${where} GROUP BY p.slug, p.title, p.brand ORDER BY p.updated_at DESC LIMIT 50`, params).catch(() => ({ rows: [] }))
  res.json({ items: result.rows.map((r) => ({ ...r, best_price: r.best_price != null ? Number(r.best_price) : null })) })
})
app.get('/api/admin/products/:slug/offers', auth, async (req, res) => {
  const product = await pool.query('SELECT slug, title, brand, category FROM products WHERE slug = $1 LIMIT 1', [req.params.slug]).catch(() => ({ rows: [] }))
  if (!product.rows.length) return res.status(404).json({ error: 'Produkt nicht gefunden' })
  const offers = await pool.query('SELECT id, shop_name, price, currency, product_url, affiliate_url, image_url, source_name, source_group, updated_at, is_hidden FROM product_offers WHERE product_slug = $1 ORDER BY price ASC, updated_at DESC', [req.params.slug]).catch(() => ({ rows: [] }))
  res.json({ product: product.rows[0], offers: offers.rows.map(normalizeOffer) })
})

app.post('/api/admin/products/:slug/offers', auth, async (_req, res) => res.status(410).json({ error: 'Legacy-Angebotsimport entfernt. Neue Daten laufen über AI-first Quellen und Canonical Index.' }))
app.put('/api/admin/products/:slug/offers/:offerId', auth, async (_req, res) => res.status(410).json({ error: 'Legacy-Override entfernt. Quellen-Tuning erfolgt über AI-Controls und Swiss Sources.' }))
app.get('/api/admin/shop-sources', auth, async (_req, res) => res.json({ items: [] }))
app.post('/api/admin/shop-sources/save', auth, async (_req, res) => res.status(410).json({ error: 'Legacy-Shop-Sources entfernt.' }))
app.get('/api/admin/crawl/jobs', auth, async (_req, res) => res.json({ items: [] }))
app.post('/api/admin/crawl/run', auth, async (_req, res) => res.status(410).json({ error: 'Legacy-Crawl-Steuerung entfernt. Backend arbeitet AI-first.' }))
app.get('/api/admin/discovery/queue', auth, async (_req, res) => res.json({ items: [] }))
app.post('/api/admin/discovery/run', auth, async (_req, res) => res.status(410).json({ error: 'Legacy-Discovery-Steuerung entfernt. Discovery wird über Quellenplanung vorbereitet.' }))

app.use(express.static(distDir))
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' })
  res.sendFile(path.join(distDir, 'index.html'))
})

ensureCoreSchema(pool)
  .then(() => app.listen(PORT, () => console.log(`kauvio webapp on ${PORT}`)))
  .catch((err) => {
    console.error('DB schema bootstrap failed:', err)
    process.exit(1)
  })
