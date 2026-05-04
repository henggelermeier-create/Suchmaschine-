BEGIN;

-- The worker import path is working, but autonomous_builder can still create
-- non-product seeds from old search logs/canonical titles. Pause only the
-- autonomous seeder; existing product price comparison jobs continue to run.
UPDATE ai_runtime_controls
SET is_enabled = FALSE,
    control_value_json = COALESCE(control_value_json, '{}'::jsonb)
      || '{"paused_reason":"product_only_hardening","product_only":true,"seed_from_search_logs":false,"seed_from_canonical_titles":false,"enqueue_per_tick":0,"trending_limit":0,"baseline_limit":0,"seed_batch_size":0,"max_pending_candidates":0}'::jsonb,
    updated_by = 'pause_non_product_seeder',
    updated_at = NOW()
WHERE control_key = 'autonomous_builder';

UPDATE ai_seed_candidates
SET status = 'failed',
    notes = COALESCE(notes, '') || ' | paused_non_product_autonomous_seed',
    updated_at = NOW()
WHERE status IN ('pending','running')
  AND seed_source IN ('trending_search_log','popular_canonical','inventory_target','autonomous_seed')
  AND normalized_query NOT IN (
    'iphone 16 pro 256gb',
    'samsung galaxy s24 ultra',
    'apple airpods pro 2',
    'dyson v15 detect',
    'macbook air m3 13 zoll',
    'lenovo thinkpad t14',
    'sony wh 1000xm5',
    'nintendo switch oled',
    'playstation 5 slim',
    'lg oled c4 55 zoll',
    'ecovacs deebot x5 omni',
    'garmin forerunner 965'
  );

UPDATE search_tasks
SET status = 'failed',
    error_message = 'Autonomer Nicht-Produkt-Seed gestoppt. Nur Produkt-Preisvergleich bleibt aktiv.',
    finished_at = NOW(),
    updated_at = NOW()
WHERE status IN ('pending','running')
  AND trigger_type = 'autonomous_seed'
  AND strategy = 'swiss_ai_live';

UPDATE search_task_sources
SET status = 'failed',
    error_message = 'Autonomer Nicht-Produkt-Seed gestoppt.',
    updated_at = NOW()
WHERE search_task_id IN (
  SELECT id FROM search_tasks
  WHERE status = 'failed'
    AND error_message = 'Autonomer Nicht-Produkt-Seed gestoppt. Nur Produkt-Preisvergleich bleibt aktiv.'
    AND updated_at >= NOW() - INTERVAL '10 minutes'
);

INSERT INTO ai_runtime_events(event_type, severity, event_payload_json, created_by, created_at)
VALUES (
  'pause_autonomous_non_product_seeder',
  'warning',
  jsonb_build_object(
    'active_product_price_jobs', (SELECT COUNT(*) FROM search_tasks WHERE status IN ('pending','running') AND strategy = 'swiss_product_price_compare'),
    'stopped_autonomous_jobs', (SELECT COUNT(*) FROM search_tasks WHERE status = 'failed' AND error_message = 'Autonomer Nicht-Produkt-Seed gestoppt. Nur Produkt-Preisvergleich bleibt aktiv.'),
    'note', 'Worker product imports continue; autonomous non-product seed generation paused.'
  ),
  'pause_non_product_seeder',
  NOW()
);

COMMIT;
