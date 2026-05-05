function normalizeKey(input = '') {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(chf|smartphone|notebook|kopfhorer|headphones|laptop|tablet|tv|audio)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const PRODUCT_EXCLUDE_RE = /(gutschein|geschenkgutschein|gift\s*card|voucher|rabattcode|coupon|blog|ratgeber|news|artikel|beitrag|magazin|forum|datenblatt|produktdatenblatt|pdf|download|ersatzteil|zubehoer\s*set|versicherung|garantieverlängerung|service|reparatur|abo|subscription|mitgliedschaft|kurs|ticket|event)/i
const PRODUCT_SIGNAL_RE = /(iphone|ipad|macbook|galaxy|pixel|watch|airpods|kopfhörer|kopfhoerer|headphone|laptop|notebook|monitor|tv|oled|qled|tablet|kamera|speaker|lautsprecher|dyson|staubsauger|saugroboter|kaffeemaschine|bohrmaschine|akku|drucker|ssd|router|konsole|playstation|xbox|nintendo|smartphone|handy|gaming|sneaker|schuhe|jacke|rucksack|grill|velo|bike|trampolin)/i
const GENERIC_MODEL_TOKENS = new Set(['generaluberholt', 'generalüberholt', 'gebraucht', 'refurbished', 'refreshed', 'renewed', 'reconditioned', 'occasion', 'demo', 'vorfuhr', 'vorführ', 'handy', 'smartphone', 'black', 'white', 'schwarz', 'weiss', 'titanium', 'android', 'ios', 'zoll', 'cm', 'gb', 'tb', 'produkt', 'produktdatenblatt', 'auf', 'lager'])
const REFURBISHED_RE = /(general[üu]berholt|refurbished|refreshed|renewed|reconditioned|wiederaufbereitet|aufbereitet|remanufactured)/i
const USED_RE = /(occasion|gebraucht|used|second\s*hand|b-ware|b ware|demo|vorf[üu]hr|aussteller|retoure|r[üu]ckl[äa]ufer)/i
const NEW_RE = /\b(neu|new|originalverpackt|ovp|fabrikneu)\b/i

function canonicalSlug(id) {
  return `canonical-${id}`
}

function detectCondition(input = '') {
  const value = String(input || '')
  if (REFURBISHED_RE.test(value)) return 'refurbished'
  if (USED_RE.test(value)) return 'used'
  if (NEW_RE.test(value)) return 'new'
  return 'new'
}

function conditionLabel(condition = 'new') {
  if (condition === 'refurbished') return 'Generalüberholt'
  if (condition === 'used') return 'Occasion'
  return 'Neu'
}

function productWhereSql(alias = 'cp') {
  return `COALESCE(${alias}.is_hidden, false) = false
    AND COALESCE(${alias}.content_type, 'product') = 'product'
    AND COALESCE(${alias}.title, '') !~* '(gutschein|geschenkgutschein|gift[[:space:]]*card|voucher|rabattcode|coupon|blog|ratgeber|news|artikel|beitrag|magazin|forum|datenblatt|produktdatenblatt|pdf|download|versicherung|service|reparatur|abo|subscription|ticket|event)'
    AND (
      ${alias}.best_price IS NOT NULL
      OR EXISTS (SELECT 1 FROM source_offers_v2 so_filter WHERE so_filter.canonical_product_id = ${alias}.id AND so_filter.is_active = true AND so_filter.price IS NOT NULL)
    )`
}

function isLikelyProduct(row = {}) {
  const text = `${row.title || ''} ${row.category || ''} ${row.brand || ''}`
  if (!String(row.title || '').trim()) return false
  if (PRODUCT_EXCLUDE_RE.test(text)) return false
  if (row.price == null && Number(row.offer_count || 0) <= 0) return false
  if (PRODUCT_SIGNAL_RE.test(text)) return true
  return Number(row.offer_count || 0) > 0 && row.price != null
}

function decisionFromCanonical(row) {
  const price = row.price ?? row.best_price
  const avg = row.price_avg_30d
  const low = row.price_low_30d
  if (price != null && low != null && Number(price) <= Number(low) * 1.03) return { label: 'Top Preis' }
  if (price != null && avg != null && Number(price) <= Number(avg) * 0.95) return { label: 'Guter Preis' }
  if (row.deal_label) return { label: row.deal_label }
  if (Number(row.deal_score || 0) >= 90) return { label: 'Top Preis' }
  if (Number(row.deal_score || 0) >= 78) return { label: 'Guter Preis' }
  if (Number(row.offer_count || 0) >= 2) return { label: 'Preisvergleich' }
  return { label: 'Produktpreis' }
}

function mapCanonicalRow(row) {
  const condition = detectCondition(`${row.title || ''} ${row.condition_text || ''}`)
  return {
    slug: canonicalSlug(row.id),
    title: row.title,
    brand: row.brand,
    category: 'Produkt',
    condition,
    condition_label: conditionLabel(condition),
    ai_summary: row.ai_summary,
    image_url: row.image_url,
    price: row.price != null ? Number(row.price) : null,
    shop_name: row.shop_name,
    offer_count: Number(row.offer_count || 0),
    source_count: Number(row.source_count || 0),
    popularity_score: Number(row.popularity_score || 0),
    freshness_priority: Number(row.freshness_priority || 0),
    deal_score: Number(row.deal_score || 0),
    deal_label: row.deal_label || null,
    price_avg_30d: row.price_avg_30d != null ? Number(row.price_avg_30d) : null,
    price_low_30d: row.price_low_30d != null ? Number(row.price_low_30d) : null,
    price_high_30d: row.price_high_30d != null ? Number(row.price_high_30d) : null,
    updated_at: row.updated_at,
    is_canonical: true,
    canonical_id: row.id,
    decision: decisionFromCanonical(row),
  }
}

function mapProductRows(rows = []) {
  return rows.map(mapCanonicalRow).filter(isLikelyProduct)
}

function comparisonTokens(row = {}) {
  const titleTokens = normalizeKey(row.title || '').split(' ').filter(Boolean)
  const brandTokens = normalizeKey(row.brand || '').split(' ').filter(Boolean)
  const merged = [...brandTokens, ...titleTokens]
  const out = []
  for (const token of merged) {
    if (token.length < 2) continue
    if (GENERIC_MODEL_TOKENS.has(token)) continue
    if (!out.includes(token)) out.push(token)
    if (out.length >= 5) break
  }
  return out
}

function comparisonPatterns(row = {}) {
  const tokens = comparisonTokens(row)
  const patterns = []
  if (tokens.length >= 4) patterns.push(`%${tokens.slice(0, 4).join('%')}%`)
  if (tokens.length >= 3) patterns.push(`%${tokens.slice(0, 3).join('%')}%`)
  if (tokens.length >= 2) patterns.push(`%${tokens.slice(0, 2).join('%')}%`)
  return [...new Set(patterns)].slice(0, 3)
}

function cleanShopName(value = '') {
  return String(value || 'Shop').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

function conditionRank(condition = 'new') {
  if (condition === 'new') return 0
  if (condition === 'refurbished') return 1
  if (condition === 'used') return 2
  return 3
}

function bestOfferPerShop(offers = [], targetCondition = 'new') {
  const map = new Map()
  for (const offer of offers) {
    if (offer.price == null) continue
    const shop = cleanShopName(offer.shop_name)
    const offerText = `${offer.offer_title || ''} ${offer.condition_text || ''}`
    const condition = offer.condition || detectCondition(offerText)
    const key = `${condition}:${shop.toLowerCase()}`
    const normalized = { ...offer, condition, condition_label: conditionLabel(condition), shop_name: shop, price: Number(offer.price), affiliate_url: offer.product_url || null, redirect_url: offer.product_url || null, is_hidden: false, is_same_condition: condition === targetCondition }
    const previous = map.get(key)
    if (!previous || normalized.price < previous.price) map.set(key, normalized)
  }
  return [...map.values()].sort((a, b) => {
    if (a.condition === targetCondition && b.condition !== targetCondition) return -1
    if (a.condition !== targetCondition && b.condition === targetCondition) return 1
    if (conditionRank(a.condition) !== conditionRank(b.condition)) return conditionRank(a.condition) - conditionRank(b.condition)
    return a.price - b.price
  })
}

function priceJudgement({ price, avg, low, offerCount, condition = 'new', mixedConditions = false }) {
  const prefix = condition === 'new' ? 'Neuware' : conditionLabel(condition)
  if (price == null) return `KI Einschätzung: ${prefix} · Preis wird noch geprüft.`
  if (mixedConditions && condition !== 'new') return `KI Einschätzung: ${prefix} ist günstiger, aber nicht mit Neuware gleichsetzen.`
  if (low != null && price <= Number(low) * 1.03) return `KI Einschätzung: ${prefix} · Top Preis nahe am 30-Tage-Tief.`
  if (avg != null && price <= Number(avg) * 0.95) return `KI Einschätzung: ${prefix} · guter Preis unter dem Durchschnitt.`
  if (offerCount >= 3) return `KI Einschätzung: ${prefix} · Vergleich vorhanden, Preis fair prüfen.`
  return `KI Einschätzung: ${prefix} · Einzelpreis, weitere Shops werden geprüft.`
}

export async function fetchCanonicalSearchResults(pool, query = '', limit = 60) {
  const q = String(query || '').trim()
  const params = []
  const baseProductWhere = productWhereSql('cp')
  let where = `WHERE ${baseProductWhere}`
  if (q) {
    params.push(`%${q}%`)
    where += ` AND (cp.title ILIKE $1 OR cp.brand ILIKE $1 OR EXISTS (
      SELECT 1 FROM canonical_product_aliases cpa WHERE cpa.canonical_product_id = cp.id AND cpa.alias_text ILIKE $1
    ))`
  }
  params.push(limit)
  const sql = `
    SELECT
      cp.id,
      cp.title,
      cp.brand,
      cp.category,
      cp.ai_summary,
      COALESCE(cp.image_url, (ARRAY_AGG(so.image_url ORDER BY so.updated_at DESC))[1]) AS image_url,
      COALESCE(cp.best_price, MIN(so.price)) AS price,
      COALESCE((ARRAY_AGG(so.provider ORDER BY so.price ASC NULLS LAST, so.updated_at DESC))[1], 'KI Index') AS shop_name,
      COALESCE(cp.offer_count, COUNT(so.*)::int) AS offer_count,
      COALESCE(cp.source_count, COUNT(DISTINCT so.provider)::int) AS source_count,
      COALESCE(cp.popularity_score, 0) AS popularity_score,
      COALESCE(cp.freshness_priority, 0) AS freshness_priority,
      COALESCE(cp.deal_score, 0) AS deal_score,
      cp.deal_label,
      cp.price_avg_30d,
      cp.price_low_30d,
      cp.price_high_30d,
      COALESCE(cp.updated_at, NOW()) AS updated_at
    FROM canonical_products cp
    LEFT JOIN source_offers_v2 so ON so.canonical_product_id = cp.id AND so.is_active = true
    ${where}
    GROUP BY cp.id
    ORDER BY cp.popularity_score DESC, cp.freshness_priority DESC, updated_at DESC, price ASC NULLS LAST
    LIMIT $${params.length}
  `
  const result = await pool.query(sql, params)
  return mapProductRows(result.rows).slice(0, limit)
}

export async function fetchHomeComparisons(pool, limit = 6) {
  const poolSize = Math.max(Number(limit || 6) * 10, 48)
  const productFilter = productWhereSql('cp')
  const result = await pool.query(`
    WITH ranked AS (
      SELECT
        cp.id,
        cp.title,
        cp.brand,
        cp.category,
        cp.ai_summary,
        COALESCE(cp.image_url, (ARRAY_AGG(so.image_url ORDER BY so.updated_at DESC))[1]) AS image_url,
        COALESCE(cp.best_price, MIN(so.price)) AS price,
        COALESCE((ARRAY_AGG(so.provider ORDER BY so.price ASC NULLS LAST, so.updated_at DESC))[1], 'KI Index') AS shop_name,
        COALESCE(cp.offer_count, COUNT(so.*)::int) AS offer_count,
        COALESCE(cp.source_count, COUNT(DISTINCT so.provider)::int) AS source_count,
        COALESCE(cp.popularity_score, 0) AS popularity_score,
        COALESCE(cp.freshness_priority, 0) AS freshness_priority,
        COALESCE(cp.deal_score, 0) AS deal_score,
        cp.deal_label,
        cp.price_avg_30d,
        cp.price_low_30d,
        cp.price_high_30d,
        COALESCE(cp.updated_at, NOW()) AS updated_at,
        (COALESCE(cp.popularity_score, 0) * 0.30 + COALESCE(cp.freshness_priority, 0) * 0.25 + COALESCE(cp.deal_score, 0) * 0.25 + LEAST(COALESCE(cp.offer_count, 0), 10) * 5) AS trend_weight
      FROM canonical_products cp
      LEFT JOIN source_offers_v2 so ON so.canonical_product_id = cp.id AND so.is_active = true
      WHERE ${productFilter}
      GROUP BY cp.id
      HAVING COALESCE(cp.best_price, MIN(so.price)) IS NOT NULL
      ORDER BY trend_weight DESC, updated_at DESC
      LIMIT $2
    )
    SELECT *
    FROM ranked
    ORDER BY random() * GREATEST(trend_weight, 1) DESC, updated_at DESC
    LIMIT $1
  `, [limit, poolSize]).catch(() => ({ rows: [] }))
  return mapProductRows(result.rows).slice(0, limit)
}

export async function fetchCanonicalSuggestions(pool, query = '', limit = 8) {
  const q = String(query || '').trim()
  if (q.length < 2) return []
  const items = await fetchCanonicalSearchResults(pool, q, limit)
  return items.slice(0, limit)
}

export async function fetchSimilarCanonicalProducts(pool, canonicalId, limit = 6) {
  const base = await pool.query(`SELECT id, title, brand, category FROM canonical_products WHERE id = $1 AND ${productWhereSql('canonical_products')} LIMIT 1`, [canonicalId]).catch(() => ({ rows: [] }))
  const row = base.rows[0]
  if (!row) return []
  const result = await pool.query(`
    SELECT
      cp.id,
      cp.title,
      cp.brand,
      cp.category,
      cp.ai_summary,
      COALESCE(cp.image_url, (ARRAY_AGG(so.image_url ORDER BY so.updated_at DESC))[1]) AS image_url,
      COALESCE(cp.best_price, MIN(so.price)) AS price,
      COALESCE((ARRAY_AGG(so.provider ORDER BY so.price ASC NULLS LAST, so.updated_at DESC))[1], 'KI Index') AS shop_name,
      COALESCE(cp.offer_count, COUNT(so.*)::int) AS offer_count,
      COALESCE(cp.source_count, COUNT(DISTINCT so.provider)::int) AS source_count,
      COALESCE(cp.popularity_score, 0) AS popularity_score,
      COALESCE(cp.freshness_priority, 0) AS freshness_priority,
      COALESCE(cp.deal_score, 0) AS deal_score,
      cp.deal_label,
      cp.price_avg_30d,
      cp.price_low_30d,
      cp.price_high_30d,
      COALESCE(cp.updated_at, NOW()) AS updated_at
    FROM canonical_products cp
    LEFT JOIN source_offers_v2 so ON so.canonical_product_id = cp.id AND so.is_active = true
    WHERE cp.id <> $1 AND ${productWhereSql('cp')} AND (cp.brand = $2 OR cp.title ILIKE $3)
    GROUP BY cp.id
    ORDER BY (CASE WHEN cp.brand = $2 THEN 1 ELSE 0 END) DESC, cp.popularity_score DESC, cp.updated_at DESC
    LIMIT $4
  `, [canonicalId, row.brand || null, `%${(row.title || '').split(' ').slice(0, 2).join(' ')}%`, limit]).catch(() => ({ rows: [] }))
  return mapProductRows(result.rows).slice(0, limit)
}

export async function fetchRelatedSuggestions(pool, query = '', limit = 8) {
  const q = normalizeKey(query)
  if (!q) return []
  const tokens = q.split(' ').filter(Boolean)
  const prefix = tokens.slice(0, 2).join(' ')
  const result = await pool.query(`
    SELECT title FROM canonical_products cp
    WHERE ${productWhereSql('cp')} AND (title ILIKE $1 OR brand ILIKE $1)
    ORDER BY popularity_score DESC NULLS LAST, updated_at DESC
    LIMIT $2
  `, [`%${prefix}%`, limit]).catch(() => ({ rows: [] }))
  return [...new Set(result.rows.map((row) => row.title).filter(Boolean))].slice(0, limit)
}

export function mergeSearchResults(primary = [], canonical = [], limit = 100) {
  const seen = new Set()
  const out = []
  const push = (item) => {
    if (!isLikelyProduct(item)) return
    const key = normalizeKey(`${item.brand || ''} ${item.title || ''}`)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(item)
  }
  primary.forEach(push)
  canonical.forEach(push)
  return out.slice(0, limit)
}

export async function fetchCanonicalProductBySlug(pool, slug) {
  const match = String(slug || '').match(/^canonical-(\d+)$/)
  if (!match) return null
  const canonicalId = Number(match[1])
  if (!Number.isFinite(canonicalId)) return null

  const product = await pool.query(
    `SELECT id, title, brand, category, ai_summary, image_url, best_price, best_price_currency, offer_count, source_count, popularity_score, freshness_priority, deal_score, deal_label, price_avg_30d, price_low_30d, price_high_30d, model_key, canonical_key, updated_at
     FROM canonical_products cp WHERE id = $1 AND ${productWhereSql('cp')} LIMIT 1`,
    [canonicalId]
  )
  if (!product.rows.length) return null

  const row = product.rows[0]
  const targetCondition = detectCondition(row.title || '')
  const patterns = comparisonPatterns(row)
  const offers = await pool.query(
    `SELECT DISTINCT ON (LOWER(so.provider), so.source_product_url)
        so.provider AS shop_name,
        so.offer_title,
        so.condition_text,
        so.price,
        so.currency,
        COALESCE(so.deeplink_url, so.source_product_url) AS product_url,
        so.source_product_url,
        so.image_url,
        so.updated_at,
        cp.id AS matched_canonical_id
     FROM source_offers_v2 so
     JOIN canonical_products cp ON cp.id = so.canonical_product_id
     WHERE so.is_active = true
       AND so.price IS NOT NULL
       AND COALESCE(cp.is_hidden, false) = false
       AND (
         so.canonical_product_id = $1
         OR (NULLIF($2::text, '') IS NOT NULL AND cp.model_key = $2)
         OR (NULLIF($3::text, '') IS NOT NULL AND cp.canonical_key = $3)
         OR (NULLIF($4::text, '') IS NOT NULL AND LOWER(COALESCE(cp.brand, '')) = LOWER($4) AND (cp.title ILIKE ANY($5::text[]) OR so.offer_title ILIKE ANY($5::text[])))
         OR (cp.title ILIKE ANY($5::text[]) OR so.offer_title ILIKE ANY($5::text[]))
       )
     ORDER BY LOWER(so.provider), so.source_product_url, so.price ASC NULLS LAST, so.updated_at DESC
     LIMIT 160`,
    [canonicalId, row.model_key || '', row.canonical_key || '', row.brand || '', patterns.length ? patterns : [`%${String(row.title || '').slice(0, 24)}%`]]
  ).catch(() => ({ rows: [] }))

  const allOffers = bestOfferPerShop(offers.rows, targetCondition).slice(0, 60)
  const sameConditionOffers = allOffers.filter((offer) => offer.condition === targetCondition)
  const otherConditionOffers = allOffers.filter((offer) => offer.condition !== targetCondition)
  const normalizedOffers = [...sameConditionOffers, ...otherConditionOffers]
  const bestSameCondition = sameConditionOffers[0] || null
  const absoluteCheapest = allOffers.slice().sort((a, b) => a.price - b.price)[0] || null
  const cheapest = bestSameCondition || absoluteCheapest || null
  const fallbackImage = normalizedOffers.find((offer) => offer.image_url)?.image_url || null
  const offerCount = sameConditionOffers.length
  const bestPrice = cheapest?.price ?? (row.best_price != null ? Number(row.best_price) : null)
  const mixedConditions = otherConditionOffers.length > 0
  const aiSummary = priceJudgement({ price: bestPrice, avg: row.price_avg_30d != null ? Number(row.price_avg_30d) : null, low: row.price_low_30d != null ? Number(row.price_low_30d) : null, offerCount, condition: cheapest?.condition || targetCondition, mixedConditions })

  const similarItems = await fetchSimilarCanonicalProducts(pool, canonicalId, 6)
  const suggestions = await fetchRelatedSuggestions(pool, row.title || '', 8)

  return {
    slug: canonicalSlug(row.id),
    title: row.title,
    brand: row.brand,
    category: 'Produkt',
    condition: targetCondition,
    condition_label: conditionLabel(targetCondition),
    ai_summary: aiSummary,
    image_url: row.image_url || fallbackImage,
    price: bestPrice,
    currency: row.best_price_currency || cheapest?.currency || 'CHF',
    shop_name: cheapest?.shop_name || 'KI Index',
    product_url: cheapest?.product_url || null,
    redirect_url: cheapest?.redirect_url || null,
    offer_count: offerCount,
    source_count: offerCount,
    total_offer_count: normalizedOffers.length,
    has_mixed_conditions: mixedConditions,
    cheapest_condition: cheapest?.condition || targetCondition,
    cheapest_condition_label: conditionLabel(cheapest?.condition || targetCondition),
    absolute_best_price: absoluteCheapest?.price ?? null,
    absolute_best_condition: absoluteCheapest?.condition || null,
    popularity_score: Number(row.popularity_score || 0),
    freshness_priority: Number(row.freshness_priority || 0),
    deal_score: Number(row.deal_score || 0),
    deal_label: row.deal_label || null,
    price_avg_30d: row.price_avg_30d != null ? Number(row.price_avg_30d) : null,
    price_low_30d: row.price_low_30d != null ? Number(row.price_low_30d) : null,
    price_high_30d: row.price_high_30d != null ? Number(row.price_high_30d) : null,
    decision: decisionFromCanonical({ ...row, price: bestPrice, offer_count: offerCount }),
    offers: normalizedOffers,
    same_condition_offers: sameConditionOffers,
    other_condition_offers: otherConditionOffers,
    similarItems,
    suggestions,
    is_canonical: true,
    canonical_id: row.id,
    updated_at: row.updated_at,
  }
}

export async function resolveCanonicalRedirect(pool, slug, shop) {
  const match = String(slug || '').match(/^canonical-(\d+)$/)
  if (!match) return null
  const canonicalId = Number(match[1])
  if (!Number.isFinite(canonicalId)) return null

  let result
  if (shop) {
    result = await pool.query(
      `SELECT provider AS shop_name, COALESCE(deeplink_url, source_product_url) AS target_url
       FROM source_offers_v2
       WHERE canonical_product_id = $1 AND is_active = true AND price IS NOT NULL AND LOWER(provider) = LOWER($2)
       ORDER BY price ASC NULLS LAST, updated_at DESC
       LIMIT 1`,
      [canonicalId, shop]
    )
  }
  if (!result?.rows?.length) {
    result = await pool.query(
      `SELECT provider AS shop_name, COALESCE(deeplink_url, source_product_url) AS target_url
       FROM source_offers_v2
       WHERE canonical_product_id = $1 AND is_active = true AND price IS NOT NULL
       ORDER BY price ASC NULLS LAST, updated_at DESC
       LIMIT 1`,
      [canonicalId]
    )
  }
  return result.rows[0] || null
}
