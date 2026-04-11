BEGIN;

CREATE TABLE IF NOT EXISTS web_discovery_results (
  id BIGSERIAL PRIMARY KEY,
  search_task_id BIGINT REFERENCES search_tasks(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  source_domain TEXT,
  page_url TEXT NOT NULL,
  result_title TEXT,
  snippet TEXT,
  result_rank INTEGER,
  discovered_shop BOOLEAN NOT NULL DEFAULT FALSE,
  discovered_product BOOLEAN NOT NULL DEFAULT FALSE,
  extracted_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (search_task_id, page_url)
);

CREATE INDEX IF NOT EXISTS idx_web_discovery_results_domain
  ON web_discovery_results(source_domain, created_at DESC);

CREATE TABLE IF NOT EXISTS search_requests (
  id BIGSERIAL PRIMARY KEY,
  query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  session_key TEXT,
  email TEXT,
  latest_task_id BIGINT REFERENCES search_tasks(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  eta_minutes INTEGER NOT NULL DEFAULT 5,
  result_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_notified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_search_requests_normalized
  ON search_requests(normalized_query, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_requests_session
  ON search_requests(session_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_requests_email
  ON search_requests(email, updated_at DESC)
  WHERE email IS NOT NULL;

INSERT INTO ai_runtime_controls(control_key, is_enabled, control_value_json, description, updated_by)
VALUES
(
  'open_web_discovery',
  true,
  '{"result_limit": 10, "product_fetch_limit": 6, "search_timeout_ms": 25000}'::jsonb,
  'Sucht aktiv im offenen Web nach neuen Schweizer Shops und Produktseiten.',
  'migration'
),
(
  'search_request_waitlist',
  true,
  '{"default_eta_minutes": 6, "max_eta_minutes": 20}'::jsonb,
  'Speichert Suchaufträge mit ETA und optionaler E-Mail für spätere Ergebnisse.',
  'migration'
)
ON CONFLICT (control_key) DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled,
  control_value_json = EXCLUDED.control_value_json,
  description = EXCLUDED.description,
  updated_at = NOW();

COMMIT;
