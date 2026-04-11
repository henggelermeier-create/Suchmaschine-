BEGIN;

CREATE OR REPLACE FUNCTION public.extract_hostname(input_url TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  host TEXT;
BEGIN
  IF input_url IS NULL OR btrim(input_url) = '' THEN
    RETURN NULL;
  END IF;
  host := lower(regexp_replace(input_url, '^https?://', ''));
  host := split_part(host, '/', 1);
  host := regexp_replace(host, '^www\.', '');
  IF host = '' THEN
    RETURN NULL;
  END IF;
  RETURN host;
END;
$$;

CREATE OR REPLACE FUNCTION public.make_source_key_from_host(host TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  key_text TEXT;
BEGIN
  IF host IS NULL OR btrim(host) = '' THEN
    RETURN NULL;
  END IF;
  key_text := regexp_replace(lower(host), '[^a-z0-9]+', '_', 'g');
  key_text := regexp_replace(key_text, '^_+|_+$', '', 'g');
  IF key_text ~ '^[0-9]' THEN
    key_text := 'shop_' || key_text;
  END IF;
  RETURN NULLIF(key_text, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.make_display_name_from_host(host TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  cleaned TEXT;
BEGIN
  IF host IS NULL OR btrim(host) = '' THEN
    RETURN NULL;
  END IF;
  cleaned := regexp_replace(lower(host), '\.(ch|com|net|shop)$', '', 'i');
  cleaned := regexp_replace(cleaned, '[\.-]+', ' ', 'g');
  cleaned := initcap(cleaned);
  RETURN NULLIF(cleaned, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_register_swiss_source_from_offer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  candidate_url TEXT;
  host TEXT;
  source_key TEXT;
  display_name TEXT;
BEGIN
  candidate_url := COALESCE(NEW.deeplink_url, NEW.source_product_url);
  host := public.extract_hostname(candidate_url);

  IF host IS NULL OR host !~ '\.ch$' THEN
    RETURN NEW;
  END IF;

  IF host ~ '(^|\.)toppreise\.ch$' THEN
    RETURN NEW;
  END IF;

  source_key := public.make_source_key_from_host(host);
  display_name := COALESCE(public.make_display_name_from_host(host), NEW.provider, host);

  IF source_key IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO swiss_sources(
    source_key,
    display_name,
    provider_kind,
    source_kind,
    country_code,
    language_code,
    base_url,
    seed_urls_json,
    categories_json,
    priority,
    confidence_score,
    refresh_interval_minutes,
    is_active,
    notes,
    shop_domain,
    auto_discovered,
    discovery_source_key,
    created_at,
    updated_at
  )
  VALUES (
    source_key,
    display_name,
    'shop_source',
    'shop_catalog',
    'CH',
    'de',
    'https://' || host,
    jsonb_build_array(candidate_url),
    '[]'::jsonb,
    38,
    0.46,
    240,
    TRUE,
    'Automatisch aus Offer-URLs erkannter Schweizer Shop.',
    host,
    TRUE,
    'offer_trigger',
    NOW(),
    NOW()
  )
  ON CONFLICT (source_key) DO UPDATE
  SET shop_domain = COALESCE(swiss_sources.shop_domain, EXCLUDED.shop_domain),
      auto_discovered = TRUE,
      updated_at = NOW();

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_canonical_image_from_offer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.canonical_product_id IS NOT NULL AND NEW.image_url IS NOT NULL AND btrim(NEW.image_url) <> '' THEN
    UPDATE canonical_products
    SET image_url = COALESCE(image_url, NEW.image_url),
        updated_at = NOW()
    WHERE id = NEW.canonical_product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_register_swiss_source_from_offer ON source_offers_v2;
CREATE TRIGGER trg_auto_register_swiss_source_from_offer
AFTER INSERT OR UPDATE OF deeplink_url, source_product_url
ON source_offers_v2
FOR EACH ROW
EXECUTE FUNCTION public.auto_register_swiss_source_from_offer();

DROP TRIGGER IF EXISTS trg_sync_canonical_image_from_offer ON source_offers_v2;
CREATE TRIGGER trg_sync_canonical_image_from_offer
AFTER INSERT OR UPDATE OF canonical_product_id, image_url
ON source_offers_v2
FOR EACH ROW
EXECUTE FUNCTION public.sync_canonical_image_from_offer();

INSERT INTO swiss_sources(
  source_key,
  display_name,
  provider_kind,
  source_kind,
  country_code,
  language_code,
  base_url,
  seed_urls_json,
  categories_json,
  priority,
  confidence_score,
  refresh_interval_minutes,
  is_active,
  notes,
  shop_domain,
  auto_discovered,
  discovery_source_key,
  created_at,
  updated_at
)
SELECT DISTINCT
  public.make_source_key_from_host(public.extract_hostname(COALESCE(so.deeplink_url, so.source_product_url))) AS source_key,
  COALESCE(public.make_display_name_from_host(public.extract_hostname(COALESCE(so.deeplink_url, so.source_product_url))), so.provider, public.extract_hostname(COALESCE(so.deeplink_url, so.source_product_url))) AS display_name,
  'shop_source',
  'shop_catalog',
  'CH',
  'de',
  'https://' || public.extract_hostname(COALESCE(so.deeplink_url, so.source_product_url)),
  jsonb_build_array(COALESCE(so.deeplink_url, so.source_product_url)),
  '[]'::jsonb,
  38,
  0.46,
  240,
  TRUE,
  'Rückwirkend aus vorhandenen Offer-URLs erkannter Schweizer Shop.',
  public.extract_hostname(COALESCE(so.deeplink_url, so.source_product_url)),
  TRUE,
  'offer_backfill',
  NOW(),
  NOW()
FROM source_offers_v2 so
WHERE public.extract_hostname(COALESCE(so.deeplink_url, so.source_product_url)) ~ '\.ch$'
  AND public.extract_hostname(COALESCE(so.deeplink_url, so.source_product_url)) !~ '(^|\.)toppreise\.ch$'
  AND public.make_source_key_from_host(public.extract_hostname(COALESCE(so.deeplink_url, so.source_product_url))) IS NOT NULL
ON CONFLICT (source_key) DO UPDATE
SET shop_domain = COALESCE(swiss_sources.shop_domain, EXCLUDED.shop_domain),
    auto_discovered = TRUE,
    updated_at = NOW();

UPDATE canonical_products cp
SET image_url = src.image_url,
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (canonical_product_id)
    canonical_product_id,
    image_url
  FROM source_offers_v2
  WHERE canonical_product_id IS NOT NULL
    AND image_url IS NOT NULL
    AND btrim(image_url) <> ''
  ORDER BY canonical_product_id, updated_at DESC
) src
WHERE cp.id = src.canonical_product_id
  AND (cp.image_url IS NULL OR btrim(cp.image_url) = '');

COMMIT;
