import { stripHtml, cleanCommerceQuery, queryTokens, normalizeSearchText, dedupeCandidates, extractOgImage, extractImageCandidates, parseAnchorCandidates, parseContainerCandidates, parseJsonProductCandidates, parseSearchForms, buildUrlFromForm, buildFallbackSearchCandidates } from './shop_parsers/shared.mjs'
import { parseDigitecCards } from './shop_parsers/digitec.mjs'
import { parseGalaxusCards } from './shop_parsers/galaxus.mjs'
import { parseAlternateCards } from './shop_parsers/alternate.mjs'

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai_service:3010'
const SEARCH_CANDIDATE_LIMIT = Number(process.env.SHOP_SEARCH_CANDIDATE_LIMIT || 28)
const SHOP_IMPORT_CARD_LIMIT = Number(process.env.SHOP_IMPORT_CARD_LIMIT || 20)
const SHOP_PRODUCT_FETCH_TIMEOUT_MS = Number(process.env.SHOP_PRODUCT_FETCH_TIMEOUT_MS || 14000)
const SHOP_AI_EXTRACT_LIMIT = Number(process.env.SHOP_AI_EXTRACT_LIMIT || 8)

function selectShopParser(provider = '') {
  if (provider === 'digitec') return parseDigitecCards
  if (provider === 'galaxus') return parseGalaxusCards
  if (provider === 'alternate_ch') return parseAlternateCards
  return null
}

function rankLocal(items = []) {
  const unique = []
  const seen = new Set()
  for (const item of items) {
    if (!item?.url || seen.has(item.url)) continue
    seen.add(item.url)
    unique.push(item)
  }
  return unique.sort((a, b) => {
    const as = (a.title_hit_count * 4) + (a.url_hit_count * 2) + (a.inline_price != null ? 2 : 0) + (a.image_url ? 3 : 0)
    const bs = (b.title_hit_count * 4) + (b.url_hit_count * 2) + (b.inline_price != null ? 2 : 0) + (b.image_url ? 3 : 0)
    return bs - as
  })
}

function parseGenericShopCandidates(html = '', pageUrl = '', query = '', provider = '') {
  return rankLocal([
    ...parseJsonProductCandidates(html, pageUrl, query, provider),
    ...parseContainerCandidates(html, pageUrl, query, provider),
    ...parseAnchorCandidates(html, pageUrl, query, provider),
  ])
}

function extractSearchSignals(html = '', query = '') {
  const cleanedQuery = cleanCommerceQuery(query)
  const text = normalizeSearchText(stripHtml(html))
  const tokens = queryTokens(cleanedQuery)
  return {
    queryHits: tokens.filter(token => text.includes(token)).length,
    priceHits: (String(html).match(/CHF\s?[0-9]/gi) || []).length,
    titleLikeHits: (String(html).match(/<h[1-4][^>]*>/gi) || []).length,
    emptySignals: /(keine treffer|0 treffer|no results|nichts gefunden|leider nichts gefunden)/i.test(html),
    homeSignals: /(newsletter|hero-banner|unsere angebote|beliebte kategorien)/i.test(html),
  }
}

function getCandidatesForProvider(html = '', url = '', query = '', provider = '') {
  const parser = selectShopParser(provider)
  return parser ? parser(html, url, query) : parseGenericShopCandidates(html, url, query, provider)
}

function scoreSearchHtml(html = '', searchUrl = '', query = '', provider = '') {
  const cleanedQuery = cleanCommerceQuery(query)
  const candidates = getCandidatesForProvider(html, searchUrl, cleanedQuery, provider)
  const { queryHits, priceHits, titleLikeHits, emptySignals, homeSignals } = extractSearchSignals(html, cleanedQuery)
  let score = 0
  score += Math.min(24, queryHits * 6)
  score += Math.min(52, candidates.length * 4)
  score += Math.min(12, candidates.filter(candidate => candidate.image_url).length * 3)
  score += Math.min(10, priceHits)
  score += Math.min(6, titleLikeHits)
  if (/([?&](q|query|search|suche|keyword|text)=)|\/search|\/suche|\/produktsuche|catalogsearch|searchtext|searchresult|listing\.xhtml/i.test(String(searchUrl || ''))) score += 6
  if (emptySignals) score -= 20
  if (homeSignals && candidates.length < 2) score -= 8
  return score
}

async function tryFetch(url, fetchText, timeoutMs = null) {
  try {
    const html = timeoutMs == null ? await fetchText(url) : await fetchText(url, timeoutMs)
    return { ok: true, html }
  } catch (error) {
    return { ok: false, error: String(error?.message || error || 'Unknown error') }
  }
}

