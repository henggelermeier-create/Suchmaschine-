BEGIN;

CREATE OR REPLACE FUNCTION public.sync_product_from_canonical(target_canonical_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  row_data RECORD;
  target_slug TEXT;
BEGIN
  IF target_canonical_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    cp.id,
    cp.title,
    cp.brand,
    cp.category,
    COALESCE(cp.ai_summary, cp.deal_label, 'KI-aufbereiteter Produktvergleich für die Schweiz.') AS ai_summary,
    COALESCE(cp.deal_score, 0) AS deal_score,
    COALESCE(cp.best_price, MIN(so.price)) AS price,
    COALESCE(cp.best_price_currency, (ARRAY_AGG(so.currency ORDER BY so.price ASC NULLS LAST, so.updated_at DESC))[1], 'CHF') AS currency,
    COALESCE((ARRAY_AGG(so.provider ORDER BY so.price ASC NULLS LAST, so.updated_at DESC))[1], 'KI Index') AS shop_name,
    COALESCE((ARRAY_AGG(COALESCE(so.deeplink_url, so.source_product_url) ORDER BY so.price ASC NULLS LAST, so.updated_at DESC))[1], NULL) AS product_url,
    COALESCE(cp.image_url, (ARRAY_AGG(so.image_url ORDER BY so.updated_at DESC))[1]) AS image_url,
    NOW() AS updated_at
  INTO row_data
  FROM canonical_products cp
  LEFT JOIN source_offers_v2 so ON so.canonical_product_id = cp.id AND so.is_active = true
  WHERE cp.id = target_canonical_id
  GROUP BY cp.id;

  IF row_data.id IS NULL THEN
    RETURN;
  END IF;

  target_slug := 'canonical-' || row_data.id::text;

  INSERT INTO products(
    slug, title, brand, category, ai_summary, deal_score, price, currency, shop_name, product_url, image_url, source_name, created_at, updated_at
  )
  VALUES (
    target_slug,
    row_data.title,
    row_data.brand,
    row_data.category,
    row_data.ai_summary,
    row_data.deal_score,
    row_data.price,
    row_data.currency,
    row_data.shop_name,
    row_data.product_url,
    row_data.image_url,
    'canonical_sync',
    NOW(),
    NOW()
  )
  ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    brand = EXCLUDED.brand,
    category = EXCLUDED.category,
    ai_summary = EXCLUDED.ai_summary,
    deal_score = EXCLUDED.deal_score,
    price = EXCLUDED.price,
    currency = EXCLUDED.currency,
    shop_name = EXCLUDED.shop_name,
    product_url = EXCLUDED.product_url,
    image_url = COALESCE(EXCLUDED.image_url, products.image_url),
    source_name = EXCLUDED.source_name,
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_product_offers_from_canonical(target_canonical_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  target_slug TEXT;
BEGIN
  IF target_canonical_id IS NULL THEN
    RETURN;
  END IF;

  target_slug := 'canonical-' || target_canonical_id::text;

  DELETE FROM product_offers WHERE product_slug = target_slug AND source_name = 'canonical_sync';

  INSERT INTO product_offers(
    product_slug,
    shop_name,
    price,
    currency,
    product_url,
    affiliate_url,
    image_url,
    source_name,
    source_group,
    is_hidden,
    created_at,
    updated_at,
    last_seen_at
  )
  SELECT
    target_slug,
    so.provider,
    so.price,
    COALESCE(so.currency, 'CHF'),
    COALESCE(so.deeplink_url, so.source_product_url),
    COALESCE(so.deeplink_url, so.source_product_url),
    so.image_url,
    'canonical_sync',
    so.provider_group,
    FALSE,
    NOW(),
    NOW(),
    NOW()
  FROM source_offers_v2 so
  WHERE so.canonical_product_id = target_canonical_id
    AND so.is_active = true
    AND so.price IS NOT NULL
  ON CONFLICT (product_slug, shop_name) DO UPDATE SET
    price = EXCLUDED.price,
    currency = EXCLUDED.currency,
    product_url = EXCLUDED.product_url,
    affiliate_url = EXCLUDED.affiliate_url,
    image_url = COALESCE(EXCLUDED.image_url, product_offers.image_url),
    source_name = EXCLUDED.source_name,
    source_group = EXCLUDED.source_group,
    is_hidden = FALSE,
    updated_at = NOW(),
    last_seen_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_sync_from_canonical_product()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.sync_product_from_canonical(NEW.id);
  PERFORM public.sync_product_offers_from_canonical(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_sync_from_source_offer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  canonical_id BIGINT;
BEGIN
  canonical_id := COALESCE(NEW.canonical_product_id, OLD.canonical_product_id);
  IF canonical_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  PERFORM public.sync_product_from_canonical(canonical_id);
  PERFORM public.sync_product_offers_from_canonical(canonical_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_products_from_canonical_products ON canonical_products;
CREATE TRIGGER trg_sync_products_from_canonical_products
AFTER INSERT OR UPDATE OF title, brand, category, ai_summary, deal_score, deal_label, best_price, best_price_currency, image_url, updated_at
ON canonical_products
FOR EACH ROW
EXECUTE FUNCTION public.trigger_sync_from_canonical_product();

DROP TRIGGER IF EXISTS trg_sync_products_from_source_offers_v2 ON source_offers_v2;
CREATE TRIGGER trg_sync_products_from_source_offers_v2
AFTER INSERT OR UPDATE OF canonical_product_id, price, currency, deeplink_url, source_product_url, image_url, is_active
ON source_offers_v2
FOR EACH ROW
EXECUTE FUNCTION public.trigger_sync_from_source_offer();

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM canonical_products LOOP
    PERFORM public.sync_product_from_canonical(rec.id);
    PERFORM public.sync_product_offers_from_canonical(rec.id);
  END LOOP;
END $$;

COMMIT;
