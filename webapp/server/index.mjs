import express from 'express'
import cors from 'cors'
import path from 'path'
import jwt from 'jsonwebtoken'
import { Pool } from 'pg'
import { fileURLToPath } from 'url'
import { ensureCoreSchema } from '../../database/ensure_schema.mjs'

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

function normalizeDbUrl(raw) {
  const fallback = `postgresql://${process.env.POSTGRES_USER || 'kauvio'}:${process.env.POSTGRES_PASSWORD || 'replace_me'}@postgres:5432/${process.env.POSTGRES_DB || 'kauvio'}`
  const input = String(raw || fallback).trim()
  try {
    const url = new URL(input)
    if (!url.hostname || ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
      url.hostname = process.env.POSTGRES_HOST || 'postgres'
    }
    if (!url.port) {
      url.port = String(process.env.POSTGRES_PORT || 5432)
    }
    return url.toString()
  } catch {
    return fallback
  }
}

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


function normalizeSourceName(input) {
  const value = String(input || '').trim().toLowerCase()
  if (['digitec', 'galaxus', 'brack', 'interdiscount', 'all'].includes(value)) return value
  return null
}

function normalizeCrawlMode(input) {
  return String(input || 'fast').trim().toLowerCase() === 'full' ? 'full' : 'fast'
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




function parseStartUrls(input = '') {
  return String(input || '')
    .split(/[\n,]+/)
    .map(x => x.trim())
    .filter(Boolean)
    .filter(x => /^https?:\/\//i.test(x))
}

function guessPageType(url = '') {
  const value = String(url).toLowerCase()
  if (/product|\/p\/|\/product\//.test(value)) return 'product'
  if (/category|toplist|notebook|smartphone|headphones|tv|audio/.test(value)) return 'category'
  return 'unknown'
}

async function enqueueDiscoveryLinksForSource(source) {
  const urls = parseStartUrls(source.start_urls || source.base_url || '')
  const added = []
  for (const url of urls) {
    const pageType = guessPageType(url)
    const result = await pool.query(
      `INSERT INTO shop_discovery_queue(source_name, source_group, page_url, page_type, status, discovered_from, notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'pending',$5,$6,NOW(),NOW())
       ON CONFLICT (source_name, page_url)
       DO UPDATE SET updated_at = NOW()
       RETURNING id, source_name, source_group, page_url, page_type, status`,
      [source.source_name, source.source_group || null, url, pageType, source.base_url || null, 'Seeded from shop source']
    )
    added.push(result.rows[0])
  }
  return added
}

function buildAssistantPlan(message = '') {
  const text = String(message || '').toLowerCase().trim()
  if (!text) return { summary: 'Keine Eingabe', actions: [] }

  const actions = []
  if (/(starte|start|run).*(crawl|crawler|import)/.test(text)) {
    let source_name = 'all'
    if (text.includes('digitec')) source_name = 'digitec'
    if (text.includes('galaxus')) source_name = 'galaxus'
    if (text.includes('brack')) source_name = 'brack'
    if (text.includes('interdiscount')) source_name = 'interdiscount'
    const mode = text.includes('full') ? 'full' : 'fast'
    actions.push({ type: 'run_crawl', source_name, mode })
  }

  if (/(finde|suche|zeige).*(duplikat|doppelt|merge)/.test(text)) {
    actions.push({ type: 'scan_duplicates' })
  }

  if (/(check|prüf|pruef|status|health|fehler|problem).*(system|backend|crawl|shop|admin)/.test(text)) {
    actions.push({ type: 'scan_system_health' })
  }

  if (/(fix|beheb|reparier|stabilisiere).*(crawl|crawler)/.test(text)) {
    actions.push({ type: 'run_crawl', source_name: 'all', mode: 'fast' })
    actions.push({ type: 'scan_system_health' })
  }

  if (/(discovery|discover|start-links|start links|shop suchen|shop scan)/.test(text)) {
    let source_name = 'all'
    if (text.includes('digitec')) source_name = 'digitec'
    if (text.includes('galaxus')) source_name = 'galaxus'
    if (text.includes('brack')) source_name = 'brack'
    if (text.includes('interdiscount')) source_name = 'interdiscount'
    actions.push({ type: 'run_discovery', source_name })
  }

  if (/(deaktivier|deaktiviere|disable).*(shop|quelle)/.test(text)) {
    const known = ['digitec', 'galaxus', 'brack', 'interdiscount']
    const source_name = known.find(x => text.includes(x))
    if (source_name) actions.push({ type: 'set_shop_active', source_name, is_active: false })
  }

  if (/(aktivier|aktiviere|enable).*(shop|quelle)/.test(text)) {
    const known = ['digitec', 'galaxus', 'brack', 'interdiscount']
    const source_name = known.find(x => text.includes(x))
    if (source_name) actions.push({ type: 'set_shop_active', source_name, is_active: true })
  }

  return {
    summary: actions.length ? 'Vorgeschlagene sichere Backend-Aktionen erkannt.' : 'Keine sichere Aktion erkannt. Formuliere z. B. „Starte Digitec Fast Crawl“ oder „Finde Duplikate“.',
    actions
  }
}

async function executeAssistantAction(action, requestedBy = 'admin') {
  if (action.type === 'run_crawl') {
    const inserted = await pool.query(
      `INSERT INTO crawl_jobs(source_name, mode, status, requested_by)
       VALUES ($1,$2,'pending',$3)
       RETURNING id, source_name, mode, status, requested_by, requested_at`,
      [action.source_name || 'all', action.mode || 'fast', requestedBy]
    )
    return { ok: true, type: action.type, job: inserted.rows[0] }
  }

  if (action.type === 'run_discovery') {
    let query = `SELECT source_name, source_group, display_name, base_url, start_urls FROM admin_shop_sources WHERE is_active = true`
    const params = []
    if (action.source_name && action.source_name !== 'all') {
      query += ` AND source_name = $1`
      params.push(action.source_name)
    }
    const result = await pool.query(query, params)
    const items = []
    for (const source of result.rows) {
      const added = await enqueueDiscoveryLinksForSource(source)
      items.push({ source_name: source.source_name, queued: added.length })
    }
    return { ok: true, type: action.type, queued: items }
  }

  if (action.type === 'scan_duplicates') {
    const rows = await pool.query(`SELECT slug, title, brand, category FROM products ORDER BY updated_at DESC LIMIT 120`)
    const items = rows.rows
    const found = []
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]
        const b = items[j]
        const score = scoreProductSimilarity(a, b)
        if (score >= 0.62) found.push({ left: a.slug, right: b.slug, score: Number(score.toFixed(2)) })
      }
    }
    return { ok: true, type: action.type, matches: found.slice(0, 40) }
  }

  if (action.type === 'set_shop_active') {
    const updated = await pool.query(
      `UPDATE admin_shop_sources SET is_active = $1, updated_at = NOW() WHERE source_name = $2 RETURNING source_name, display_name, is_active`,
      [action.is_active === false ? false : true, action.source_name]
    )
    return { ok: true, type: action.type, item: updated.rows[0] || null }
  }

  if (action.type === 'scan_system_health') {
    const checks = {}
    const countSafe = async (name, sql) => {
      try {
        const r = await pool.query(sql)
        checks[name] = { ok: true, count: Number(r.rows?.[0]?.c || 0) }
      } catch (err) {
        checks[name] = { ok: false, error: String(err.message || err) }
      }
    }
    await countSafe('products', 'SELECT COUNT(*)::int as c FROM products')
    await countSafe('offers', 'SELECT COUNT(*)::int as c FROM product_offers')
    await countSafe('crawl_jobs', 'SELECT COUNT(*)::int as c FROM crawl_jobs')
    await countSafe('discovery_queue', 'SELECT COUNT(*)::int as c FROM shop_discovery_queue')
    await countSafe('monitoring_events', 'SELECT COUNT(*)::int as c FROM monitoring_events')
    return { ok: true, type: action.type, checks }
  }

  return { ok: false, type: action.type, error: 'Unbekannte Aktion' }
}


