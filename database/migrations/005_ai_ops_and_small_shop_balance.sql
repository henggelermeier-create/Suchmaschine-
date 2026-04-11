BEGIN;

ALTER TABLE swiss_sources
  ADD COLUMN IF NOT EXISTS source_size TEXT NOT NULL DEFAULT 'mid';
ALTER TABLE swiss_sources
  ADD COLUMN IF NOT EXISTS is_small_shop BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE swiss_sources
  ADD COLUMN IF NOT EXISTS discovery_weight NUMERIC(6,3) NOT NULL DEFAULT 1.0;
ALTER TABLE swiss_sources
  ADD COLUMN IF NOT EXISTS runtime_score NUMERIC(6,3) NOT NULL DEFAULT 1.0;
ALTER TABLE swiss_sources
  ADD COLUMN IF NOT EXISTS manual_boost NUMERIC(6,3) NOT NULL DEFAULT 0.0;
ALTER TABLE swiss_sources
  ADD COLUMN IF NOT EXISTS last_runtime_status TEXT;
ALTER TABLE swiss_sources
  ADD COLUMN IF NOT EXISTS last_runtime_error TEXT;
ALTER TABLE swiss_sources
  ADD COLUMN IF NOT EXISTS last_runtime_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_swiss_sources_small_shop ON swiss_sources(is_small_shop, is_active, priority DESC);

CREATE TABLE IF NOT EXISTS ai_runtime_controls (
  id BIGSERIAL PRIMARY KEY,
  control_key TEXT NOT NULL UNIQUE,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  control_value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_runtime_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  source_key TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  event_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_runtime_events_source ON ai_runtime_events(source_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_runtime_events_type ON ai_runtime_events(event_type, created_at DESC);

INSERT INTO ai_runtime_controls(control_key, is_enabled, control_value_json, description, updated_by)
VALUES
  ('small_shop_balance', true, '{"min_small_shops": 2, "boost": 18}'::jsonb, 'Sorgt dafür, dass kleine Schweizer Shops in der Live-Quellenplanung mitberücksichtigt werden.', 'migration'),
  ('runtime_auto_tuning', true, '{"degrade_on_error": 0.15, "promote_on_success": 0.05}'::jsonb, 'Passt Laufzeit- und Vertrauenswerte für Quellen an.', 'migration'),
  ('assistant_backend_actions', true, '{"allow_source_tuning": true, "allow_runtime_notes": true}'::jsonb, 'Erlaubt KI-gestützte Backend-Anpassungen für Quellen und Runtime.', 'migration')
ON CONFLICT (control_key) DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled,
  control_value_json = EXCLUDED.control_value_json,
  description = EXCLUDED.description,
  updated_at = NOW();

UPDATE swiss_sources
SET source_size = CASE
      WHEN source_key IN ('toppreise','digitec','galaxus','brack','interdiscount','mediamarkt') THEN 'large'
      WHEN source_key IN ('fust','melectronics','microspot') THEN 'mid'
      ELSE 'small'
    END,
    is_small_shop = CASE
      WHEN source_key IN ('nettoshop') THEN TRUE
      ELSE COALESCE(is_small_shop, FALSE)
    END,
    discovery_weight = CASE
      WHEN source_key IN ('nettoshop') THEN 1.25
      WHEN source_key IN ('fust','melectronics','microspot') THEN 1.1
      ELSE 1.0
    END,
    runtime_score = COALESCE(runtime_score, 1.0),
    manual_boost = COALESCE(manual_boost, 0.0),
    updated_at = NOW();

COMMIT;
