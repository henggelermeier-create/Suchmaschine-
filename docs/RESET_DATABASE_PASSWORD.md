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



## Automatischer Passwort-Abgleich (neu)

Der Postgres-Container setzt beim Start das Passwort von `POSTGRES_USER` automatisch auf `POSTGRES_PASSWORD` (auch bei bestehendem Volume).

Dadurch reicht in vielen Fällen bereits:
1. `POSTGRES_PASSWORD` korrekt setzen
2. Stack neu starten

## Neuer Schutz im Code

Die Services (`webapp`, `crawler`, `worker`) versuchen zuerst die `DATABASE_URL` und bei `28P01` (Auth-Fehler) automatisch einen zweiten Verbindungsversuch mit `POSTGRES_*`-Werten.

Das hilft sowohl bei veralteter `DATABASE_URL` als auch bei teilweise inkonsistenter ENV-Übernahme in Coolify.

## Wichtig

Wenn trotz Neustart weiterhin `28P01` erscheint, ist wahrscheinlich ein tieferes Rollen-/State-Problem im Volume vorhanden.

Dann musst du als Fallback:

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
