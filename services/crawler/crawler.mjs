import { Pool } from "pg"
import { JSDOM } from "jsdom"
import { ensureCoreSchema } from "../../database/ensure_schema.mjs"

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
console.log('[crawler] Using DB host from DATABASE_URL:', new URL(DATABASE_URL).hostname)
const pool = new Pool({ connectionString: DATABASE_URL })

const FAST_INTERVAL = Number(process.env.FAST_CRAWLER_INTERVAL_SECONDS || 600)
const FULL_INTERVAL = Number(process.env.FULL_CRAWLER_INTERVAL_SECONDS || 3600)
const DEFAULT_LIMIT = Number(process.env.IMPORT_LIMIT_PER_PAGE || 36)

const config = {
  digitec: {
    shopName: 'Digitec',
    sourceName: 'digitec',
    fastUrls: splitEnv('DIGITEC_FAST_URLS', process.env.DIGITEC_IMPORT_URLS || 'https://www.digitec.ch/de/s1/producttype/toplist/relevance/smartphones-24,https://www.digitec.ch/de/s1/producttype/toplist/relevance/notebook-6,https://www.digitec.ch/de/s1/producttype/toplist/relevance/headphones-48'),
    fullUrls: splitEnv('DIGITEC_FULL_URLS', process.env.DIGITEC_IMPORT_URLS || ''),
    limit: Number(process.env.DIGITEC_IMPORT_LIMIT_PER_PAGE || DEFAULT_LIMIT),
    importer: importDigitecPage,
  },
  brack: {
    shopName: 'BRACK',
    sourceName: 'brack',
    fastUrls: splitEnv('BRACK_FAST_URLS', 'https://www.brack.ch/it-multimedia/handy-telefonie/smartphone-handy/smartphones,https://www.brack.ch/it-multimedia/notebook-tablet/notebooks'),
    fullUrls: splitEnv('BRACK_FULL_URLS', 'https://www.brack.ch/it-multimedia/handy-telefonie/smartphone-handy/smartphones,https://www.brack.ch/it-multimedia/notebook-tablet/notebooks,https://www.brack.ch/multimedia-tv-audio/kopfhoerer-headsets'),
    limit: Number(process.env.BRACK_IMPORT_LIMIT_PER_PAGE || 30),
    importer: importBrackPage,
  },
  interdiscount: {
    shopName: 'Interdiscount',
    sourceName: 'interdiscount',
    fastUrls: splitEnv('INTERDISCOUNT_FAST_URLS', 'https://www.interdiscount.ch/de/telefone-tablets-smartwatches/handys-smartphones--c411000,https://www.interdiscount.ch/de/computer-gaming/notebooks-notebooks--c511000'),
    fullUrls: splitEnv('INTERDISCOUNT_FULL_URLS', 'https://www.interdiscount.ch/de/telefone-tablets-smartwatches/handys-smartphones--c411000,https://www.interdiscount.ch/de/computer-gaming/notebooks-notebooks--c511000,https://www.interdiscount.ch/de/tv-audio/kopfh%C3%B6rer-headsets--c151000'),
    limit: Number(process.env.INTERDISCOUNT_IMPORT_LIMIT_PER_PAGE || 30),
    importer: importInterdiscountPage,
  }
}

function splitEnv(name, fallback = '') {
  return String(process.env[name] || fallback)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 160)
}

