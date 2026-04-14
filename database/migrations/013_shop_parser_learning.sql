BEGIN;

ALTER TABLE swiss_sources
ADD COLUMN IF NOT EXISTS parser_profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS learning_state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS preferred_parser TEXT,
ADD COLUMN IF NOT EXISTS preferred_image_strategy TEXT,
ADD COLUMN IF NOT EXISTS last_successful_import_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_successful_image_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS shop_learning_events (
  id BIGSERIAL PRIMARY KEY,
  swiss_source_id BIGINT NOT NULL REFERENCES swiss_sources(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  query TEXT,
  page_url TEXT,
  parser_name TEXT,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  score NUMERIC(6,3),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_learning_events_source
ON shop_learning_events(swiss_source_id, created_at DESC);

COMMIT;
