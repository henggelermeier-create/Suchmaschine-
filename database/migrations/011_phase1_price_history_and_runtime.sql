BEGIN;

ALTER TABLE canonical_products
  ADD COLUMN IF NOT EXISTS deal_score INTEGER,
  ADD COLUMN IF NOT EXISTS deal_label TEXT,
  ADD COLUMN IF NOT EXISTS price_avg_30d NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS price_low_30d NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS price_high_30d NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS last_price_refresh_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS offer_price_history (
  id BIGSERIAL PRIMARY KEY,
  canonical_product_id BIGINT REFERENCES canonical_products(id) ON DELETE CASCADE,
  source_offer_id BIGINT REFERENCES source_offers_v2(id) ON DELETE CASCADE,
  provider TEXT,
  source_product_url TEXT,
  price NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CHF',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offer_price_history_canonical_time
  ON offer_price_history(canonical_product_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_offer_price_history_offer_time
  ON offer_price_history(source_offer_id, recorded_at DESC);

CREATE OR REPLACE FUNCTION public.capture_offer_price_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.price IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR OLD.price IS DISTINCT FROM NEW.price OR OLD.canonical_product_id IS DISTINCT FROM NEW.canonical_product_id THEN
    INSERT INTO offer_price_history(canonical_product_id, source_offer_id, provider, source_product_url, price, currency, recorded_at)
    VALUES (NEW.canonical_product_id, NEW.id, NEW.provider, NEW.source_product_url, NEW.price, COALESCE(NEW.currency, 'CHF'), NOW());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_offer_price_history ON source_offers_v2;
CREATE TRIGGER trg_capture_offer_price_history
AFTER INSERT OR UPDATE OF price, canonical_product_id
ON source_offers_v2
FOR EACH ROW
EXECUTE FUNCTION public.capture_offer_price_history();

INSERT INTO offer_price_history(canonical_product_id, source_offer_id, provider, source_product_url, price, currency, recorded_at)
SELECT DISTINCT ON (so.id)
  so.canonical_product_id,
  so.id,
  so.provider,
  so.source_product_url,
  so.price,
  COALESCE(so.currency, 'CHF'),
  COALESCE(so.updated_at, NOW())
FROM source_offers_v2 so
WHERE so.price IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO ai_runtime_controls(control_key, is_enabled, control_value_json, description, updated_by)
VALUES
(
  'engine_runtime',
  true,
  '{"mode": "run", "target_products": 10000}'::jsonb,
  'Startet oder pausiert die zentrale KI-Engine für Discovery, Preisrefresh und Canonical-Updates.',
  'migration'
),
(
  'price_refresh',
  true,
  '{"history_days": 30, "top_deal_threshold": 0.98, "good_deal_threshold": 0.95}'::jsonb,
  'Berechnet Preisverlauf und KI-Deal-Signale für Canonical-Produkte.',
  'migration'
)
ON CONFLICT (control_key) DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled,
  control_value_json = EXCLUDED.control_value_json,
  description = EXCLUDED.description,
  updated_at = NOW();

COMMIT;
