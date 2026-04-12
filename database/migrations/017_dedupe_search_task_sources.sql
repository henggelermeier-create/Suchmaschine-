BEGIN;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY search_task_id, provider, source_kind
      ORDER BY source_priority DESC, created_at ASC, id ASC
    ) AS rn
  FROM search_task_sources
)
DELETE FROM search_task_sources sts
USING ranked r
WHERE sts.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_search_task_sources_unique_provider_kind
  ON search_task_sources(search_task_id, provider, source_kind);

COMMIT;