function normalizeTextForMatch(input = '') {
  return String(input || '')
    .toLowerCase()
    .replace(/galaxy/g, 'galaxy')
    .replace(/iphone/g, 'iphone')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(5g|lte|wifi|wi fi|dual sim|esim|nano sim|smartphone|handy|notebook|laptop|kopfhörer|headphones|bluetooth|apple|samsung)\b/g, ' ')
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
  if ((a.brand || '').toLowerCase() && (a.brand || '').toLowerCase() === (b.brand || '').toLowerCase()) score += 0.15
  return Math.min(1, score)
}

async function loadProductBasic(slug) {
  const result = await pool.query('SELECT slug, title, brand, category FROM products WHERE slug = $1 LIMIT 1', [slug])
  return result.rows[0] || null
}


function normalizeShopPayload(body = {}) {
  const shop_name = String(body.shop_name || '').trim()
  const source_name = String(body.source_name || '').trim().toLowerCase()
  const source_group = String(body.source_group || '').trim().toLowerCase() || null
  const product_url = String(body.product_url || '').trim() || null
  const affiliate_url = String(body.affiliate_url || '').trim() || null
  const currency = String(body.currency || 'CHF').trim().toUpperCase() || 'CHF'
  const image_url = String(body.image_url || '').trim() || null
  const price = Number(body.price)
  if (!shop_name) return { error: 'Shop-Name fehlt.' }
  if (!Number.isFinite(price) || price <= 0) return { error: 'Preis ist ungültig.' }
  return {
    shop_name,
    source_name: source_name || null,
    source_group,
    product_url,
    affiliate_url,
    currency,
    image_url,
    price
  }
}

