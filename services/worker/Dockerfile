FROM node:20-alpine
WORKDIR /app/services/worker
COPY services/worker/package.json package.json
RUN npm install --omit=dev
COPY services/worker ./
COPY database /app/database
RUN node <<'EOF'
const fs = require('fs')
const path = '/app/services/worker/worker.mjs'
let worker = fs.readFileSync(path, 'utf8')

function replaceOnce(needle, replacement, label) {
  if (worker.includes(replacement)) return
  if (!worker.includes(needle)) throw new Error(`Needle not found: ${label}`)
  worker = worker.replace(needle, replacement)
}

replaceOnce(
  "import { runOpenWebDiscovery } from './open_web_discovery.mjs'\n",
  "import { runOpenWebDiscovery } from './open_web_discovery.mjs'\nimport { importFromShopCatalog } from './shop_catalog_import.mjs'\n",
  'worker import'
)

replaceOnce(
  "const titleFromHostname = (hostname = '') => String(hostname || '').replace(/\\.(ch|com|net|shop)$/i, '').split(/[.-]+/).filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') || hostname\n",
  "const titleFromHostname = (hostname = '') => String(hostname || '').replace(/\\.(ch|com|net|shop)$/i, '').split(/[.-]+/).filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') || hostname\nfunction looksUsefulAutonomousQuery(input = '') { const raw = String(input || '').trim(); const normalized = normalizeSearchText(raw); if (!normalized) return false; if (normalized.length < 4) return false; const tokens = normalized.split(' ').filter(Boolean); if (!tokens.length) return false; if (tokens.every(token => token.length <= 2)) return false; if (tokens.length === 1 && tokens[0].length < 5) return false; return true }\n",
  'query quality function'
)

replaceOnce(
  "for (const item of finalSelection) await pool.query(`INSERT INTO search_task_sources(search_task_id, provider, source_kind, seed_value, status, swiss_source_id, planner_reason, source_priority) VALUES ($1,$2,$3,$4,'pending',$5,$6,$7)`, [task.id, item.source.source_key, item.source.source_kind, buildSeedValue(item.source, query), item.source.id, item.reason, item.score]).catch(() => {});",
  "const dedupedSelection = []; const seenSourceKeys = new Set(); for (const item of finalSelection) { const key = `${task.id}:${item.source.source_key}:${item.source.source_kind}`; if (seenSourceKeys.has(key)) continue; seenSourceKeys.add(key); dedupedSelection.push(item) } for (const item of dedupedSelection) await pool.query(`INSERT INTO search_task_sources(search_task_id, provider, source_kind, seed_value, status, swiss_source_id, planner_reason, source_priority) VALUES ($1,$2,$3,$4,'pending',$5,$6,$7) ON CONFLICT (search_task_id, provider, source_kind) DO UPDATE SET seed_value = EXCLUDED.seed_value, swiss_source_id = COALESCE(search_task_sources.swiss_source_id, EXCLUDED.swiss_source_id), planner_reason = EXCLUDED.planner_reason, source_priority = GREATEST(COALESCE(search_task_sources.source_priority, 0), COALESCE(EXCLUDED.source_priority, 0)), updated_at = NOW()`, [task.id, item.source.source_key, item.source.source_kind, buildSeedValue(item.source, query), item.source.id, item.reason, Number.isFinite(Number(item.score)) ? Number(item.score) : 0]).catch(() => {});",
  'dedupe task sources'
)

replaceOnce(
  "async function processAutonomousSeedCandidate(seed) { const task = await createSearchTask(seed.query, 'worker_autonomous', 'autonomous_seed'); await pool.query(`UPDATE ai_seed_candidates SET status = CASE WHEN $2 IS NULL THEN 'failed' ELSE 'completed' END, last_enqueued_task_id = $2, updated_at = NOW() WHERE id = $1`, [seed.id, task?.id || null]).catch(() => {}); workerLog('autonomous_seed_processed', { seedId: seed.id, query: seed.query, taskId: task?.id || null, result: task ? 'enqueued' : 'failed' }) }",
  "async function processAutonomousSeedCandidate(seed) { if (!looksUsefulAutonomousQuery(seed.query)) { await pool.query(`UPDATE ai_seed_candidates SET status = 'failed', notes = COALESCE(notes, '') || ' | rejected_low_quality_seed', updated_at = NOW() WHERE id = $1`, [seed.id]).catch(() => {}); workerLog('autonomous_seed_rejected', { seedId: seed.id, query: seed.query }); return } const task = await createSearchTask(seed.query, 'worker_autonomous', 'autonomous_seed'); await pool.query(`UPDATE ai_seed_candidates SET status = CASE WHEN $2::bigint IS NULL THEN 'failed' ELSE 'completed' END, last_enqueued_task_id = $2::bigint, updated_at = NOW() WHERE id = $1`, [seed.id, task?.id || null]).catch(() => {}); workerLog('autonomous_seed_processed', { seedId: seed.id, query: seed.query, taskId: task?.id || null, result: task ? 'enqueued' : 'failed' }) }",
  'seed candidate cast'
)

replaceOnce(
  "async function processTaskSource(task, source) { const swissSource = await loadSwissSource(source.swiss_source_id); workerLog('task_source_start', { taskId: task.id, query: task.query, provider: source.provider, sourceKind: source.source_kind }); if (source.provider === 'toppreise' && source.source_kind === 'comparison_search') {",
  "async function processTaskSource(task, source) { const swissSource = await loadSwissSource(source.swiss_source_id); workerLog('task_source_start', { taskId: task.id, query: task.query, provider: source.provider, sourceKind: source.source_kind }); if (source.source_kind === 'shop_catalog') { const result = await importFromShopCatalog({ task, source, swissSource, fetchText, storeSourceOffers, canonicalModelKey, brandFromTitle, sanitizeSourceKey, logImportDiagnostic }); await pool.query(`UPDATE search_task_sources SET status = CASE WHEN $2 > 0 THEN 'success' ELSE 'failed' END, discovered_count = $3, imported_count = $2, updated_at = NOW(), error_message = CASE WHEN $2 > 0 THEN NULL ELSE 'Shop-Katalog lieferte keine speicherbaren Offers.' END WHERE id = $1`, [source.id, result.imported, result.discovered]).catch(() => {}); workerLog('task_source_shop_catalog_result', { taskId: task.id, provider: source.provider, discovered: result.discovered, imported: result.imported }); return result } if (source.provider === 'toppreise' && source.source_kind === 'comparison_search') {",
  'shop catalog import hook'
)

fs.writeFileSync(path, worker)
EOF
CMD ["npm","start"]
