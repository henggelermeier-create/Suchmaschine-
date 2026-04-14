BEGIN;

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