function normalizeOffer(row) {
  const baseUrl = row.affiliate_url || row.product_url
  return {
    ...row,
    price: row.price != null ? Number(row.price) : null,
    affiliate_url: row.affiliate_url || null,
    is_hidden: !!row.is_hidden,
    redirect_url: withAffiliate(baseUrl)
  }
}

app.get('/api/health', async (_req, res) => {
  const db = await pool.query('SELECT NOW() as now')
  res.json({ ok: true, service: 'webapp', dbTime: db.rows[0].now })
})

app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body || {}
  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Login fehlgeschlagen. Prüfe E-Mail und Passwort.' })
  }
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

  const sql = `
    SELECT
      p.slug, p.title, p.brand, p.category, p.ai_summary, p.deal_score,
      MIN(o.price) AS price,
      (ARRAY_AGG(o.shop_name ORDER BY o.price ASC, o.updated_at DESC))[1] AS shop_name,
      COUNT(*)::int AS offer_count,
      MAX(p.updated_at) AS updated_at
    FROM products p
    JOIN product_offers o ON o.product_slug = p.slug AND COALESCE(o.is_hidden, false) = false
    ${where}
    GROUP BY p.slug, p.title, p.brand, p.category, p.ai_summary, p.deal_score
    ORDER BY updated_at DESC, price ASC NULLS LAST
    LIMIT 100
  `
  const result = await pool.query(sql, params)
  await pool.query('INSERT INTO search_logs(query, result_count) VALUES ($1,$2)', [q, result.rows.length])
  res.json({ items: result.rows.map(r => ({
    ...r,
    price: Number(r.price),
    decision: r.deal_score >= 88 ? { label: 'Jetzt kaufen' } : r.deal_score >= 78 ? { label: 'Guter Kauf' } : { label: 'Live Preis' }
  })) })
})

app.get('/api/products/:slug', async (req, res) => {
  const product = await pool.query('SELECT * FROM products WHERE slug = $1 LIMIT 1', [req.params.slug])
  if (!product.rows.length) return res.status(404).json({ error: 'Produkt nicht gefunden' })

  const offers = await pool.query(
    'SELECT shop_name, price, currency, product_url, affiliate_url, image_url, updated_at, is_hidden FROM product_offers WHERE product_slug = $1 AND COALESCE(is_hidden, false) = false ORDER BY price ASC, updated_at DESC',
    [req.params.slug]
  )

  const ai = await fetch(`${AI_SERVICE_URL}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product.rows[0])
  }).then(r => r.json()).catch(() => ({}))

  const enrichedOffers = offers.rows.map(normalizeOffer)
  const cheapest = enrichedOffers[0] || null

  res.json({
    ...product.rows[0],
    price: cheapest ? Number(cheapest.price) : product.rows[0].price,
    shop_name: cheapest?.shop_name || product.rows[0].shop_name,
    product_url: cheapest?.product_url || product.rows[0].product_url,
    redirect_url: cheapest?.redirect_url || withAffiliate(product.rows[0].product_url),
    decision: ai.evaluation || null,
    offers: enrichedOffers
  })
})

app.post('/api/alerts', async (req, res) => {
  const { email, productSlug, targetPrice } = req.body || {}
  if (!email || !productSlug || !targetPrice) return res.status(400).json({ error: 'Bitte E-Mail, Produkt und Zielpreis angeben.' })
  await pool.query('INSERT INTO alerts(email, product_slug, target_price) VALUES ($1,$2,$3)', [email, productSlug, targetPrice])
  res.json({ ok: true })
})

app.get('/r/:slug/:shop?', async (req, res) => {
  const { slug, shop } = req.params
  let row
  if (shop) {
    row = await pool.query('SELECT shop_name, product_url, affiliate_url FROM product_offers WHERE product_slug = $1 AND LOWER(shop_name) = LOWER($2) AND COALESCE(is_hidden, false) = false LIMIT 1', [slug, shop])
  }
  if (!row?.rows?.length) {
    row = await pool.query('SELECT shop_name, product_url, affiliate_url FROM product_offers WHERE product_slug = $1 AND COALESCE(is_hidden, false) = false ORDER BY price ASC, updated_at DESC LIMIT 1', [slug])
  }
  const chosen = row.rows[0] || null
  if (!chosen || !(chosen.affiliate_url || chosen.product_url)) return res.status(404).send('Ziel nicht gefunden')
  const target = withAffiliate(chosen.affiliate_url || chosen.product_url)
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null
  const ipAddress = forwardedFor || req.socket?.remoteAddress || null
  const userAgent = req.headers['user-agent'] || null
  const referer = req.headers.referer || req.headers.referrer || null
  try {
    await pool.query(
      `INSERT INTO outbound_clicks(product_slug, shop_name, target_url, ip_address, user_agent, referer)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [slug, chosen.shop_name || null, target, ipAddress, userAgent, referer]
    )
  } catch (err) {
    console.error('redirect click tracking failed', err)
  }
  res.redirect(target)
})

