# Datenbank-Passwort-Reset

Wenn in den Logs steht:

`password authentication failed for user "kauvio"`

dann stimmt das Postgres-Passwort nicht mit der `DATABASE_URL` überein.

## Konsistente Beispielwerte

- `POSTGRES_DB=kauvio`
- `POSTGRES_USER=kauvio`
- `POSTGRES_PASSWORD=CHANGE_ME_POSTGRES_PASSWORD`
- `DATABASE_URL=postgresql://kauvio:CHANGE_ME_POSTGRES_PASSWORD@postgres:5432/kauvio`
- `REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD`
- `REDIS_URL=redis://:CHANGE_ME_REDIS_PASSWORD@redis:6379`


## Neuer Schutz im Code

Die Services (`webapp`, `crawler`, `worker`) überschreiben bei gesetzten `POSTGRES_*`-Variablen die Zugangsdaten aus `DATABASE_URL`.

Das hilft, wenn in Coolify versehentlich eine alte `DATABASE_URL` stehen bleibt, aber `POSTGRES_PASSWORD` bereits korrekt ist.

## Wichtig

Wenn PostgreSQL bereits mit einem alten Passwort initialisiert wurde, reicht es nicht, nur die Variablen zu ändern.

Dann musst du:

1. Stack stoppen
2. Postgres Persistent Storage / Volume löschen
3. speichern
4. neu deployen

Danach funktioniert die Verbindung von:
- webapp
- crawler
- worker

## Admin Login

- `ADMIN_EMAIL=admin@kauvio.ch`
- `ADMIN_PASSWORD=CHANGE_ME_ADMIN_PASSWORD`
