BEGIN;

CREATE TABLE IF NOT EXISTS products (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  ai_summary TEXT,
  deal_score INTEGER DEFAULT 0,
  price NUMERIC(12,2),
  currency TEXT DEFAULT 'CHF',
  shop_name TEXT,
  product_url TEXT,
  image_url TEXT,
  source_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_offers (
  id BIGSERIAL PRIMARY KEY,
  product_slug TEXT NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  shop_name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CHF',
  product_url TEXT,
  affiliate_url TEXT,
  image_url TEXT,
  source_name TEXT,
  source_group TEXT,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_offers_unique_shop ON product_offers(product_slug, shop_name);

CREATE TABLE IF NOT EXISTS alerts (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  product_slug TEXT NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  target_price NUMERIC(12,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS search_logs (
  id BIGSERIAL PRIMARY KEY,
  query TEXT,
  result_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crawler_runs (
  id BIGSERIAL PRIMARY KEY,
  source_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  items_found INTEGER NOT NULL DEFAULT 0,
  items_written INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbound_clicks (
  id BIGSERIAL PRIMARY KEY,
  product_slug TEXT,
  shop_name TEXT,
  target_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monitoring_events (
  id BIGSERIAL PRIMARY KEY,
  service_name TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crawl_jobs (
  id BIGSERIAL PRIMARY KEY,
  source_name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'fast',
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS admin_shop_sources (
  id SERIAL PRIMARY KEY,
  source_name TEXT NOT NULL UNIQUE,
  source_group TEXT,
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  base_url TEXT,
  start_urls TEXT,
  discovery_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_merge_log (
  id BIGSERIAL PRIMARY KEY,
  source_slug TEXT NOT NULL,
  target_slug TEXT NOT NULL,
  merged_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_discovery_unique ON shop_discovery_queue(source_name, page_url);

CREATE TABLE IF NOT EXISTS ai_action_log (
  id BIGSERIAL PRIMARY KEY,
  action_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  payload_json TEXT,
  result_json TEXT,
  requested_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO admin_shop_sources(source_name, source_group, display_name, is_active, base_url)
VALUES
  ('digitec', 'dg_group', 'Digitec', TRUE, 'https://www.digitec.ch'),
  ('galaxus', 'dg_group', 'Galaxus', TRUE, 'https://www.galaxus.ch'),
  ('brack', 'brack', 'BRACK', TRUE, 'https://www.brack.ch'),
  ('interdiscount', 'interdiscount', 'Interdiscount', TRUE, 'https://www.interdiscount.ch')
ON CONFLICT (source_name) DO NOTHING;

COMMIT;
