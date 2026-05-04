BEGIN;

UPDATE search_tasks
SET status = 'failed',
    error_message = 'Nicht-Produkt Job gestoppt: Kauvio verarbeitet nur Produkt-Preisvergleiche.',
    finished_at = NOW(),
    updated_at = NOW()
WHERE status IN ('pending','running')
  AND (
    query ILIKE '%Gutschein%'
    OR query ILIKE '%Mein Konto%'
    OR query ILIKE '%Login%'
    OR query ILIKE '%Warenkorb%'
    OR query ILIKE '%Checkout%'
    OR query ILIKE '%Ratgeber%'
    OR query ILIKE '%News%'
    OR query ILIKE '%Artikel%'
    OR query ILIKE '%Beitrag%'
    OR query ILIKE '%Datenblatt%'
    OR query ILIKE '%PDF%'
    OR query ILIKE '%Ticket%'
    OR query ILIKE '%Service%'
  );

UPDATE search_task_sources
SET status = 'failed',
    error_message = 'Parent task ist kein Produkt-Preisvergleich.',
    updated_at = NOW()
WHERE search_task_id IN (
  SELECT id FROM search_tasks
  WHERE status = 'failed'
    AND error_message = 'Nicht-Produkt Job gestoppt: Kauvio verarbeitet nur Produkt-Preisvergleiche.'
    AND updated_at >= NOW() - INTERVAL '10 minutes'
);

UPDATE ai_runtime_controls
SET control_value_json = COALESCE(control_value_json, '{}'::jsonb)
  || '{"product_only":true,"enqueue_per_tick":1,"trending_limit":8,"baseline_limit":8,"seed_batch_size":30,"max_pending_candidates":120,"recycle_completed_after_hours":72}'::jsonb,
    updated_by = 'product_queue_cleanup',
    updated_at = NOW()
WHERE control_key = 'autonomous_builder';

INSERT INTO ai_runtime_events(event_type, severity, event_payload_json, created_by, created_at)
VALUES (
  'product_queue_cleanup',
  'warning',
  jsonb_build_object(
    'bad_jobs_stopped', (SELECT COUNT(*) FROM search_tasks WHERE status = 'failed' AND error_message = 'Nicht-Produkt Job gestoppt: Kauvio verarbeitet nur Produkt-Preisvergleiche.'),
    'active_sources', (SELECT COUNT(*) FROM swiss_sources WHERE is_active = true)
  ),
  'product_queue_cleanup',
  NOW()
);

COMMIT;
