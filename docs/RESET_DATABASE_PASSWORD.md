# Datenbank-Passwort-Reset

Wenn in den Logs steht:

`password authentication failed for user "kauvio"`

dann stimmt das Postgres-Passwort nicht mit der `DATABASE_URL` überein.

## Final verwendete Werte

- `POSTGRES_DB=kauvio`
- `POSTGRES_USER=kauvio`
- `POSTGRES_PASSWORD=kauvio123secure`
- `DATABASE_URL=postgresql://kauvio:kauvio123secure@postgres:5432/kauvio`

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
- `ADMIN_PASSWORD=changeme123`
