function normalizeKey(input = '') {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(chf|smartphone|notebook|kopfhorer|kopfhorer|headphones|laptop|tablet|tv|audio)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function canonicalSlug(id) {
  return `canonical-${id}`
}

export async function fetchCanonicalSearchResults(pool, query = '', limit = 60) {
  const q = String(query || '').trim()
  const params = []
  let where = ''
  if (q) {
    params.push(`%${q}%`)
    where = `WHERE cp.title ILIKE $1 OR cp.brand ILIKE $1 OR cp.category ILIKE $1 OR EXISTS (
      SELECT 1 FROM canonical_product_aliases cpa WHERE cpa.canonical_product_id = cp.id AND cpa.alias_text ILIKE $1
    )`
  }
  params.push(limit)
  const sql = `
    SELECT
      cp.id,
      cp.title,
      cp.brand,
      cp.category,
      cp.ai_summary,
      cp.image_url,
      COALESCE(cp.best_price, MIN(so.price)) AS price,
      COALESCE((ARRAY_AGG(so.provider ORDER BY so.price ASC NULLS LAST, so.updated_at DESC))[1], 'KI Index') AS shop_name,
      COALESCE(cp.offer_count, COUNT(so.*)::int) AS offer_count,
      COALESCE(cp.source_count, COUNT(DISTINCT so.provider)::int) AS source_count,
      COALESCE(cp.popularity_score, 0) AS popularity_score,
      COALESCE(cp.freshness_priority, 0) AS freshness_priority,
      COALESCE(cp.updated_at, NOW()) AS updated_at
    FROM canonical_products cp
    LEFT JOIN source_offers_v2 so ON so.canonical_product_id = cp.id AND so.is_active = true
    ${where}
    GROUP BY cp.id
    ORDER BY cp.popularity_score DESC, cp.freshness_priority DESC, updated_at DESC, price ASC NULLS LAST
    LIMIT $${params.length}
  `
  const result = await pool.query(sql, params)
  return result.rows.map((row) => ({
    slug: canonicalSlug(row.id),
    title: row.title,
    brand: row.brand,
    category: row.category,
    ai_summary: row.ai_summary,
    image_url: row.image_url,
    price: row.price != null ? Number(row.price) : null,
    shop_name: row.shop_name,
    offer_count: Number(row.offer_count || 0),
    source_count: Number(row.source_count || 0),
    popularity_score: Number(row.popularity_score || 0),
    freshness_priority: Number(row.freshness_priority || 0),
    updated_at: row.updated_at,
    is_canonical: true,
    canonical_id: row.id,
    decision: Number(row.offer_count || 0) >= 3 ? { label: 'KI Vergleich' } : { label: 'Live KI' }
  }))
}

export function mergeSearchResults(primary = [], canonical = [], limit = 100) {
  const seen = new Set()
  const out = []
  const push = (item) => {
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
    `SELECT id, title, brand, category, ai_summary, image_url, best_price, best_price_currency, offer_count, source_count, popularity_score, freshness_priority, updated_at
     FROM canonical_products WHERE id = $1 LIMIT 1`,
    [canonicalId]
  )
  if (!product.rows.length) return null

  const offers = await pool.query(
    `SELECT provider AS shop_name, price, currency, COALESCE(deeplink_url, source_product_url) AS product_url, source_product_url, image_url, updated_at
     FROM source_offers_v2
     WHERE canonical_product_id = $1 AND is_active = true
     ORDER BY price ASC NULLS LAST, updated_at DESC
     LIMIT 30`,
    [canonicalId]
  )

  const row = product.rows[0]
  const normalizedOffers = offers.rows.map((offer) => ({
    ...offer,
    price: offer.price != null ? Number(offer.price) : null,
    affiliate_url: offer.product_url || null,
    redirect_url: offer.product_url || null,
    is_hidden: false,
  }))
  const cheapest = normalizedOffers[0] || null

  return {
    slug: canonicalSlug(row.id),
    title: row.title,
    brand: row.brand,
    category: row.category,
    ai_summary: row.ai_summary,
    image_url: row.image_url,
    price: cheapest?.price ?? (row.best_price != null ? Number(row.best_price) : null),
    currency: row.best_price_currency || 'CHF',
    shop_name: cheapest?.shop_name || 'KI Index',
    product_url: cheapest?.product_url || null,
    redirect_url: cheapest?.redirect_url || null,
    offer_count: Number(row.offer_count || normalizedOffers.length || 0),
    source_count: Number(row.source_count || 0),
    popularity_score: Number(row.popularity_score || 0),
    freshness_priority: Number(row.freshness_priority || 0),
    decision: normalizedOffers.length >= 3 ? { label: 'KI Vergleich' } : { label: 'Live KI' },
    offers: normalizedOffers,
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
       WHERE canonical_product_id = $1 AND is_active = true AND LOWER(provider) = LOWER($2)
       ORDER BY price ASC NULLS LAST, updated_at DESC
       LIMIT 1`,
      [canonicalId, shop]
    )
  }
  if (!result?.rows?.length) {
    result = await pool.query(
      `SELECT provider AS shop_name, COALESCE(deeplink_url, source_product_url) AS target_url
       FROM source_offers_v2
       WHERE canonical_product_id = $1 AND is_active = true
       ORDER BY price ASC NULLS LAST, updated_at DESC
       LIMIT 1`,
      [canonicalId]
    )
  }
  return result.rows[0] || null
}
