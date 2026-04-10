export function normalizeSearchText(input = '') {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function canonicalModelKey({ brand = '', title = '', specs = '' } = {}) {
  return normalizeSearchText(`${brand} ${title} ${specs}`)
    .replace(/\b(5g|lte|wifi|bluetooth|dual sim|esim|smartphone|notebook|headphones|kopfhorer|kopfhörer|staubsauger|black|white|blue|green|gray|grey|silver|gold)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function enqueueLiveSearchTask(pool, query, requestedBy = 'public') {
  const normalized = normalizeSearchText(query)
  if (!normalized) return null

  await pool.query(
    `INSERT INTO query_gap_log(query, normalized_query, local_result_count, live_task_created)
     VALUES ($1,$2,0,true)`,
    [query, normalized]
  ).catch(() => {})

  const existing = await pool.query(
    `SELECT id, query, normalized_query, status, strategy, user_visible_note, result_count, discovered_count, imported_count, created_at
     FROM search_tasks
     WHERE normalized_query = $1
       AND status IN ('pending', 'running')
       AND created_at >= NOW() - INTERVAL '30 minutes'
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalized]
  ).catch(() => ({ rows: [] }))
  if (existing.rows?.length) return existing.rows[0]

  const inserted = await pool.query(
    `INSERT INTO search_tasks(query, normalized_query, trigger_type, status, strategy, user_visible_note, task_priority, source_budget, requested_by)
     VALUES ($1,$2,'query_miss','pending','hybrid_ai_live','Wir bereiten gerade Live-Ergebnisse aus Schweizer Quellen auf.',60,25,$3)
     RETURNING id, query, normalized_query, status, strategy, user_visible_note, result_count, discovered_count, imported_count, created_at`,
    [query, normalized, requestedBy]
  )

  const task = inserted.rows[0]
  const seeds = [
    { provider: 'toppreise', source_kind: 'search_seed', seed_value: query },
    { provider: 'sitemap_discovery', source_kind: 'query_seed', seed_value: query },
    { provider: 'swiss_shop_scan', source_kind: 'query_seed', seed_value: query },
  ]
  for (const seed of seeds) {
    await pool.query(
      `INSERT INTO search_task_sources(search_task_id, provider, source_kind, seed_value, status)
       VALUES ($1,$2,$3,$4,'pending')`,
      [task.id, seed.provider, seed.source_kind, seed.seed_value]
    ).catch(() => {})
  }
  return task
}
