/**
 * Daten-Download aus der DIP-API des Bundestags – Anfragen UND Antworten, direkt in den data-Ordner.
 *
 *   npm run fetch -- [--monate 12 | --von 2025-03-25]  [--wahlperiode 21] [--bis 2026-12-31] [--limit 20] [--pause 1000] [--nur anfragen|antworten]
 *
 * Phase 1 (anfragen):  alle Kleinen/Großen Anfragen der Wahlperiode -> data/{kleine,grosse}_anfragen
 * Phase 2 (antworten): alle Antwort-Drucksachen im Zeitraum, über den Vorgang der passenden Anfrage zugeordnet -> selber Ordner
 * Je Drucksache: <id>.pdf + eine Zeile in metadaten.jsonl (DIP-JSON, ergänzt um anfrage_id/anfrage_dokumentnummer).
 * Wiederholbar: vorhandene Einträge/PDFs werden übersprungen. Braucht DIP_API_KEY in .env.local.
 *
 * ACHTUNG: Filternamen (f.drucksachetyp, f.wahlperiode, f.zuordnung, f.datum.start/end, f.vorgang) und
 * Feldnamen sind nicht gegen die Swagger-Doku verifiziert. Darum: erst mit --limit 20 testen und die Zusammenfassung lesen.
 */
import fs from "node:fs";
import path from "node:path";
import { FOLDERS } from "../src/lib/store";
import { env } from "../src/lib/env";

const BASE = process.env.DIP_BASE ?? "https://search.dip.bundestag.de/api/v1";
const KEY = process.env.DIP_API_KEY;
if (!KEY) throw new Error("DIP_API_KEY fehlt (.env.local). Key: dip.bundestag.de > Über DIP > Hilfe > API");

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const limit = Number(arg("limit")) || Infinity;
const wp = arg("wahlperiode") ?? "21";
const monate = Number(arg("monate")) || undefined;
const monateZurueck = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10); };
const von = arg("von") ?? (monate ? monateZurueck(monate) : undefined);
const bis = arg("bis");
const nur = arg("nur");
const CONC = 1; // bewusst sequentiell: keine parallelen Downloads
const PAUSE = Number(arg("pause")) || 1000; // mittlere Pause zwischen Abrufen in ms (zufällig 0,5x–1,5x)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const UA = "parlanext-fetch/0.1 (Recherche-Tool, sequentielle Abfragen)";
/** Der Server schützt sich teils mit einer Browser-Prüfung ("Enodia"); die umgehen wir nicht, sondern bremsen und brechen sonst ab. */
const istBotSchutz = (r: Response, body?: string) => (r.headers.get("content-type") ?? "").includes("text/html") && (r.status === 400 || r.status === 403 || r.status === 429 || /Enodia/i.test(body ?? ""));

async function get(url: string, headers: Record<string, string> = {}, attempt = 0): Promise<Response> {
  if (attempt === 0) await sleep(PAUSE * (0.5 + Math.random())); // Rücksicht auf den Server
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(60000) });
    if (istBotSchutz(r)) {
      if (attempt >= 4) throw new Error("Der Server verlangt eine Browser-Prüfung (Bot-Schutz). Bitte später erneut starten (die Läufe sind wiederholbar) oder die Last senken.");
      const wait = 15 * (attempt + 1);
      console.warn(`Bot-Schutz des Servers aktiv (HTTP ${r.status}) bei ${new URL(url).pathname} – warte ${wait} s (Versuch ${attempt + 1}/4) …`);
      await sleep(wait * 1000);
      return get(url, headers, attempt + 1);
    }
    if ((r.status === 429 || r.status >= 500) && attempt < 5) { console.warn(`HTTP ${r.status} – neuer Versuch in ${2 ** attempt} s`); await sleep(2 ** attempt * 1000); return get(url, headers, attempt + 1); }
    return r;
  } catch (e) {
    if (attempt < 5 && !/Bot-Schutz/.test((e as Error).message)) { console.warn(`Netzwerkfehler (${(e as Error).name}) – neuer Versuch in ${2 ** attempt} s`); await sleep(2 ** attempt * 1000); return get(url, headers, attempt + 1); }
    throw e;
  }
}
const dip = (p: string) => get(`${BASE}${p}`, { Authorization: `ApiKey ${KEY}` });

