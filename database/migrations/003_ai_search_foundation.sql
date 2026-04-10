BEGIN;

CREATE TABLE IF NOT EXISTS canonical_products (
  id BIGSERIAL PRIMARY KEY,
  canonical_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  model_key TEXT,
  ean_gtin TEXT,
  mpn TEXT,
  image_url TEXT,
  specs_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_summary TEXT,
  popularity_score NUMERIC(12,4) NOT NULL DEFAULT 0,
  freshness_priority INTEGER NOT NULL DEFAULT 0,
  confidence_score NUMERIC(6,3) NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  offer_count INTEGER NOT NULL DEFAULT 0,
  best_price NUMERIC(12,2),
  best_price_currency TEXT DEFAULT 'CHF',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_enriched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_canonical_products_popularity ON canonical_products(popularity_score DESC, freshness_priority DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_products_brand_category ON canonical_products(brand, category);
CREATE INDEX IF NOT EXISTS idx_canonical_products_model_key ON canonical_products(model_key);

CREATE TABLE IF NOT EXISTS canonical_product_aliases (
  id BIGSERIAL PRIMARY KEY,
  canonical_product_id BIGINT NOT NULL REFERENCES canonical_products(id) ON DELETE CASCADE,
  alias_text TEXT NOT NULL,
  alias_type TEXT NOT NULL DEFAULT 'title',
  confidence_score NUMERIC(6,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(canonical_product_id, alias_text)
);
CREATE INDEX IF NOT EXISTS idx_canonical_alias_text ON canonical_product_aliases(alias_text);

CREATE TABLE IF NOT EXISTS source_pages (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  page_url TEXT NOT NULL,
  normalized_url TEXT,
  page_type TEXT NOT NULL DEFAULT 'unknown',
  http_status INTEGER,
  crawl_status TEXT NOT NULL DEFAULT 'pending',
  title TEXT,
  discovered_from TEXT,
  discovered_query TEXT,
  discovered_rank INTEGER,
  image_url TEXT,
  raw_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  extracted_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  fingerprint TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_crawled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, page_url)
);
CREATE INDEX IF NOT EXISTS idx_source_pages_kind_status ON source_pages(source_kind, crawl_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_pages_provider_type ON source_pages(provider, page_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS source_offers_v2 (
  id BIGSERIAL PRIMARY KEY,
  canonical_product_id BIGINT REFERENCES canonical_products(id) ON DELETE SET NULL,
  source_page_id BIGINT REFERENCES source_pages(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  provider_group TEXT,
  offer_title TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  model_key TEXT,
  ean_gtin TEXT,
  mpn TEXT,
  price NUMERIC(12,2),
  currency TEXT DEFAULT 'CHF',
  availability TEXT,
  condition_text TEXT,
  image_url TEXT,
  deeplink_url TEXT,
  source_product_url TEXT,
  confidence_score NUMERIC(6,3) NOT NULL DEFAULT 0,
  extraction_method TEXT,
  extracted_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_source_offers_v2_canonical ON source_offers_v2(canonical_product_id, price ASC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_offers_v2_provider ON source_offers_v2(provider, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_offers_v2_lookup ON source_offers_v2(model_key, ean_gtin, mpn);

CREATE TABLE IF NOT EXISTS search_tasks (
  id BIGSERIAL PRIMARY KEY,
  query TEXT NOT NULL,
  normalized_query TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'pending',
  strategy TEXT NOT NULL DEFAULT 'hybrid',
  user_visible_note TEXT,
  task_priority INTEGER NOT NULL DEFAULT 0,
  source_budget INTEGER NOT NULL DEFAULT 0,
  result_count INTEGER NOT NULL DEFAULT 0,
  discovered_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  requested_by TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_search_tasks_status_priority ON search_tasks(status, task_priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_search_tasks_query ON search_tasks(normalized_query, created_at DESC);

CREATE TABLE IF NOT EXISTS search_task_sources (
  id BIGSERIAL PRIMARY KEY,
  search_task_id BIGINT NOT NULL REFERENCES search_tasks(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  seed_value TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  discovered_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_search_task_sources_task ON search_task_sources(search_task_id, status, provider);

CREATE TABLE IF NOT EXISTS ai_merge_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_type TEXT NOT NULL DEFAULT 'canonical_merge',
  status TEXT NOT NULL DEFAULT 'pending',
  canonical_product_id BIGINT REFERENCES canonical_products(id) ON DELETE CASCADE,
  source_offer_id BIGINT REFERENCES source_offers_v2(id) ON DELETE CASCADE,
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_score NUMERIC(6,3) NOT NULL DEFAULT 0,
  requested_by TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_merge_jobs_status ON ai_merge_jobs(status, created_at ASC);

CREATE TABLE IF NOT EXISTS product_popularity_signals (
  id BIGSERIAL PRIMARY KEY,
  canonical_product_id BIGINT REFERENCES canonical_products(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  signal_value NUMERIC(12,4) NOT NULL DEFAULT 0,
  source_ref TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_popularity_signals_product ON product_popularity_signals(canonical_product_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS query_gap_log (
  id BIGSERIAL PRIMARY KEY,
  query TEXT NOT NULL,
  normalized_query TEXT,
  local_result_count INTEGER NOT NULL DEFAULT 0,
  live_task_created BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_query_gap_log_normalized ON query_gap_log(normalized_query, created_at DESC);

COMMIT;
