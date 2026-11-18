/**
 * Ingest: anfragen.jsonl (aus dip_anfragen.py) -> Postgres (drucksache + chunk + Embeddings)
 * Aufruf: npm run ingest -- ./anfragen.jsonl [--limit 50]
 * Resumable: Drucksachen, die schon Chunks haben, werden übersprungen.
 *
 * Erwartete Felder je Zeile (bitte gegen die Ausgabe von dip_anfragen.py prüfen):
 * id, datum, dokumentnummer, titel, vorgangstyp, kfw, bmz, ez_deskriptor,
 * deskriptoren[], sachgebiete[], pdf_url, text
 */
import fs from "node:fs";
import readline from "node:readline";
import { Pool } from "pg";
import OpenAI from "openai";

const file = process.argv[2] ?? "anfragen.jsonl";
const limit = Number(process.argv[process.argv.indexOf("--limit") + 1]) || Infinity;
const DIM = Number(process.env.EMBEDDING_DIMENSIONS ?? 1536);
const BATCH = 64;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ai = new OpenAI({ baseURL: process.env.AZURE_OPENAI_ENDPOINT, apiKey: process.env.AZURE_OPENAI_API_KEY });
const MODEL = process.env.AZURE_EMBEDDING_DEPLOYMENT!;

type Row = {
  id: string; datum?: string; dokumentnummer?: string; titel?: string; vorgangstyp?: string;
  kfw?: boolean; bmz?: boolean; ez_deskriptor?: boolean; deskriptoren?: string[]; sachgebiete?: string[];
  pdf_url?: string; text?: string;
};

/** Pro Frage/Antwort-Paar ("1. …") chunken, Fallback: ~2000 Zeichen mit 200 Überlappung. */
function chunk(text: string): string[] {
  const pairs = text.split(/\n(?=\s*\d+\.\s)/).map((s) => s.trim()).filter((s) => s.length > 40);
  const out: string[] = [];
  for (const p of pairs.length > 1 ? pairs : [text]) {
    if (p.length <= 2400) out.push(p);
    else for (let i = 0; i < p.length; i += 1800) out.push(p.slice(i, i + 2000));
  }
  return out;
}

/** Antworten, die nur auf andere Antworten verweisen, überspringen. */
const isReferenceOnly = (t: string) => t.length < 600 && /siehe (die )?antwort|verweis/i.test(t);

async function embedBatch(inputs: string[], attempt = 0): Promise<number[][]> {
  try {
    const r = await ai.embeddings.create({ model: MODEL, input: inputs, dimensions: DIM });
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

async function main() {
  await pool.query(
    `INSERT INTO config(key,value) VALUES ('embedding_model',$1),('embedding_dimensions',$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
    [MODEL, String(DIM)],
  );
  const done = new Set((await pool.query(`SELECT DISTINCT drucksache_id FROM chunk`)).rows.map((r) => r.drucksache_id));
  const rl = readline.createInterface({ input: fs.createReadStream(file) });
  let n = 0, skipped = 0;
  let queue: { id: string; ord: number; content: string }[] = [];

  const flush = async () => {
    if (!queue.length) return;
    const vecs = await embedBatch(queue.map((q) => q.content));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < queue.length; i++) {
        await client.query(`INSERT INTO chunk(drucksache_id, ord, content, embedding) VALUES ($1,$2,$3,$4::vector)`,
          [queue[i].id, queue[i].ord, queue[i].content, `[${vecs[i].join(",")}]`]);
      }
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
    queue = [];
  };

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (n >= limit) break;
    const r = JSON.parse(line) as Row;
    if (!r.text || done.has(r.id)) { skipped++; continue; }
    if (isReferenceOnly(r.text)) { skipped++; continue; }
    await pool.query(
      `INSERT INTO drucksache(id,datum,dokumentnummer,titel,vorgangstyp,kfw,bmz,ez_deskriptor,deskriptoren,sachgebiete,pdf_url,text)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.datum || null, r.dokumentnummer, r.titel, r.vorgangstyp, !!r.kfw, !!r.bmz, !!r.ez_deskriptor,
        r.deskriptoren ?? [], r.sachgebiete ?? [], r.pdf_url, r.text],
    );
    // Kontext-Präfix je Chunk verbessert Retrieval
    const prefix = `${r.dokumentnummer ?? r.id} | ${r.datum ?? ""} | ${r.titel ?? ""} | ${(r.deskriptoren ?? []).join(", ")}\n`;
    chunk(r.text).forEach((c, ord) => queue.push({ id: r.id, ord, content: prefix + c }));
    n++;
    if (queue.length >= BATCH) await flush();
    if (n % 25 === 0) console.log(`${n} Drucksachen verarbeitet (${skipped} übersprungen)`);
  }
  await flush();
  console.log(`Fertig: ${n} neu, ${skipped} übersprungen.`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
