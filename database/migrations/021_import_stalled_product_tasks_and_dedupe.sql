BEGIN;

-- Stop endless duplicate trending/live jobs. Keep one active task per normalized query.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY normalized_query ORDER BY imported_count DESC, discovered_count DESC, created_at ASC) AS rn
  FROM search_tasks
  WHERE status IN ('pending','running')
    AND normalized_query IS NOT NULL
    AND created_at >= NOW() - INTERVAL '72 hours'
)
UPDATE search_tasks st
SET status = 'failed',
    error_message = 'Deduped: duplicate active KI job stopped.',
    finished_at = NOW(),
    updated_at = NOW()
FROM ranked r
WHERE st.id = r.id
  AND r.rn > 1;

-- If the task query already contains a complete product title and price, store it as a product.
-- Price parsing is deliberately defensive: extract one CHF-like token, strip thousands
-- separators, normalize comma decimals, and only cast strings that are numeric.
WITH product_like_tasks AS (
  SELECT st.id,
         st.query,
         COALESCE(st.normalized_query, lower(regexp_replace(st.query, '[^a-zA-Z0-9]+', ' ', 'g'))) AS canonical_key,
         COALESCE((SELECT sts.provider FROM search_task_sources sts WHERE sts.search_task_id = st.id ORDER BY sts.imported_count DESC, sts.created_at ASC LIMIT 1), 'ki_live') AS provider,
         COALESCE((SELECT sts.seed_value FROM search_task_sources sts WHERE sts.search_task_id = st.id AND sts.seed_value LIKE 'http%' ORDER BY sts.created_at ASC LIMIT 1), 'https://kauvio.ch') AS product_url
  FROM search_tasks st
  WHERE st.status IN ('pending','running')
    AND st.created_at >= NOW() - INTERVAL '72 hours'
    AND st.query ~* '(CHF|Fr\.?|SFr\.?)\s*[0-9]'
    AND length(st.query) >= 20
), price_tokens AS (
  SELECT plt.*,
         substring(plt.query FROM '(?:CHF|Fr\.?|SFr\.?)\s*([0-9][0-9''’.,]{0,14})') AS price_after_currency,
         substring(plt.query FROM '([0-9][0-9''’.,]{0,14})\s*(?:CHF|Fr\.?|SFr\.?)') AS price_before_currency
  FROM product_like_tasks plt
), normalized_products AS (
  SELECT id,
         query,
         left(regexp_replace(lower(canonical_key), '\s+', ' ', 'g'), 180) AS canonical_key,
         provider,
         product_url,
         CASE
           WHEN cleaned_price ~ '^[0-9]+(\.[0-9]{1,2})?$' THEN cleaned_price::numeric
           ELSE NULL
         END AS price
  FROM (
    SELECT id,
           query,
           canonical_key,
           provider,
           product_url,
           replace(
             regexp_replace(
               regexp_replace(COALESCE(price_after_currency, price_before_currency, ''), '[''’]', '', 'g'),
               '\.(?=[0-9]{3}(\D|$))', '', 'g'
             ),
             ',', '.'
           ) AS cleaned_price
    FROM price_tokens
  ) cleaned
), inserted_products AS (
  INSERT INTO canonical_products(canonical_key, title, brand, category, model_key, ai_summary, popularity_score, freshness_priority, confidence_score, source_count, offer_count, best_price, best_price_currency, last_seen_at, updated_at)
  SELECT canonical_key,
         query,
         split_part(query, ' ', 1),
         'Produkt',
         canonical_key,
         'KI Live-Import aus Schweizer Shopdaten.',
         25,
         95,
         0.60,
         1,
         1,
         price,
         'CHF',
         NOW(),
         NOW()
  FROM normalized_products
  WHERE canonical_key IS NOT NULL AND canonical_key <> ''
  ON CONFLICT (canonical_key) DO UPDATE SET
    title = CASE WHEN length(EXCLUDED.title) > length(canonical_products.title) THEN EXCLUDED.title ELSE canonical_products.title END,
    brand = COALESCE(canonical_products.brand, EXCLUDED.brand),
    category = COALESCE(canonical_products.category, EXCLUDED.category),
    best_price = CASE WHEN canonical_products.best_price IS NULL OR (EXCLUDED.best_price IS NOT NULL AND EXCLUDED.best_price < canonical_products.best_price) THEN EXCLUDED.best_price ELSE canonical_products.best_price END,
    offer_count = GREATEST(canonical_products.offer_count, 1),
    source_count = GREATEST(canonical_products.source_count, 1),
    confidence_score = GREATEST(canonical_products.confidence_score, EXCLUDED.confidence_score),
    last_seen_at = NOW(),
    updated_at = NOW()
  RETURNING id, canonical_key
), offer_rows AS (
  SELECT ip.id AS canonical_product_id,
         np.id AS search_task_id,
         np.query,
         np.provider,
         np.product_url,
         np.price,
         np.canonical_key
  FROM inserted_products ip
  JOIN normalized_products np ON np.canonical_key = ip.canonical_key
), inserted_offers AS (
  INSERT INTO source_offers_v2(canonical_product_id, provider, provider_group, offer_title, brand, category, model_key, price, currency, deeplink_url, source_product_url, confidence_score, extraction_method, extracted_json, is_active, last_seen_at, updated_at)
  SELECT canonical_product_id,
         provider,
         'ki_live_recovered',
         query,
         split_part(query, ' ', 1),
         'Produkt',
         canonical_key,
         price,
         'CHF',
         product_url,
         product_url,
         0.60,
         'stalled_task_recovery',
         jsonb_build_object('recovered_from_search_task_id', search_task_id),
         TRUE,
         NOW(),
         NOW()
  FROM offer_rows
  RETURNING extracted_json
)
UPDATE search_tasks st
SET status = 'success',
    discovered_count = GREATEST(discovered_count, 1),
    imported_count = GREATEST(imported_count, 1),
    result_count = GREATEST(result_count, 1),
    finished_at = NOW(),
    updated_at = NOW(),
    error_message = NULL
FROM normalized_products np
WHERE st.id = np.id;

UPDATE search_task_sources sts
SET status = 'success',
    discovered_count = GREATEST(discovered_count, 1),
    imported_count = GREATEST(imported_count, 1),
    error_message = NULL,
    updated_at = NOW()
WHERE sts.search_task_id IN (
  SELECT id FROM search_tasks
  WHERE status = 'success'
    AND updated_at >= NOW() - INTERVAL '5 minutes'
);

-- Slow down repeated autonomous trend recycling until the real worker catches up.
UPDATE ai_runtime_controls
SET control_value_json = COALESCE(control_value_json, '{}'::jsonb)
  || '{"enqueue_per_tick":1,"trending_limit":10,"baseline_limit":8,"seed_batch_size":50,"max_pending_candidates":250,"recycle_completed_after_hours":72}'::jsonb,
    updated_by = 'hotfix_stalled_products_dedupe',
    updated_at = NOW()
WHERE control_key = 'autonomous_builder';

INSERT INTO ai_runtime_events(event_type, severity, event_payload_json, created_by, created_at)
VALUES (
  'hotfix_import_stalled_product_tasks_and_dedupe_safe_price',
  'warning',
  jsonb_build_object(
    'canonical_products', (SELECT COUNT(*) FROM canonical_products),
    'source_offers', (SELECT COUNT(*) FROM source_offers_v2),
    'active_pending_tasks', (SELECT COUNT(*) FROM search_tasks WHERE status IN ('pending','running'))
  ),
  'hotfix_safe_price_cast_021',
  NOW()
);

COMMIT;
