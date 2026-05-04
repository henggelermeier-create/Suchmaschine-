BEGIN;

-- Safe boot hotfix.
-- Previous versions of this migration attempted to recover products during server startup.
-- On production data, duplicate canonical keys inside the same INSERT could trigger:
-- "ON CONFLICT DO UPDATE command cannot affect row a second time".
-- Server startup must never depend on a risky recovery import, so this migration now only
-- performs safe queue cleanup and throttling. Product recovery/import must run in workers.

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY normalized_query
           ORDER BY imported_count DESC NULLS LAST, discovered_count DESC NULLS LAST, created_at ASC
         ) AS rn
  FROM search_tasks
  WHERE status IN ('pending','running')
    AND normalized_query IS NOT NULL
    AND normalized_query <> ''
    AND created_at >= NOW() - INTERVAL '72 hours'
)
UPDATE search_tasks st
SET status = 'failed',
    error_message = 'Deduped: duplicate active KI job stopped.',
    finished_at = NOW(),
    updated_at = NOW()
FROM ranked r
WHERE st.id = r.id
  AND r.rn > 1;

UPDATE search_task_sources sts
SET status = 'failed',
    error_message = 'Parent task deduped.',
    updated_at = NOW()
WHERE sts.search_task_id IN (
  SELECT id
  FROM search_tasks
  WHERE status = 'failed'
    AND error_message = 'Deduped: duplicate active KI job stopped.'
    AND updated_at >= NOW() - INTERVAL '5 minutes'
);

UPDATE ai_runtime_controls
SET control_value_json = COALESCE(control_value_json, '{}'::jsonb)
  || '{"enqueue_per_tick":1,"trending_limit":10,"baseline_limit":8,"seed_batch_size":50,"max_pending_candidates":250,"recycle_completed_after_hours":72}'::jsonb,
    updated_by = 'hotfix_safe_boot_021',
    updated_at = NOW()
WHERE control_key = 'autonomous_builder';

INSERT INTO ai_runtime_events(event_type, severity, event_payload_json, created_by, created_at)
VALUES (
  'hotfix_safe_boot_021',
  'warning',
  jsonb_build_object(
    'active_pending_tasks', (SELECT COUNT(*) FROM search_tasks WHERE status IN ('pending','running')),
    'note', 'Migration 021 made safe for server boot; product import handled by workers.'
  ),
  'hotfix_safe_boot_021',
  NOW()
);

COMMIT;
