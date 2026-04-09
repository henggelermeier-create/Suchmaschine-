ALTER TABLE product_offers
  ADD COLUMN IF NOT EXISTS source_group TEXT;

CREATE INDEX IF NOT EXISTS idx_product_offers_source_group
  ON product_offers(source_group);

CREATE TABLE IF NOT EXISTS admin_shop_sources (
  id SERIAL PRIMARY KEY,
  source_name TEXT NOT NULL UNIQUE,
  source_group TEXT,
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO admin_shop_sources(source_name, source_group, display_name, is_active)
VALUES
  ('digitec', 'dg_group', 'Digitec', TRUE),
  ('galaxus', 'dg_group', 'Galaxus', TRUE),
  ('brack', 'brack', 'BRACK', TRUE),
  ('interdiscount', 'interdiscount', 'Interdiscount', TRUE)
ON CONFLICT (source_name) DO NOTHING;
