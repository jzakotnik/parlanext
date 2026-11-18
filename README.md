# Anfragen-Check

Web-App, die prüft, ob eine (neue) parlamentarische Anfrage schon einmal von der Bundesregierung beantwortet wurde – Korpus: Antworten auf Kleine/Große Anfragen mit Bezug zur KfW Entwicklungsbank.

**Stack:** Next.js 15 (App Router) · Postgres + pgvector · Azure (Foundry) für Embeddings (`text-embedding-3-large`, 1536 Dim.) und Chat-Modell.

## Start (Demo-Modus, ohne Setup)
```bash
npm install
npm run dev
```
Ohne `DATABASE_URL` läuft die App mit fiktiven Demodaten; ohne Azure-Keys wird heuristisch statt per KI bewertet.

## Echtbetrieb
```bash
cp .env.example .env.local   # Werte eintragen
npm run db:up                # pgvector/pgvector:pg17, Schema wird automatisch angelegt
npm run ingest -- ./anfragen.jsonl --limit 50   # erst klein testen, dann voll
```
- Hybridsuche: Vektor + deutsche Volltextsuche, per Reciprocal Rank Fusion; Filter (KfW, BMZ, Datum, Vorgangstyp) im WHERE.
- Vertrauensregeln: Ein Urteil gibt es nur mit **wörtlichem, verifiziertem Zitat** + Datum + Link; bei „nichts gefunden“ werden Suchanfragen/Filter und der nächste Treffer unter der Schwelle (0,55) gezeigt; Antworten > 12 Monate werden markiert.
- Embedding-Modell/Dimension stehen in `.env` und in der Tabelle `config`; Wechsel = neu embedden.
- Keys bleiben serverseitig (`src/lib/azure.ts`, nur in Route Handlers).

## Struktur
`src/lib/search.ts` Hybridsuche · `src/lib/check.ts` Zerlegung → Suche → Bewertung → Zitat-Verifikation · `scripts/ingest.ts` Import (resumable) · `db/schema.sql`.

## Offen
DIP-Feldnamen/Enums gegen Swagger prüfen (`ingest.ts` erwartet die Felder aus `dip_anfragen.py`), Chat-Agent mit Tools `search_antworten`/`get_antwort`, Evaluationsset (20–30 Fragen), Entra-Auth, `pg_trgm`-Suche für Komposita (Index vorhanden).
