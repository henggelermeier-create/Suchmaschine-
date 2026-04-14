const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai_service:3010'

function decodeHtml(str = '') {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
}

function hostnameFromUrl(url = '') {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

function absolutizeUrl(baseUrl = '', href = '') {
  try { return new URL(href, baseUrl).toString() } catch { return '' }
}

function looksSwissDomain(hostname = '') {
  return /\.ch$/i.test(hostname)
}

function looksLikeProductUrl(url = '') {
  return /\/product|\/p\/|\/artikel|\/item|\/products?\/|\/dp\/|\/buy\/|\/shop\/|\/de\/s1\/product/i.test(String(url || ''))
}

function normalizePrice(raw) {
  if (raw == null) return null
  const cleaned = String(raw)
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

function dedupeByUrl(items = []) {
  const out = []
  const seen = new Set()
  for (const item of items) {
    if (!item?.url || seen.has(item.url)) continue
    seen.add(item.url)
    out.push(item)
  }
  return out
}

function extractImageCandidates(fragment = '', baseUrl = '') {
  const candidates = []
  const srcMatch = fragment.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (srcMatch?.[1]) candidates.push(absolutizeUrl(baseUrl, decodeHtml(srcMatch[1])))
  const dataSrcMatch = fragment.match(/<img[^>]+data-src=["']([^"']+)["']/i)
  if (dataSrcMatch?.[1]) candidates.push(absolutizeUrl(baseUrl, decodeHtml(dataSrcMatch[1])))
  const srcSetMatch = fragment.match(/<img[^>]+srcset=["']([^"']+)["']/i)
  if (srcSetMatch?.[1]) {
    const first = srcSetMatch[1].split(',')[0]?.trim()?.split(/\s+/)?.[0]
    if (first) candidates.push(absolutizeUrl(baseUrl, decodeHtml(first)))
  }
  return candidates.filter(Boolean)
}

function extractOgImage(html = '', baseUrl = '') {
  const match = String(html).match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/i)
  if (match?.[1]) return absolutizeUrl(baseUrl, decodeHtml(match[1]))
  return null
}

function parseShopCatalogCandidates(html = '', pageUrl = '', query = '', provider = '') {
  const baseHost = hostnameFromUrl(pageUrl)
  const items = []
  const matches = [...String(html).matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]

  for (const match of matches) {
    const url = absolutizeUrl(pageUrl, decodeHtml(match[1]))
    const host = hostnameFromUrl(url)
    if (!url || !host || host !== baseHost || !looksSwissDomain(host)) continue
    if (!looksLikeProductUrl(url)) continue

    const fragment = match[2] || ''
    const title = decodeHtml(fragment).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!title || title.length < 8) continue

    const priceMatch = fragment.match(/CHF\s?[0-9'.,]{2,20}/i)
    const imageCandidates = extractImageCandidates(fragment, pageUrl)
    const image_url = imageCandidates[0] || null

    items.push({
      url,
      title,
      provider,
      host,
      query,
      image_url,
      inline_price: normalizePrice(priceMatch?.[0] || null),
    })
  }

  return dedupeByUrl(items)
}

async function callAiExtract({ html, url, query, source }) {
  const res = await fetch(`${AI_SERVICE_URL}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, url, query, source }),
  })
  if (!res.ok) throw new Error(`AI extract HTTP ${res.status}`)
  const data = await res.json()
  return data?.extraction || null
}

export async function importFromShopCatalog({
  task,
  source,
  swissSource,
  fetchText,
  storeSourceOffers,
  canonicalModelKey,
  brandFromTitle,
  sanitizeSourceKey,
  logImportDiagnostic = null,
}) {
  const query = task.query || source.seed_value || ''
  const searchUrl = swissSource?.search_url_template
    ? swissSource.search_url_template.replace('{query}', encodeURIComponent(query))
    : source.seed_value

  if (!searchUrl || !/^https?:\/\//i.test(searchUrl)) {
    if (typeof logImportDiagnostic === 'function') {
      await logImportDiagnostic({
        searchTaskId: task.id,
        searchTaskSourceId: source.id,
        stage: 'shop_catalog_search_url',
        status: 'warning',
        message: 'No usable search URL for shop catalog source',
        payload: { provider: source.provider, searchUrl, query },
      })
    }
    return { discovered: 0, imported: 0, sourceKey: source.provider }
  }

  const searchHtml = await fetchText(searchUrl)
  const inlineOgImage = extractOgImage(searchHtml, searchUrl)
  const candidates = parseShopCatalogCandidates(searchHtml, searchUrl, query, source.provider)
  const picked = candidates.slice(0, 12)

  if (typeof logImportDiagnostic === 'function') {
    await logImportDiagnostic({
      searchTaskId: task.id,
      searchTaskSourceId: source.id,
      stage: 'shop_catalog_candidates',
      status: picked.length ? 'success' : 'warning',
      message: `Parsed ${picked.length} shop catalog candidates`,
      payload: { provider: source.provider, query, searchUrl, candidates: picked.slice(0, 5) },
    })
  }

  const offers = []
  for (const candidate of picked) {
    try {
      const productHtml = await fetchText(candidate.url)
      const extraction = await callAiExtract({
        html: productHtml,
        url: candidate.url,
        query,
        source: `shop_catalog:${source.provider}`,
      })

      if (!extraction?.title) continue

      const brand = extraction.brand || brandFromTitle(extraction.title)
      const model_key = extraction.model_key || canonicalModelKey({
        brand,
        title: extraction.title,
        specs: [extraction.mpn, extraction.ean_gtin].filter(Boolean).join(' '),
      })

      const image_url =
        extraction.image_url ||
        candidate.image_url ||
        extractOgImage(productHtml, candidate.url) ||
        inlineOgImage ||
        null

      offers.push({
        provider: sanitizeSourceKey(source.provider) || source.provider,
        provider_group: 'shop_catalog',
        offer_title: extraction.title,
        brand,
        category: extraction.category || null,
        model_key,
        ean_gtin: extraction.ean_gtin || null,
        mpn: extraction.mpn || null,
        price: extraction.price ?? candidate.inline_price ?? null,
        currency: extraction.currency || 'CHF',
        availability: extraction.availability || null,
        condition_text: null,
        image_url,
        deeplink_url: extraction.deeplink_url || candidate.url,
        source_product_url: extraction.source_product_url || candidate.url,
        confidence_score: Number(extraction.confidence_score || 0.7),
        extraction_method: extraction.extraction_method || 'shop_catalog_ai_extract',
        extracted_json: {
          query,
          provider: source.provider,
          candidate_title: candidate.title,
          candidate_image_url: candidate.image_url || null,
          extraction,
        },
      })
    } catch (err) {
      if (typeof logImportDiagnostic === 'function') {
        await logImportDiagnostic({
          searchTaskId: task.id,
          searchTaskSourceId: source.id,
          stage: 'shop_catalog_product_fetch',
          status: 'error',
          message: String(err?.message || err),
          payload: { provider: source.provider, url: candidate.url, query },
        })
      }
    }
  }

  const imported = await storeSourceOffers(
    task.id,
    { ...source, provider: source.provider, source_kind: 'shop_catalog', seed_value: query },
    offers,
    searchUrl,
    'shop_catalog_import',
    source.id
  )

  return {
    discovered: picked.length,
    imported,
    sourceKey: swissSource?.source_key || source.provider,
  }
}
