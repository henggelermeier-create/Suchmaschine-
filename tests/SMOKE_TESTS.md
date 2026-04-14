# Smoke Tests

## 1. Health
- GET `/api/health`
- GET `http://ai_service:3010/health`

## 2. Homepage
- Startseite zeigt maximal 6 Karten
- keine weiteren Angebotsblöcke unterhalb der Startseite

## 3. Suche
Teste:
- `gopro hero`
- `garmin fenix`
- `iphone 16 pro 256 gb`

Erwartung:
- Search Task wird angelegt
- `open_web_result` ist >= 0
- `shop_catalog` importiert echte Offers
- `canonical_merge_result.merged` > 0
- `/api/products?q=...` liefert `items`

## 4. Bilder
- mindestens ein Offer enthält `image_url`
- Produktseite zeigt Bild oder Bild-URL im Payload

## 5. Admin
- Login funktioniert
- AI Control Update funktioniert
- Swiss Source Update funktioniert
- Task Retry funktioniert

## 6. DB
Kontrollieren:
- `source_offers_v2` wächst
- `canonical_products` wächst
- `search_task_sources.imported_count` > 0 für shop_catalog
