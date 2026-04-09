CREATE TABLE IF NOT EXISTS shop_discovery_queue (
  id BIGSERIAL PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_group TEXT,
  page_url TEXT NOT NULL,
  page_type TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'pending',
  discovered_from TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_discovery_unique
  ON shop_discovery_queue(source_name, page_url);

CREATE INDEX IF NOT EXISTS idx_shop_discovery_status
  ON shop_discovery_queue(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_action_log (
  id BIGSERIAL PRIMARY KEY,
  action_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  payload_json TEXT,
  result_json TEXT,
  requested_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
