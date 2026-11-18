/**
 * Lädt zu jeder Anfrage in data/{kleine,grosse}_anfragen/metadaten.jsonl die zugehörige(n) Antwort-Drucksache(n)
 * über die DIP-API (Vorgang -> Drucksachen) und speichert PDF + Metadatenzeile im selben Ordner.
 *
 * Aufruf: npm run fetch-antworten [-- --limit 20]   (erst klein testen!)
 * Braucht DIP_API_KEY. Resumable: vorhandene Antworten (Metadaten + PDF) werden übersprungen.
 *
 * ACHTUNG: Filtername f.vorgang und Feldnamen sind nicht gegen die Swagger-Doku verifiziert.
 * Das Skript gibt deshalb die gefundenen Drucksachentypen aus – "Antwort" sollte dabei sein.
 */
import fs from "node:fs";
import path from "node:path";
import { FOLDERS } from "../src/lib/store";
import { env } from "../src/lib/env";

const BASE = process.env.DIP_BASE ?? "https://search.dip.bundestag.de/api/v1";
const KEY = process.env.DIP_API_KEY;
if (!KEY) throw new Error("DIP_API_KEY fehlt (.env.local).");
const limit = Number(process.argv[process.argv.indexOf("--limit") + 1]) || Infinity;
const CONC = 8;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function get(url: string, headers: Record<string, string> = {}, attempt = 0): Promise<Response> {
  const r = await fetch(url, { headers });
  if ((r.status === 429 || r.status >= 500) && attempt < 5) { await sleep(2 ** attempt * 1000); return get(url, headers, attempt + 1); }
  return r;
}

async function drucksachenZuVorgang(vorgangId: string): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 10; i++) {
    const u = `${BASE}/drucksache?f.vorgang=${vorgangId}&format=json${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const r = await get(u, { Authorization: `ApiKey ${KEY}` });
    if (!r.ok) throw new Error(`DIP ${r.status} für Vorgang ${vorgangId}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    out.push(...(j.documents ?? []));
    if (!j.cursor || j.cursor === cursor || !(j.documents ?? []).length) break;
    cursor = j.cursor;
  }
  return out;
}

async function main() {
  const typCount: Record<string, number> = {};
  let neu = 0, ohne = 0, fehler = 0, verarbeitet = 0;

  for (const { dir } of FOLDERS) {
    const folder = path.join(env.dataDir, dir);
    const metaFile = path.join(folder, "metadaten.jsonl");
    if (!fs.existsSync(metaFile)) continue;
    const rows = fs.readFileSync(metaFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const have = new Set(rows.map((r) => String(r.id)));
    const anfragen = rows.filter((r) => /Anfrage/.test(r.drucksachetyp ?? "") && r.vorgangsbezug?.length);
    console.log(`${dir}: ${anfragen.length} Anfragen`);

    let i = 0;
    const worker = async () => {
      while (i < anfragen.length && verarbeitet < limit) {
        const a = anfragen[i++];
        verarbeitet++;
        try {
          const found: any[] = [];
          for (const vb of a.vorgangsbezug) found.push(...(await drucksachenZuVorgang(String(vb.id))));
          const antworten = found.filter((d) => d.drucksachetyp === "Antwort");
          found.forEach((d) => (typCount[d.drucksachetyp] = (typCount[d.drucksachetyp] ?? 0) + 1));
          if (!antworten.length) { ohne++; continue; }
          for (const d of antworten) {
            const id = String(d.id);
            const pdfUrl = d.fundstelle?.pdf_url;
            const pdfFile = path.join(folder, `${id}.pdf`);
            if (have.has(id) && fs.existsSync(pdfFile)) continue;
            if (!pdfUrl) { fehler++; continue; }
            if (!fs.existsSync(pdfFile)) {
              const r = await get(pdfUrl);
              if (!r.ok) { console.warn(`PDF ${r.status}: ${pdfUrl}`); fehler++; continue; }
              fs.writeFileSync(pdfFile, Buffer.from(await r.arrayBuffer()));
            }
            if (!have.has(id)) {
              have.add(id);
              fs.appendFileSync(metaFile, JSON.stringify({ ...d, anfrage_id: a.id, anfrage_dokumentnummer: a.dokumentnummer, vorgangstyp: a.drucksachetyp }) + "\n");
            }
            neu++;
          }
        } catch (e) { fehler++; console.warn((e as Error).message); }
        if (verarbeitet % 50 === 0) console.log(`${verarbeitet} Anfragen geprüft, ${neu} Antworten neu, ${ohne} ohne Antwort`);
      }
    };
    await Promise.all(Array.from({ length: CONC }, worker));
  }
  console.log(`Fertig. Neue Antworten: ${neu}; Anfragen ohne Antwort: ${ohne}; Fehler: ${fehler}`);
  console.log("Drucksachentypen in den Vorgängen:", typCount);
}
main().catch((e) => { console.error(e); process.exit(1); });
