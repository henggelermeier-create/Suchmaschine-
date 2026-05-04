function sanitizeSourceKey(input = '') {
  const key = String(input || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\.[a-z]{2,}.*$/i, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return key || null
}

function normalizeBaseUrl(input = '') {
  const raw = String(input || '').trim()
  if (!raw) return null
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    return `${url.protocol}//${url.hostname}`
  } catch {
    return null
  }
}

function buildSearchTemplate(baseUrl, input = '') {
  const raw = String(input || '').trim()
  if (raw) return raw.includes('{query}') ? raw : `${raw}${raw.includes('?') ? '&' : '?'}q={query}`
  return `${baseUrl}/search?q={query}`
}

export function registerAdminManualSourceRoutes(app, { pool, auth, logAiRuntimeEvent }) {
  app.post('/api/admin/swiss-sources', auth, async (req, res) => {
    const body = req.body || {}
    const displayName = String(body.displayName || body.display_name || body.name || '').trim()
    const baseUrl = normalizeBaseUrl(body.baseUrl || body.base_url || body.url || '')
    if (!displayName || !baseUrl) return res.status(400).json({ error: 'Name und Shop-URL sind nötig.' })

    const sourceKey = sanitizeSourceKey(body.sourceKey || body.source_key || displayName || baseUrl)
    if (!sourceKey) return res.status(400).json({ error: 'Source Key konnte nicht erstellt werden.' })

    const categories = Array.isArray(body.categories) && body.categories.length ? body.categories : ['electronics', 'home', 'fashion']
    const searchUrlTemplate = buildSearchTemplate(baseUrl, body.searchUrlTemplate || body.search_url_template || '')
    const priority = Number(body.priority || 61)
    const confidence = Number(body.confidenceScore || body.confidence_score || 0.62)

    const result = await pool.query(`
      INSERT INTO swiss_sources(source_key, display_name, provider_kind, source_kind, country_code, language_code, base_url, search_url_template, categories_json, priority, confidence_score, refresh_interval_minutes, is_active, notes, manual_boost, updated_at)
      VALUES ($1,$2,'shop_source','shop_catalog','CH','de',$3,$4,$5::jsonb,$6,$7,180,TRUE,$8,2,NOW())
      ON CONFLICT (source_key) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        base_url = EXCLUDED.base_url,
        search_url_template = EXCLUDED.search_url_template,
        categories_json = EXCLUDED.categories_json,
        priority = GREATEST(swiss_sources.priority, EXCLUDED.priority),
        confidence_score = GREATEST(swiss_sources.confidence_score, EXCLUDED.confidence_score),
        is_active = TRUE,
        manual_boost = GREATEST(COALESCE(swiss_sources.manual_boost, 0), 2),
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *
    `, [sourceKey, displayName, baseUrl, searchUrlTemplate, JSON.stringify(categories), priority, confidence, body.notes || 'Manuell im Admin hinzugefügt.'])

    await logAiRuntimeEvent?.('admin_manual_source_added', sourceKey, 'info', { displayName, baseUrl, searchUrlTemplate }, req.user?.email || 'admin')
    res.json({ ok: true, item: result.rows[0] })
  })
}
