/**
 * Ingest: data/{kleine,grosse}-anfragen/*.pdf + metadaten.jsonl -> Textcache, Chunks, Azure-Embeddings.
 * Ergebnis (alles in data/index, gitignored): texts/*.txt, chunks.jsonl, vectors.f32, manifest.json
 * Aufruf: npm run ingest [-- --limit 50]
 * Resumable: bereits verarbeitete Dokumente (manifest.json) werden übersprungen.
 *
 * metadaten.jsonl – eine Zeile pro PDF, z. B.:
 * {"id":"12345","drucksachetyp":"Antwort","dokumentnummer":"21/1234","datum":"2025-03-01","titel":"…"}
 * ("vorgangstyp" ergibt sich sonst aus dem Ordner; "id" optional, Default = dokumentnummer)
 */
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { extractText, getDocumentProxy } from "unpdf";
import { chunkAntwort } from "../src/lib/chunker";
import { tagsFor } from "../src/lib/tags";
import { FOLDERS, INDEX_TYPEN, indexDir, pdfPath, readMetadata, safeId, textPath } from "../src/lib/store";
import { env } from "../src/lib/env";

const limit = Number(process.argv[process.argv.indexOf("--limit") + 1]) || Infinity;
const DIM = env.dimensions;
const MAX_TOKENS = Number(process.env.EMBED_MAX_TOKENS) || 100000; // je Anfrage (Azure-Limit: 300.000)
const BATCH = Number(process.env.EMBED_BATCH) || 32; // kleiner = weniger Token pro Anfrage (bei knapper Quota verringern)
// Einzelner Aufruf: nach TIMEOUT_MS abbrechen (Node würde sonst nach 5 min mit einem Header-Timeout aufgeben) und selbst wiederholen
const TIMEOUT_MS = Number(process.env.EMBED_TIMEOUT_MS) || 120000;
const ai = new OpenAI({ baseURL: env.endpoint, apiKey: env.apiKey, maxRetries: 0, timeout: TIMEOUT_MS });

const idx = indexDir();
fs.mkdirSync(path.join(idx, "texts"), { recursive: true });
for (const f of FOLDERS) fs.mkdirSync(path.join(env.dataDir, f.dir), { recursive: true });
const manifestFile = path.join(idx, "manifest.json");
const chunksFile = path.join(idx, "chunks.jsonl");
const vecFile = path.join(idx, "vectors.f32");

type Manifest = { dim: number; model: string; chunks: number; docs: string[]; endpointHost?: string; updated?: string };
const manifest: Manifest = fs.existsSync(manifestFile)
  ? JSON.parse(fs.readFileSync(manifestFile, "utf8"))
  : { dim: DIM, model: env.embeddingDeployment ?? "", chunks: 0, docs: [] };
if (manifest.dim !== DIM || (manifest.model && manifest.model !== env.embeddingDeployment))
  throw new Error(`Index wurde mit ${manifest.model}/${manifest.dim} erzeugt – Modellwechsel erfordert neuen Index (data/index löschen).`);

// Nach Absturz: Dateien auf den Stand des Manifests zurückschneiden
if (fs.existsSync(vecFile)) fs.truncateSync(vecFile, manifest.chunks * DIM * 4);
if (fs.existsSync(chunksFile)) {
  const keep = fs.readFileSync(chunksFile, "utf8").split("\n").filter(Boolean).slice(0, manifest.chunks);
  fs.writeFileSync(chunksFile, keep.length ? keep.join("\n") + "\n" : "");
}

const isReferenceOnly = (t: string) => t.length < 600 && /siehe (die )?antwort|verweis/i.test(t);

// Adaptive Drosselung: nach einem 429 wird zwischen den Batches gewartet, bei Erfolg langsam wieder schneller.
let delay = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Das SDK setzt name="Error", nur die Klasse heißt APIConnectionTimeoutError: daher instanceof
const istZeitueberschreitung = (e: any) =>
  e instanceof OpenAI.APIConnectionError || e?.cause?.code === "UND_ERR_HEADERS_TIMEOUT" || (typeof e?.status === "number" && e.status >= 500);

