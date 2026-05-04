BEGIN;

INSERT INTO swiss_sources(source_key, display_name, provider_kind, source_kind, country_code, language_code, base_url, search_url_template, categories_json, priority, confidence_score, refresh_interval_minutes, is_active, notes, manual_boost, updated_at)
VALUES
  ('mediamarkt_ch', 'MediaMarkt Schweiz', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.mediamarkt.ch', 'https://www.mediamarkt.ch/de/search.html?query={query}', '["electronics","computing","mobile","audio","gaming","home"]'::jsonb, 86, 0.82, 180, TRUE, 'Schweizer Elektronik-Shop.', 2, NOW()),
  ('officeworld', 'Office World', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.officeworld.ch', 'https://www.officeworld.ch/de/search?q={query}', '["office","computing","electronics"]'::jsonb, 64, 0.64, 240, TRUE, 'Schweizer Office-Shop.', 1, NOW()),
  ('pcking', 'PC King', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.pcking.ch', 'https://www.pcking.ch/search?sSearch={query}', '["computing","electronics","gaming"]'::jsonb, 62, 0.62, 240, TRUE, 'Schweizer PC-Shop.', 2, NOW()),
  ('techmania', 'Techmania', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.techmania.ch', 'https://www.techmania.ch/search?sSearch={query}', '["electronics","computing","mobile","audio"]'::jsonb, 62, 0.62, 240, TRUE, 'Schweizer Technik-Shop.', 2, NOW()),
  ('microspot_archive', 'Microspot/Coop Technik', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.microspot.ch', 'https://www.microspot.ch/de/search?query={query}', '["electronics","computing","home","audio"]'::jsonb, 60, 0.60, 240, TRUE, 'Alternative Schweizer Technik-Quelle.', 1, NOW()),
  ('nettoshop', 'nettoshop.ch', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.nettoshop.ch', 'https://www.nettoshop.ch/de/search?q={query}', '["home","appliances","electronics"]'::jsonb, 66, 0.66, 240, TRUE, 'Schweizer Haushaltsgeräte-Shop.', 1, NOW()),
  ('venova', 'Venova', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.venova.ch', 'https://www.venova.ch/de/search?sSearch={query}', '["home","appliances","garden","tools"]'::jsonb, 60, 0.60, 240, TRUE, 'Schweizer Shop für Home/Garden.', 1, NOW()),
  ('microspot_fr', 'microspot recherche', 'shop_source', 'shop_catalog', 'CH', 'fr', 'https://www.microspot.ch', 'https://www.microspot.ch/fr/search?query={query}', '["electronics","computing","home","audio"]'::jsonb, 56, 0.56, 240, TRUE, 'Französische Schweizer Quelle.', 1, NOW()),
  ('digitec_fr', 'Digitec Romandie', 'shop_source', 'shop_catalog', 'CH', 'fr', 'https://www.digitec.ch', 'https://www.digitec.ch/fr/search?q={query}', '["electronics","computing","mobile","audio","gaming"]'::jsonb, 70, 0.70, 180, TRUE, 'Französische Schweizer Digitec-Quelle.', 1, NOW()),
  ('galaxus_fr', 'Galaxus Romandie', 'shop_source', 'shop_catalog', 'CH', 'fr', 'https://www.galaxus.ch', 'https://www.galaxus.ch/fr/search?q={query}', '["electronics","home","fashion","sports","beauty","garden"]'::jsonb, 70, 0.70, 180, TRUE, 'Französische Schweizer Galaxus-Quelle.', 1, NOW()),
  ('brack_fr', 'BRACK.CH Romandie', 'shop_source', 'shop_catalog', 'CH', 'fr', 'https://www.brack.ch', 'https://www.brack.ch/fr/search?query={query}', '["electronics","computing","home","office","gaming"]'::jsonb, 66, 0.66, 180, TRUE, 'Französische Schweizer Brack-Quelle.', 1, NOW()),
  ('decathlon_ch', 'Decathlon Schweiz', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.decathlon.ch', 'https://www.decathlon.ch/de/search?Ntt={query}', '["sports","outdoor","fashion"]'::jsonb, 58, 0.58, 240, TRUE, 'Sport-Shop Schweiz.', 1, NOW()),
  ('bike24_ch', 'BIKE24 Schweiz', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.bike24.ch', 'https://www.bike24.ch/search?searchTerm={query}', '["sports","bike","outdoor"]'::jsonb, 52, 0.52, 360, TRUE, 'Bike-Shop Schweiz.', 1, NOW()),
  ('microspot_it', 'microspot ticino', 'shop_source', 'shop_catalog', 'CH', 'it', 'https://www.microspot.ch', 'https://www.microspot.ch/it/search?query={query}', '["electronics","computing","home","audio"]'::jsonb, 50, 0.50, 360, TRUE, 'Italienische Schweizer Quelle.', 1, NOW()),
  ('galaxus_it', 'Galaxus Ticino', 'shop_source', 'shop_catalog', 'CH', 'it', 'https://www.galaxus.ch', 'https://www.galaxus.ch/it/search?q={query}', '["electronics","home","fashion","sports","beauty","garden"]'::jsonb, 52, 0.52, 360, TRUE, 'Italienische Schweizer Galaxus-Quelle.', 1, NOW())
ON CONFLICT (source_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  provider_kind = EXCLUDED.provider_kind,
  source_kind = EXCLUDED.source_kind,
  country_code = EXCLUDED.country_code,
  language_code = EXCLUDED.language_code,
  base_url = EXCLUDED.base_url,
  search_url_template = EXCLUDED.search_url_template,
  categories_json = EXCLUDED.categories_json,
  priority = GREATEST(COALESCE(swiss_sources.priority, 0), EXCLUDED.priority),
  confidence_score = GREATEST(COALESCE(swiss_sources.confidence_score, 0), EXCLUDED.confidence_score),
  refresh_interval_minutes = LEAST(COALESCE(swiss_sources.refresh_interval_minutes, 9999), EXCLUDED.refresh_interval_minutes),
  is_active = TRUE,
  notes = EXCLUDED.notes,
  manual_boost = GREATEST(COALESCE(swiss_sources.manual_boost, 0), EXCLUDED.manual_boost),
  updated_at = NOW();

UPDATE ai_runtime_controls
SET is_enabled = TRUE,
    control_value_json = jsonb_strip_nulls(COALESCE(control_value_json, '{}'::jsonb) || '{"enqueue_per_tick":8,"baseline_limit":40,"trending_limit":80,"seed_batch_size":500,"max_pending_candidates":4000,"target_canonical_products":25000,"recycle_completed_after_hours":6}'::jsonb),
    updated_at = NOW(),
    updated_by = 'migration_more_shops'
WHERE control_key = 'autonomous_builder';

UPDATE search_tasks
SET status = 'pending',
    error_message = NULL,
    task_priority = GREATEST(COALESCE(task_priority, 0), 85),
    source_budget = GREATEST(COALESCE(source_budget, 0), 120),
    updated_at = NOW()
WHERE status IN ('pending', 'running', 'failed')
  AND created_at >= NOW() - INTERVAL '48 hours';

UPDATE search_task_sources
SET status = 'pending',
    error_message = NULL,
    updated_at = NOW()
WHERE status IN ('pending', 'running', 'failed')
  AND created_at >= NOW() - INTERVAL '48 hours';

WITH active_tasks AS (
  SELECT id, query
  FROM search_tasks
  WHERE status = 'pending'
    AND created_at >= NOW() - INTERVAL '48 hours'
), active_sources AS (
  SELECT id, source_key, source_kind, search_url_template, sitemap_url, base_url, priority, manual_boost
  FROM swiss_sources
  WHERE is_active = TRUE
), inserted_sources AS (
  INSERT INTO search_task_sources(search_task_id, provider, source_kind, seed_value, status, swiss_source_id, planner_reason, source_priority, updated_at)
  SELECT
    t.id,
    s.source_key,
    s.source_kind,
    CASE
      WHEN s.source_kind = 'comparison_search' THEN t.query
      WHEN s.search_url_template IS NOT NULL THEN replace(s.search_url_template, '{query}', replace(t.query, ' ', '%20'))
      WHEN s.sitemap_url IS NOT NULL THEN s.sitemap_url
      WHEN s.base_url IS NOT NULL THEN s.base_url
      ELSE t.query
    END,
    'pending',
    s.id,
    'Requeue: alle aktiven Schweizer Shops abarbeiten',
    COALESCE(s.priority, 0) + COALESCE(s.manual_boost, 0) * 10,
    NOW()
  FROM active_tasks t
  CROSS JOIN active_sources s
  ON CONFLICT (search_task_id, provider, source_kind) DO UPDATE SET
    status = 'pending',
    seed_value = EXCLUDED.seed_value,
    swiss_source_id = COALESCE(search_task_sources.swiss_source_id, EXCLUDED.swiss_source_id),
    planner_reason = EXCLUDED.planner_reason,
    source_priority = GREATEST(COALESCE(search_task_sources.source_priority, 0), COALESCE(EXCLUDED.source_priority, 0)),
    error_message = NULL,
    updated_at = NOW()
  RETURNING id
)
INSERT INTO ai_runtime_events(event_type, severity, event_payload_json, created_by, created_at)
VALUES (
  'expand_shop_sources_and_requeue',
  'warning',
  jsonb_build_object(
    'active_sources', (SELECT COUNT(*) FROM swiss_sources WHERE is_active = true),
    'pending_tasks', (SELECT COUNT(*) FROM search_tasks WHERE status = 'pending'),
    'pending_sources', (SELECT COUNT(*) FROM search_task_sources WHERE status = 'pending'),
    'inserted_or_updated_sources', (SELECT COUNT(*) FROM inserted_sources)
  ),
  'migration_more_shops',
  NOW()
);

COMMIT;
