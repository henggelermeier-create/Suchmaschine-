ALTER TABLE product_offers ADD COLUMN IF NOT EXISTS affiliate_url TEXT;
ALTER TABLE product_offers ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_product_offers_hidden ON product_offers(is_hidden);
