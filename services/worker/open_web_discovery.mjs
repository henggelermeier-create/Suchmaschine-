const EXCLUDED_DISCOVERY_HOSTS = ['toppreise.ch', 'duckduckgo.com', 'html.duckduckgo.com', 'lite.duckduckgo.com', 'google.com', 'www.google.com', 'bing.com', 'search.yahoo.com']
const SHOP_HINTS = [
  { host: 'brack.ch', brandHint: 'Brack' },
  { host: 'interdiscount.ch', brandHint: 'Interdiscount' },
  { host: 'microspot.ch', brandHint: 'Microspot' },
  { host: 'mediamarkt.ch', brandHint: 'MediaMarkt' },
  { host: 'fust.ch', brandHint: 'Fust' },
  { host: 'melectronics.ch', brandHint: 'Melectronics' },
  { host: 'galaxus.ch', brandHint: 'Galaxus' },
  { host: 'digitec.ch', brandHint: 'Digitec' },
]

function decodeHtml(str = '') {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&uuml;/gi, 'ü')
    .replace(/&ouml;/gi, 'ö')
    .replace(/&auml;/gi, 'ä')
    .replace(/&#x27;/g, "'")
}

function safeJsonParse(value) {
  try { return JSON.parse(value) } catch { return null }
}

function flattenJsonLd(node) {
  if (!node) return []
  if (Array.isArray(node)) return node.flatMap(flattenJsonLd)
  if (Array.isArray(node['@graph'])) return flattenJsonLd(node['@graph'])
  return [node]
}