async function resolveShopSearchContext({ task, source, swissSource, fetchText, logImportDiagnostic = null }) {
  const rawQuery = task.query || source.seed_value || ''
  const query = cleanCommerceQuery(rawQuery)
  const homepageUrl = swissSource?.base_url || (source.seed_value && /^https?:\/\//i.test(source.seed_value) ? source.seed_value : null)
  const candidates = []

  if (swissSource?.search_url_template) candidates.push({ url: swissSource.search_url_template.replace('{query}', encodeURIComponent(query)), reason: 'configured_template', method: 'GET' })

  let homepageHtml = null
  if (homepageUrl && /^https?:\/\//i.test(homepageUrl)) {
    const homepageResult = await tryFetch(homepageUrl, fetchText)
    if (homepageResult.ok) {
      homepageHtml = homepageResult.html
      for (const form of parseSearchForms(homepageHtml, homepageUrl)) {
        const built = buildUrlFromForm(form, query)
        if (built) candidates.push({ url: built, reason: form.searchLike ? 'homepage_search_form' : 'homepage_form_guess', method: form.method })
      }
      candidates.push(...buildFallbackSearchCandidates(homepageUrl, query))
    } else if (typeof logImportDiagnostic === 'function') {
      await logImportDiagnostic({ searchTaskId: task.id, searchTaskSourceId: source.id, stage: 'shop_catalog_homepage_fetch', status: 'warning', message: 'Could not load shop homepage for search-url discovery', payload: { provider: source.provider, homepageUrl, error: homepageResult.error } })
    }
  }

  const uniqueCandidates = dedupeCandidates(candidates)
  let best = null
  for (const candidate of uniqueCandidates.slice(0, SEARCH_CANDIDATE_LIMIT)) {
    const fetched = await tryFetch(candidate.url, fetchText)
    if (!fetched.ok) {
      if (typeof logImportDiagnostic === 'function') await logImportDiagnostic({ searchTaskId: task.id, searchTaskSourceId: source.id, stage: 'shop_catalog_search_candidate', status: 'warning', message: 'Search candidate fetch failed', payload: { provider: source.provider, candidateUrl: candidate.url, reason: candidate.reason, error: fetched.error } })
      continue
    }
    const item = { ...candidate, searchUrl: candidate.url, searchHtml: fetched.html, score: scoreSearchHtml(fetched.html, candidate.url, query, source.provider) }
    if (!best || item.score > best.score) best = item
  }

  if (typeof logImportDiagnostic === 'function') await logImportDiagnostic({ searchTaskId: task.id, searchTaskSourceId: source.id, stage: 'shop_catalog_search_url_resolution', status: best ? 'success' : 'warning', message: best ? 'Resolved shop search URL dynamically' : 'Could not resolve a shop search URL', payload: { provider: source.provider, rawQuery, query, homepageUrl, bestSearchUrl: best?.searchUrl || null, bestScore: best?.score || 0, candidateCount: uniqueCandidates.length, triedCandidateCount: Math.min(uniqueCandidates.length, SEARCH_CANDIDATE_LIMIT) } })

  return { rawQuery, query, homepageUrl, homepageHtml, searchUrl: best?.searchUrl || null, searchHtml: best?.searchHtml || null, searchScore: best?.score || 0 }
}

async function callAiExtract({ html, url, query, source }) {
  const res = await fetch(`${AI_SERVICE_URL}/extract`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html, url, query, source }) })
  if (!res.ok) throw new Error(`AI extract HTTP ${res.status}`)
  const data = await res.json()
  return data?.extraction || null
}

function enrichCandidateImage(candidate, html = '', url = '') {
  const imageUrl = candidate.image_url || extractOgImage(html, url) || extractImageCandidates(html, url)[0] || null
  return imageUrl ? { ...candidate, image_url: imageUrl } : candidate
}

function buildOfferFromExtraction(extraction, candidate, source, query, searchUrl, searchScore, { canonicalModelKey, brandFromTitle, sanitizeSourceKey }, inlineOgImage = null) {
  if (!extraction?.title) return null
  const brand = extraction.brand || brandFromTitle(extraction.title)
  const model_key = extraction.model_key || canonicalModelKey({ brand, title: extraction.title, specs: [extraction.mpn, extraction.ean_gtin].filter(Boolean).join(' ') })
  return { provider: sanitizeSourceKey(source.provider) || source.provider, provider_group: 'shop_catalog', offer_title: extraction.title, brand, category: extraction.category || null, model_key, ean_gtin: extraction.ean_gtin || null, mpn: extraction.mpn || null, price: extraction.price ?? candidate.inline_price ?? null, currency: extraction.currency || 'CHF', availability: extraction.availability || null, condition_text: null, image_url: extraction.image_url || candidate.image_url || inlineOgImage || null, deeplink_url: extraction.deeplink_url || candidate.url, source_product_url: extraction.source_product_url || candidate.url, confidence_score: Number(extraction.confidence_score || 0.7), extraction_method: extraction.extraction_method || 'shop_catalog_ai_extract', extracted_json: { query, provider: source.provider, search_url: searchUrl, search_score: searchScore, candidate_title: candidate.title, candidate_image_url: candidate.image_url || null, extraction } }
}

