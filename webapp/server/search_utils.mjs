const SEARCH_SYNONYMS = {
  iphone: ['iphone', 'apple iphone'],
  ipad: ['ipad', 'apple ipad'],
  mac: ['mac', 'macbook', 'apple macbook'],
  macbook: ['macbook', 'mac book', 'apple macbook'],
  airpods: ['airpods', 'air pods', 'apple airpods'],
  galaxy: ['galaxy', 'samsung galaxy'],
  samsung: ['samsung', 'galaxy', 'samsung galaxy'],
  ps5: ['ps5', 'playstation 5', 'playstation5'],
  playstation: ['playstation', 'playstation 5', 'ps5'],
  dyson: ['dyson']
}

export function expandSearchTerms(input = '') {
  const base = String(input || '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (!base) return []
  const terms = new Set([base])
  const tokens = base.replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(Boolean)
  for (const token of tokens) {
    const expanded = SEARCH_SYNONYMS[token] || []
    for (const value of expanded) terms.add(value)
  }
  if (base.includes('iphone')) terms.add('apple iphone')
  if (base.includes('macbook') || base === 'mac') terms.add('apple macbook')
  if (base.includes('galaxy')) terms.add('samsung galaxy')
  return [...terms].filter(Boolean).slice(0, 8)
}

export function buildSearchSqlParts(query = '') {
  const terms = expandSearchTerms(query)
  const params = []
  const filters = []
  const scoreParts = []

  for (const term of terms) {
    params.push(term.toLowerCase())
    const exactIdx = params.length
    params.push(`${term}%`)
    const prefixIdx = params.length
    params.push(`%${term}%`)
    const containsIdx = params.length

    filters.push(`p.title ILIKE $${containsIdx} OR p.brand ILIKE $${containsIdx} OR p.category ILIKE $${containsIdx}`)
    scoreParts.push(`(
      CASE WHEN LOWER(p.title) = $${exactIdx} THEN 180 ELSE 0 END +
      CASE WHEN p.title ILIKE $${prefixIdx} THEN 120 ELSE 0 END +
      CASE WHEN p.title ILIKE $${containsIdx} THEN 80 ELSE 0 END +
      CASE WHEN p.brand ILIKE $${prefixIdx} THEN 52 ELSE 0 END +
      CASE WHEN p.brand ILIKE $${containsIdx} THEN 36 ELSE 0 END +
      CASE WHEN p.category ILIKE $${containsIdx} THEN 18 ELSE 0 END
    )`)
  }

  return {
    params,
    whereSql: filters.length ? `WHERE ${filters.join(' OR ')}` : '',
    scoreSql: scoreParts.length ? scoreParts.join(' + ') : '0'
  }
}

export function mapDecision(dealScore) {
  return dealScore >= 88 ? { label: 'Jetzt kaufen' } : dealScore >= 78 ? { label: 'Guter Kauf' } : { label: 'Live Preis' }
}
