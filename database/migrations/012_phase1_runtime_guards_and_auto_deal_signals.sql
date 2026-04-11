BEGIN;

CREATE OR REPLACE FUNCTION public.ai_engine_is_paused()
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  runtime_mode TEXT;
  runtime_enabled BOOLEAN;
BEGIN
  SELECT is_enabled, COALESCE(control_value_json->>'mode', 'run')
  INTO runtime_enabled, runtime_mode
  FROM ai_runtime_controls
  WHERE control_key = 'engine_runtime'
  LIMIT 1;

  IF runtime_enabled IS FALSE THEN
    RETURN TRUE;
  END IF;

  runtime_mode := lower(COALESCE(runtime_mode, 'run'));
  RETURN runtime_mode IN ('pause', 'stop');
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_ai_engine_runtime()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.ai_engine_is_paused() THEN
    RAISE EXCEPTION 'AI engine paused';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_search_tasks_runtime ON search_tasks;
CREATE TRIGGER trg_guard_search_tasks_runtime
BEFORE UPDATE OF status
ON search_tasks
FOR EACH ROW
WHEN (OLD.status = 'pending' AND NEW.status = 'running')
EXECUTE FUNCTION public.guard_ai_engine_runtime();

DROP TRIGGER IF EXISTS trg_guard_seed_runtime ON ai_seed_candidates;
CREATE TRIGGER trg_guard_seed_runtime
BEFORE UPDATE OF status
ON ai_seed_candidates
FOR EACH ROW
WHEN (OLD.status = 'pending' AND NEW.status = 'running')
EXECUTE FUNCTION public.guard_ai_engine_runtime();

CREATE OR REPLACE FUNCTION public.refresh_single_canonical_deal_signal(target_canonical_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_current NUMERIC(12,2);
  v_avg NUMERIC(12,2);
  v_low NUMERIC(12,2);
  v_high NUMERIC(12,2);
  v_offer_count INTEGER;
  v_source_count INTEGER;
  v_top_threshold NUMERIC := 0.98;
  v_good_threshold NUMERIC := 0.95;
  v_score INTEGER := 60;
  v_label TEXT := 'KI Vergleich';
BEGIN
  IF target_canonical_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(cp.best_price, MIN(so.price)),
    AVG(oph.price)::numeric(12,2),
    MIN(oph.price)::numeric(12,2),
    MAX(oph.price)::numeric(12,2),
    COALESCE(cp.offer_count, COUNT(so.*)::int),
    COALESCE(cp.source_count, COUNT(DISTINCT so.provider)::int)
  INTO v_current, v_avg, v_low, v_high, v_offer_count, v_source_count
  FROM canonical_products cp
  LEFT JOIN source_offers_v2 so ON so.canonical_product_id = cp.id AND so.is_active = true
  LEFT JOIN offer_price_history oph ON oph.canonical_product_id = cp.id AND oph.recorded_at >= NOW() - INTERVAL '30 days'
  WHERE cp.id = target_canonical_id
  GROUP BY cp.id;

  SELECT
    COALESCE((control_value_json->>'top_deal_threshold')::numeric, 0.98),
    COALESCE((control_value_json->>'good_deal_threshold')::numeric, 0.95)
  INTO v_top_threshold, v_good_threshold
  FROM ai_runtime_controls
  WHERE control_key = 'price_refresh'
  LIMIT 1;

  IF v_current IS NOT NULL AND v_avg IS NOT NULL THEN
    IF v_low IS NOT NULL AND v_current <= v_low * v_top_threshold THEN
      v_score := LEAST(99, GREATEST(80, 95 + COALESCE(v_offer_count, 0)));
      v_label := 'Top Preis';
    ELSIF v_current <= v_avg * v_good_threshold THEN
      v_score := LEAST(96, GREATEST(70, 82 + COALESCE(v_source_count, 0)));
      v_label := 'Guter Preis';
    ELSIF v_current <= v_avg * 1.03 THEN
      v_score := LEAST(85, GREATEST(55, 68 + COALESCE(v_offer_count, 0)));
      v_label := 'Fairer Preis';
    ELSE
      v_score := LEAST(70, GREATEST(35, 48 + COALESCE(v_source_count, 0)));
      v_label := 'Eher teuer';
    END IF;
  END IF;

  UPDATE canonical_products
  SET deal_score = v_score,
      deal_label = v_label,
      price_avg_30d = v_avg,
      price_low_30d = v_low,
      price_high_30d = v_high,
      last_price_refresh_at = NOW(),
      ai_summary = CASE
        WHEN COALESCE(ai_summary, '') = '' THEN 'KI Einschätzung: ' || v_label || COALESCE(' · Ø30d CHF ' || v_avg::text, '')
        ELSE ai_summary
      END,
      updated_at = NOW()
  WHERE id = target_canonical_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_refresh_canonical_deal_signal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.refresh_single_canonical_deal_signal(COALESCE(NEW.canonical_product_id, OLD.canonical_product_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_canonical_deal_from_offer ON source_offers_v2;
CREATE TRIGGER trg_refresh_canonical_deal_from_offer
AFTER INSERT OR UPDATE OF price, canonical_product_id, is_active
ON source_offers_v2
FOR EACH ROW
EXECUTE FUNCTION public.trigger_refresh_canonical_deal_signal();

DROP TRIGGER IF EXISTS trg_refresh_canonical_deal_from_history ON offer_price_history;
CREATE TRIGGER trg_refresh_canonical_deal_from_history
AFTER INSERT
ON offer_price_history
FOR EACH ROW
EXECUTE FUNCTION public.trigger_refresh_canonical_deal_signal();

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM canonical_products LOOP
    PERFORM public.refresh_single_canonical_deal_signal(rec.id);
  END LOOP;
END $$;

COMMIT;
