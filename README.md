# Anfragen-Check

Web-App, die prüft, ob eine (neue) parlamentarische Anfrage schon einmal von der Bundesregierung beantwortet wurde – Korpus: Antworten auf Kleine/Große Anfragen mit Bezug zur KfW Entwicklungsbank.

**Stack:** Next.js 15 · Azure (Foundry): `text-embedding-3-large` (1536 Dim.) + GPT-6 Astra · **keine Datenbank** – PDFs, Metadaten und Suchindex liegen als Dateien im gitignorierten Ordner `data/`.

## Start (Demo-Modus)
```bash
npm install
npm run dev
```
Ohne Index zeigt die App fiktive Demodaten; ohne Azure-Keys wird heuristisch statt per KI bewertet.

## Daten holen (Anfragen + Antworten direkt vom Bundestag)
```bash
cp .env.example .env.local    # DIP_API_KEY eintragen (dip.bundestag.de > Über DIP > Hilfe > API)
npm run fetch -- --limit 20   # erst klein testen und die Zusammenfassung lesen
npm run fetch                 # dann komplett (Wahlperiode 21; Optionen: --wahlperiode, --von, --bis, --nur anfragen|antworten)
```
Das Tool legt `data/` selbst an, lädt alle Kleinen/Großen Anfragen der Wahlperiode und dazu die Antwort-Drucksachen der Bundesregierung (PDF + `metadaten.jsonl`) und ist wiederholbar. Filter- und Feldnamen der DIP-API sind nicht gegen die Swagger-Doku verifiziert – die Zusammenfassung am Ende zeigt, ob „Antwort“ gefunden wurde.

```
data/
  kleine_anfragen/   <id>.pdf  + metadaten.jsonl   (Anfragen und Antworten)
  grosse_anfragen/   <id>.pdf  + metadaten.jsonl
  index/             (wird erzeugt) texts/, chunks.jsonl, vectors.f32, manifest.json, flags.json
```
`metadaten.jsonl` ist das DIP-JSON je Drucksache (`id`, `drucksachetyp`, `dokumentnummer`, `datum`, `titel`, `vorgangsbezug`, `fundstelle.pdf_url` …). Indexiert werden standardmäßig nur Drucksachen vom Typ „Antwort“ (`INDEX_TYPEN` ändert das). KfW-/BMZ-Bezug wird beim Ingest aus dem Volltext abgeleitet. Ordner ohne Download anlegen: `npm run data:init`.

## Index bauen
```bash
cp .env.example .env.local   # Azure-Endpoint, Key, Deployment-Namen
npm run ingest -- --limit 50 # erst klein testen (Azure-Werte in .env.local), dann ohne --limit
```
Resumable (bereits indexierte PDFs werden übersprungen). Embedding-Modell/Dimension stehen im Manifest; ein Modellwechsel erfordert einen neuen Index (`data/index` löschen).

## Funktionsweise
- Suche: Vektor (Azure-Embeddings, Kosinus im Speicher) + Stichwortsuche, per Reciprocal Rank Fusion; Filter KfW/BMZ/Datum/Vorgangstyp. Bis ~100k Chunks ist das ohne Vektordatenbank schnell genug.
- Vertrauensregeln: Urteil nur mit **wörtlich verifiziertem Zitat** + Datum + PDF-Link; bei „nichts gefunden“ werden Suchanfragen/Filter und der nächste Treffer unter der Schwelle (0,55) gezeigt; Antworten > 12 Monate sind markiert.
- Die PDFs werden über `/api/pdf/<id>` aus `data/` ausgeliefert. Keys bleiben serverseitig.

## Offen
DIP-Feldnamen gegen Swagger prüfen, Chat-Agent mit Tools `search_antworten`/`get_antwort`, Evaluationsset, Entra-Auth, Dekomposition deutscher Komposita.
