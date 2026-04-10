import { Pool } from 'pg'
import { normalizeDbUrl } from '../../database/normalize_db_url.mjs'
import { ensureCoreSchema } from '../../database/ensure_schema.mjs'
import { canonicalModelKey } from '../../webapp/server/ai_search_runtime.mjs'

const DATABASE_URL = normalizeDbUrl(process.env.DATABASE_URL)
const pool = new Pool({ connectionString: DATABASE_URL })
const INTERVAL_SECONDS = Number(process.env.AI_SEARCH_WORKER_INTERVAL_SECONDS || 30)

async function claimSearchTask() {
  const result = await pool.query(
    `UPDATE search_tasks
     SET status = 'running', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
     WHERE id = (
       SELECT id FROM search_tasks
       WHERE status = 'pending'
       ORDER BY task_priority DESC, created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`
  ).catch(() => ({ rows: [] }))
  return result.rows[0] || null
}

async function ensureCanonicalFromOffers(taskId) {
  const offers = await pool.query(
    `SELECT id, provider, offer_title, brand, category, model_key, image_url, price, currency
     FROM source_offers_v2
     WHERE canonical_product_id IS NULL
     ORDER BY updated_at DESC
     LIMIT 200`
  ).catch(() => ({ rows: [] }))

  let merged = 0
  for (const offer of offers.rows) {
    const modelKey = offer.model_key || canonicalModelKey({ brand: offer.brand, title: offer.offer_title })
    if (!modelKey) continue
    const existing = await pool.query(
      `SELECT id FROM canonical_products WHERE model_key = $1 LIMIT 1`,
      [modelKey]
    ).catch(() => ({ rows: [] }))

    let canonicalId = existing.rows[0]?.id
    if (!canonicalId) {
      const inserted = await pool.query(
        `INSERT INTO canonical_products(canonical_key, title, brand, category, model_key, image_url, best_price, best_price_currency, offer_count, source_count, confidence_score, created_at, updated_at, last_seen_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,1,0.7,NOW(),NOW(),NOW())
         RETURNING id`,
        [modelKey, offer.offer_title, offer.brand || null, offer.category || null, modelKey, offer.image_url || null, offer.price || null, offer.currency || 'CHF']
      ).catch(() => ({ rows: [] }))
      canonicalId = inserted.rows[0]?.id
    }

    if (!canonicalId) continue
    await pool.query(`UPDATE source_offers_v2 SET canonical_product_id = $1, model_key = $2, updated_at = NOW() WHERE id = $3`, [canonicalId, modelKey, offer.id]).catch(() => {})
    await pool.query(`UPDATE canonical_products SET offer_count = offer_count + 1, source_count = source_count + 1, updated_at = NOW(), last_seen_at = NOW() WHERE id = $1`, [canonicalId]).catch(() => {})
    await pool.query(`INSERT INTO ai_merge_jobs(job_type, status, canonical_product_id, source_offer_id, input_json, output_json, confidence_score, requested_by, started_at, finished_at, created_at, updated_at)
      VALUES ('canonical_merge','success',$1,$2,$3,$4,0.7,'ai_search_worker',NOW(),NOW(),NOW(),NOW())`, [canonicalId, offer.id, JSON.stringify({ taskId, offerId: offer.id }), JSON.stringify({ canonicalId, modelKey })]).catch(() => {})
    merged += 1
  }
  return merged
}

async function processSearchTask(task) {
  const merged = await ensureCanonicalFromOffers(task.id)
  await pool.query(
    `UPDATE search_tasks
     SET status = 'success', finished_at = NOW(), updated_at = NOW(), imported_count = imported_count + $2, result_count = imported_count + $2
     WHERE id = $1`,
    [task.id, merged]
  ).catch(() => {})
}

async function tick() {
  const task = await claimSearchTask()
  if (!task) return
  try {
    await processSearchTask(task)
  } catch (err) {
    await pool.query(
      `UPDATE search_tasks SET status = 'failed', finished_at = NOW(), updated_at = NOW(), error_message = $2 WHERE id = $1`,
      [task.id, String(err.message || err)]
    ).catch(() => {})
  }
}

async function start() {
  await ensureCoreSchema(pool)
  setInterval(() => { tick().catch(console.error) }, INTERVAL_SECONDS * 1000)
  tick().catch(console.error)
}

start().catch((err) => {
  console.error('[ai_search_worker] startup failed', err)
  process.exit(1)
})
