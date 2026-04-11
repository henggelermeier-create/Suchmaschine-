BEGIN;

CREATE TABLE IF NOT EXISTS ai_query_memory (
  normalized_query TEXT PRIMARY KEY,
  raw_query TEXT,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  total_result_count INTEGER NOT NULL DEFAULT 0,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_source_keys_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  learned_tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_query_memory_success ON ai_query_memory(success_count DESC, last_success_at DESC);

INSERT INTO ai_runtime_controls(control_key, is_enabled, control_value_json, description, updated_by)
VALUES (
  'query_learning',
  true,
  '{"source_boost": 35, "tag_boost": 10}'::jsonb,
  'Lernt aus erfolgreichen Suchläufen und priorisiert bei ähnlichen Suchen passende Quellen schneller.',
  'migration'
)
ON CONFLICT (control_key) DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled,
  control_value_json = EXCLUDED.control_value_json,
  description = EXCLUDED.description,
  updated_at = NOW();

COMMIT;
