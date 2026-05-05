BEGIN;

-- Große Schweizer Shops müssen sichtbar importieren. Dieser Fix korrigiert Such-Templates,
-- setzt Prioritäten hoch und queued fehlgeschlagene Quellen erneut.

UPDATE swiss_sources
SET search_url_template = CASE source_key
  WHEN 'brack' THEN 'https://www.brack.ch/search?query={query}'
  WHEN 'interdiscount' THEN 'https://www.interdiscount.ch/de/search?q={query}'
  WHEN 'mediamarkt_ch' THEN 'https://www.mediamarkt.ch/de/search.html?query={query}'
  WHEN 'microspot' THEN 'https://www.microspot.ch/de/search?query={query}'
  WHEN 'fust' THEN 'https://www.fust.ch/de/suche.html?search={query}'
  WHEN 'melectronics' THEN 'https://www.melectronics.ch/de/search?q={query}'
  WHEN 'nettoshop' THEN 'https://www.nettoshop.ch/search?q={query}'
  WHEN 'steg' THEN 'https://www.steg-electronics.ch/de/search?q={query}'
  ELSE search_url_template
END,
priority = CASE
  WHEN source_key IN ('digitec','galaxus','brack','interdiscount') THEN 120
  WHEN source_key IN ('mediamarkt_ch','microspot','fust','melectronics','alternate_ch','nettoshop') THEN 112
  WHEN source_key IN ('mobilezone','conrad_ch','steg') THEN 104
  ELSE priority
END,
manual_boost = CASE
  WHEN source_key IN ('digitec','galaxus','brack','interdiscount') THEN 15
  WHEN source_key IN ('mediamarkt_ch','microspot','fust','melectronics','alternate_ch','nettoshop') THEN 12
  ELSE COALESCE(manual_boost, 0)
END,
refresh_interval_minutes = CASE
  WHEN source_key IN ('digitec','galaxus','brack','interdiscount','mediamarkt_ch','microspot','fust','melectronics','alternate_ch','nettoshop') THEN 10
  ELSE refresh_interval_minutes
END,
is_active = TRUE,
updated_at = NOW()
WHERE source_key IN (
  'digitec','galaxus','brack','interdiscount','mediamarkt_ch','microspot','fust','melectronics','alternate_ch','nettoshop','mobilezone','conrad_ch','steg'
);