/** Alle Seiten einer DIP-Liste (Cursor-Paginierung). */
async function* seiten(pfad: string): AsyncGenerator<{ docs: any[]; numFound?: number }> {
  let cursor: string | undefined;
  for (let i = 0; i < 1000; i++) {
    const r = await dip(`${pfad}${pfad.includes("?") ? "&" : "?"}format=json${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    if (!r.ok) throw new Error(`DIP ${r.status} bei ${pfad}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const docs = j.documents ?? [];
    yield { docs, numFound: j.numFound };
    if (!docs.length || !j.cursor || j.cursor === cursor) return;
    cursor = j.cursor;
  }
}

async function pool<T>(items: T[], fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: CONC }, async () => { while (i < items.length) await fn(items[i++]); }));
}

const stats = { anfragenNeu: 0, antwortenNeu: 0, ohneAntwort: 0, fehler: 0, pdf404: 0 };
const folders = FOLDERS.map((f) => ({ ...f, path: path.join(env.dataDir, f.dir), meta: path.join(env.dataDir, f.dir, "metadaten.jsonl") }));
for (const f of folders) { fs.mkdirSync(f.path, { recursive: true }); if (!fs.existsSync(f.meta)) fs.writeFileSync(f.meta, ""); }
const readRows = (file: string) => fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

/** true = PDF vorhanden; false = nicht verfügbar (404 = beim Bundestag noch nicht abrufbar, wird beim nächsten Lauf erneut versucht) */
async function ladePdf(d: any, folder: string): Promise<boolean> {
  const pdfFile = path.join(folder, `${d.id}.pdf`);
  if (fs.existsSync(pdfFile)) return true;
  const url = d.fundstelle?.pdf_url;
  if (!url) return false;
  const r = await get(url);
  if (!r.ok) { if (r.status === 404) stats.pdf404++; else console.warn(`PDF ${r.status}: ${url}`); return false; }
  fs.writeFileSync(pdfFile, Buffer.from(await r.arrayBuffer()));
  return true;
}

const typen: Record<string, number> = {};

async function phaseAnfragen() {
  let gesamt = 0;
  for (const f of folders) {
    const have = new Set(readRows(f.meta).map((r) => String(r.id)));
    const q = `/drucksache?f.drucksachetyp=${encodeURIComponent(f.typ)}&f.wahlperiode=${wp}&f.zuordnung=BT` +
      (von ? `&f.datum.start=${von}` : "") + (bis ? `&f.datum.end=${bis}` : "");
    let n = 0;
    for await (const { docs, numFound } of seiten(q)) {
      if (n === 0) console.log(`${f.typ}: ${numFound ?? "?"} laut DIP (WP ${wp})`);
      const neu = docs.filter((d) => !have.has(String(d.id)));
      await pool(neu, async (d) => {
        if (stats.anfragenNeu >= limit) return;
        try {
          if (!(await ladePdf(d, f.path))) return; // PDF (noch) nicht abrufbar: nicht in die Metadaten aufnehmen, nächster Lauf versucht es erneut
          fs.appendFileSync(f.meta, JSON.stringify(d) + "\n");
          have.add(String(d.id)); stats.anfragenNeu++;
        } catch (e) { stats.fehler++; console.warn((e as Error).message); }
      });
      gesamt = stats.anfragenNeu; n += docs.length;
      console.log(`  ${f.dir}: ${n} Seiten-Einträge gesehen, ${stats.anfragenNeu} neu geladen`);
      if (gesamt >= limit) return;
    }
  }
}