function normalizePrice(raw) {
  if (raw == null) return null
  const cleaned = String(raw)
    .replace(/CHF/gi, '')
    .replace(/–/g, '')
    .replace(/'/g, '')
    .replace(/[^\d.,]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
  const value = Number.parseFloat(cleaned)
  return Number.isFinite(value) ? value : null
}

function categoryFromUrl(url) {
  try {
    const pathname = new URL(url).pathname
    const last = pathname.split('/').filter(Boolean).pop() || 'produkte'
    return last
      .replace(/-\d+$/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
  } catch {
    return 'Produkte'
  }
}

function brandFromTitle(title) {
  const first = String(title || '').trim().split(/\s+/)[0] || ''
  return first.length > 1 ? first : null
}

function maybeAbsolute(base, href) {
  if (!href) return null
  if (/^https?:\/\//i.test(href)) return href
  try {
    return new URL(href, base).toString()
  } catch {
    return null
  }
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function extractStorageGb(title) {
  const text = cleanText(title).toUpperCase()
  const match = text.match(/(\d+)\s*(TB|GB)/i)
  if (!match) return null
  const size = Number(match[1])
  const unit = match[2].toUpperCase()
  if (!Number.isFinite(size)) return null
  return unit === 'TB' ? size * 1024 : size
}

function normalizeModelKey(title, brand) {
  let text = cleanText(title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  const knownBrand = cleanText(brand || '').toLowerCase()
  if (knownBrand) {
    const escaped = knownBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    text = text.replace(new RegExp(`^${escaped}\\s+`, 'i'), '')
  }

  text = text
    .replace(/\((.*?)\)/g, ' $1 ')
    .replace(/\b(5g|4g|lte|wifi|bluetooth|cellular|dual sim|sim|esim|ohne vertrag|schweiz|schwarz|weiss|weiß|silber|grau|graphite|space grau|space gray|natural titanium|titanium|pink|blau|blue|green|violet|purple|black|white|silver|gold|red|gelb|yellow|orange|midnight|starlight)\b/gi, ' ')
    .replace(/\b(enterprise|business|consumer|edition|gen\.?|generation)\b/gi, ' ')
    .replace(/\b(\d+)\s*(gb|tb)\b/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return text
}

function buildMatchKey(title, brand) {
  const cleanBrand = cleanText(brand || brandFromTitle(title) || '')
  const model = normalizeModelKey(title, cleanBrand)
  const storageGb = extractStorageGb(title)
  return [cleanBrand.toLowerCase(), model, storageGb ? `${storageGb}gb` : 'nostorage']
    .filter(Boolean)
    .join(' ')
    .trim()
}

function canonicalProduct(input) {
  const title = cleanText(input.title)
  const brand = cleanText(input.brand || brandFromTitle(title) || '') || null
  const category = cleanText(input.category || '') || null
  const matchKey = buildMatchKey(title, brand)
  const slugBase = matchKey || title

  return {
    slug: slugify(slugBase),
    match_key: matchKey,
    title,
    brand,
    category,
    description: input.description || `Live import von ${input.shop_name}`,
    price: input.price,
    currency: input.currency || 'CHF',
    price_level: input.price_level || `Live bei ${input.shop_name}`,
    deal_score: Number.isFinite(Number(input.deal_score)) ? Number(input.deal_score) : 60,
    ai_summary: input.ai_summary || `Aktueller Live-Preisimport von ${input.shop_name}.`,
    shop_name: input.shop_name,
    product_url: input.product_url || null,
    image_url: input.image_url || null,
    source_name: input.source_name,
    source_external_id: input.source_external_id || null,
  }
}

function normalizeOffer(raw) {
  const product = canonicalProduct(raw)
  return {
    ...product,
    offer_shop_name: raw.shop_name,
    offer_url: raw.product_url || null,
    offer_price: raw.price,
    offer_currency: raw.currency || 'CHF',
    source_name: raw.source_name,
    image_url: raw.image_url || null,
  }
}

function dedupeProducts(items) {
  const map = new Map()
  for (const item of items) {
    if (!item.slug || !item.offer_shop_name || !item.offer_price) continue
    const key = `${item.match_key || item.slug}|${item.offer_shop_name}`
    const prev = map.get(key)
    if (!prev || Number(item.offer_price) < Number(prev.offer_price)) map.set(key, item)
  }
  return [...map.values()]
}

async function fetchHtml(url, attempts = 3) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20000)
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
      lastError = err
      if (attempt < attempts) {
        await new Promise(resolve => setTimeout(resolve, 1500 * attempt))
      }
    }
  }
  throw lastError
}
function linesFromBody(document, html) {
  return String(document.body?.textContent || html)
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean)
}

function extractLinks(document, baseUrl, matcher) {
  const out = []
  for (const a of document.querySelectorAll('a[href]')) {
    const href = maybeAbsolute(baseUrl, a.getAttribute('href'))
    const text = cleanText(a.textContent)
    if (!href || !text) continue
    if (!matcher(href, text)) continue
    out.push({ href, text })
  }
  return out
}

function matchLink(links, title) {
  if (!title) return null
  const t = title.toLowerCase()
  const short = t.split(' ').slice(0, 5).join(' ')
  const found = links.find(x => x.text.toLowerCase() === t)
    || links.find(x => x.text.toLowerCase().includes(short))
    || links.find(x => short.includes(x.text.toLowerCase()))
  return found?.href || null
}

async function importDigitecPage(url, limit) {
  const html = await fetchHtml(url)
  const dom = new JSDOM(html)
  const document = dom.window.document
  const lines = linesFromBody(document, html)
  const links = extractLinks(document, url, (href) => /digitec\.ch\/.+\/(product|s1\/product)\//i.test(href))
  const category = categoryFromUrl(url)
  const products = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!/^CHF\s*\d/i.test(line)) continue

    const price = normalizePrice(line)
    const title = cleanText(lines[i + 1])
    const specs = cleanText(lines[i + 2])
    if (!price || !title || /^CHF\s*\d/i.test(title) || title.length < 3) continue

    const fullTitle = cleanText(`${title} ${specs}`)
    products.push(normalizeOffer({
      title: fullTitle,
      brand: brandFromTitle(title),
      category,
      description: `Live import von Digitec (${category})`,
      price,
      currency: 'CHF',
      price_level: 'Live bei Digitec',
      deal_score: 60,
      ai_summary: 'Aktueller Live-Preisimport von Digitec.',
      shop_name: 'Digitec',
      product_url: matchLink(links, fullTitle) || matchLink(links, title),
      image_url: null,
      source_name: 'digitec',
      source_external_id: null,
    }))
  }

  return dedupeProducts(products).slice(0, limit)
}

function parseBrackFromScripts(html, url) {
  const category = categoryFromUrl(url)
  const products = []
  const hrefRegex = /https?:\/\/www\.brack\.ch\/[^"'\s<]+/gi
  const priceRegex = /CHF\s*[0-9'.,]+/gi
  const titleRegex = /(Apple|Samsung|Google|Xiaomi|Sony|Nokia|Motorola|Asus|Lenovo|HP|Acer|Dell|MSI|Jabra|Bose)[^"'<>]{6,120}/gi
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1])

  for (const chunk of scripts) {
    const links = [...chunk.matchAll(hrefRegex)].map(m => m[0])
    if (!links.length) continue
    for (const link of links) {
      const idx = chunk.indexOf(link)
      const windowText = chunk.slice(Math.max(0, idx - 600), idx + 900)
      const priceMatch = [...windowText.matchAll(priceRegex)].pop()
      const titleMatch = [...windowText.matchAll(titleRegex)][0]
      const price = priceMatch ? normalizePrice(priceMatch[0]) : null
      const title = titleMatch ? cleanText(titleMatch[0]) : null
      if (!price || !title) continue
      products.push(normalizeOffer({
        title,
        brand: brandFromTitle(title),
        category,
        description: `Live import von BRACK (${category})`,
        price,
        currency: 'CHF',
        price_level: 'Live bei BRACK',
        deal_score: 59,
        ai_summary: 'Aktueller Live-Preisimport von BRACK.',
        shop_name: 'BRACK',
        product_url: link,
        source_name: 'brack',
      }))
    }
  }

  return products
}

function parseBrackFromBody(document, url) {
  const category = categoryFromUrl(url)
  const text = document.body?.textContent || ''
  const lines = String(text).split(/\n+/).map(cleanText).filter(Boolean)
  const products = []

  for (let i = 0; i < lines.length - 2; i++) {
    const title = lines[i]
    const maybePrice = lines[i + 1]
    if (!/(Apple|Samsung|Google|Xiaomi|Sony|Nokia|Motorola|Asus|Lenovo|HP|Acer|Dell|MSI|Jabra|Bose)/i.test(title)) continue
    if (!/^CHF\s*[0-9'.,]+/i.test(maybePrice)) continue
    const price = normalizePrice(maybePrice)
    if (!price) continue
    products.push(normalizeOffer({
      title,
      brand: brandFromTitle(title),
      category,
      description: `Live import von BRACK (${category})`,
      price,
      currency: 'CHF',
      price_level: 'Live bei BRACK',
      deal_score: 59,
      ai_summary: 'Aktueller Live-Preisimport von BRACK.',
      shop_name: 'BRACK',
      product_url: null,
      source_name: 'brack',
    }))
  }

  return products
}

async function importBrackPage(url, limit) {
  const html = await fetchHtml(url)
  const dom = new JSDOM(html)
  const document = dom.window.document
  let products = parseBrackFromScripts(html, url)
  if (!products.length) products = parseBrackFromBody(document, url)
  return dedupeProducts(products).slice(0, limit)
}


function parseInterdiscountFromLdJson(html, url) {
  const category = categoryFromUrl(url)
  const products = []
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const chunk = match[1]
    try {
      const data = JSON.parse(chunk)
      const nodes = Array.isArray(data) ? data : [data]
      for (const node of nodes) {
        const entries = Array.isArray(node?.itemListElement) ? node.itemListElement : []
        for (const entry of entries) {
          const item = entry.item || entry
          const title = cleanText(item?.name)
          const productUrl = maybeAbsolute(url, item?.url)
          const image = Array.isArray(item?.image) ? item.image[0] : item?.image
          const offers = item?.offers || {}
          const price = normalizePrice(offers?.price || offers?.lowPrice || offers?.highPrice)
          if (!title || !price) continue
          products.push(normalizeOffer({
            title,
            brand: cleanText(item?.brand?.name || item?.brand || brandFromTitle(title)),
            category,
            description: `Live import von Interdiscount (${category})`,
            price,
            currency: offers?.priceCurrency || 'CHF',
            price_level: 'Live bei Interdiscount',
            deal_score: 58,
            ai_summary: 'Aktueller Live-Preisimport von Interdiscount.',
            shop_name: 'Interdiscount',
            product_url: productUrl,
            image_url: image || null,
            source_name: 'interdiscount',
            source_external_id: item?.sku || item?.productID || null,
          }))
        }
      }
    } catch {}
  }
  return products
}

function parseInterdiscountFromBody(document, url) {
  const category = categoryFromUrl(url)
  const lines = linesFromBody(document, document.documentElement?.outerHTML || '')
  const links = extractLinks(document, url, (href) => /interdiscount\.ch\/.+--p[0-9]+/i.test(href))
  const products = []
  const brandPattern = /(Apple|Samsung|Google|Xiaomi|Sony|Nokia|Motorola|Asus|Lenovo|HP|Acer|Dell|MSI|JBL|Bose|Sennheiser|Nothing|Honor|Huawei)/i
  for (let i = 0; i < lines.length - 2; i++) {
    const title = lines[i]
    const maybePrice = lines[i + 1]
    if (!brandPattern.test(title)) continue
    if (!/^CHF\s*[0-9'.,]+/i.test(maybePrice)) continue
    const price = normalizePrice(maybePrice)
    if (!price) continue
    products.push(normalizeOffer({
      title,
      brand: brandFromTitle(title),
      category,
      description: `Live import von Interdiscount (${category})`,
      price,
      currency: 'CHF',
      price_level: 'Live bei Interdiscount',
      deal_score: 58,
      ai_summary: 'Aktueller Live-Preisimport von Interdiscount.',
      shop_name: 'Interdiscount',
      product_url: matchLink(links, title),
      source_name: 'interdiscount',
    }))
  }
  return products
}

async function importInterdiscountPage(url, limit) {
  const html = await fetchHtml(url)
  const dom = new JSDOM(html)
  const document = dom.window.document
  let products = parseInterdiscountFromLdJson(html, url)
  if (!products.length) products = parseInterdiscountFromBody(document, url)
  return dedupeProducts(products).slice(0, limit)
}

async function upsertOffer(product) {
  await pool.query(
    `
      INSERT INTO products (
        slug, title, brand, category, description, price, currency, price_level, deal_score, ai_summary,
        shop_name, product_url, image_url, source_name, source_external_id, updated_at, last_seen_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW()
      )
      ON CONFLICT (slug) DO UPDATE SET
        title = EXCLUDED.title,
        brand = COALESCE(EXCLUDED.brand, products.brand),
        category = COALESCE(EXCLUDED.category, products.category),
        description = COALESCE(EXCLUDED.description, products.description),
        price = LEAST(COALESCE(products.price, EXCLUDED.price), EXCLUDED.price),
        currency = EXCLUDED.currency,
        price_level = EXCLUDED.price_level,
        deal_score = GREATEST(COALESCE(products.deal_score, 0), EXCLUDED.deal_score),
        ai_summary = EXCLUDED.ai_summary,
        shop_name = EXCLUDED.shop_name,
        product_url = COALESCE(EXCLUDED.product_url, products.product_url),
        image_url = COALESCE(EXCLUDED.image_url, products.image_url),
        source_name = EXCLUDED.source_name,
        source_external_id = COALESCE(EXCLUDED.source_external_id, products.source_external_id),
        updated_at = NOW(),
        last_seen_at = NOW()
    `,
    [
      product.slug,
      product.title,
      product.brand,
      product.category,
      product.description,
      product.offer_price,
      product.offer_currency,
      product.price_level,
      product.deal_score,
      product.ai_summary,
      product.offer_shop_name,
      product.offer_url,
      product.image_url,
      product.source_name,
      product.source_external_id,
    ]
  )

  await pool.query(
    `
      INSERT INTO product_offers (
        product_slug, shop_name, price, currency, product_url, image_url, source_name, updated_at, last_seen_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
      ON CONFLICT (product_slug, shop_name) DO UPDATE SET
        price = EXCLUDED.price,
        currency = EXCLUDED.currency,
        product_url = COALESCE(EXCLUDED.product_url, product_offers.product_url),
        image_url = COALESCE(EXCLUDED.image_url, product_offers.image_url),
        source_name = EXCLUDED.source_name,
        updated_at = NOW(),
        last_seen_at = NOW()
    `,
    [product.slug, product.offer_shop_name, product.offer_price, product.offer_currency, product.offer_url, product.image_url, product.source_name]
  )
}

async function refreshCanonicalPricing() {
  await pool.query(`
    UPDATE products p
    SET price = x.min_price,
        currency = x.currency,
        shop_name = x.shop_name,
        product_url = x.product_url,
        updated_at = NOW()
    FROM (
      SELECT DISTINCT ON (o.product_slug)
        o.product_slug,
        o.price AS min_price,
        o.currency,
        o.shop_name,
        o.product_url
      FROM product_offers o
      ORDER BY o.product_slug, o.price ASC, o.updated_at DESC
    ) x
    WHERE p.slug = x.product_slug
  `)
}

async function runSource(sourceKey, mode) {
  const source = config[sourceKey]
  const urls = mode === 'fast' ? source.fastUrls : source.fullUrls
  if (!urls.length) return

  let itemsFound = 0
  let itemsWritten = 0

  try {
    for (const url of urls) {
      const products = await source.importer(url, source.limit)
      itemsFound += products.length
      for (const product of products) {
        await upsertOffer(product)
        itemsWritten += 1
      }
    }

    await refreshCanonicalPricing()
    await pool.query(
      'INSERT INTO crawler_runs(source_name, status, items_found, items_written) VALUES ($1,$2,$3,$4)',
      [`${source.sourceName}-${mode}`, 'success', itemsFound, itemsWritten]
    )
    console.log(`[crawler] ${source.sourceName} ${mode} ok ${itemsWritten}/${itemsFound}`)
  } catch (err) {
    console.error(`[crawler] ${source.sourceName} ${mode} failed`, err)
    await pool.query(
      'INSERT INTO crawler_runs(source_name, status, items_found, items_written, error_message) VALUES ($1,$2,$3,$4,$5)',
      [`${source.sourceName}-${mode}`, 'failed', itemsFound, itemsWritten, String(err.message || err)]
    ).catch(() => {})
  }
}

async function runAll(mode) {
  if (!DATABASE_URL) {
    console.error('[crawler] DATABASE_URL fehlt')
    return
  }
  for (const source of ['digitec', 'brack', 'interdiscount']) {
    try {
      await runSource(source, mode)
    } catch (err) {
      console.error(`[crawler] ${source} ${mode} failed`, err)
      await pool.query(
        'INSERT INTO monitoring_events(service_name, level, message) VALUES ($1,$2,$3)',
        ['crawler', 'error', `${source} ${mode} failed: ${String(err?.message || err)}`]
      ).catch(() => {})
    }
  }
}


function extractLinksFromHtml(html = '', baseUrl = '') {
  const links = new Set()
  const regex = /href=["']([^"'#]+)["']/gi
  let match
  while ((match = regex.exec(html))) {
    try {
      const url = new URL(match[1], baseUrl).toString()
      if (/^https?:\/\//i.test(url)) links.add(url)
    } catch {}
  }
  return [...links]
}

async function processDiscoveryQueue() {
  let rows = []
  try {
    const result = await pool.query(`
      SELECT id, source_name, source_group, page_url
      FROM shop_discovery_queue
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 5
    `)
    rows = result.rows
  } catch {
    return
  }

  for (const row of rows) {
    try {
      const claimed = await pool.query(`
        UPDATE shop_discovery_queue
        SET status = 'running', updated_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING id, source_name, source_group, page_url
      `, [row.id])

      if (!claimed.rows.length) continue
      const item = claimed.rows[0]
      const html = await fetchHtml(item.page_url)
      const links = extractLinksFromHtml(html, item.page_url).slice(0, 60)

      for (const link of links) {
        const pageType = /product|\/p\/|\/product\//i.test(link) ? 'product' : (/category|toplist|notebook|smartphone|headphones/i.test(link) ? 'category' : 'unknown')
        await pool.query(`
          INSERT INTO shop_discovery_queue(source_name, source_group, page_url, page_type, status, discovered_from, notes, created_at, updated_at)
          VALUES ($1,$2,$3,$4,'pending',$5,$6,NOW(),NOW())
          ON CONFLICT (source_name, page_url)
          DO UPDATE SET updated_at = NOW()
        `, [item.source_name, item.source_group || null, link, pageType, item.page_url, 'Auto-discovered from start link']).catch(() => {})
      }

      await pool.query(`
        UPDATE shop_discovery_queue
        SET status = 'success', updated_at = NOW(), notes = COALESCE(notes, 'Processed')
        WHERE id = $1
      `, [item.id])
      console.log(`[crawler] discovery ok ${item.source_name} ${item.page_url}`)
    } catch (err) {
      await pool.query(`
        UPDATE shop_discovery_queue
        SET status = 'failed', updated_at = NOW(), last_error = $2
        WHERE id = $1
      `, [row.id, String(err.message || err)]).catch(() => {})
      console.error('[crawler] discovery failed', err)
    }
  }
}


async function processManualJobs() {
  let jobs = []
  try {
    const result = await pool.query(`
      SELECT id, source_name, mode
      FROM crawl_jobs
      WHERE status = 'pending'
      ORDER BY requested_at ASC
      LIMIT 5
    `)
    jobs = result.rows
  } catch {
    return
  }

  for (const job of jobs) {
    try {
      const claimed = await pool.query(`
        UPDATE crawl_jobs
        SET status = 'running', started_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING id, source_name, mode
      `, [job.id])

      if (!claimed.rows.length) continue

      const { source_name, mode } = claimed.rows[0]
      if (source_name === 'all') {
        await runAll(mode)
      } else {
        await runSource(source_name, mode)
      }

      await pool.query(`
        UPDATE crawl_jobs
        SET status = 'success', finished_at = NOW()
        WHERE id = $1
      `, [job.id])
      console.log(`[crawler] manual job ok ${source_name} ${mode}`)
    } catch (err) {
      console.error('[crawler] manual job failed', err)
      await pool.query(`
        UPDATE crawl_jobs
        SET status = 'failed', finished_at = NOW(), error_message = $2
        WHERE id = $1
      `, [job.id, String(err.message || err)]).catch(() => {})
    }
  }
}

async function startCrawler() {
  await ensureCoreSchema(pool)
  setTimeout(() => { runAll('fast').catch(console.error) }, 5000)
  setTimeout(() => { runAll('full').catch(console.error) }, 15000)
  setInterval(() => { runAll('fast').catch(console.error) }, FAST_INTERVAL * 1000)
  setInterval(() => { runAll('full').catch(console.error) }, FULL_INTERVAL * 1000)
  setInterval(() => { processManualJobs().catch(console.error) }, 15000)
  setInterval(() => { processDiscoveryQueue().catch(console.error) }, 20000)
  processManualJobs().catch(console.error)
  processDiscoveryQueue().catch(console.error)
}

startCrawler().catch(err => {
  console.error('[crawler] startup failed', err)
  process.exit(1)
})