async function embedBatch(inputs: string[], attempt = 0): Promise<number[][]> {
  if (delay) await sleep(delay);
  try {
    const r = await ai.embeddings.create({ model: env.embeddingDeployment!, input: inputs, dimensions: DIM });
    delay = Math.max(0, delay - 250);
    return r.data.map((d) => d.embedding);
  } catch (e: any) {
    if (e?.status === 429 && attempt < 12) {
      const retryAfter = Number(e?.headers?.get?.("retry-after")) * 1000 || 0;
      const wait = Math.min(60000, Math.max(retryAfter, 2 ** attempt * 1500));
      delay = Math.min(10000, Math.max(delay, 1000) * 1.5);
      console.warn(`429 (Rate-Limit) – warte ${Math.round(wait / 1000)} s; Pause zwischen Batches jetzt ${Math.round(delay / 1000)} s`);
      await sleep(wait);
      return embedBatch(inputs, attempt + 1);
    }
    // Ein einzelner Text über dem Token-Limit des Modells (z. B. dichte Zahlentabellen): nur diesen Text kürzen und wiederholen,
    // statt den ganzen Lauf abzubrechen. Das Embedding steht dann für den Anfang des Chunks; der volle Text bleibt gespeichert.
    const m = e?.status === 400 ? /input\[(\d+)\].*maximum input length/i.exec(String(e?.message ?? "")) : null;
    if (m && attempt < 8) {
      const k = Number(m[1]);
      if (inputs[k] && inputs[k].length > 500) {
        const kuerzer = inputs[k].slice(0, Math.floor(inputs[k].length * 0.6));
        console.warn(`Text zu lang für das Modell (${inputs[k].length} Zeichen) – Embedding nur für die ersten ${kuerzer.length} Zeichen`);
        return embedBatch(inputs.map((t, i) => (i === k ? kuerzer : t)), attempt + 1);
      }
    }
    // Hänger, Verbindungsabbruch oder Serverfehler: große Batches halbieren (häufigste Abhilfe), kleine nach Pause wiederholen
    if (istZeitueberschreitung(e) && attempt < 8) {
      const grund = e instanceof OpenAI.APIConnectionTimeoutError || e?.cause?.code === "UND_ERR_HEADERS_TIMEOUT" ? "Zeitüberschreitung" : `Fehler ${e?.status ?? "Verbindung"}`;
      if (inputs.length > 8) {
        console.warn(`${grund} bei ${inputs.length} Texten – teile den Batch und versuche es erneut`);
        const mid = Math.ceil(inputs.length / 2);
        const first = await embedBatch(inputs.slice(0, mid), attempt + 1);
        const second = await embedBatch(inputs.slice(mid), attempt + 1);
        return [...first, ...second];
      }
      const wait = Math.min(60000, 2 ** attempt * 2000);
      console.warn(`${grund} – neuer Versuch in ${Math.round(wait / 1000)} s (Versuch ${attempt + 1}/8)`);
      await sleep(wait);
      return embedBatch(inputs, attempt + 1);
    }
    throw e;
  }
}

async function pdfText(file: string): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(file)), { verbosity: 0 });
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n") : text).replace(/[ \t]+\n/g, "\n").replace(/-\n(?=[a-zäöü])/g, "");
}

// Tags (config/tags.json) werden aus dem Volltext abgeleitet; Änderungen an der Konfiguration: npm run tags
const tagsFile = path.join(idx, "tags.json");
const tagMap: Record<string, string[]> = fs.existsSync(tagsFile) ? JSON.parse(fs.readFileSync(tagsFile, "utf8")) : {};

let queue: { doc: string; ord: number; content: string; typ: string; nr: string }[] = [];
let pendingDocs: string[] = [];

