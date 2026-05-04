BEGIN;

UPDATE ai_seed_candidates
SET status = 'failed',
    notes = COALESCE(notes, '') || ' | rejected_non_product_seed',
    updated_at = NOW()
WHERE status IN ('pending','running')
  AND (
    query ILIKE '%Blizzard%'
    OR query ILIKE '%Privatserver%'
    OR query ILIKE '%Lipödem%'
    OR query ILIKE '%Erkrankung%'
    OR query ILIKE '%Steam-Release%'
    OR query ILIKE '%Solo-Entwickler%'
    OR query ILIKE '%Kindheitstraum%'
    OR query ILIKE '%Mummy%'
    OR query ILIKE '%Film%'
    OR query ILIKE '%News%'
    OR query ILIKE '%Artikel%'
    OR query ILIKE '%Beitrag%'
    OR query ILIKE '%Ratgeber%'
    OR query ILIKE '%Gutschein%'
    OR query ILIKE '%Mein Konto%'
  );

UPDATE search_tasks
SET status = 'failed',
    error_message = 'Nicht-Produkt Job gestoppt: Worker product-only cleanup.',
    finished_at = NOW(),
    updated_at = NOW()
WHERE status IN ('pending','running')
  AND trigger_type = 'autonomous_seed'
  AND (
    query ILIKE '%Blizzard%'
    OR query ILIKE '%Privatserver%'
    OR query ILIKE '%Lipödem%'
    OR query ILIKE '%Erkrankung%'
    OR query ILIKE '%Steam-Release%'
    OR query ILIKE '%Solo-Entwickler%'
    OR query ILIKE '%Kindheitstraum%'
    OR query ILIKE '%Mummy%'
    OR query ILIKE '%Film%'
    OR query ILIKE '%News%'
    OR query ILIKE '%Artikel%'
    OR query ILIKE '%Beitrag%'
    OR query ILIKE '%Ratgeber%'
    OR query ILIKE '%Gutschein%'
    OR query ILIKE '%Mein Konto%'
  );

UPDATE ai_runtime_controls
SET control_value_json = COALESCE(control_value_json, '{}'::jsonb)
  || '{"product_only":true,"seed_from_search_logs":false,"seed_from_canonical_titles":false,"enqueue_per_tick":1,"trending_limit":0,"baseline_limit":12,"seed_batch_size":12,"max_pending_candidates":80,"recycle_completed_after_hours":168}'::jsonb,
    updated_by = 'worker_product_only_seed_cleanup',
    updated_at = NOW()
WHERE control_key = 'autonomous_builder';

INSERT INTO ai_runtime_events(event_type, severity, event_payload_json, created_by, created_at)
VALUES (
  'worker_product_only_seed_cleanup',
  'warning',
  jsonb_build_object(
    'pending_seeds', (SELECT COUNT(*) FROM ai_seed_candidates WHERE status = 'pending'),
    'running_seeds', (SELECT COUNT(*) FROM ai_seed_candidates WHERE status = 'running'),
    'active_tasks', (SELECT COUNT(*) FROM search_tasks WHERE status IN ('pending','running'))
  ),
  'worker_product_only_seed_cleanup',
  NOW()
);

COMMIT;