app.get('/api/admin/clicks', auth, async (_req, res) => {
  const totals = await pool.query('SELECT COUNT(*)::int AS total_clicks FROM outbound_clicks')
  const last24h = await pool.query("SELECT COUNT(*)::int AS clicks_24h FROM outbound_clicks WHERE created_at >= NOW() - INTERVAL '24 hours'")
  const topProducts = await pool.query(`
    SELECT oc.product_slug, COALESCE(p.title, oc.product_slug) AS title, COUNT(*)::int AS clicks
    FROM outbound_clicks oc
    LEFT JOIN products p ON p.slug = oc.product_slug
    GROUP BY oc.product_slug, p.title
    ORDER BY clicks DESC, title ASC
    LIMIT 10
  `)
  const topShops = await pool.query(`
    SELECT COALESCE(shop_name, 'Unbekannt') AS shop_name, COUNT(*)::int AS clicks
    FROM outbound_clicks
    GROUP BY COALESCE(shop_name, 'Unbekannt')
    ORDER BY clicks DESC, shop_name ASC
    LIMIT 10
  `)
  const recent = await pool.query(`
    SELECT oc.product_slug, COALESCE(p.title, oc.product_slug) AS title, COALESCE(oc.shop_name, 'Unbekannt') AS shop_name, oc.created_at
    FROM outbound_clicks oc
    LEFT JOIN products p ON p.slug = oc.product_slug
    ORDER BY oc.created_at DESC
    LIMIT 20
  `)
  res.json({
    stats: {
      total_clicks: totals.rows[0]?.total_clicks || 0,
      clicks_24h: last24h.rows[0]?.clicks_24h || 0
    },
    topProducts: topProducts.rows,
    topShops: topShops.rows,
    recent: recent.rows
  })
})


