import { Pool } from 'pg'
import { JSDOM } from 'jsdom'
import { ensureCoreSchema } from '../../database/ensure_schema.mjs'
import { normalizeDbUrl } from '../../database/normalize_db_url.mjs'

const DATABASE_URL = normalizeDbUrl(process.env.DATABASE_URL)
const pool = new Pool({ connectionString: DATABASE_URL })
const FETCH_TIMEOUT_MS = Number(process.env.CRAWLER_FETCH_TIMEOUT_MS || 90000)
const LIMIT = Number(process.env.IMPORT_LIMIT_PER_PAGE || 36)

const sources = {
  digitec: {
    shop_name: 'Digitec',
    urls: String(process.env.DIGITEC_IMPORT_URLS || 'https://www.digitec.ch/de/s1/producttype/toplist/relevance/smartphones-24,https://www.digitec.ch/de/s1/producttype/toplist/relevance/notebook-6')
      .split(',').map(x => x.trim()).filter(Boolean)
  },
  galaxus: {
    shop_name: 'Galaxus',
    urls: String(process.env.GALAXUS_IMPORT_URLS || 'https://www.galaxus.ch/de/s1/producttype/toplist/relevance/smartphones-24,https://www.galaxus.ch/de/s1/producttype/toplist/relevance/notebook-6')
      .split(',').map(x => x.trim()).filter(Boolean)
  }
}

function clean(s=''){ return String(s).replace(/\s+/g,' ').trim() }
function brandFromTitle(title=''){ return clean(title).split(/\s+/)[0] || null }
function slugify(input=''){ return String(input).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,160) }
function normalizePrice(raw){
  const cleaned = String(raw||'').replace(/CHF/gi,'').replace(/'/g,'').replace(/[^\d.,]/g,'').replace(/\.(?=\d{3}(\D|$))/g,'').replace(',','.')
  const value = Number.parseFloat(cleaned)
  return Number.isFinite(value) ? value : null
}
function categoryFromUrl(url){
  if (/smartphones/i.test(url)) return 'Smartphones'
  if (/notebook/i.test(url)) return 'Notebooks'
  return 'Produkte'
}
function maybeAbsolute(base, href){ try { return new URL(href, base).toString() } catch { return null } }
function buildSlug(title, brand){ return slugify(`${brand || brandFromTitle(title) || ''} ${title}`) }

async function fetchHtml(url, attempts=3){
  let lastError
  for(let attempt=1; attempt<=attempts; attempt++){
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; KauvioBot/1.0; +https://kauvio.ch)',
          'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8'
        },
        signal: controller.signal
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      const html = await res.text()
      clearTimeout(timeout)
      return html
    } catch (err) {
      clearTimeout(timeout)
      lastError = err?.name === 'AbortError' ? new Error(`Fetch timeout after ${FETCH_TIMEOUT_MS}ms for ${url}`) : err
      if (attempt < attempts) await new Promise(r => setTimeout(r, 1500 * attempt))
    }
  }
  throw lastError
}

