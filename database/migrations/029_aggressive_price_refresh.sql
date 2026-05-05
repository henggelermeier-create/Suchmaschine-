BEGIN;

-- Aggressive price refresh: known products should refresh offers/prices as often as possible.
-- Product discovery continues separately; known products prefer price_refresh instead of full re-import.
INSERT INTO ai_runtime_controls(control_key, is_enabled, control_value_json, description, updated_by, updated_at)
VALUES (
  'price_refresh',
  TRUE,
  '{"enabled":true,"existing_products_price_only":true,"refresh_existing_after_minutes":30,"refresh_hot_products_after_minutes":15,"refresh_stale_after_hours":2,"max_refresh_jobs_per_run":500,"max_refresh_sources_per_product":30,"do_not_reimport_product_when_existing":true,"prioritize_known_products":true,"continuous_refresh":true}'::jsonb,
  'Aggressiver Preisrefresh für bekannte Produkte.',
  'aggressive_price_refresh',
  NOW()
)
ON CONFLICT (control_key) DO UPDATE SET
  is_enabled = TRUE,
  control_value_json = COALESCE(ai_runtime_controls.control_value_json, '{}'::jsonb) || EXCLUDED.control_value_json,
  description = EXCLUDED.description,
  updated_by = EXCLUDED.updated_by,
  updated_at = NOW();

UPDATE ai_runtime_controls
SET is_enabled = TRUE,
    control_value_json = COALESCE(control_value_json, '{}'::jsonb)
      || '{"enabled":true,"product_only":true,"enqueue_per_tick":4,"baseline_limit":20,"trending_limit":0,"seed_batch_size":120,"max_pending_candidates":800,"target_canonical_products":25000,"recycle_completed_after_hours":24,"price_refresh_first":true}'::jsonb,
    updated_by = 'aggressive_price_refresh',
    updated_at = NOW()
WHERE control_key = 'autonomous_builder';

-- Create many price-refresh jobs for existing products, prioritizing older or popular products.
WITH products_to_refresh AS (
  SELECT id,
         title,
         lower(regexp_replace(title, '[^a-zA-Z0-9]+', ' ', 'g')) AS normalized_query,
         COALESCE(popularity_score, 0) AS popularity_score,
         COALESCE(last_seen_at, updated_at, created_at) AS last_refresh_at
  FROM canonical_products
  WHERE COALESCE(is_hidden, false) = false
    AND COALESCE(content_type, 'product') = 'product'
    AND title IS NOT NULL
    AND LENGTH(TRIM(title)) >= 4
    AND (
      last_seen_at IS NULL
      OR last_seen_at <= NOW() - INTERVAL '30 minutes'
      OR updated_at <= NOW() - INTERVAL '30 minutes'
    )
  ORDER BY COALESCE(last_seen_at, updated_at, created_at) ASC NULLS FIRST, COALESCE(popularity_score, 0) DESC
  LIMIT 500
), inserted_refresh_tasks AS (
  INSERT INTO search_tasks(query, normalized_query, trigger_type, status, strategy, user_visible_note, task_priority, source_budget, requested_by, created_at, updated_at)
  SELECT title,
         normalized_query,
         'price_refresh',
         'pending',
         'price_refresh',
         'Produkt ist bekannt: KI aktualisiert nur Preise und Shop-Angebote so häufig wie möglich.',
         85 + LEAST(10, popularity_score::int),
         120,
         'aggressive_price_refresh',
         NOW(),
         NOW()
  FROM products_to_refresh p
  WHERE NOT EXISTS (
    SELECT 1 FROM search_tasks st
    WHERE st.normalized_query = p.normalized_query
      AND st.trigger_type = 'price_refresh'
      AND st.status IN ('pending','running')
      AND st.created_at >= NOW() - INTERVAL '30 minutes'
  )
  RETURNING id, query
), refresh_sources AS (
  SELECT id, source_key, source_kind, search_url_template, sitemap_url, base_url, priority, manual_boost
  FROM swiss_sources
  WHERE is_active = TRUE
    AND (country_code = 'CH' OR base_url ILIKE '%.ch%')
  ORDER BY COALESCE(priority, 0) DESC, COALESCE(manual_boost, 0) DESC, display_name ASC
  LIMIT 30
)
INSERT INTO search_task_sources(search_task_id, provider, source_kind, seed_value, status, swiss_source_id, planner_reason, source_priority, created_at, updated_at)
SELECT t.id,
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
       'Aggressiver Preis-Refresh für bekanntes Produkt',
       COALESCE(s.priority, 0) + COALESCE(s.manual_boost, 0) * 10 + 250,
       NOW(),
       NOW()
FROM inserted_refresh_tasks t
CROSS JOIN refresh_sources s
ON CONFLICT (search_task_id, provider, source_kind) DO UPDATE SET
  seed_value = EXCLUDED.seed_value,
  planner_reason = EXCLUDED.planner_reason,
  source_priority = GREATEST(COALESCE(search_task_sources.source_priority, 0), COALESCE(EXCLUDED.source_priority, 0)),
  status = CASE WHEN search_task_sources.status = 'failed' THEN 'pending' ELSE search_task_sources.status END,
  updated_at = NOW();

INSERT INTO ai_runtime_events(event_type, severity, event_payload_json, created_by, created_at)
VALUES (
  'aggressive_price_refresh',
  'warning',
  jsonb_build_object(
    'refresh_tasks_created_last_10m', (SELECT COUNT(*) FROM search_tasks WHERE trigger_type = 'price_refresh' AND created_at >= NOW() - INTERVAL '10 minutes'),
    'active_refresh_tasks', (SELECT COUNT(*) FROM search_tasks WHERE trigger_type = 'price_refresh' AND status IN ('pending','running')),
    'active_ch_sources', (SELECT COUNT(*) FROM swiss_sources WHERE is_active = TRUE AND (country_code = 'CH' OR base_url ILIKE '%.ch%'))
  ),
  'aggressive_price_refresh',
  NOW()
);

COMMIT;
