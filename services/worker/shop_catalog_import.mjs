
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

function stripHtml(html = '') {
  return decodeHtml(
    String(html || '')
      .replace(/<script[\r\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\r\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim()
}

function normalizeSearchText(input = '') {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function queryTokens(query = '') {
  return normalizeSearchText(query).split(' ').filter(token => token.length >= 2)
}

function cleanCommerceQuery(query = '') {
  const removeTokens = new Set([
    'schweiz', 'schweizer', 'swiss', 'preisvergleich', 'bestpreis', 'preis', 'vergleich',
    'angebote', 'angebot', 'deals', 'deal', 'kaufen', 'kauf', 'shop', 'shops', 'online',
    'guenstig', 'gunstig', 'aktion', 'sale', 'ch',
  ])
  const tokens = normalizeSearchText(query).split(' ').filter(Boolean)
  const filtered = tokens.filter(token => !removeTokens.has(token))
  const cleaned = filtered.join(' ').trim()
  return cleaned || normalizeSearchText(query)
}

function hostnameFromUrl(url = '') {
  try { return new URL(url).hostname.toLowerCase().replace(/^www./, '') } catch { return '' }
}

function absolutizeUrl(baseUrl = '', href = '') {
  try { return new URL(href, baseUrl).toString() } catch { return '' }
}

function looksSwissDomain(hostname = '') {
  return /\.ch$/i.test(hostname)
}

function looksLikeProductUrl(url = '') {
  return /\/product|\/p\/|\/artikel|\/item|\/products?\/|\/dp\/|\/buy\/|\/shop\/|\/de\/s1\/product|\/de\/product/i.test(String(url || ''))
}

function looksLikeSearchUrl(url = '') {
  return /([?&](q|query|search|suche|keyword|text)=)|\/search|\/suche|\/produktsuche|catalogsearch|searchtext|searchresult|listing\.xhtml/i.test(String(url || ''))
}

function normalizePrice(raw) {
  if (raw == null) return null
  const cleaned = String(raw)
    .replace(/CHF/gi, '')
    .replace(/nk\..*$/i, '')
    .replace(/zzgl\..*$/i, '')
    .replace(/'/g, '')
    .replace(/–/s, str) ..replace(/[^\d.,]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(/,/g, '.')
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

function dedupeCandidates(items = []) {
  const out = []
  const seen = new Set()
  for (const item of items) {
    const key = `${item?.url || ''}|${item?.method || ''}|${item?.reason || ''}`
    if (!item?.url || seen.has(key)) continue
    seen.add(key)
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

function countTokenHits(text = '', tokens = []) {
  const normalized = normalizeSearchText(text)
  return tokens.filter(token => normalized.includes(token)).length
}

function extractAnchorLabel(anchorAttrs = '', fragment = '') {
  const ariaMatch = anchorAttrs.match(/aria-label=["']([^"']+)["']/i)
  const titleAttrMatch = anchorAttrs.match(/title=["']([^"']+)["']/i)
  const attrLabel = decodeHtml(ariaMatch?.[1] || titleAttrMatch?.[1] || '').trim()
  const fragmentLabel = decodeHtml(fragment).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return attrLabel || fragmentLabel
}

function parseShopCatalogCandidates(html = '', pageUrl = '', query = '', provider = '') {
  const baseHost = hostnameFromUrl(pageUrl)
  const items = []
  const tokens = queryTokens(cleanCommerceQuery(query))
  const matches = [...String(html).matchAll(/<a([^>]*)href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]

  for (const match of matches) {
    const anchorAttrs = match[1] || ''
    const url = absolutizeUrl(pageUrl, decodeHtml(match[2]))
    const host = hostnameFromUrl(url)
    if (!url || !host || host !== baseHost || !looksSwissDomain(host)) continue
    if (!looksLikeProductUrl(url)) continue

    const fragment = match[3] || ''
    const title = extractAnchorLabel(anchorAttrs, fragment)
    if (!title || title.length < 8) continue

    const titleHitCount = countTokenHits(title, tokens)
    const urlHitCount = countTokenHits(url, tokens)
    if (tokens.length && titleHitCount === 0 && urlHitCount === 0) continue

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
      inline_price: normalizePrice(priceMatch?.[1] || null),
      title_hit_count: titleHitCount,
      url_hit_count: urlHitCount,
    })
  }

  return dedupeByUrl(items).sort((a, b) => {
    const aScore = (a.title_hit_count * 3) + a.url_hit_count + (a.inline_price != null ? 1 : 0)
    const bScore = (b.title_hit_count * 3) + b.url_hit_count + (b.inline_price != null ? 1 : 0)
    return bScore - aScore
  })
}

function parseSearchForms(html = '', baseUrl = '') {
  const forms = []
  const formMatches = [...String(html).matchAll(/<form([^>]*)>([\s\S]*?)<\/form>/gi)]

  for (const match of formMatches) {
    const attrs = match[1] || ''
    const inner = match[2] || ''
    const actionMatch = attrs.match(/action=["']([^"']+)["']/i)
    const methodMatch = attrs.match(/method=["']([^"']+)["']/i)
    const action = absolutizeUrl(baseUrl, decodeHtml(actionMatch?.[1] || baseUrl))
    const method = String(methodMatch?.[1] || 'GET').toUpperCase()
    const inputMatches = [...inner.matchAll(/<input([^>]*)>/gi)]
    let fieldName = null
    let searchLike = false

    for (const input of inputMatches) {
      const inputAttrs = input[1] || ''
      const typeMatch = inputAttrs.match(/type=["']([^"']+)["']/i)
      const nameMatch = inputAttrs.match(/name=["']([^"']+)["']/i)
      const placeholderMatch = inputAttrs.match(/placeholder=["']([^"']+)["']/i)
      const type = String(typeMatch?.[1] || 'text').toLowerCase()
      const name = decodeHtml(nameMatch?.[1] || '').trim()
      const placeholder = decodeHtml(placeholderMatch?.[1] || '').trim().toLowerCase()
      if (!name) continue
      if (['hidden', 'submit', 'button', 'reset', 'checkbox', 'radio'].includes(type)) continue
      const looksSearchField = type === 'search' || /(search|suche|query|keyword|q|text)/i.test(name) || /(such|search)/i.test(placeholder)
      if (!fieldName || looksSearchField) fieldName = name
      if (looksSearchField) searchLike = true
    }

    if (!fieldName || !action) continue
    forms.push({ action, method, fieldName, searchLike })
  }

  return forms
}

function buildUrlFromForm(form, query) {
  if (!form?.action || !form?.fieldName) return null
  try {
    const url = new URL(form.action)
    url.searchParams.set(form.fieldName, query)
    return url.toString()
  } catch {
    return null
  }
}

function buildFallbackSearchCandidates(baseUrl = '', query = '') {
  try {
    const base = new URL(baseUrl)
    const origin = `${base.protocol}//${base.host}`
    const encoded = encodeURIComponent(query)
    const candidates = [
      `${origin}/search?q=${encoded}`,
      `${origin}/search?query=${encoded}`,
      `${origin}/search?search=${encoded}`,
      `${origin}/suche?q=${encoded}`,
      `${origin}/suche?query=${encoded}`,
      `${origin}/suche?search=${encoded}`,
      `${origin}/produktsuche?q=${encoded}`,
      `${origin}/products?search=${encoded}`,
      `${origin}/catalogsearch/result/?q=${encoded}`,
      `${origin}/de/search?q=${encoded}`,
      `${origin}/de/search?query=${encoded}`,
      `${origin}/de/suche?q=${encoded}`,
      `${origin}/de/suche?query=${encoded}`,
      `${origin}/de/searchtext/${encoded}`,
      `${origin}/listing.xhtml?q=${encoded.replace(/%20/g, '+')}`,
    ]
    return dedupeCandidates(candidates.map(url => ({ url, reason: 'fallback_pattern', method: 'GET' })))
  } catch {
    return []
  }
}

function scoreSearchHtml(html = '', searchUrl = '', query = '') {
  const text = normalizeSearchText(stripH