app.get('/api/admin/crawl/jobs', auth, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, source_name, mode, status, requested_by, requested_at, started_at, finished_at, error_message
      FROM crawl_jobs
      ORDER BY requested_at DESC
      LIMIT 20
    `)
    res.json({ items: result.rows })
  } catch {
    res.json({ items: [] })
  }
})

app.post('/api/admin/crawl/run', auth, async (req, res) => {
  const sourceName = normalizeSourceName(req.body?.source_name)
  const mode = normalizeCrawlMode(req.body?.mode)
  if (!sourceName) return res.status(400).json({ error: 'Ungültige Quelle' })

  try {
    const inserted = await pool.query(
      `INSERT INTO crawl_jobs(source_name, mode, status, requested_by)
       VALUES ($1,$2,'pending',$3)
       RETURNING id, source_name, mode, status, requested_by, requested_at`,
      [sourceName, mode, req.user?.email || 'admin']
    )
    res.json({ ok: true, job: inserted.rows[0] })
  } catch (err) {
    const msg = String(err.message || err)
    if (/crawl_jobs/i.test(msg)) {
      return res.status(500).json({ error: 'Crawl-Job konnte nicht angelegt werden. Datenbank-Tabelle crawl_jobs fehlt. Bitte DB/Migrationen prüfen.' })
    }
    res.status(500).json({ error: `Crawl-Job konnte nicht angelegt werden: ${msg}` })
  }
})

app.get('/api/admin/products', auth, async (req, res) => {
  const q = String(req.query.q || '').trim()
  const params = []
  let where = ''
  if (q) {
    params.push(`%${q}%`)
    where = 'WHERE p.title ILIKE $1 OR p.slug ILIKE $1 OR p.brand ILIKE $1'
  }
  const result = await pool.query(`
    SELECT p.slug, p.title, p.brand,
      COUNT(o.*)::int AS offer_count,
      MIN(o.price) AS best_price,
      MAX(p.updated_at) AS updated_at
    FROM products p
    LEFT JOIN product_offers o ON o.product_slug = p.slug AND COALESCE(o.is_hidden, false) = false
    ${where}
    GROUP BY p.slug, p.title, p.brand
    ORDER BY p.updated_at DESC
    LIMIT 50
  `, params)
  res.json({ items: result.rows.map(r => ({ ...r, best_price: r.best_price != null ? Number(r.best_price) : null })) })
})

app.get('/api/admin/products/:slug/offers', auth, async (req, res) => {
  const product = await pool.query('SELECT slug, title, brand, category FROM products WHERE slug = $1 LIMIT 1', [req.params.slug])
  if (!product.rows.length) return res.status(404).json({ error: 'Produkt nicht gefunden' })
  const offers = await pool.query(
    'SELECT id, shop_name, price, currency, product_url, affiliate_url, image_url, source_name, source_group, updated_at, is_hidden FROM product_offers WHERE product_slug = $1 ORDER BY price ASC, updated_at DESC',
    [req.params.slug]
  )
  res.json({ product: product.rows[0], offers: offers.rows.map(normalizeOffer) })
})



app.post('/api/admin/discovery/run', auth, async (req, res) => {
  const sourceName = String(req.body?.source_name || 'all').trim().toLowerCase()
  try {
    let query = `SELECT source_name, source_group, display_name, base_url, start_urls FROM admin_shopSources WHERE is_active = true`
    query = query.replace('admin_shopSources','admin_shop_sources')
    const params = []
    if (sourceName && sourceName !== 'all') {
      query += ` AND source_name = $1`
      params.push(sourceName)
    }
    const result = await pool.query(query, params)
    const queued = []
    for (const source of result.rows) {
      const added = await enqueueDiscoveryLinksForSource(source)
      queued.push({ source_name: source.source_name, added: added.length })
    }
    res.json({ ok: true, queued })
  } catch (err) {
    res.status(500).json({ error: 'Discovery konnte nicht gestartet werden.' })
  }
})

app.get('/api/admin/discovery/queue', auth, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, source_name, source_group, page_url, page_type, status, discovered_from, notes, created_at, updated_at, last_error
      FROM shop_discovery_queue
      ORDER BY updated_at DESC
      LIMIT 100
    `)
    res.json({ items: result.rows })
  } catch {
    res.json({ items: [] })
  }
})


app.get('/api/admin/system-health', auth, async (_req, res) => {
  const checks = {}
  const countSafe = async (name, sql) => {
    try {
      const r = await pool.query(sql)
      checks[name] = { ok: true, count: Number(r.rows?.[0]?.c || 0) }
    } catch (err) {
      checks[name] = { ok: false, error: String(err.message || err) }
    }
  }
  await countSafe('products', 'SELECT COUNT(*)::int as c FROM products')
  await countSafe('offers', 'SELECT COUNT(*)::int as c FROM product_offers')
  await countSafe('crawl_jobs', 'SELECT COUNT(*)::int as c FROM crawl_jobs')
  await countSafe('discovery_queue', 'SELECT COUNT(*)::int as c FROM shop_discovery_queue')
  await countSafe('monitoring_events', 'SELECT COUNT(*)::int as c FROM monitoring_events')
  res.json({ ok: true, checks })
})

app.post('/api/admin/assistant/plan', auth, async (req, res) => {
  const message = String(req.body?.message || '')
  const plan = buildAssistantPlan(message)
  try {
    await pool.query(
      `INSERT INTO ai_action_log(action_name, status, payload_json, requested_by, created_at)
       VALUES ($1,'planned',$2,$3,NOW())`,
      ['assistant_plan', JSON.stringify({ message, plan }), req.user?.email || 'admin']
    ).catch(() => {})
  } catch {}
  res.json(plan)
})

