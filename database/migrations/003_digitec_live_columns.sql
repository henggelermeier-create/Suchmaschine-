ALTER TABLE products ADD COLUMN IF NOT EXISTS shop_name TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS source_name TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS source_external_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_last_seen_at ON products(last_seen_at DESC);
