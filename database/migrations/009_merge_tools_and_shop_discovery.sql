ALTER TABLE admin_shop_sources
  ADD COLUMN IF NOT EXISTS base_url TEXT,
  ADD COLUMN IF NOT EXISTS start_urls TEXT,
  ADD COLUMN IF NOT EXISTS discovery_notes TEXT;

CREATE TABLE IF NOT EXISTS product_merge_log (
  id BIGSERIAL PRIMARY KEY,
  source_slug TEXT NOT NULL,
  target_slug TEXT NOT NULL,
  merged_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
