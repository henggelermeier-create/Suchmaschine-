# Coolify / Docker Compose Deploy

Dieser Stack ist für Multi-Service-Deploy gedacht.

## Pflicht
- Als Quelle die `docker-compose.yml` im Repo-Root verwenden.
- Nicht nur `webapp` deployen. Es müssen mindestens diese Services laufen:
  - `webapp`
  - `worker`
  - `postgres`
  - `redis`
  - `ai_service`

## Wichtige Kontrolle nach dem Deploy
- `webapp` muss healthy sein über `/api/health`
- `ai_service` muss healthy sein über `/health`
- `worker` muss healthy sein über den DB-Heartbeat-Check

## Worker-Erfolg prüfen
Nach dem Deploy muss im Admin sichtbar sein:
- KI Engine Status nicht auf `KI steht`
- Suchjobs > 0 oder Warteschlange sichtbar
- KI Produkte / KI Offers nicht dauerhaft 0

## Wichtige Env-Variablen
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- optional: `AI_SEARCH_WORKER_INTERVAL_SECONDS`
- optional: `WORKER_HEARTBEAT_MAX_AGE_SECONDS`

## Typischer Fehler
Wenn nur die Webapp läuft, funktioniert das Admin-Frontend zwar, aber:
- die KI füllt keine Produkte nach
- Suchjobs bleiben hängen oder werden nicht verarbeitet
- der Admin zeigt nur statische Werte ohne echten Fortschritt
