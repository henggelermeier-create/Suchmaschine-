CREATE TABLE IF NOT EXISTS outbound_clicks (
  id SERIAL PRIMARY KEY,
  product_slug TEXT NOT NULL,
  shop_name TEXT,
  target_url TEXT,
  ip_address TEXT,
  user_agent TEXT,
  referer TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbound_clicks_created_at ON outbound_clicks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_clicks_product_slug ON outbound_clicks(product_slug);
CREATE INDEX IF NOT EXISTS idx_outbound_clicks_shop_name ON outbound_clicks(shop_name);
