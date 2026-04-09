CREATE TABLE IF NOT EXISTS product_offers (
  id SERIAL PRIMARY KEY,
  product_slug TEXT NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  shop_name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'CHF',
  product_url TEXT,
  image_url TEXT,
  source_name TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(product_slug, shop_name)
);

CREATE INDEX IF NOT EXISTS idx_product_offers_slug ON product_offers(product_slug);
CREATE INDEX IF NOT EXISTS idx_product_offers_price ON product_offers(price ASC);
