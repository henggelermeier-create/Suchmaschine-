BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_toppreise_task_source()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM search_task_sources sts
    WHERE sts.search_task_id = NEW.id
      AND sts.provider = 'toppreise'
      AND sts.source_kind = 'comparison_search'
  ) THEN
    INSERT INTO search_task_sources(
      search_task_id,
      provider,
      source_kind,
      seed_value,
      status,
      swiss_source_id,
      planner_reason,
      source_priority,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      'toppreise',
      'comparison_search',
      NEW.query,
      'pending',
      NULL,
      'Deterministischer Preisvergleich als sichere Basis',
      100,
      NOW(),
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_toppreise_task_source ON search_tasks;
CREATE TRIGGER trg_ensure_toppreise_task_source
AFTER INSERT ON search_tasks
FOR EACH ROW
EXECUTE FUNCTION public.ensure_toppreise_task_source();

INSERT INTO search_task_sources(
  search_task_id,
  provider,
  source_kind,
  seed_value,
  status,
  swiss_source_id,
  planner_reason,
  source_priority,
  created_at,
  updated_at
)
SELECT
  st.id,
  'toppreise',
  'comparison_search',
  st.query,
  CASE WHEN st.status IN ('success','failed') THEN 'success' ELSE 'pending' END,
  NULL,
  'Backfill deterministischer Preisvergleich als sichere Basis',
  100,
  NOW(),
  NOW()
FROM search_tasks st
WHERE NOT EXISTS (
  SELECT 1
  FROM search_task_sources sts
  WHERE sts.search_task_id = st.id
    AND sts.provider = 'toppreise'
    AND sts.source_kind = 'comparison_search'
);

INSERT INTO ai_seed_candidates(
  query,
  normalized_query,
  seed_source,
  priority,
  status,
  notes,
  created_at,
  updated_at
)
VALUES
  ('iphone 16 pro', 'iphone 16 pro', 'phase1_seed', 95, 'pending', 'Phase 1 Top-Produkt', NOW(), NOW()),
  ('iphone 16', 'iphone 16', 'phase1_seed', 90, 'pending', 'Phase 1 Top-Produkt', NOW(), NOW()),
  ('samsung galaxy s25 ultra', 'samsung galaxy s25 ultra', 'phase1_seed', 95, 'pending', 'Phase 1 Top-Produkt', NOW(), NOW()),
  ('samsung galaxy s25', 'samsung galaxy s25', 'phase1_seed', 90, 'pending', 'Phase 1 Top-Produkt', NOW(), NOW()),
  ('google pixel 9 pro', 'google pixel 9 pro', 'phase1_seed', 88, 'pending', 'Phase 1 Top-Produkt', NOW(), NOW()),
  ('macbook air m4', 'macbook air m4', 'phase1_seed', 94, 'pending', 'Phase 1 Top-Produkt', NOW(), NOW()),
  ('macbook pro m4', 'macbook pro m4', 'phase1_seed', 90, 'pending', 'Phase 1 Top-Produkt', NOW(), NOW()),
  ('lenovo thinkpad', 'lenovo thinkpad', 'phase1_seed', 82, 'pending', 'Phase 1 Computing', NOW(), NOW()),
  ('gaming laptop rtx 4070', 'gaming laptop rtx 4070', 'phase1_seed', 84, 'pending', 'Phase 1 Computing', NOW(), NOW()),
  ('asus rog laptop', 'asus rog laptop', 'phase1_seed', 82, 'pending', 'Phase 1 Computing', NOW(), NOW()),
  ('airpods pro', 'airpods pro', 'phase1_seed', 90, 'pending', 'Phase 1 Audio', NOW(), NOW()),
  ('sony wh 1000xm6', 'sony wh 1000xm6', 'phase1_seed', 88, 'pending', 'Phase 1 Audio', NOW(), NOW()),
  ('bose quietcomfort ultra', 'bose quietcomfort ultra', 'phase1_seed', 86, 'pending', 'Phase 1 Audio', NOW(), NOW()),
  ('jabra elite', 'jabra elite', 'phase1_seed', 80, 'pending', 'Phase 1 Audio', NOW(), NOW()),
  ('dyson v15', 'dyson v15', 'phase1_seed', 89, 'pending', 'Phase 1 Haushalt', NOW(), NOW()),
  ('dyson v12', 'dyson v12', 'phase1_seed', 84, 'pending', 'Phase 1 Haushalt', NOW(), NOW()),
  ('roborock s8', 'roborock s8', 'phase1_seed', 87, 'pending', 'Phase 1 Haushalt', NOW(), NOW()),
  ('ecovacs deebot', 'ecovacs deebot', 'phase1_seed', 79, 'pending', 'Phase 1 Haushalt', NOW(), NOW()),
  ('kaffeevollautomat delonghi', 'kaffeevollautomat delonghi', 'phase1_seed', 81, 'pending', 'Phase 1 Haushalt', NOW(), NOW()),
  ('philips airfryer', 'philips airfryer', 'phase1_seed', 78, 'pending', 'Phase 1 Haushalt', NOW(), NOW()),
  ('oled tv 55 zoll', 'oled tv 55 zoll', 'phase1_seed', 86, 'pending', 'Phase 1 TV', NOW(), NOW()),
  ('lg oled evo', 'lg oled evo', 'phase1_seed', 84, 'pending', 'Phase 1 TV', NOW(), NOW()),
  ('samsung oled tv', 'samsung oled tv', 'phase1_seed', 82, 'pending', 'Phase 1 TV', NOW(), NOW()),
  ('sony bravia oled', 'sony bravia oled', 'phase1_seed', 80, 'pending', 'Phase 1 TV', NOW(), NOW()),
  ('nintendo switch 2', 'nintendo switch 2', 'phase1_seed', 92, 'pending', 'Phase 1 Gaming', NOW(), NOW()),
  ('playstation 5', 'playstation 5', 'phase1_seed', 88, 'pending', 'Phase 1 Gaming', NOW(), NOW()),
  ('xbox series x', 'xbox series x', 'phase1_seed', 84, 'pending', 'Phase 1 Gaming', NOW(), NOW()),
  ('meta quest 3', 'meta quest 3', 'phase1_seed', 82, 'pending', 'Phase 1 Gaming', NOW(), NOW()),
  ('garmin fenix', 'garmin fenix', 'phase1_seed', 77, 'pending', 'Phase 1 Wearables', NOW(), NOW()),
  ('apple watch ultra', 'apple watch ultra', 'phase1_seed', 85, 'pending', 'Phase 1 Wearables', NOW(), NOW()),
  ('apple watch series 10', 'apple watch series 10', 'phase1_seed', 84, 'pending', 'Phase 1 Wearables', NOW(), NOW()),
  ('samsung galaxy watch', 'samsung galaxy watch', 'phase1_seed', 79, 'pending', 'Phase 1 Wearables', NOW(), NOW()),
  ('logitech mx master', 'logitech mx master', 'phase1_seed', 75, 'pending', 'Phase 1 Accessories', NOW(), NOW()),
  ('logitech mx keys', 'logitech mx keys', 'phase1_seed', 75, 'pending', 'Phase 1 Accessories', NOW(), NOW()),
  ('bambu lab a1', 'bambu lab a1', 'phase1_seed', 76, 'pending', 'Phase 1 Maker', NOW(), NOW()),
  ('dji mini 4 pro', 'dji mini 4 pro', 'phase1_seed', 83, 'pending', 'Phase 1 Drone', NOW(), NOW()),
  ('gopro hero', 'gopro hero', 'phase1_seed', 77, 'pending', 'Phase 1 Camera', NOW(), NOW()),
  ('sony alpha a7', 'sony alpha a7', 'phase1_seed', 79, 'pending', 'Phase 1 Camera', NOW(), NOW()),
  ('canon eos r6', 'canon eos r6', 'phase1_seed', 77, 'pending', 'Phase 1 Camera', NOW(), NOW()),
  ('nikon z6', 'nikon z6', 'phase1_seed', 74, 'pending', 'Phase 1 Camera', NOW(), NOW())
ON CONFLICT (normalized_query) DO UPDATE
SET priority = GREATEST(ai_seed_candidates.priority, EXCLUDED.priority),
    updated_at = NOW();

UPDATE ai_runtime_controls
SET is_enabled = TRUE,
    control_value_json = jsonb_set(COALESCE(control_value_json, '{}'::jsonb), '{mode}', '"run"'::jsonb, TRUE),
    updated_at = NOW()
WHERE control_key = 'engine_runtime';

UPDATE ai_runtime_controls
SET is_enabled = TRUE,
    control_value_json = COALESCE(control_value_json, '{}'::jsonb) || '{"result_limit": 18, "product_fetch_limit": 12, "search_timeout_ms": 25000}'::jsonb,
    updated_at = NOW()
WHERE control_key = 'open_web_discovery';

COMMIT;
