# Coolify exakt

## Build Pack
- Docker Compose
- Base Directory: `/`
- Compose File: `/docker-compose.yml`

## Pflicht-ENV
- `POSTGRES_PASSWORD=DEIN_DB_PASSWORT`
- `ADMIN_EMAIL=admin@kauvio.ch`
- `ADMIN_PASSWORD=DEIN_PASSWORT`
- `JWT_SECRET=LANGES_SECRET`

## Empfohlene explizite DB-URL
`DATABASE_URL=postgresql://kauvio:DEIN_DB_PASSWORT@postgres:5432/kauvio`

## Woran du den Fix erkennst
In den Webapp-Logs steht nach dem Start:
- `Using DB host from DATABASE_URL: postgres`

Wenn dort `localhost` oder `127.0.0.1` steht, ist die ENV in Coolify falsch gesetzt oder nicht übernommen.


Hinweis: Falls Coolify versehentlich eine DATABASE_URL mit localhost setzt, ersetzt der Code localhost automatisch durch den Docker-Service `postgres`. Optional kannst du POSTGRES_HOST=postgres setzen.