function buildFallbackOfferFromCandidate(candidate, source, query, searchUrl, searchScore, { canonicalModelKey, brandFromTitle, sanitizeSourceKey }, inlineOgImage = null) {
  if (!candidate?.title || !candidate?.url) return null
  const brand = brandFromTitle(candidate.title)
  const model_key = canonicalModelKey({ brand, title: candidate.title, specs: '' })
  return { provider: sanitizeSourceKey(source.provider) || source.provider, provider_group: 'shop_catalog', offer_title: candidate.title, brand, category: null, model_key, ean_gtin: null, mpn: null, price: candidate.inline_price ?? null, currency: 'CHF', availability: null, condition_text: null, image_url: candidate.image_url || inlineOgImage || null, deeplink_url: candidate.url, source_product_url: candidate.url, confidence_score: candidate.inline_price != null ? 0.58 : (candidate.image_url ? 0.52 : 0.42), extraction_method: candidate.inline_price != null || candidate.image_url ? 'shop_catalog_card_fallback' : 'shop_catalog_link_fallback', extracted_json: { query, provider: source.provider, search_url: searchUrl, search_score: searchScore, fallback: true, candidate, stored_for_fast_db_results: true } }
}

export async function importFromShopCatalog({ task, source, swissSource, fetchText, storeSourceOffers, canonicalModelKey, brandFromTitle, sanitizeSourceKey, logImportDiagnostic = null }) {
  const resolved = await resolveShopSearchContext({ task, source, swissSource, fetchText, logImportDiagnostic })
  const query = resolved.query
  const searchUrl = resolved.searchUrl
  const searchHtml = resolved.searchHtml

  if (!searchUrl || !searchHtml) {
    if (typeof logImportDiagnostic === 'function') await logImportDiagnostic({ searchTaskId: task.id, searchTaskSourceId: source.id, stage: 'shop_catalog_search_url', status: 'warning', message: 'No usable search URL for shop catalog source', payload: { provider: source.provider, searchUrl, rawQuery: resolved.rawQuery, query, homepageUrl: resolved.homepageUrl } })
    return { discovered: 0, imported: 0, sourceKey: source.provider }
  }

  const inlineOgImage = extractOgImage(searchHtml, searchUrl)
  const picked = getCandidatesForProvider(searchHtml, searchUrl, query, source.provider).slice(0, SHOP_IMPORT_CARD_LIMIT)
  if (typeof logImportDiagnostic === 'function') await logImportDiagnostic({ searchTaskId: task.id, searchTaskSourceId: source.id, stage: 'shop_catalog_candidates', status: picked.length ? 'success' : 'warning', message: `Parsed ${picked.length} shop catalog candidates`, payload: { provider: source.provider, parser: selectShopParser(source.provider) ? source.provider : 'generic', rawQuery: resolved.rawQuery, query, searchUrl, searchScore: resolved.searchScore, imageCandidates: picked.filter(candidate => candidate.image_url).length, candidates: picked.slice(0, 5) } })

  const offers = []
  let aiExtracts = 0
  for (const originalCandidate of picked) {
    let candidate = originalCandidate
    try {
      const productResult = await tryFetch(candidate.url, fetchText, SHOP_PRODUCT_FETCH_TIMEOUT_MS)
      if (productResult.ok) candidate = enrichCandidateImage(candidate, productResult.html, candidate.url)
      let extraction = null
      if (productResult.ok && aiExtracts < SHOP_AI_EXTRACT_LIMIT) {
        aiExtracts += 1
        extraction = await callAiExtract({ html: productResult.html, url: candidate.url, query, source: `shop_catalog:${source.provider}` })
      }
      const offer = buildOfferFromExtraction(extraction, candidate, source, query, searchUrl, resolved.searchScore, { canonicalModelKey, brandFromTitle, sanitizeSourceKey }, inlineOgImage) || buildFallbackOfferFromCandidate(candidate, source, query, searchUrl, resolved.searchScore, { canonicalModelKey, brandFromTitle, sanitizeSourceKey }, inlineOgImage)
      if (offer) offers.push(offer)
    } catch (err) {
      const fallbackOffer = buildFallbackOfferFromCandidate(candidate, source, query, searchUrl, resolved.searchScore, { canonicalModelKey, brandFromTitle, sanitizeSourceKey }, inlineOgImage)
      if (fallbackOffer) offers.push(fallbackOffer)
      if (typeof logImportDiagnostic === 'function') await logImportDiagnostic({ searchTaskId: task.id, searchTaskSourceId: source.id, stage: 'shop_catalog_product_fetch', status: fallbackOffer ? 'warning' : 'error', message: fallbackOffer ? 'Product fetch failed, fallback offer stored' : String(err?.message || err), payload: { provider: source.provider, url: candidate.url, rawQuery: resolved.rawQuery, query, searchUrl } })
    }
  }

  const imported = await storeSourceOffers(task.id, { ...source, provider: source.provider, source_kind: 'shop_catalog', seed_value: query }, offers, searchUrl, 'shop_catalog_import', source.id)
  return { discovered: picked.length, imported, sourceKey: swissSource?.source_key || source.provider }
}
