import express from 'express'
import cors from 'cors'
import path from 'path'
import jwt from 'jsonwebtoken'
import { Pool } from 'pg'
import { fileURLToPath } from 'url'
import { ensureCoreSchema } from '../../database/ensure_schema.mjs'
import { normalizeDbUrl } from '../../database/normalize_db_url.mjs'
import { enqueueLiveSearchTask } from './ai_search_runtime.mjs'
import {
  fetchCanonicalProductBySlug,
  fetchCanonicalSearchResults,
  fetchCanonicalSuggestions,
  fetchHomeComparisons,
  fetchRelatedSuggestions,
  fetchSimilarCanonicalProducts,
  mergeSearchResults,
  resolveCanonicalRedirect,
} from './canonical_search_runtime.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')

const app = express()
app.use(cors())
app.use(express.json())

const PORT = Number(process.env.PORT || process.env.COOLIFY_CONTAINER_PORT || 3002)
const HOST = process.env.HOST || '0.0.0.0'
const JWT_SECRET = process.env.JWT_SECRET || 'replace_me_with_long_secret'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@kauvio.ch'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123'
const AFFILIATE_DEFAULT_TAG = process.env.AFFILIATE_DEFAULT_TAG || 'kauvio-default'

const DATABASE_URL = normalizeDbUrl(process.env.DATABASE_URL)
const pool = new Pool({ connectionString: DATABASE_URL })

function auth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'Nicht eingeloggt' })
  try { req.user = jwt.verify(token, JWT_SECRET); next() } catch { return res.status(401).json({ error: 'Ungültiger Token' }) }
}

function withAffiliate(url) {
  if (!url) return null
  if (/([?&](tag|ref|utm_source)=)/i.test(url)) return url
  try {
    const u = new URL(url)
    if (/amazon\./i.test(u.hostname)) { u.searchParams.set('tag', AFFILIATE_DEFAULT_TAG); return u.toString() }
    u.searchParams.set('utm_source', 'kauvio')
    return u.toString()
  } catch { return url }
}

function normalizeOffer(row) {
  const baseUrl = row.affiliate_url || row.product_url
  return { ...row, price: row.price != null ? Number(row.price) : null, affiliate_url: row.affiliate_url || null, is_hidden: !!row.is_hidden, redirect_url: withAffiliate(baseUrl) }
}
function publicTaskShape(task) { return { id: task.id, query: task.query, status: task.status, strategy: task.strategy, userVisibleNote: task.user_visible_note || 'Wir bereiten gerade Live-Ergebnisse aus Schweizer Quellen auf.', resultCount: task.result_count || 0 } }
async function dbCount(sql) { try { const r = await pool.query(sql); return Number(r.rows?.[0]?.c || 0) } catch { return 0 } }
async function buildSystemHealth() {
  const checks = {}
  const add = async (name, sql) => { try { const r = await pool.query(sql); checks[name] = { ok: true, count: Number(r.rows?.[0]?.c || 0) } } catch (err) { checks[name] = { ok: false, error: String(err.message || err) } } }
  await add('canonical_products', 'SELECT COUNT(*)::int AS c FROM canonical_products')
  await add('source_offers_v2', 'SELECT COUNT(*)::int AS c FROM source_offers_v2')
  await add('search_tasks', 'SELECT COUNT(*)::int AS c FROM search_tasks')
  await add('swiss_sources', 'SELECT COUNT(*)::int AS c FROM swiss_sources')
  await add('web_discovery_results', 'SELECT COUNT(*)::int AS c FROM web_discovery_results')
  await add('ai_seed_candidates', 'SELECT COUNT(*)::int AS c FROM ai_seed_candidates')
  return checks
}
async function getAiControls() { const result = await pool.query(`SELECT control_key, is_enabled, control_value_json, description, updated_by, updated_at FROM ai_runtime_controls ORDER BY control_key ASC`).catch(() => ({ rows: [] })); return result.rows }
async function getSwissSourcesAdmin() { const result = await pool.query(`SELECT source_key, display_name, provider_kind, source_kind, country_code, language_code, base_url, priority, confidence_score, refresh_interval_minutes, is_active, source_size, is_small_shop, discovery_weight, runtime_score, manual_boost, last_runtime_status, last_runtime_error, last_runtime_at, categories_json, notes, auto_discovered, shop_domain, updated_at FROM swiss_sources ORDER BY priority DESC, confidence_score DESC, display_name ASC`).catch(() => ({ rows: [] })); return result.rows }
async function logAiRuntimeEvent(eventType, sourceKey, severity = 'info', payload = {}, createdBy = 'system') { await pool.query(`INSERT INTO ai_runtime_events(event_type, source_key, severity, event_payload_json, created_by, created_at) VALUES ($1,$2,$3,$4,$5,NOW())`, [eventType, sourceKey || null, severity, JSON.stringify(payload || {}), createdBy]).catch(() => {}) }