async function phaseAntworten() {
  const antwortTyp = arg("antwort-typ") ?? "Antwort";
  // Vorgang-ID -> Anfrage (aus den lokalen Metadaten)
  const byVorgang = new Map<string, { a: any; f: (typeof folders)[number] }>();
  const have = new Set<string>();
  for (const f of folders) for (const r of readRows(f.meta)) {
    have.add(String(r.id));
    if (/Anfrage/.test(r.drucksachetyp ?? "") && !r.anfrage_id) for (const vb of r.vorgangsbezug ?? []) byVorgang.set(String(vb.id), { a: r, f });
  }
  const q = `/drucksache?f.drucksachetyp=${encodeURIComponent(antwortTyp)}&f.wahlperiode=${wp}&f.zuordnung=BT` +
    (von ? `&f.datum.start=${von}` : "") + (bis ? `&f.datum.end=${bis}` : "");
  let n = 0;
  const zugeordnet = new Set<string>();
  for await (const { docs, numFound } of seiten(q)) {
    if (n === 0) {
      console.log(`${antwortTyp}: ${numFound ?? "?"} laut DIP (WP ${wp})`);
      if (!numFound && !docs.length) console.warn(`Keine Drucksachen vom Typ "${antwortTyp}" gefunden – anderen Wert mit --antwort-typ probieren.`);
    }
    n += docs.length;
    await pool(docs, async (d) => {
      if (stats.antwortenNeu >= limit) return;
      try {
        const vbs: any[] = d.vorgangsbezug ?? [];
        vbs.forEach((vb) => typen[vb.vorgangstyp] = (typen[vb.vorgangstyp] ?? 0) + 1);
        const match = vbs.map((vb) => byVorgang.get(String(vb.id))).find(Boolean);
        const istAnfrage = vbs.some((vb) => /Anfrage/.test(vb.vorgangstyp ?? ""));
        if (!match && !istAnfrage) return; // z. B. Antworten auf andere Vorgangstypen
        const f = match?.f ?? (vbs.some((vb) => /Große/.test(vb.vorgangstyp ?? "")) ? folders[1] : folders[0]);
        if (have.has(String(d.id)) && fs.existsSync(path.join(f.path, `${d.id}.pdf`))) { if (match) zugeordnet.add(String(match.a.id)); return; }
        if (!(await ladePdf(d, f.path))) return;
        if (!have.has(String(d.id))) {
          have.add(String(d.id));
          fs.appendFileSync(f.meta, JSON.stringify({ ...d, ...(match ? { anfrage_id: match.a.id, anfrage_dokumentnummer: match.a.dokumentnummer } : {}), vorgangstyp: f.typ }) + "\n");
        }
        if (match) zugeordnet.add(String(match.a.id));
        stats.antwortenNeu++;
      } catch (e) { stats.fehler++; console.warn((e as Error).message); }
    });
    console.log(`  ${n} Antworten gesehen, ${stats.antwortenNeu} neu geladen`);
    if (stats.antwortenNeu >= limit) break;
  }
  if (limit === Infinity) stats.ohneAntwort = [...byVorgang.values()].filter((x, i, arr) => arr.findIndex((y) => y.a.id === x.a.id) === i && !zugeordnet.has(String(x.a.id))).length;
}

async function main() {
  console.log(`DIP: ${BASE} (sequentiell, Pause ~${PAUSE} ms)`);
  if (von || bis) console.log(`Zeitraum: ${von ?? "Beginn"} bis ${bis ?? "heute"}`);
  if (nur !== "antworten") await phaseAnfragen();
  if (nur !== "anfragen") await phaseAntworten();
  console.log("Fertig:", stats);
  if (stats.pdf404) console.log(`${stats.pdf404} PDFs sind beim Bundestag (noch) nicht abrufbar (404) – meist ganz neue Drucksachen. Beim nächsten Lauf wird es erneut versucht.`);
  if (Object.keys(typen).length) console.log('Vorgangstypen der geladenen Antworten:', typen);
  console.log("Nächster Schritt: npm run ingest -- --limit 50");
}
main().catch((e) => { console.error(e); process.exit(1); });