-- Zusätzliche Alternate-Templates als eigene Quellen. Sie laufen generisch, erhöhen aber die Chance,
-- dass dynamische Shops mit einem funktionierenden Suchpfad gelesen werden.
INSERT INTO swiss_sources(source_key, display_name, provider_kind, source_kind, country_code, language_code, base_url, search_url_template, categories_json, priority, manual_boost, confidence_score, refresh_interval_minutes, is_active, notes)
VALUES
  ('brack_search_de', 'BRACK.CH Search DE', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.brack.ch', 'https://www.brack.ch/de/search?query={query}', '["electronics","computing","home","office","toys"]'::jsonb, 116, 12, 0.82, 10, TRUE, 'Alternativer BRACK-Suchpfad für Kauvio Import.'),
  ('brack_suche_de', 'BRACK.CH Suche DE', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.brack.ch', 'https://www.brack.ch/de/suche?query={query}', '["electronics","computing","home","office","toys"]'::jsonb, 114, 10, 0.80, 10, TRUE, 'Alternativer BRACK-Suchpfad.'),
  ('interdiscount_search_de', 'Interdiscount Search DE', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.interdiscount.ch', 'https://www.interdiscount.ch/de/search?text={query}', '["electronics","mobile","audio","home"]'::jsonb, 114, 10, 0.80, 10, TRUE, 'Alternativer Interdiscount-Suchpfad.'),
  ('mediamarkt_search_de', 'MediaMarkt CH Search DE', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.mediamarkt.ch', 'https://www.mediamarkt.ch/de/search.html?searchProfile=onlineshop&query={query}', '["electronics","gaming","mobile","audio","home"]'::jsonb, 110, 9, 0.78, 15, TRUE, 'Alternativer MediaMarkt-Suchpfad.'),
  ('microspot_suche_de', 'microspot Suche DE', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.microspot.ch', 'https://www.microspot.ch/de/suche?query={query}', '["electronics","home","office","gaming"]'::jsonb, 108, 8, 0.76, 15, TRUE, 'Alternativer microspot-Suchpfad.')
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
  manual_boost = EXCLUDED.manual_boost,
  confidence_score = EXCLUDED.confidence_score,
  refresh_interval_minutes = EXCLUDED.refresh_interval_minutes,
  is_active = TRUE,
  notes = EXCLUDED.notes,
  updated_at = NOW();

-- Fehlgeschlagene große Shop-Quellen wieder öffnen, damit der Worker sie nach dem Fix neu versucht.
UPDATE search_task_sources
SET status = 'pending',
    error_message = NULL,
    discovered_count = 0,
    imported_count = 0,
    updated_at = NOW()
WHERE provider IN (
  'brack','brack_search_de','brack_suche_de','interdiscount','interdiscount_search_de',
  'mediamarkt_ch','mediamarkt_search_de','microspot','microspot_suche_de','fust','melectronics','nettoshop'
)
AND status IN ('failed','skipped')
AND created_at >= NOW() - INTERVAL '48 hours';

-- Aktive Produkt-Preisvergleich-Jobs bekommen die Big-Shop-Quellen nochmals explizit.
WITH active_tasks AS (
  SELECT id, query
  FROM search_tasks
  WHERE status IN ('pending','running')
    AND strategy IN ('swiss_product_price_compare','price_refresh')
    AND query IS NOT NULL
  ORDER BY task_priority DESC NULLS LAST, created_at ASC
  LIMIT 400
), big_sources AS (
  SELECT id, source_key, source_kind, search_url_template, base_url, priority, manual_boost
  FROM swiss_sources
  WHERE is_active = TRUE
    AND source_key IN (
      'digitec','galaxus','brack','brack_search_de','brack_suche_de','interdiscount','interdiscount_search_de',
      'mediamarkt_ch','mediamarkt_search_de','microspot','microspot_suche_de','fust','melectronics','alternate_ch','nettoshop',
      'mobilezone','conrad_ch','steg','toppreise'
    )
)
INSERT INTO search_task_sources(search_task_id, provider, source_kind, seed_value, status, swiss_source_id, planner_reason, source_priority, created_at, updated_at)
SELECT t.id,
       s.source_key,
       s.source_kind,
       CASE
         WHEN s.search_url_template IS NOT NULL THEN replace(s.search_url_template, '{query}', replace(t.query, ' ', '%20'))
         WHEN s.base_url IS NOT NULL THEN s.base_url
         ELSE t.query
       END,
       'pending',
       s.id,
       'Big-Shop Pflichtquelle für Kauvio Preisvergleich',
       COALESCE(s.priority, 0) + COALESCE(s.manual_boost, 0) * 20 + 500,
       NOW(),
       NOW()
FROM active_tasks t
CROSS JOIN big_sources s
ON CONFLICT (search_task_id, provider, source_kind) DO UPDATE SET
  seed_value = EXCLUDED.seed_value,
  planner_reason = EXCLUDED.planner_reason,
  source_priority = GREATEST(COALESCE(search_task_sources.source_priority, 0), COALESCE(EXCLUDED.source_priority, 0)),
  status = CASE WHEN search_task_sources.status IN ('failed','skipped') THEN 'pending' ELSE search_task_sources.status END,
  error_message = NULL,
  updated_at = NOW();

INSERT INTO ai_runtime_events(event_type, severity, event_payload_json, created_by, created_at)
VALUES (
  'fix_big_shop_search_coverage',
  'warning',
  jsonb_build_object(
    'active_big_shop_sources', (SELECT COUNT(*) FROM swiss_sources WHERE is_active = TRUE AND source_key IN ('digitec','galaxus','brack','interdiscount','mediamarkt_ch','microspot','fust','melectronics','alternate_ch','nettoshop')),
    'requeued_big_shop_sources', (SELECT COUNT(*) FROM search_task_sources WHERE provider IN ('brack','interdiscount','mediamarkt_ch','microspot','fust','melectronics','nettoshop') AND status = 'pending')
  ),
  'fix_big_shop_search_coverage',
  NOW()
);

COMMIT;
