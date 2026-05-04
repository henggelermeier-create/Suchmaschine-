BEGIN;

INSERT INTO swiss_sources(source_key, display_name, provider_kind, source_kind, country_code, language_code, base_url, search_url_template, categories_json, priority, confidence_score, refresh_interval_minutes, is_active, notes, manual_boost, updated_at)
VALUES
  ('toppreise', 'Toppreise', 'comparison_source', 'comparison_search', 'CH', 'de', 'https://www.toppreise.ch', 'https://www.toppreise.ch/suche?q={query}', '["electronics","computing","mobile","audio","home"]'::jsonb, 100, 0.92, 120, TRUE, 'Schweizer Preisvergleich.', 2, NOW()),
  ('preisvergleich_ch', 'Preisvergleich.ch', 'comparison_source', 'comparison_search', 'CH', 'de', 'https://www.preisvergleich.ch', 'https://www.preisvergleich.ch/search?q={query}', '["electronics","computing","mobile","audio","home"]'::jsonb, 92, 0.86, 120, TRUE, 'Schweizer Preisvergleich.', 1, NOW()),
  ('digitec', 'Digitec', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.digitec.ch', 'https://www.digitec.ch/de/search?q={query}', '["electronics","computing","mobile","audio","gaming"]'::jsonb, 96, 0.94, 120, TRUE, 'Schweizer Elektronik-Shop.', 2, NOW()),
  ('galaxus', 'Galaxus', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.galaxus.ch', 'https://www.galaxus.ch/de/search?q={query}', '["electronics","home","fashion","sports","beauty","garden"]'::jsonb, 94, 0.93, 120, TRUE, 'Schweizer Universal-Shop.', 2, NOW()),
  ('brack', 'BRACK.CH', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.brack.ch', 'https://www.brack.ch/search?query={query}', '["electronics","computing","home","office","gaming"]'::jsonb, 92, 0.90, 120, TRUE, 'Schweizer Shop.', 2, NOW()),
  ('interdiscount', 'Interdiscount', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.interdiscount.ch', 'https://www.interdiscount.ch/de/search?q={query}', '["electronics","computing","mobile","audio","gaming"]'::jsonb, 90, 0.88, 120, TRUE, 'Schweizer Elektronik-Shop.', 2, NOW()),
  ('microspot', 'microspot.ch', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.microspot.ch', 'https://www.microspot.ch/de/search?query={query}', '["electronics","computing","home","audio"]'::jsonb, 86, 0.84, 180, TRUE, 'Schweizer Shop.', 1, NOW()),
  ('fust', 'Fust', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.fust.ch', 'https://www.fust.ch/de/search.html?query={query}', '["electronics","home","appliances","computing"]'::jsonb, 84, 0.82, 180, TRUE, 'Schweizer Elektronik und Haushalt.', 1, NOW()),
  ('melectronics', 'melectronics', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.melectronics.ch', 'https://www.melectronics.ch/de/search?q={query}', '["electronics","computing","mobile","audio"]'::jsonb, 82, 0.80, 180, TRUE, 'Schweizer Elektronik-Shop.', 1, NOW()),
  ('alternate_ch', 'Alternate Schweiz', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.alternate.ch', 'https://www.alternate.ch/listing.xhtml?q={query}', '["electronics","computing","gaming"]'::jsonb, 82, 0.80, 180, TRUE, 'Schweizer Elektronik-Shop.', 1, NOW()),
  ('apple_ch', 'Apple Schweiz', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.apple.com/ch-de', 'https://www.apple.com/ch-de/search/{query}', '["electronics","computing","mobile","audio"]'::jsonb, 80, 0.80, 240, TRUE, 'Offizieller Schweizer Apple Store.', 1, NOW()),
  ('mobilezone', 'mobilezone', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.mobilezone.ch', 'https://www.mobilezone.ch/de/search?q={query}', '["mobile","electronics","audio"]'::jsonb, 78, 0.78, 180, TRUE, 'Schweizer Mobilgeräte-Shop.', 1, NOW()),
  ('steg', 'STEg Electronics', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.steg-electronics.ch', 'https://www.steg-electronics.ch/de/search?q={query}', '["electronics","computing","audio","mobile"]'::jsonb, 76, 0.76, 180, TRUE, 'Schweizer Elektronik-Shop.', 1, NOW()),
  ('conrad_ch', 'Conrad Schweiz', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.conrad.ch', 'https://www.conrad.ch/de/search.html?search={query}', '["electronics","computing","tools"]'::jsonb, 76, 0.76, 180, TRUE, 'Schweizer Elektronik- und Komponenten-Shop.', 1, NOW()),
  ('fnac_ch', 'Fnac Schweiz', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.fnac.ch', 'https://www.fnac.ch/SearchResult/ResultList.aspx?Search={query}', '["electronics","computing","audio","books","gaming"]'::jsonb, 74, 0.74, 180, TRUE, 'Schweizer Fnac-Shop.', 1, NOW()),
  ('manor', 'Manor', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.manor.ch', 'https://www.manor.ch/de/search?q={query}', '["home","fashion","beauty","electronics"]'::jsonb, 70, 0.72, 240, TRUE, 'Schweizer Warenhaus.', 1, NOW()),
  ('coop_city', 'Coop City', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.coop-city.ch', 'https://www.coop-city.ch/de/search?q={query}', '["home","electronics","beauty"]'::jsonb, 68, 0.70, 240, TRUE, 'Schweizer Warenhaus.', 1, NOW()),
  ('jumbo', 'Jumbo', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.jumbo.ch', 'https://www.jumbo.ch/de/search?q={query}', '["home","garden","tools"]'::jsonb, 66, 0.68, 240, TRUE, 'Schweizer DIY-Shop.', 1, NOW()),
  ('landi', 'LANDI', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.landi.ch', 'https://www.landi.ch/shop/suche?query={query}', '["home","garden","tools"]'::jsonb, 64, 0.66, 240, TRUE, 'Schweizer Home/Garden/Tools-Shop.', 1, NOW()),
  ('hornbach_ch', 'HORNBACH Schweiz', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.hornbach.ch', 'https://www.hornbach.ch/suche/?q={query}', '["home","garden","tools"]'::jsonb, 64, 0.66, 240, TRUE, 'Schweizer DIY-Shop.', 1, NOW()),
  ('ikea_ch', 'IKEA Schweiz', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.ikea.com/ch/de', 'https://www.ikea.com/ch/de/search/?q={query}', '["home","furniture"]'::jsonb, 62, 0.64, 240, TRUE, 'Schweizer Möbel-Shop.', 1, NOW()),
  ('micasa', 'Micasa', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.micasa.ch', 'https://www.micasa.ch/de/search?q={query}', '["home","furniture"]'::jsonb, 60, 0.62, 240, TRUE, 'Schweizer Home-Shop.', 1, NOW()),
  ('ochsner_sport', 'Ochsner Sport', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.ochsnersport.ch', 'https://www.ochsnersport.ch/de/shop/search?q={query}', '["sports","outdoor","fashion"]'::jsonb, 60, 0.62, 240, TRUE, 'Schweizer Sport-Shop.', 1, NOW()),
  ('zalando_ch', 'Zalando Schweiz', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.zalando.ch', 'https://www.zalando.ch/catalog/?q={query}', '["fashion","shoes"]'::jsonb, 58, 0.60, 240, TRUE, 'Modeanbieter Schweiz.', 1, NOW()),
  ('ricardo', 'Ricardo', 'marketplace_source', 'shop_catalog', 'CH', 'de', 'https://www.ricardo.ch', 'https://www.ricardo.ch/de/s/{query}', '["marketplace","electronics","home","fashion"]'::jsonb, 58, 0.58, 240, TRUE, 'Schweizer Marktplatz.', 1, NOW())
ON CONFLICT (source_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  provider_kind = EXCLUDED.provider_kind,
  source_kind = EXCLUDED.source_kind,
  country_code = EXCLUDED.country_code,
  language_code = EXCLUDED.language_code,
  base_url = EXCLUDED.base_url,
  search_url_template = EXCLUDED.search_url_template,
  categories_json = EXCLUDED.categories_json,
  priority = EXCLUDED.priority,
  confidence_score = EXCLUDED.confidence_score,
  refresh_interval_minutes = EXCLUDED.refresh_interval_minutes,
  is_active = TRUE,
  notes = EXCLUDED.notes,
  manual_boost = GREATEST(COALESCE(swiss_sources.manual_boost, 0), EXCLUDED.manual_boost),
  updated_at = NOW();

WITH seed_queries(query, normalized_query, priority) AS (
  VALUES
    ('iPhone 16 Pro', 'iphone 16 pro', 100),
    ('AirPods Pro', 'airpods pro', 96),
    ('Dyson V15', 'dyson v15', 92),
    ('MacBook Air', 'macbook air', 90),
    ('Samsung Galaxy S24', 'samsung galaxy s24', 88),
    ('PlayStation 5', 'playstation 5', 86),
    ('OLED TV', 'oled tv', 84),
    ('Gaming Laptop', 'gaming laptop', 82),
    ('Akku Bohrmaschine', 'akku bohrmaschine', 80),
    ('Sneaker', 'sneaker', 78)
), inserted_tasks AS (
  INSERT INTO search_tasks(query, normalized_query, trigger_type, status, strategy, user_visible_note, task_priority, source_budget, requested_by)
  SELECT sq.query, sq.normalized_query, 'force_shop_source_bootstrap', 'pending', 'all_swiss_shops', 'KI durchsucht jetzt alle Schweizer Shops.', sq.priority, 80, 'migration_shop_source_bootstrap'
  FROM seed_queries sq
  WHERE NOT EXISTS (
    SELECT 1 FROM search_tasks st
    WHERE st.normalized_query = sq.normalized_query
      AND st.trigger_type = 'force_shop_source_bootstrap'
      AND st.created_at >= NOW() - INTERVAL '12 hours'
  )
  RETURNING id, query
)
INSERT INTO search_task_sources(search_task_id, provider, source_kind, seed_value, status, swiss_source_id, planner_reason, source_priority)
SELECT
  it.id,
  ss.source_key,
  ss.source_kind,
  CASE
    WHEN ss.source_kind = 'comparison_search' THEN it.query
    WHEN ss.search_url_template IS NOT NULL THEN replace(ss.search_url_template, '{query}', replace(it.query, ' ', '%20'))
    WHEN ss.sitemap_url IS NOT NULL THEN ss.sitemap_url
    WHEN ss.base_url IS NOT NULL THEN ss.base_url
    ELSE it.query
  END,
  'pending',
  ss.id,
  'Alle Schweizer Shops neu eingelesen',
  COALESCE(ss.priority, 0) + COALESCE(ss.manual_boost, 0) * 10
FROM inserted_tasks it
JOIN swiss_sources ss ON ss.is_active = true;

INSERT INTO ai_runtime_events(event_type, severity, event_payload_json, created_by, created_at)
VALUES (
  'restore_shop_sources_and_queue_all',
  'warning',
  jsonb_build_object(
    'active_sources', (SELECT COUNT(*) FROM swiss_sources WHERE is_active = true),
    'pending_sources', (SELECT COUNT(*) FROM search_task_sources WHERE status = 'pending')
  ),
  'migration_shop_source_bootstrap',
  NOW()
);

COMMIT;