async function flush() {
  if (!queue.length && !pendingDocs.length) return;
  // Die Warteschlange kann (bei langen Dokumenten) viel größer als ein Batch sein: in Scheiben schicken.
  // Limits: max. BATCH Texte und max. ~MAX_TOKENS (grob geschätzt, 1 Token ≈ 3 Zeichen) je Anfrage.
  const estTokens = (t: string) => Math.ceil(t.length / 3);
  let i = 0;
  while (i < queue.length) {
    const slice: typeof queue = [];
    let tok = 0;
    while (i < queue.length && slice.length < BATCH && (slice.length === 0 || tok + estTokens(queue[i].content) <= MAX_TOKENS)) {
      tok += estTokens(queue[i].content);
      slice.push(queue[i++]);
    }
    const vecs = await embedBatch(slice.map((q) => q.content));
    const f32 = new Float32Array(vecs.length * DIM);
    vecs.forEach((v, k) => f32.set(v, k * DIM));
    fs.appendFileSync(vecFile, Buffer.from(f32.buffer));
    fs.appendFileSync(chunksFile, slice.map((q) => JSON.stringify(q)).join("\n") + "\n");
    // manifest.chunks wird erst am Ende des Flush gesetzt – bei Abbruch wird zurückgeschnitten
  }
  manifest.chunks += queue.length;
  manifest.docs.push(...pendingDocs);
  manifest.model = env.embeddingDeployment ?? "";
  manifest.endpointHost = new URL(env.endpoint!).host;
  manifest.updated = new Date().toISOString();
  fs.writeFileSync(tagsFile, JSON.stringify(tagMap));
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  queue = [];
  pendingDocs = [];
}

async function main() {
  if (!env.embeddingDeployment || !env.endpoint || !env.apiKey) throw new Error("Azure-Variablen fehlen (.env.local).");
  const done = new Set(manifest.docs);
  const alle = readMetadata();
  const docs = alle.filter((d) => INDEX_TYPEN.includes(d.drucksachetyp));
  console.log(`${docs.length} von ${alle.length} Metadatenzeilen haben Typ ${INDEX_TYPEN.join("/")} (übrige werden nicht indexiert).`);
  if (!docs.length) console.warn("Keine Antworten gefunden – zuerst npm run fetch ausführen.");
  if (!docs.length) console.warn("Keine Einträge in data/*/metadaten.jsonl gefunden.");
  let n = 0, skipped = 0;

  for (const d of docs) {
    if (n >= limit) break;
    if (done.has(d.id)) { skipped++; continue; }
    // Bevorzugt der DIP-Volltext (<id>.txt, von npm run fetch), sonst PDF-Extraktion
    const txtFile = path.join(env.dataDir, d.folder, `${d.id}.txt`);
    const file = pdfPath(d);
    let text: string;
    if (fs.existsSync(txtFile)) text = fs.readFileSync(txtFile, "utf8");
    else {
      if (!fs.existsSync(file)) { console.warn(`PDF fehlt: ${file}`); skipped++; continue; }
      try { text = await pdfText(file); } catch (e) { console.warn(`Lesefehler ${d.datei}: ${(e as Error).message}`); skipped++; continue; }
    }
    if (text.trim().length < 80 || isReferenceOnly(text)) { console.warn(`übersprungen (leer/Verweis): ${d.datei}`); pendingDocs.push(d.id); skipped++; continue; }

    fs.writeFileSync(textPath(d.id), text);
    tagMap[d.id] = tagsFor(text);
    // Kontext-Präfix je Chunk verbessert das Retrieval
    // Einzeilig halten: DIP-Titel enthalten Zeilenumbrüche („… Kleine Anfrage\r\n- Drucksache 21/8830 -\r\n…“)
    const eine = (t: string) => t.replace(/\s+/g, " ").trim();
    const prefix = `${d.dokumentnummer} | ${d.datum ?? ""} | ${eine(d.titel)} | ${eine(d.deskriptoren.join(", "))}\n`;
    chunkAntwort(text).forEach((c, ord) => queue.push({ doc: d.id, ord, content: prefix + c.content, typ: c.typ, nr: c.nr }));
    pendingDocs.push(d.id);
    n++;
    if (queue.length >= BATCH) await flush();
    if (n % 25 === 0) console.log(`${n} PDFs verarbeitet (${skipped} übersprungen)`);
  }
  await flush();
  console.log(`Fertig: ${n} neu, ${skipped} übersprungen, ${manifest.chunks} Chunks im Index.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
