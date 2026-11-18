/**
 * Ingest: data/{kleine,grosse}-anfragen/*.pdf + metadaten.jsonl -> Textcache, Chunks, Azure-Embeddings.
 * Ergebnis (alles in data/index, gitignored): texts/*.txt, chunks.jsonl, vectors.f32, manifest.json
 * Aufruf: npm run ingest [-- --limit 50]
 * Resumable: bereits verarbeitete Dokumente (manifest.json) werden übersprungen.
 *
 * metadaten.jsonl – eine Zeile pro PDF, z. B.:
 * {"datei":"20-1234.pdf","dokumentnummer":"20/1234","datum":"2024-03-01","titel":"…","kfw":true,
 *  "bmz":true,"deskriptoren":["…"],"sachgebiete":["…"]}
 * ("vorgangstyp" ergibt sich sonst aus dem Ordner; "id" optional, Default = dokumentnummer)
 */
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { extractText, getDocumentProxy } from "unpdf";
import { FOLDERS, INDEX_TYPEN, indexDir, pdfPath, readMetadata, safeId, textPath } from "../src/lib/store";
import { env } from "../src/lib/env";

const limit = Number(process.argv[process.argv.indexOf("--limit") + 1]) || Infinity;
const DIM = env.dimensions;
const BATCH = 64;
const ai = new OpenAI({ baseURL: env.endpoint, apiKey: env.apiKey });

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

/** Pro Frage/Antwort-Paar ("1. …") chunken, Fallback ~2000 Zeichen mit Überlappung. */
function chunk(text: string): string[] {
  const pairs = text.split(/\n(?=\s*\d+\.\s)/).map((s) => s.trim()).filter((s) => s.length > 40);
  const out: string[] = [];
  for (const p of pairs.length > 1 ? pairs : [text.trim()]) {
    if (p.length <= 2400) out.push(p);
    else for (let i = 0; i < p.length; i += 1800) out.push(p.slice(i, i + 2000));
  }
  return out;
}

const isReferenceOnly = (t: string) => t.length < 600 && /siehe (die )?antwort|verweis/i.test(t);

async function embedBatch(inputs: string[], attempt = 0): Promise<number[][]> {
  try {
    const r = await ai.embeddings.create({ model: env.embeddingDeployment!, input: inputs, dimensions: DIM });
    return r.data.map((d) => d.embedding);
  } catch (e: any) {
    if (e?.status === 429 && attempt < 6) {
      const wait = 2 ** attempt * 1500;
      console.warn(`429 – warte ${wait} ms`);
      await new Promise((r) => setTimeout(r, wait));
      return embedBatch(inputs, attempt + 1);
    }
    throw e;
  }
}

async function pdfText(file: string): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(file)));
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n") : text).replace(/[ \t]+\n/g, "\n").replace(/-\n(?=[a-zäöü])/g, "");
}

// Die DIP-Metadaten enthalten keine KfW-/BMZ-Kennzeichnung: aus dem Volltext ableiten (Hinweis, stichprobenartig prüfen)
const KFW = /\bKfW\b|Kreditanstalt für Wiederaufbau|Entwicklungsbank/i;
const BMZ = /\bBMZ\b|Bundesministerium für wirtschaftliche Zusammenarbeit/i;
const flagsFile = path.join(idx, "flags.json");
const flags: Record<string, { kfw: boolean; bmz: boolean }> = fs.existsSync(flagsFile) ? JSON.parse(fs.readFileSync(flagsFile, "utf8")) : {};

let queue: { doc: string; ord: number; content: string }[] = [];
let pendingDocs: string[] = [];

async function flush() {
  if (!queue.length && !pendingDocs.length) return;
  if (queue.length) {
    const vecs = await embedBatch(queue.map((q) => q.content));
    const f32 = new Float32Array(vecs.length * DIM);
    vecs.forEach((v, i) => f32.set(v, i * DIM));
    fs.appendFileSync(vecFile, Buffer.from(f32.buffer));
    fs.appendFileSync(chunksFile, queue.map((q) => JSON.stringify(q)).join("\n") + "\n");
    manifest.chunks += queue.length;
  }
  manifest.docs.push(...pendingDocs);
  manifest.model = env.embeddingDeployment ?? "";
  manifest.endpointHost = new URL(env.endpoint!).host;
  manifest.updated = new Date().toISOString();
  fs.writeFileSync(flagsFile, JSON.stringify(flags));
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
  if (!docs.length) console.warn("Keine Antworten gefunden – zuerst npm run fetch-antworten ausführen.");
  if (!docs.length) console.warn("Keine Einträge in data/*/metadaten.jsonl gefunden.");
  let n = 0, skipped = 0;

  for (const d of docs) {
    if (n >= limit) break;
    if (done.has(d.id)) { skipped++; continue; }
    const file = pdfPath(d);
    if (!fs.existsSync(file)) { console.warn(`PDF fehlt: ${file}`); skipped++; continue; }
    let text: string;
    try { text = await pdfText(file); } catch (e) { console.warn(`Lesefehler ${d.datei}: ${(e as Error).message}`); skipped++; continue; }
    if (text.trim().length < 80 || isReferenceOnly(text)) { console.warn(`übersprungen (leer/Verweis): ${d.datei}`); pendingDocs.push(d.id); skipped++; continue; }

    fs.writeFileSync(textPath(d.id), text);
    flags[d.id] = { kfw: KFW.test(text), bmz: BMZ.test(text) };
    // Kontext-Präfix je Chunk verbessert das Retrieval
    const prefix = `${d.dokumentnummer} | ${d.datum ?? ""} | ${d.titel} | ${d.deskriptoren.join(", ")}\n`;
    chunk(text).forEach((c, ord) => queue.push({ doc: d.id, ord, content: prefix + c }));
    pendingDocs.push(d.id);
    n++;
    if (queue.length >= BATCH) await flush();
    if (n % 25 === 0) console.log(`${n} PDFs verarbeitet (${skipped} übersprungen)`);
  }
  await flush();
  console.log(`Fertig: ${n} neu, ${skipped} übersprungen, ${manifest.chunks} Chunks im Index.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
