# Kauvio full build bundle

Dieses Bundle setzt die besprochenen Kernpunkte konkret um:

- echte AI-Extraktion im `ai_service`
- automatische Produktfindung + AI-Auslesen in `open_web_discovery`
- Startseite mit maximal 6 Vergleichen
- Suchergebnis-UX mit ähnlichen Produkten und weiteren Vorschlägen
- gleiches Designsystem für Frontend, Produktseite und Admin

## Ersetzen

- `services/ai_service/package.json`
- `services/ai_service/ai_service.mjs`
- `services/worker/open_web_discovery.mjs`
- `webapp/server/index.mjs`
- `webapp/server/canonical_search_runtime.mjs`
- `webapp/package.json`
- `webapp/src/Brand.jsx`
- `webapp/src/SearchSuggestBox.jsx`
- `webapp/src/HomePageProfessional.jsx`
- `webapp/src/Root.jsx`
- `webapp/src/App.jsx`
- `webapp/src/styles.css`
- `webapp/src/swiss-home.css`

## Danach

1. `webapp` neu bauen
2. `ai_service` neu deployen
3. `worker` neu deployen
4. prüfen, dass `OPENAI_API_KEY` im `ai_service` gesetzt ist
5. optional `AI_SERVICE_URL` für den Worker setzen. Standard ist bereits `http://ai_service:3010`

## Was jetzt funktional anders ist

- Homepage zeigt nur 6 Vergleiche
- Startseite zeigt keine weiteren Angebote mehr
- Suchseite zeigt Hauptvergleich + ähnliche Produkte + weitere Vorschläge
- Open Web Discovery ruft jetzt den AI-Service für Produkt-Extraktion auf
- AI-Service kann Produktseiten mit Heuristik und optional mit OpenAI Responses API als JSON extrahieren
- `/api/products/suggest` und `/api/search/related` sind ergänzt
