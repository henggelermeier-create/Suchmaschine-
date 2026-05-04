BEGIN;

UPDATE search_tasks
SET created_at = created_at - INTERVAL '365 days',
    updated_at = NOW(),
    error_message = COALESCE(error_message, 'Archiviert') || ' | archived_non_product_admin'
WHERE status = 'failed'
  AND strategy = 'swiss_ai_live'
  AND (
    COALESCE(error_message, '') ILIKE '%Nicht-Produkt%'
    OR COALESCE(error_message, '') ILIKE '%Autonomer%'
    OR query ILIKE '%Gutschein%'
    OR query ILIKE '%Mein Konto%'
    OR query ILIKE '%News%'
    OR query ILIKE '%Artikel%'
    OR query ILIKE '%Beitrag%'
    OR query ILIKE '%Ratgeber%'
    OR query ILIKE '%Film%'
    OR query ILIKE '%Tarantino%'
    OR query ILIKE '%Apple streicht%'
    OR query ILIKE '%Reisegrösse%'
  );

INSERT INTO ai_runtime_events(event_type, severity, event_payload_json, created_by, created_at)
VALUES (
  'archive_failed_non_product_jobs',
  'info',
  jsonb_build_object(
    'archived_jobs', (SELECT COUNT(*) FROM search_tasks WHERE COALESCE(error_message, '') ILIKE '%archived_non_product_admin%'),
    'visible_product_jobs', (SELECT COUNT(*) FROM search_tasks WHERE strategy = 'swiss_product_price_compare' AND status IN ('pending','running','success'))
  ),
  'archive_failed_non_product_jobs',
  NOW()
);

COMMIT;
