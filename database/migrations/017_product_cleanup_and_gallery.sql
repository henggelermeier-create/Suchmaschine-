BEGIN;

ALTER TABLE canonical_products
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE canonical_products
  ADD COLUMN IF NOT EXISTS hidden_reason TEXT;
ALTER TABLE canonical_products
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
ALTER TABLE canonical_products
  ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'product';
ALTER TABLE canonical_products
  ADD COLUMN IF NOT EXISTS image_gallery_json JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE source_offers_v2
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE source_offers_v2
  ADD COLUMN IF NOT EXISTS hidden_reason TEXT;
ALTER TABLE source_offers_v2
  ADD COLUMN IF NOT EXISTS image_gallery_json JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_canonical_products_visible_products
  ON canonical_products(is_hidden, content_type, popularity_score DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_offers_visible
  ON source_offers_v2(canonical_product_id, is_active, is_hidden, price ASC, updated_at DESC);

UPDATE canonical_products
SET content_type = 'article', is_hidden = TRUE, hidden_reason = COALESCE(hidden_reason, 'Automatisch ausgeblendet: Beitrag statt Produkt'), hidden_at = COALESCE(hidden_at, NOW())
WHERE is_hidden = FALSE
  AND (
    LOWER(COALESCE(title, '')) ~ '(blog|beitrag|ratgeber|news|magazin|testbericht|review|vergleich:|anleitung)'
    OR LOWER(COALESCE(category, '')) ~ '(blog|beitrag|news|magazin|ratgeber)'
  );

UPDATE canonical_products cp
SET image_gallery_json = gallery.images
FROM (
  SELECT canonical_product_id, jsonb_agg(DISTINCT image_url) AS images
  FROM source_offers_v2
  WHERE image_url IS NOT NULL AND LENGTH(TRIM(image_url)) > 0
  GROUP BY canonical_product_id
) gallery
WHERE cp.id = gallery.canonical_product_id
  AND (cp.image_gallery_json = '[]'::jsonb OR cp.image_gallery_json IS NULL);

COMMIT;
