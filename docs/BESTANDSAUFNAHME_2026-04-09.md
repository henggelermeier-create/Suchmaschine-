# Bestandsaufnahme (Stand: 2026-04-09)

## 1) Projektüberblick
- Monorepo mit 4 Laufzeit-Komponenten über `docker-compose`:
  - `webapp` (Express + React + Vite)
  - `crawler` (Shop-Importe)
  - `worker` (Monitoring/Background)
  - `ai_service` (einfache Bewertungs-API)
  - plus `postgres` und `redis`.
- Datenbank-Migrationen liegen unter `database/migrations` und werden per `ensure_schema.mjs` sequenziell/lock-geschützt ausgeführt.

## 2) Positiver Ist-Zustand
- DB-URL-Normalisierung ist in `webapp`, `crawler` und `worker` implementiert (localhost wird auf Docker-Service `postgres` normalisiert).
- Struktur für Crawl-Jobs, Discovery-Queue und Offer-Tracking ist vorhanden.
- Health-Endpunkte sind vorhanden (`/api/health` im Backend, `/health` im ai_service).

## 3) Auffälligkeiten / Risiken

### 3.1 Sicherheitsrisiken (hoch)
- In `docker-compose.yml` sind produktionsnahe Secrets/Kennwörter direkt im Klartext hinterlegt (DB, Redis, Admin, JWT).
- `ENV_EXAMPLE` enthält ebenfalls konkrete Secret-Beispiele statt klar als Dummy markierter Platzhalter.

### 3.2 Repository-Hygiene (hoch)
- Es existiert aktuell keine `.gitignore` auf Repo-Ebene.
- Mehrere `node_modules`-Ordner sind untracked vorhanden (`webapp`, `services/ai_service`, `services/crawler`, `services/worker`).
- Dadurch steigt das Risiko, versehentlich Abhängigkeiten einzuchecken und das Repo unnötig aufzublähen.

### 3.3 Codequalität-Alarm (hoch)
- In `webapp/src/App.jsx` sind offensichtliche Merge-Artefakte im JSX enthalten (`codex/fix-error`, `main`) innerhalb der Brand-Komponente.
- Das ist potenziell sichtbarer UI-Fehler und deutet auf unvollständig bereinigten Merge-Stand hin.

### 3.4 Dokumentationskonsistenz (mittel)
- `docs/RESET_DATABASE_PASSWORD.md` nennt andere Passwortwerte als `docker-compose.yml`/`ENV_EXAMPLE`.
- Dadurch entsteht operatives Risiko bei Deploy/Recovery (Runbook-Drift).

## 4) Betriebs- und Wartungsbild
- Repo-Größe lokal aktuell ca. 55 MB.
- Ein großer Anteil entfällt auf lokale Node-Artefakte in Service- und Webapp-Verzeichnissen.
- Architektur und Namenskonventionen wirken übergreifend konsistent; die größten Risiken sind aktuell Security-/Repo-Hygiene-Themen.

## 5) Empfohlene Prioritäten (nächste Schritte)
1. **Sofort**: Secrets aus `docker-compose.yml` entfernen, ausschließlich via ENV/Secret-Store injizieren.
2. **Sofort**: Repo-weite `.gitignore` ergänzen (mind. `**/node_modules`, Build-Artefakte, lokale ENV-Dateien).
3. **Sofort**: Merge-Artefakte in `webapp/src/App.jsx` bereinigen.
4. **Kurzfristig**: Dokumente (`README_START_HERE.md`, `COOLIFY_EXACT.md`, `RESET_DATABASE_PASSWORD.md`) auf konsistente Beispielwerte harmonisieren.
5. **Kurzfristig**: Optionaler CI-Check für „keine Klartext-Secrets“ + Lint/Build vor Merge.

## 6) Kurzfazit
Technisch ist das Projekt grundsätzlich lauffähig und strukturell gut aufgeteilt, hat aber aktuell drei zentrale Blocker vor „sauberem“ Produktionsbetrieb:
1) Secret-Handling,
2) Repository-Hygiene,
3) Merge-Restfehler im Frontend.