function hostnameFromUrl(url = '') {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

function looksSwissDomain(hostname = '') {
  return /\.ch$/i.test(hostname)
}

function isExcludedDiscoveryHost(host = '') {
  return EXCLUDED_DISCOVERY_HOSTS.some((item) => host === item || host.endsWith(`.${item}`))
}

function looksLikeProductUrl(url = '') {
  return /\/product|\/p\/|\/artikel|\/item|\/products?\/|\/dp\/|\/buy\/|\/shop\//i.test(String(url || ''))
}

function getMeta(html = '', selectors = []) {
  for (const selector of selectors) {
    const regex = new RegExp(`<meta[^>]+(?:property|name)=["']${selector}["'][^>]+content=["']([^"']+)["']`, 'i')
    const match = html.match(regex)
    if (match?.[1]) return decodeHtml(match[1])
  }
  return null
}

function getTitleTag(html = '') {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match?.[1] ? decodeHtml(match[1]) : null
}

function extractJsonLdCandidates(html = '') {
  const matches = [...String(html).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  const out = []
  for (const match of matches) {
    const parsed = safeJsonParse(match[1])
    if (!parsed) continue
    out.push(...flattenJsonLd(parsed))
  }
  return out
}

function extractVisibleText(html = '') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseProductFromJsonLd(html = '', pageUrl = '', { clean, brandFromTitle, normalizePrice }) {
  const blocks = extractJsonLdCandidates(html)
  for (const block of blocks) {
    const typeValue = Array.isArray(block['@type']) ? block['@type'].join(' ') : String(block['@type'] || '')
    if (!/Product/i.test(typeValue)) continue
    const offerNode = Array.isArray(block.offers) ? block.offers[0] : block.offers || {}
    const imageNode = Array.isArray(block.image) ? block.image[0] : block.image
    const brandNode = typeof block.brand === 'object' ? block.brand?.name : block.brand
    const price = normalizePrice(offerNode?.price || offerNode?.priceSpecification?.price)
    return {
      title: clean(block.name || getTitleTag(html) || ''),
      brand: clean(brandNode || brandFromTitle(block.name || '')),
      image_url: typeof imageNode === 'string' ? imageNode : null,
      price,
      currency: offerNode?.priceCurrency || 'CHF',
      availability: clean(offerNode?.availability || ''),
      mpn: clean(block.mpn || ''),
      ean_gtin: clean(block.gtin13 || block.gtin || ''),
      source_product_url: pageUrl,
      deeplink_url: pageUrl,
      confidence_score: price ? 0.9 : 0.78,
      extraction_method: 'json_ld_product',
    }
  }
  return null
}

function parseProductFromMeta(html = '', pageUrl = '', { clean, brandFromTitle, normalizePrice }) {
  const title = getMeta(html, ['og:title', 'twitter:title']) || getTitleTag(html)
  const image = getMeta(html, ['og:image', 'twitter:image'])
  const priceRaw = getMeta(html, ['product:price:amount', 'og:price:amount']) || (html.match(/CHF\s?[0-9'.,]+/i)?.[0] || null)
  const price = normalizePrice(priceRaw)
  if (!title && !price) return null
  return {
    title: clean(title || ''),
    brand: brandFromTitle(title || ''),
    image_url: image || null,
    price,
    currency: 'CHF',
    availability: null,
    mpn: null,
    ean_gtin: null,
    source_product_url: pageUrl,
    deeplink_url: pageUrl,
    confidence_score: price && image ? 0.72 : 0.58,
    extraction_method: 'meta_fallback',
  }
}

function parseProductFromShopHints(html = '', pageUrl = '', host = '', { clean, brandFromTitle, normalizePrice }) {
  const visibleText = extractVisibleText(html)
  const hasKnownHost = SHOP_HINTS.some((item) => host === item.host || host.endsWith(`.${item.host}`))
  if (!hasKnownHost) return null

  const title = clean(
    getMeta(html, ['og:title']) ||
    getTitleTag(html) ||
    (visibleText.match(/([A-Z0-9][A-Za-z0-9+\-\/() ]{18,120})/)?.[1] || '')
  )
  const image = getMeta(html, ['og:image', 'twitter:image']) || null
  const priceMatch = visibleText.match(/CHF\s?[0-9'.,]{2,20}/i)
  const price = normalizePrice(priceMatch?.[0] || null)
  if (!title || !price) return null

  return {
    title,
    brand: brandFromTitle(title),
    image_url: image,
    price,
    currency: 'CHF',
    availability: null,
    mpn: null,
    ean_gtin: null,
    source_product_url: pageUrl,
    deeplink_url: pageUrl,
    confidence_score: image ? 0.68 : 0.62,
    extraction_method: 'shop_hint_fallback',
  }
}

function normalizeResult(url, title, query, source) {
  const host = hostnameFromUrl(url)
  if (!url || !host || isExcludedDiscoveryHost(host) || !looksSwissDomain(host)) return null
  if (!title || title.length < 8) return null
  return { url, title, snippet: '', host, query, source }
}

function parseDuckDuckGoResults(html = '', query = '', source = 'duckduckgo_html') {
  const results = []
  const matches = [...String(html).matchAll(/<a[^>]+(?:class=["'][^"']*(?:result__a|result-link)[^"']*["'])?[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  for (const match of matches) {
    let url = decodeHtml(match[1])
    const title = decodeHtml(match[2]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const uddg = url.match(/[?&]uddg=([^&]+)/)
    if (uddg?.[1]) url = decodeURIComponent(uddg[1])
    const item = normalizeResult(url, title, query, source)
    if (item) results.push(item)
  }
  const unique = []
  const seen = new Set()
  for (const item of results) {
    if (seen.has(item.url)) continue
    seen.add(item.url)
    unique.push(item)
  }
  return unique
}

function parseGoogleResults(html = '', query = '') {
  const results = []
  const urlMatches = [...String(html).matchAll(/href=["']\/url\?q=([^"'&]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)]
  for (const match of urlMatches) {
    const url = decodeURIComponent(match[1])
    const title = decodeHtml(match[2]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const item = normalizeResult(url, title, query, 'google_html')
    if (item) results.push(item)
  }
  const unique = []
  const seen = new Set()
  for (const item of results) {
    if (seen.has(item.url)) continue
    seen.add(item.url)
    unique.push(item)
  }
  return unique
}

function absolutizeUrl(baseUrl = '', href = '') {
  try { return new URL(href, baseUrl).toString() } catch { return '' }
}

function parseGenericAnchorResults(html = '', pageUrl = '', query = '', source = 'direct_shop_search') {
  const out = []
  const baseHost = hostnameFromUrl(pageUrl)
  const matches = [...String(html).matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  for (const match of matches) {
    const url = absolutizeUrl(pageUrl, decodeHtml(match[1]))
    const title = decodeHtml(match[2]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const host = hostnameFromUrl(url)
    if (!url || !host || host !== baseHost) continue
    if (!looksSwissDomain(host) || isExcludedDiscoveryHost(host)) continue
    if (!title || title.length < 8) continue
    out.push({ url, title, snippet: '', host, query, source })
  }
  const unique = []
  const seen = new Set()
  for (const item of out) {
    if (seen.has(item.url)) continue
    seen.add(item.url)
    unique.push(item)
  }
  return unique
}

function buildOfferFromParsedProduct(parsed, url, host, query, { sanitizeSourceKey, brandFromTitle, canonicalModelKey }) {
  if (!parsed?.title) return null
  return {
    provider: sanitizeSourceKey(host) || host,
    provider_group: 'open_web',
    offer_title: parsed.title,
    brand: parsed.brand || brandFromTitle(parsed.title),
    category: null,
    model_key: canonicalModelKey({
      brand: parsed.brand || '',
      title: parsed.title || '',
      specs: [parsed.mpn, parsed.ean_gtin].filter(Boolean).join(' '),
    }),
    ean_gtin: parsed.ean_gtin || null,
    mpn: parsed.mpn || null,
    price: parsed.price || null,
    currency: parsed.currency || 'CHF',
    availability: parsed.availability || null,
    condition_text: null,
    image_url: parsed.image_url || null,
    deeplink_url: url,
    source_product_url: url,
    confidence_score: parsed.confidence_score || 0.6,
    extraction_method: parsed.extraction_method || 'open_web_generic',
    extracted_json: { query, host, parsed },
  }
}

async function collectEngineResults({ task, searchTimeout, searchTerms, fetchText }) {
  const allResults = []
  for (const term of searchTerms) {
    try {
      const html = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(term)}`, searchTimeout)
      allResults.push(...parseDuckDuckGoResults(html, task.query, 'duckduckgo_html'))
    } catch {}
    try {
      const htmlLite = await fetchText(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(term)}`, searchTimeout)
      allResults.push(...parseDuckDuckGoResults(htmlLite, task.query, 'duckduckgo_lite'))
    } catch {}
    try {
      const googleHtml = await fetchText(`https://www.google.com/search?hl=de&gl=ch&num=10&q=${encodeURIComponent(term)}`, searchTimeout)
      allResults.push(...parseGoogleResults(googleHtml, task.query))
    } catch {}
  }
  return allResults
}

async function collectDirectShopResults({ task, plannerSources = [], searchTimeout, fetchText }) {
  const directResults = []
  const directSources = plannerSources
    .filter((source) => source?.search_url_template && looksSwissDomain(hostnameFromUrl(source.base_url || source.search_url_template)))
    .slice(0, 12)

  for (const source of directSources) {
    try {
      const searchUrl = source.search_url_template.replace('{query}', encodeURIComponent(task.query || ''))
      const html = await fetchText(searchUrl, searchTimeout)
      directResults.push(...parseGenericAnchorResults(html, searchUrl, task.query, `direct_shop_search:${source.source_key}`))
    } catch {}
  }
  return directResults
}

export async function runOpenWebDiscovery({
  task,
  controlMap,
  plannerSources = [],
  inferIntent,
  clean,
  brandFromTitle,
  normalizePrice,
  sanitizeSourceKey,
  canonicalModelKey,
  registerDiscoveredShop,
  insertWebDiscoveryResult,
  storeSourceOffers,
  fetchText,
}) {
  const openWeb = controlMap.get('open_web_discovery')
  if (openWeb?.is_enabled === false) return { discovered: 0, imported: 0, sourceKeys: [] }

  const resultLimit = Number(openWeb?.control_value_json?.result_limit || 22)
  const productFetchLimit = Number(openWeb?.control_value_json?.product_fetch_limit || 14)
  const searchTimeout = Number(openWeb?.control_value_json?.search_timeout_ms || 25000)
  const intentTags = inferIntent(task.query || '')
  const searchTerms = [
    `${task.query} site:.ch kaufen preis`,
    `${task.query} site:.ch shop`,
    `${task.query} site:.ch produkt`,
    `${task.query} schweiz kaufen`,
  ]

  const engineResults = await collectEngineResults({ task, searchTimeout, searchTerms, fetchText })
  const directShopResults = await collectDirectShopResults({ task, plannerSources, searchTimeout, fetchText })
  const allResults = [...engineResults, ...directShopResults]

  const unique = []
  const seen = new Set()
  for (const item of allResults) {
    if (seen.has(item.url)) continue
    seen.add(item.url)
    unique.push(item)
    if (unique.length >= resultLimit) break
  }

  let discovered = 0
  let imported = 0
  const sourceKeys = []

  for (let i = 0; i < unique.length; i++) {
    const item = unique[i]
    const shop = await registerDiscoveredShop(item.url, intentTags, item.source.startsWith('direct_shop_search') ? 'direct_shop_search' : 'open_web_search')
    if (shop?.source_key) sourceKeys.push(shop.source_key)
    await insertWebDiscoveryResult(task, item, i + 1, { search_source: item.source }, !!shop, false)
    discovered += 1
  }

  for (const item of unique.filter((entry, idx) => looksLikeProductUrl(entry.url) || idx < productFetchLimit).slice(0, productFetchLimit)) {
    try {
      const html = await fetchText(item.url, searchTimeout)
      const parsed = parseProductFromJsonLd(html, item.url, { clean, brandFromTitle, normalizePrice }) ||
        parseProductFromMeta(html, item.url, { clean, brandFromTitle, normalizePrice }) ||
        parseProductFromShopHints(html, item.url, item.host, { clean, brandFromTitle, normalizePrice })
      const offer = buildOfferFromParsedProduct(parsed, item.url, item.host, task.query, { sanitizeSourceKey, brandFromTitle, canonicalModelKey })
      if (!offer) continue
      await storeSourceOffers(task.id, { provider: sanitizeSourceKey(item.host) || item.host, source_kind: 'open_web_product', seed_value: task.query }, [offer], item.url, item.source.startsWith('direct_shop_search') ? 'direct_shop_search' : 'open_web_product')
      await insertWebDiscoveryResult(task, item, 0, { parsed }, true, true)
      imported += 1
      if (item.host) sourceKeys.push(sanitizeSourceKey(item.host) || item.host)
    } catch {}
  }

  return { discovered, imported, sourceKeys: [...new Set(sourceKeys)] }
}