app.get('/api/health', async (_req, res) => {
  let dbOk = false
  try { await pool.query('SELECT 1'); dbOk = true } catch {}
  res.status(200).json({ ok: true, service: 'webapp', dbOk, port: PORT, host: HOST })
})

app.post('/api/ai/search/start', async (req, res) => { const query = String(req.body?.query || '').trim(); if (!query) return res.status(400).json({ error: 'Bitte einen Suchbegriff angeben.' }); const task = await enqueueLiveSearchTask(pool, query, 'public_manual_start').catch(() => null); if (!task) return res.status(500).json({ error: 'KI-Suche konnte nicht gestartet werden.' }); await logAiRuntimeEvent('public_start_ai_search', null, 'info', { query, taskId: task.id }, 'public'); res.json({ ok: true, task: publicTaskShape(task) }) })
app.post('/api/admin/login', (req, res) => { const { email, password } = req.body || {}; if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Login fehlgeschlagen. Prüfe E-Mail und Passwort.' }); const token = jwt.sign({ email, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' }); res.json({ token, user: { email, role: 'admin' } }) })
app.get('/api/products/suggest', async (req, res) => { const q = String(req.query.q || '').trim(); const items = await fetchCanonicalSuggestions(pool, q, 8).catch(() => []); res.json({ items }) })
app.get('/api/search/related', async (req, res) => { const q = String(req.query.q || '').trim(); const results = await fetchCanonicalSearchResults(pool, q, 1).catch(() => []); const best = results[0] || null; const similarItems = best?.canonical_id ? await fetchSimilarCanonicalProducts(pool, best.canonical_id, 6).catch(() => []) : []; const suggestions = await fetchRelatedSuggestions(pool, q, 8).catch(() => []); res.json({ best, similarItems, suggestions }) })
app.get('/api/products', async (req, res) => {
  const q = String(req.query.q || '').trim(); const requestedLimit = Number(req.query.limit || (q ? 24 : 6)); const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, q ? 48 : 6)) : (q ? 24 : 6)
  if (!q) { const items = await fetchHomeComparisons(pool, 6).catch(() => []); return res.json({ items, liveSearch: null, similarItems: [], suggestions: [] }) }
  const canonicalItems = await fetchCanonicalSearchResults(pool, q, limit).catch(() => []); const items = mergeSearchResults([], canonicalItems, limit); let liveSearch = null
  if (q && items.length === 0) liveSearch = await enqueueLiveSearchTask(pool, q, 'public_search').catch(() => null)
  const best = items[0] || null; const similarItems = best?.canonical_id ? await fetchSimilarCanonicalProducts(pool, best.canonical_id, 6).catch(() => []) : []; const suggestions = await fetchRelatedSuggestions(pool, q, 8).catch(() => [])
  await pool.query('INSERT INTO search_logs(query, result_count) VALUES ($1,$2)', [q, items.length]).catch(() => {})
  res.json({ items, liveSearch: liveSearch ? publicTaskShape(liveSearch) : null, similarItems, suggestions })
})
app.get('/api/products/:slug', async (req, res) => {
  const canonical = await fetchCanonicalProductBySlug(pool, req.params.slug).catch(() => null); if (canonical) return res.json(canonical)
  const product = await pool.query('SELECT * FROM products WHERE slug = $1 LIMIT 1', [req.params.slug]).catch(() => ({ rows: [] })); if (!product.rows.length) return res.status(404).json({ error: 'Produkt nicht gefunden' })
  const offers = await pool.query('SELECT shop_name, price, currency, product_url, affiliate_url, image_url, updated_at, is_hidden FROM product_offers WHERE product_slug = $1 AND COALESCE(is_hidden, false) = false ORDER BY price ASC, updated_at DESC', [req.params.slug]).catch(() => ({ rows: [] }))
  const enrichedOffers = offers.rows.map(normalizeOffer); const cheapest = enrichedOffers[0] || null
  res.json({ ...product.rows[0], price: cheapest ? Number(cheapest.price) : product.rows[0].price, shop_name: cheapest?.shop_name || product.rows[0].shop_name, product_url: cheapest?.product_url || product.rows[0].product_url, redirect_url: cheapest?.redirect_url || withAffiliate(product.rows[0].product_url), offers: enrichedOffers, similarItems: [], suggestions: await fetchRelatedSuggestions(pool, product.rows[0].title || '', 8).catch(() => []) })
})
app.get('/r/:slug/:shop?', async (req, res) => { const { slug, shop } = req.params; const canonicalTarget = await resolveCanonicalRedirect(pool, slug, shop).catch(() => null); if (canonicalTarget?.target_url) { const target = withAffiliate(canonicalTarget.target_url); await pool.query(`INSERT INTO outbound_clicks(product_slug, shop_name, target_url, ip_address, user_agent, referer) VALUES ($1,$2,$3,$4,$5,$6)`, [slug, canonicalTarget.shop_name || null, target, req.socket?.remoteAddress || null, req.headers['user-agent'] || null, req.headers.referer || req.headers.referrer || null]).catch(() => {}); return res.redirect(target) } return res.status(404).send('Ziel nicht gefunden') })
app.get('/api/admin/dashboard', auth, async (_req, res) => { const stats = { searchTasks: await dbCount('SELECT COUNT(*)::int AS c FROM search_tasks'), autonomousSeeds: await dbCount('SELECT COUNT(*)::int AS c FROM ai_seed_candidates'), learnedQueries: await dbCount('SELECT COUNT(*)::int AS c FROM ai_query_memory'), openWebPages: await dbCount('SELECT COUNT(*)::int AS c FROM web_discovery_results') }; res.json({ stats }) })
app.get('/api/admin/system-health', auth, async (_req, res) => res.json({ ok: true, checks: await buildSystemHealth() }))
app.post('/api/admin/ai/search/start', auth, async (req, res) => { const query = String(req.body?.query || '').trim(); if (!query) return res.status(400).json({ error: 'Bitte einen Suchbegriff angeben.' }); const task = await enqueueLiveSearchTask(pool, query, req.user?.email || 'admin_manual_start').catch(() => null); if (!task) return res.status(500).json({ error: 'KI-Suche konnte nicht gestartet werden.' }); await logAiRuntimeEvent('admin_start_ai_search', null, 'info', { query, taskId: task.id }, req.user?.email || 'admin'); res.json({ ok: true, task: publicTaskShape(task) }) })
app.get('/api/admin/search-tasks', auth, async (_req, res) => { const result = await pool.query(`SELECT st.id, st.query, st.status, st.strategy, st.user_visible_note, st.result_count, st.discovered_count, st.imported_count, st.error_message, st.created_at, COUNT(ss.*)::int AS source_count FROM search_tasks st LEFT JOIN search_task_sources ss ON ss.search_task_id = st.id GROUP BY st.id ORDER BY st.created_at DESC LIMIT 40`).catch(() => ({ rows: [] })); res.json({ items: result.rows }) })
app.get('/api/admin/search-requests', auth, async (_req, res) => { const items = await pool.query(`SELECT id, query, email, status, eta_minutes, result_count, latest_task_id, updated_at, completed_at FROM search_requests ORDER BY updated_at DESC LIMIT 40`).catch(() => ({ rows: [] })); res.json({ items: items.rows }) })
app.get('/api/admin/web-discovery-results', auth, async (_req, res) => { const items = await pool.query(`SELECT id, query, source_domain, page_url, result_title, result_rank, discovered_shop, discovered_product, updated_at FROM web_discovery_results ORDER BY updated_at DESC LIMIT 40`).catch(() => ({ rows: [] })); res.json({ items: items.rows }) })
app.get('/api/admin/ai/controls', auth, async (_req, res) => res.json({ items: await getAiControls() }))
app.get('/api/admin/swiss-sources', auth, async (_req, res) => res.json({ items: await getSwissSourcesAdmin() }))

app.use(express.static(distDir))
app.get('*', (req, res) => { if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' }); res.sendFile(path.join(distDir, 'index.html')) })

ensureCoreSchema(pool)
  .then(() => app.listen(PORT, HOST, () => console.log(`kauvio webapp listening on ${HOST}:${PORT}`)))
  .catch((err) => { console.error('DB schema bootstrap failed:', err); process.exit(1) })