app.post('/api/admin/assistant/execute', auth, async (req, res) => {
  const actions = Array.isArray(req.body?.actions) ? req.body.actions : []
  const results = []
  for (const action of actions) {
    const result = await executeAssistantAction(action, req.user?.email || 'admin')
    results.push(result)
  }
  try {
    await pool.query(
      `INSERT INTO ai_action_log(action_name, status, payload_json, result_json, requested_by, created_at)
       VALUES ($1,'executed',$2,$3,$4,NOW())`,
      ['assistant_execute', JSON.stringify({ actions }), JSON.stringify(results), req.user?.email || 'admin']
    ).catch(() => {})
  } catch {}
  res.json({ ok: true, results })
})

app.get('/api/admin/shop-sources', auth, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT source_name, source_group, display_name, is_active, base_url, start_urls, discovery_notes
      FROM admin_shop_sources
      ORDER BY display_name ASC
    `)
    res.json({ items: result.rows })
  } catch {
    res.json({
      items: [
        { source_name: 'digitec', source_group: 'dg_group', display_name: 'Digitec', is_active: true },
        { source_name: 'galaxus', source_group: 'dg_group', display_name: 'Galaxus', is_active: true },
        { source_name: 'brack', source_group: 'brack', display_name: 'BRACK', is_active: true },
        { source_name: 'interdiscount', source_group: 'interdiscount', display_name: 'Interdiscount', is_active: true }
      ]
    })
  }
})



app.put('/api/admin/shop-sources/:sourceName', auth, async (req, res) => {
  const source_name = String(req.params.sourceName || '').trim().toLowerCase()
  const display_name = String(req.body?.display_name || '').trim()
  const source_group = String(req.body?.source_group || '').trim().toLowerCase() || null
  const base_url = String(req.body?.base_url || '').trim() || null
  const start_urls = String(req.body?.start_urls || '').trim() || null
  const discovery_notes = String(req.body?.discovery_notes || '').trim() || null
  const is_active = req.body?.is_active === false ? false : true

  try {
    const result = await pool.query(
      `UPDATE admin_shop_sources
       SET display_name = COALESCE(NULLIF($1, ''), display_name),
           source_group = $2,
           base_url = $3,
           start_urls = $4,
           discovery_notes = $5,
           is_active = $6,
           updated_at = NOW()
       WHERE source_name = $7
       RETURNING source_name, source_group, display_name, is_active, base_url, start_urls, discovery_notes`,
      [display_name || null, source_group, base_url, start_urls, discovery_notes, is_active, source_name]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Shop-Quelle nicht gefunden.' })
    res.json({ ok: true, item: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: `Shop-Quelle konnte nicht geändert werden: ${String(err.message || err)}` })
  }
})

app.delete('/api/admin/shop-sources/:sourceName', auth, async (req, res) => {
  const source_name = String(req.params.sourceName || '').trim().toLowerCase()
  try {
    await pool.query('DELETE FROM admin_shop_sources WHERE source_name = $1', [source_name])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: `Shop-Quelle konnte nicht gelöscht werden: ${String(err.message || err)}` })
  }
})

app.post('/api/admin/shop-sources/save', auth, async (req, res) => {
  const source_name = String(req.body?.source_name || '').trim().toLowerCase()
  const display_name = String(req.body?.display_name || '').trim()
  if (!source_name || !display_name) return res.status(400).json({ error: 'Quelle und Anzeigename sind Pflicht.' })

  const source_group = String(req.body?.source_group || '').trim().toLowerCase() || null
  const base_url = String(req.body?.base_url || '').trim() || null
  const start_urls = String(req.body?.start_urls || '').trim() || null
  const discovery_notes = String(req.body?.discovery_notes || '').trim() || null
  const is_active = req.body?.is_active === false ? false : true

  try {
    const result = await pool.query(
      `INSERT INTO admin_shop_sources(source_name, source_group, display_name, is_active, base_url, start_urls, discovery_notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
       ON CONFLICT (source_name)
       DO UPDATE SET
         source_group = EXCLUDED.source_group,
         display_name = EXCLUDED.display_name,
         is_active = EXCLUDED.is_active,
         base_url = EXCLUDED.base_url,
         start_urls = EXCLUDED.start_urls,
         discovery_notes = EXCLUDED.discovery_notes,
         updated_at = NOW()
       RETURNING source_name, source_group, display_name, is_active, base_url, start_urls, discovery_notes`,
      [source_name, source_group, display_name, is_active, base_url, start_urls, discovery_notes]
    )
    res.json({ ok: true, item: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: `Shop-Quelle konnte nicht gespeichert werden: ${String(err.message || err)}` })
  }
})

app.get('/api/admin/merge-candidates', auth, async (req, res) => {
  const q = String(req.query.q || '').trim()
  const rows = await pool.query(`
    SELECT slug, title, brand, category
    FROM products
    ${q ? "WHERE title ILIKE $1 OR brand ILIKE $1" : ""}
    ORDER BY updated_at DESC
    LIMIT 120
  `, q ? [`%${q}%`] : [])
  const items = rows.rows
  const candidates = []
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]
      const b = items[j]
      const score = scoreProductSimilarity(a, b)
      if (score >= 0.62) {
        candidates.push({ left: a, right: b, score: Number(score.toFixed(2)) })
      }
    }
  }
  candidates.sort((x, y) => y.score - x.score)
  res.json({ items: candidates.slice(0, 40) })
})

app.post('/api/admin/products/merge', auth, async (req, res) => {
  const sourceSlug = String(req.body?.source_slug || '').trim()
  const targetSlug = String(req.body?.target_slug || '').trim()
  if (!sourceSlug || !targetSlug || sourceSlug === targetSlug) return res.status(400).json({ error: 'Ungültige Merge-Auswahl.' })

  const source = await loadProductBasic(sourceSlug)
  const target = await loadProductBasic(targetSlug)
  if (!source || !target) return res.status(404).json({ error: 'Produkt nicht gefunden.' })

  try {
    await pool.query('BEGIN')
    await pool.query('UPDATE product_offers SET product_slug = $1, updated_at = NOW() WHERE product_slug = $2', [targetSlug, sourceSlug])
    await pool.query('UPDATE alerts SET product_slug = $1 WHERE product_slug = $2', [targetSlug, sourceSlug]).catch(() => {})
    await pool.query('INSERT INTO product_merge_log(source_slug, target_slug, merged_by) VALUES ($1,$2,$3)', [sourceSlug, targetSlug, req.user?.email || 'admin'])
    await pool.query('DELETE FROM products WHERE slug = $1', [sourceSlug])
    await pool.query('COMMIT')
    res.json({ ok: true, merged: { source_slug: sourceSlug, target_slug: targetSlug } })
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {})
    res.status(500).json({ error: 'Produkte konnten nicht zusammengeführt werden.' })
  }
})

app.post('/api/admin/products/:slug/offers', auth, async (req, res) => {
  const product = await pool.query('SELECT slug FROM products WHERE slug = $1 LIMIT 1', [req.params.slug])
  if (!product.rows.length) return res.status(404).json({ error: 'Produkt nicht gefunden' })

  const data = normalizeShopPayload(req.body || {})
  if (data.error) return res.status(400).json({ error: data.error })

  try {
    const inserted = await pool.query(
      `INSERT INTO product_offers(product_slug, shop_name, price, currency, product_url, affiliate_url, image_url, source_name, source_group, created_at, updated_at, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW(),NOW())
       ON CONFLICT (product_slug, shop_name)
       DO UPDATE SET
         price = EXCLUDED.price,
         currency = EXCLUDED.currency,
         product_url = EXCLUDED.product_url,
         affiliate_url = COALESCE(EXCLUDED.affiliate_url, product_offers.affiliate_url),
         image_url = COALESCE(EXCLUDED.image_url, product_offers.image_url),
         source_name = COALESCE(EXCLUDED.source_name, product_offers.source_name),
         source_group = COALESCE(EXCLUDED.source_group, product_offers.source_group),
         updated_at = NOW(),
         last_seen_at = NOW()
       RETURNING id, shop_name, price, currency, product_url, affiliate_url, image_url, source_name, source_group, updated_at, false as is_hidden`,
      [req.params.slug, data.shop_name, data.price, data.currency, data.product_url, data.affiliate_url, data.image_url, data.source_name, data.source_group]
    )
    res.json({ ok: true, offer: normalizeOffer(inserted.rows[0]) })
  } catch (err) {
    res.status(500).json({ error: 'Angebot konnte nicht gespeichert werden.' })
  }
})

app.put('/api/admin/products/:slug/offers/:offerId', auth, async (req, res) => {
  const { affiliate_url, product_url, is_hidden, shop_name, price, currency, source_name, source_group } = req.body || {}
  const updated = await pool.query(
    `UPDATE product_offers
     SET affiliate_url = COALESCE($1, affiliate_url),
         product_url = COALESCE($2, product_url),
         is_hidden = COALESCE($3, is_hidden),
         shop_name = COALESCE(NULLIF($4, ''), shop_name),
         price = COALESCE($5, price),
         currency = COALESCE(NULLIF($6, ''), currency),
         source_name = COALESCE(NULLIF($7, ''), source_name),
         source_group = COALESCE(NULLIF($8, ''), source_group),
         updated_at = NOW()
     WHERE id = $9 AND product_slug = $10
     RETURNING id, shop_name, price, currency, product_url, affiliate_url, image_url, source_name, source_group, updated_at, is_hidden`,
    [
      affiliate_url ?? null,
      product_url ?? null,
      typeof is_hidden === 'boolean' ? is_hidden : null,
      shop_name ?? null,
      price != null && Number.isFinite(Number(price)) ? Number(price) : null,
      currency ?? null,
      source_name ?? null,
      source_group ?? null,
      req.params.offerId,
      req.params.slug
    ]
  )
  if (!updated.rows.length) return res.status(404).json({ error: 'Angebot nicht gefunden' })
  res.json({ ok: true, offer: normalizeOffer(updated.rows[0]) })
})

app.get('/api/admin/dashboard', auth, async (_req, res) => {
  const products = await pool.query('SELECT COUNT(*)::int as c FROM products')
  const offers = await pool.query('SELECT COUNT(*)::int as c FROM product_offers')
  const alerts = await pool.query('SELECT COUNT(*)::int as c FROM alerts')
  const searches = await pool.query('SELECT COUNT(*)::int as c FROM search_logs')
  const clicks = await pool.query('SELECT COUNT(*)::int as c FROM outbound_clicks')
  const clicks24h = await pool.query("SELECT COUNT(*)::int as c FROM outbound_clicks WHERE created_at >= NOW() - INTERVAL '24 hours'")
  const crawlerRuns = await pool.query('SELECT source_name, status, items_found, items_written, created_at FROM crawler_runs ORDER BY created_at DESC LIMIT 20')
  const crawlJobs = await pool.query(`
    SELECT id, source_name, mode, status, requested_by, requested_at, started_at, finished_at, error_message
    FROM crawl_jobs
    ORDER BY requested_at DESC
    LIMIT 20
  `).catch(() => ({ rows: [] }))
  const discoveryQueue = await pool.query(`
    SELECT id, source_name, source_group, page_url, page_type, status, updated_at
    FROM shop_discovery_queue
    ORDER BY updated_at DESC
    LIMIT 30
  `).catch(() => ({ rows: [] }))
  const topClickedProducts = await pool.query(`
    SELECT oc.product_slug, COALESCE(p.title, oc.product_slug) AS title, COUNT(*)::int AS clicks
    FROM outbound_clicks oc
    LEFT JOIN products p ON p.slug = oc.product_slug
    GROUP BY oc.product_slug, p.title
    ORDER BY clicks DESC, title ASC
    LIMIT 10
  `)
  const topClickedShops = await pool.query(`
    SELECT COALESCE(shop_name, 'Unbekannt') AS shop_name, COUNT(*)::int AS clicks
    FROM outbound_clicks
    GROUP BY COALESCE(shop_name, 'Unbekannt')
    ORDER BY clicks DESC, shop_name ASC
    LIMIT 10
  `)
  const recentClicks = await pool.query(`
    SELECT oc.product_slug, COALESCE(p.title, oc.product_slug) AS title, COALESCE(oc.shop_name, 'Unbekannt') AS shop_name, oc.created_at
    FROM outbound_clicks oc
    LEFT JOIN products p ON p.slug = oc.product_slug
    ORDER BY oc.created_at DESC
    LIMIT 20
  `)
  res.json({
    stats: {
      products: products.rows[0].c,
      offers: offers.rows[0].c,
      alerts: alerts.rows[0].c,
      searches: searches.rows[0].c,
      clicks: clicks.rows[0].c,
      clicks24h: clicks24h.rows[0].c,
    },
    crawlerRuns: crawlerRuns.rows,
    crawlJobs: crawlJobs.rows,
    discoveryQueue: discoveryQueue.rows,
    topClickedProducts: topClickedProducts.rows,
    topClickedShops: topClickedShops.rows,
    recentClicks: recentClicks.rows
  })
})

app.use(express.static(distDir))
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' })
  res.sendFile(path.join(distDir, 'index.html'))
})

ensureCoreSchema(pool)
  .then(() => {
    app.listen(PORT, () => console.log(`kauvio webapp on ${PORT}`))
  })
  .catch(err => {
    console.error('DB schema bootstrap failed:', err)
    process.exit(1)
  })