function extractLinks(document, baseUrl){
  const out = []
  for (const a of document.querySelectorAll('a[href]')) {
    const href = maybeAbsolute(baseUrl, a.getAttribute('href'))
    const text = clean(a.textContent)
    if (!href || !text) continue
    if (!/(?:digitec|galaxus)\.ch\/.+\/(product|s1\/product)\//i.test(href)) continue
    out.push({ href, text })
  }
  return out
}
function matchLink(links, title){
  const t = clean(title).toLowerCase()
  const short = t.split(' ').slice(0,5).join(' ')
  return links.find(x => x.text.toLowerCase() === t)?.href
    || links.find(x => x.text.toLowerCase().includes(short))?.href
    || null
}
function dedupe(items){
  const map = new Map()
  for (const item of items) {
    if (!item.slug || !item.price) continue
    const prev = map.get(item.slug)
    if (!prev || item.price < prev.price) map.set(item.slug, item)
  }
  return [...map.values()]
}

async function importDigitecLike(url, source_name, shop_name){
  const html = await fetchHtml(url)
  const dom = new JSDOM(html)
  const document = dom.window.document
  const links = extractLinks(document, url)
  const lines = String(document.body?.textContent || html).split(/\n+/).map(clean).filter(Boolean)
  const items = []
  for (let i=0; i<lines.length; i++){
    if (!/^CHF\s*\d/i.test(lines[i])) continue
    const price = normalizePrice(lines[i])
    const title = clean(lines[i+1])
    const specs = clean(lines[i+2])
    if (!price || !title || /^CHF\s*\d/i.test(title)) continue
    const full = clean(`${title} ${specs}`)
    const brand = brandFromTitle(title)
    items.push({
      slug: buildSlug(full, brand),
      title: full,
      brand,
      category: categoryFromUrl(url),
      description: `Live import von ${shop_name}`,
      price,
      currency: 'CHF',
      price_level: `Live bei ${shop_name}`,
      deal_score: 60,
      ai_summary: `Aktueller Live-Preisimport von ${shop_name}.`,
      shop_name,
      product_url: matchLink(links, full) || matchLink(links, title),
      image_url: null,
      source_name,
      source_external_id: null,
    })
  }
  return dedupe(items).slice(0, LIMIT)
}

async function upsertProduct(item){
  await pool.query(`INSERT INTO products (slug,title,brand,category,description,price,currency,price_level,deal_score,ai_summary,shop_name,product_url,image_url,source_name,source_external_id,updated_at,last_seen_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
    ON CONFLICT (slug) DO UPDATE SET
      title=EXCLUDED.title, brand=COALESCE(EXCLUDED.brand,products.brand), category=COALESCE(EXCLUDED.category,products.category),
      description=COALESCE(EXCLUDED.description,products.description), price=LEAST(COALESCE(products.price,EXCLUDED.price),EXCLUDED.price),
      currency=EXCLUDED.currency, price_level=EXCLUDED.price_level, deal_score=GREATEST(COALESCE(products.deal_score,0),EXCLUDED.deal_score),
      ai_summary=EXCLUDED.ai_summary, shop_name=EXCLUDED.shop_name, product_url=COALESCE(EXCLUDED.product_url,products.product_url),
      image_url=COALESCE(EXCLUDED.image_url,products.image_url), source_name=EXCLUDED.source_name, source_external_id=COALESCE(EXCLUDED.source_external_id,products.source_external_id),
      updated_at=NOW(), last_seen_at=NOW()`,
    [item.slug,item.title,item.brand,item.category,item.description,item.price,item.currency,item.price_level,item.deal_score,item.ai_summary,item.shop_name,item.product_url,item.image_url,item.source_name,item.source_external_id])

  await pool.query(`INSERT INTO product_offers (product_slug,shop_name,price,currency,product_url,image_url,source_name,updated_at,last_seen_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
    ON CONFLICT (product_slug, shop_name) DO UPDATE SET
      price=EXCLUDED.price, currency=EXCLUDED.currency, product_url=COALESCE(EXCLUDED.product_url,product_offers.product_url), image_url=COALESCE(EXCLUDED.image_url,product_offers.image_url), source_name=EXCLUDED.source_name, updated_at=NOW(), last_seen_at=NOW()`,
    [item.slug,item.shop_name,item.price,item.currency,item.product_url,item.image_url,item.source_name])
}

async function refreshCanonicalPricing(){
  await pool.query(`UPDATE products p SET price=x.min_price,currency=x.currency,shop_name=x.shop_name,product_url=x.product_url,updated_at=NOW()
    FROM (SELECT DISTINCT ON (o.product_slug) o.product_slug,o.price AS min_price,o.currency,o.shop_name,o.product_url FROM product_offers o ORDER BY o.product_slug,o.price ASC,o.updated_at DESC) x
    WHERE p.slug=x.product_slug`)
}

async function runSource(source_name, mode='fast'){
  const source = sources[source_name]
  let itemsFound = 0
  let itemsWritten = 0
  let errors = 0
  for (const url of source.urls) {
    try {
      const items = await importDigitecLike(url, source_name, source.shop_name)
      itemsFound += items.length
      console.log(`[crawler] ${source_name} ${mode} ${url} -> ${items.length} products`)
      for (const item of items) {
        await upsertProduct(item)
        itemsWritten += 1
      }
    } catch (err) {
      errors += 1
      console.error(`[crawler] ${source_name} import failed for ${url}`, err)
    }
  }
  await refreshCanonicalPricing()
  await pool.query('INSERT INTO crawler_runs(source_name,status,items_found,items_written,error_message) VALUES ($1,$2,$3,$4,$5)', [`${source_name}-${mode}`, itemsWritten>0?'success':'failed', itemsFound, itemsWritten, itemsWritten>0?null:`No products imported (${errors} source errors)`]).catch(()=>{})
  console.log(`[crawler] ${source_name} ${mode} done ${itemsWritten}/${itemsFound}`)
}

async function processManualJobs(){
  const result = await pool.query(`SELECT id, source_name, mode FROM crawl_jobs WHERE status='pending' ORDER BY requested_at ASC LIMIT 5`).catch(()=>({rows:[]}))
  for (const job of result.rows) {
    const claimed = await pool.query(`UPDATE crawl_jobs SET status='running', started_at=NOW() WHERE id=$1 AND status='pending' RETURNING id,source_name,mode`, [job.id]).catch(()=>({rows:[]}))
    if (!claimed.rows.length) continue
    const { source_name, mode } = claimed.rows[0]
    try {
      if (source_name === 'all') {
        await runSource('digitec', mode)
        await runSource('galaxus', mode)
      } else if (source_name === 'digitec' || source_name === 'galaxus') {
        await runSource(source_name, mode)
      }
      await pool.query(`UPDATE crawl_jobs SET status='success', finished_at=NOW() WHERE id=$1`, [job.id]).catch(()=>{})
      console.log(`[crawler] manual job ok ${source_name} ${mode}`)
    } catch (err) {
      await pool.query(`UPDATE crawl_jobs SET status='failed', finished_at=NOW(), error_message=$2 WHERE id=$1`, [job.id, String(err.message||err)]).catch(()=>{})
    }
  }
}

async function start(){
  await ensureCoreSchema(pool)
  console.log(`[crawler] fetch timeout is ${FETCH_TIMEOUT_MS}ms`)
  console.log(`[crawler] auto fast ${AUTO_START_FAST ? 'enabled' : 'disabled'} · auto full ${AUTO_START_FULL ? 'enabled' : 'disabled'}`)
  if (AUTO_START_FAST) {
    setTimeout(() => { runSource('digitec','fast').catch(console.error); runSource('galaxus','fast').catch(console.error) }, 5000)
    setInterval(() => { runSource('digitec','fast').catch(console.error); runSource('galaxus','fast').catch(console.error) }, FAST_INTERVAL * 1000)
  }
  if (AUTO_START_FULL) {
    setTimeout(() => { runSource('digitec','full').catch(console.error); runSource('galaxus','full').catch(console.error) }, 15000)
    setInterval(() => { runSource('digitec','full').catch(console.error); runSource('galaxus','full').catch(console.error) }, FULL_INTERVAL * 1000)
  }
  setInterval(() => { processManualJobs().catch(console.error) }, 15000)
  processManualJobs().catch(console.error)
}

start().catch(err => {
  console.error('[crawler] startup failed', err)
  process.exit(1)
})
