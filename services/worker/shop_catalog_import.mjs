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
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
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
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

function absolutizeUrl(baseUrl = '', href = '') {
  try { return new URL(href, baseUrl).toString() } catch { return '' }
}

function looksSwissDomain(hostname = '') {
  return /\.ch$/i.test(hostname)
}

function looksLikeSearchUrl(url = '') {
  return /([?&](q|query|search|suche|keyword|text)=)|\/search|\/suche|\/produktsuche|catalogsearch|searchtext|searchresult|listing\.xhtml/i.test(String(url || ''))
}

function looksLikeProductUrl(url = '', query = '') {
  const raw = String(url || '')
  if (!raw || looksLikeSearchUrl(raw)) return false
  if (/\/cart|\/checkout|\/login|\/konto|\/account|\/service|\/hilfe|\/help|\/brand|\/marke|\/category|\/kategorie|\/blog|\/magazin|\/jobs/i.test(raw)) return false
  if (/\/product|\/p\/|\/artikel|\/item|\/products?\/|\/dp\/|\/buy\/|\/shop\/|\/de\/s1\/product|\/de\/product/i.test(raw)) return true
  const path = (() => { try { return new URL(raw).pathname } catch { return raw } })()
  if (/\d{5,}/.test(path)) return true
  const tokens = queryTokens(cleanCommerceQuery(query))
  const normalizedPath = normalizeSearchText(path.replace(/[-_]+/g, ' '))
  const hits = tokens.filter(token => normalizedPath.includes(token)).length
  return hits >= Math.min(2, tokens.length || 0)
}

function normalizePrice(raw) {
  if (raw == null) return null
  const cleaned = String(raw)
    .replace(/CHF/gi, '')
    .replace(/inkl\..*$/i, '')
    .replace(/zzgl\..*\$/i, '')
    .replace(/'/g, '')
    .replace(/‍/g, '')
    .replace(/[^\d.,/g, '')
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
  const dataSrcMatch = fragment.match(/<img[^>]+(?:data-src|data-image|data-original)=["']([^"']+)["']/i)
  if (dataSrcMatch?.[1]) candidates.push(absolutizeUrl(baseUrl, decodeHtml(dataSrcMatch[1])))
  const srcSetMatch = fragment.match(/<img[^>]+srcset=["']([^"']+)["']/i)
  if (srcSetMatch?.[1]) {
    const first = srcSetMatch[1].split(',')[0]?.trim()?.split(/\s+/)?.[0]
    if (first) candidates.push(absolutizeUrl(baseUrl, decodeHtml(first)))
  }
  return [...new Set(candidates.filter(Boolean))]
}

function extractOgImage(html = '', baseUrl = '') {
  const match = String(html).match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/i)
  if (match?.[1]) return absolutizeUrl(baseUrl, decodeHtml(match[1]))
  return null
}
