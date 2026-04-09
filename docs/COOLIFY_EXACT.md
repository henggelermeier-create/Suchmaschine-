# Coolify exakt

## Build Pack
- Docker Compose
- Base Directory: `/`
- Compose File: `/docker-compose.yml`

## Pflicht-ENV
- `POSTGRES_PASSWORD=CHANGE_ME_POSTGRES_PASSWORD`
- `REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD`
- `DATABASE_URL=postgresql://kauvio:CHANGE_ME_POSTGRES_PASSWORD@postgres:5432/kauvio`
- `REDIS_URL=redis://:CHANGE_ME_REDIS_PASSWORD@redis:6379`
- `ADMIN_EMAIL=admin@kauvio.ch`
- `ADMIN_PASSWORD=CHANGE_ME_ADMIN_PASSWORD`
- `JWT_SECRET=CHANGE_ME_LONG_RANDOM_JWT_SECRET`

## Woran du den Fix erkennst
In den Webapp-Logs steht nach dem Start:
- `Using DB host from DATABASE_URL: postgres`

Wenn dort `localhost` oder `127.0.0.1` steht, ist die ENV in Coolify falsch gesetzt oder nicht übernommen.

Hinweis: Falls Coolify versehentlich eine DATABASE_URL mit localhost setzt, ersetzt der Code localhost automatisch durch den Docker-Service `postgres`. Optional kannst du `POSTGRES_HOST=postgres` setzen.
