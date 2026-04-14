BEGIN;

ALTER TABLE search_task_sources
  ADD COLUMN IF NOT EXISTS swiss_source_id BIGINT REFERENCES swiss_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS planner_reason TEXT,
  ADD COLUMN IF NOT EXISTS source_priority NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE search_task_sources
  ALTER COLUMN source_priority TYPE NUMERIC(12,2)
  USING COALESCE(source_priority, 0)::numeric;

CREATE UNIQUE INDEX IF NOT EXISTS idx_search_task_sources_unique_provider_kind
  ON search_task_sources(search_task_id, provider, source_kind);

ALTER TABLE ai_seed_candidates
  ADD COLUMN IF NOT EXISTS last_enqueued_task_id BIGINT REFERENCES search_tasks(id) ON DELETE SET NULL;

COMMIT;
