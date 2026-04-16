FROM node:20-alpine
WORKIDR /app/services/worker
COPY services/worker/package.json package.json
RUN npm install --omit=dev
COPY services/worker ./
COPY database /app/database
RUN node <<'EOF'
const fs = require('fs')
const path = '/app/services/worker/worker.mjs'
let worker = fs.readFileSync(path, 'utf8')

function ensureImport() {
  const target = "import { runOpenWebDiscovery } from './open_web_discovery.mjs'\n"
  const addition = "import { runOpenWebDiscovery } from './open_web_discovery.mjs'\nimport { importFromShopCatalog } from './shop_catalog_import.mjs'\n"
  if (worker.includes("import { importFromShopCatalog } from './shop_catalog_import.mjs'")) return
  if (worker.includes(target)) worker = worker.replace(target, addition)
}

function ensureShopCatalogHook() {
  if (worker.includes("source.source_kind === 'shop_catalog'")) return
  const needle = "async function processTaskSource(task, source) { const swissSource = await loadSwissSource(source.swiss_source_id); workerLog('task_source_start', { taskId: task.id, query: task.query, provider: source.provider, sourceKind: source.source_kind }); if (source.provider === 'toppreise' && source.source_kind === 'comparison_search') {"
  const replacement = "async function processTaskSource(task, source) { const swissSource = await loadSwissSource(source.swiss_source_id); workerLog('task_source_start', { taskId: task.id, query: task.query, provider: source.provider, sourceKind: source.source_kind }); if (source.source_kind === 'shop_catalog') { const result = await importFromShopCatalog({ task, source, swissSource, fetchText, storeSourceOffers, canonicalModelKey, brandFromTitle, sanitizeSourceKey, logImportDiagnostic }); await pool.query(`UPDATE search_task_sources SET status = CASE WHEN $2 > 0 THEN 'success' ELSE 'failed' END, discovered_count = $3, imported_count = $2, updated_at = NOW(), error_message = CASE WHEN $2 > 0 THEN NULL ELSE 'Shop-Katalog lieferte keine speicherbaren Offers.' END WHERE id = $1`, [source.id, result.imported, result.discovered]).catch(() => {}); workerLog('task_source_shop_catalog_result', { taskId: task.id, provider: source.provider, discovered: result.discovered, imported: result.imported }); return result } if (source.provider === 'toppreise' && source.source_kind === 'comparison_search') {"
  if (worker.includes(needle)) worker = worker.replace(needle, replacement)
}

ensureImport()
ensureShopCatalogHook()
fs.writeFileSync(path, worker)
EOF
CMD ["npm","start"]
