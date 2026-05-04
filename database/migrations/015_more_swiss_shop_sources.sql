BEGIN;

INSERT INTO swiss_sources(source_key, display_name, provider_kind, source_kind, country_code, language_code, base_url, search_url_template, categories_json, priority, confidence_score, refresh_interval_minutes, is_active, notes)
VALUES
  ('apple_ch', 'Apple Schweiz', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.apple.com/ch-de', 'https://www.apple.com/ch-de/search/{query}', '["electronics","computing","mobile","audio"]'::jsonb, 86, 0.84, 240, TRUE, 'Offizieller Schweizer Apple Store.'),
  ('mobilezone', 'mobilezone', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.mobilezone.ch', 'https://www.mobilezone.ch/de/search?q={query}', '["mobile","electronics","audio"]'::jsonb, 84, 0.82, 180, TRUE, 'Schweizer Mobilgeräte-Shop.'),
  ('steg', 'STEg Electronics', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.steg-electronics.ch', 'https://www.steg-electronics.ch/de/search?q={query}', '["electronics","computing","audio","mobile"]'::jsonb, 82, 0.80, 180, TRUE, 'Schweizer Elektronik- und PC-Shop.'),
  ('jumbo', 'Jumbo', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.jumbo.ch', 'https://www.jumbo.ch/de/search?q={query}', '["home","garden","tools"]'::jsonb, 72, 0.74, 240, TRUE, 'Schweizer Home/Garden/DIY-Shop.'),
  ('coop_city', 'Coop City', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.coop-city.ch', 'https://www.coop-city.ch/de/search?q={query}', '["home","electronics","beauty"]'::jsonb, 70, 0.72, 240, TRUE, 'Schweizer Warenhaus-Quelle.'),
  ('manor', 'Manor', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.manor.ch', 'https://www.manor.ch/de/search?q={query}', '["home","fashion","beauty","electronics"]'::jsonb, 70, 0.72, 240, TRUE, 'Schweizer Warenhaus-Quelle.'),
  ('fnac_ch', 'Fnac Schweiz', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.fnac.ch', 'https://www.fnac.ch/SearchResult/ResultList.aspx?Search={query}', '["electronics","computing","audio","books","gaming"]'::jsonb, 78, 0.78, 180, TRUE, 'Schweizer Fnac-Shop.'),
  ('pearl_ch', 'PEARL Schweiz', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.pearl.ch', 'https://www.pearl.ch/ch-nc-2.shtml?query={query}', '["electronics","home","computing"]'::jsonb, 66, 0.68, 240, TRUE, 'Schweizer Gadget- und Elektronik-Shop.'),
  ('conrad_ch', 'Conrad Schweiz', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.conrad.ch', 'https://www.conrad.ch/de/search.html?search={query}', '["electronics","computing","tools"]'::jsonb, 80, 0.80, 180, TRUE, 'Schweizer Elektronik- und Komponenten-Shop.'),
  ('landi', 'LANDI', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.landi.ch', 'https://www.landi.ch/shop/suche?query={query}', '["home","garden","tools"]'::jsonb, 68, 0.70, 240, TRUE, 'Schweizer Home/Garden/Tools-Shop.'),
  ('hornbach_ch', 'HORNBACH Schweiz', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.hornbach.ch', 'https://www.hornbach.ch/suche/?q={query}', '["home","garden","tools"]'::jsonb, 69, 0.70, 240, TRUE, 'Schweizer DIY-Shop.'),
  ('ikea_ch', 'IKEA Schweiz', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.ikea.com/ch/de', 'https://www.ikea.com/ch/de/search/?q={query}', '["home","furniture"]'::jsonb, 68, 0.72, 240, TRUE, 'Schweizer Möbel- und Home-Shop.'),
  ('micasa', 'Micasa', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.micasa.ch', 'https://www.micasa.ch/de/search?q={query}', '["home","furniture"]'::jsonb, 65, 0.68, 240, TRUE, 'Schweizer Home-Shop.'),
  ('sportxx', 'SportX', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.sportx.ch', 'https://www.sportx.ch/de/search?q={query}', '["sports","outdoor"]'::jsonb, 64, 0.66, 240, TRUE, 'Schweizer Sport-Shop.'),
  ('ochsner_sport', 'Ochsner Sport', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.ochsnersport.ch', 'https://www.ochsnersport.ch/de/shop/search?q={query}', '["sports","outdoor"]'::jsonb, 64, 0.66, 240, TRUE, 'Schweizer Sport-Shop.'),
  ('zalando_ch', 'Zalando Schweiz', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.zalando.ch', 'https://www.zalando.ch/catalog/?q={query}', '["fashion","shoes"]'::jsonb, 62, 0.64, 240, TRUE, 'Modeanbieter Schweiz.'),
  ('aboutyou_ch', 'ABOUT YOU Schweiz', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.aboutyou.ch', 'https://www.aboutyou.ch/suche?term={query}', '["fashion","shoes"]'::jsonb, 60, 0.62, 240, TRUE, 'Modeanbieter Schweiz.'),
  ('ottos', 'OTTOs', 'shop_source', 'shop_catalog', 'CH', 'de', 'https://www.ottos.ch', 'https://www.ottos.ch/de/search?q={query}', '["home","electronics","fashion"]'::jsonb, 62, 0.64, 240, TRUE, 'Schweizer Detailhändler.'),
  ('ricardo', 'Ricardo', 'marketplace_source', 'shop_catalog', 'CH', 'de', 'https://www.ricardo.ch', 'https://www.ricardo.ch/de/s/{query}', '["marketplace","electronics","home","fashion"]'::jsonb, 76, 0.76, 180, TRUE, 'Schweizer Marktplatz.'),
  ('tutti', 'Tutti', 'marketplace_source', 'shop_catalog', 'CH', 'de', 'https://www.tutti.ch', 'https://www.tutti.ch/de/q/{query}', '["marketplace","electronics","home","fashion"]'::jsonb, 58, 0.58, 240, TRUE, 'Schweizer Kleinanzeigen-Quelle.')
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
  updated_at = NOW();

COMMIT;
