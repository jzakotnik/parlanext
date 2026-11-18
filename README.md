# Anfragen-Check

Web-App, die prüft, ob eine (neue) parlamentarische Anfrage schon einmal von der Bundesregierung beantwortet wurde – Korpus: Antworten auf Kleine/Große Anfragen mit Bezug zur KfW Entwicklungsbank.

**Stack:** Next.js 15 · Azure (Foundry): `text-embedding-3-large` (1536 Dim.) + GPT-6 Astra · **keine Datenbank** – PDFs, Metadaten und Suchindex liegen als Dateien im gitignorierten Ordner `data/`.

## Start (Demo-Modus)
```bash
npm install
npm run dev
```
Ohne Index zeigt die App fiktive Demodaten; ohne Azure-Keys wird heuristisch statt per KI bewertet.

## Daten
```bash
npm run data:init    # legt data/ an (falls nicht vorhanden)
```
```
data/
  kleine-anfragen/   *.pdf  + metadaten.jsonl
  grosse-anfragen/   *.pdf  + metadaten.jsonl
  index/             (wird erzeugt) texts/, chunks.jsonl, vectors.f32, manifest.json
```
`metadaten.jsonl`: eine Zeile je PDF, z. B.
```json
{"datei":"20-1234.pdf","dokumentnummer":"20/1234","datum":"2024-03-01","titel":"…","kfw":true,"bmz":true,"deskriptoren":["…"],"sachgebiete":["…"]}
```
`vorgangstyp` ergibt sich aus dem Ordner; `id` ist optional (Standard: `dokumentnummer`); fehlt `datei`, wird `<dokumentnummer mit - statt />.pdf` angenommen.

## Index bauen
```bash
cp .env.example .env.local   # Azure-Endpoint, Key, Deployment-Namen
npm run ingest -- --limit 50 # erst klein testen, dann ohne --limit
```
Resumable (bereits indexierte PDFs werden übersprungen). Embedding-Modell/Dimension stehen im Manifest; ein Modellwechsel erfordert einen neuen Index (`data/index` löschen).

## Funktionsweise
- Suche: Vektor (Azure-Embeddings, Kosinus im Speicher) + Stichwortsuche, per Reciprocal Rank Fusion; Filter KfW/BMZ/Datum/Vorgangstyp. Bis ~100k Chunks ist das ohne Vektordatenbank schnell genug.
- Vertrauensregeln: Urteil nur mit **wörtlich verifiziertem Zitat** + Datum + PDF-Link; bei „nichts gefunden“ werden Suchanfragen/Filter und der nächste Treffer unter der Schwelle (0,55) gezeigt; Antworten > 12 Monate sind markiert.
- Die PDFs werden über `/api/pdf/<id>` aus `data/` ausgeliefert. Keys bleiben serverseitig.

## Offen
DIP-Feldnamen gegen Swagger prüfen, Chat-Agent mit Tools `search_antworten`/`get_antwort`, Evaluationsset, Entra-Auth, Dekomposition deutscher Komposita.
