BEGIN;

CREATE TABLE IF NOT EXISTS ai_import_diagnostics (
  id BIGSERIAL PRIMARY KEY,
  search_task_id BIGINT NULL,
  search_task_source_id BIGINT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'info',
  message TEXT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_import_diagnostics_task_created
  ON ai_import_diagnostics(search_task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_import_diagnostics_source_created
  ON ai_import_diagnostics(search_task_source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_import_diagnostics_stage_created
  ON ai_import_diagnostics(stage, created_at DESC);

COMMIT;
