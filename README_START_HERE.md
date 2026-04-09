# Kauvio CH Go-Live Bundle v15

## Fix in dieser Version
- vollständige und saubere `docker-compose.yml`
- **keine Klartext-Secrets** mehr im Compose-File (nur ENV/Secret-Store)
- `DATABASE_URL` nutzt standardmässig immer den Docker-Service `postgres`
- Webapp loggt den verwendeten DB-Host beim Start
- `.gitignore` für GitHub enthalten

## Für Coolify
Setze mindestens:
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `DATABASE_URL`
- `REDIS_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `JWT_SECRET`

Beispiel (Platzhalter):
- `DATABASE_URL=postgresql://kauvio:CHANGE_ME_POSTGRES_PASSWORD@postgres:5432/kauvio`
- `REDIS_URL=redis://:CHANGE_ME_REDIS_PASSWORD@redis:6379`

## Test nach Deploy
- Logs dürfen **nicht** mehr `127.0.0.1:5432` zeigen
- `/api/health` muss antworten
- Admin-Login muss funktionieren

Hinweis: Falls Coolify versehentlich eine DATABASE_URL mit localhost setzt, ersetzt der Code localhost automatisch durch den Docker-Service `postgres`. Optional kannst du `POSTGRES_HOST=postgres` setzen.

## Build-Fix für Coolify
- `webapp` nutzt `npm exec vite build`, damit der Vite-Build in Coolify robuster läuft.
- Falls Coolify weiter altes Verhalten zeigt: `Rebuild without cache` ausführen.

## MATCHING UPDATE v18
- Produkte werden shopübergreifend stärker über Brand + Modell + Speichergröße zusammengeführt.
- Beispiel: "Apple iPhone 15 Pro 256GB Natural Titanium" und "iPhone 15 Pro 256 GB Titan Natur" landen eher im gleichen Produkt.
- Interdiscount Body-Fallback wurde ebenfalls repariert.
