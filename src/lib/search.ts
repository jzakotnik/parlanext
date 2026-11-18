import fs from "node:fs";
import { embed } from "./azure";
import { hasIndex } from "./env";
import { DEMO_DOCS } from "./demo-data";
import { loadStore, textPath } from "./store";
import { tokens } from "./tokens";
import type { Filter, Hit } from "./types";

export { tokens };

const stem = (t: string) => t.slice(0, Math.max(5, t.length - 3));

/** Bester Absatz (Frage/Antwort-Paar) eines Textes zu einer Anfrage. */
export function bestPassage(text: string, q: string, max = 700) {
  const qs = tokens(q).map(stem);
  const paras = text.split(/\n(?=\s*\d+\.\s)/).filter(Boolean);
  let best = paras[0] ?? text;
  let bs = -1;
  for (const p of paras) {
    const low = p.toLowerCase();
    const s = qs.filter((t) => low.includes(t)).length;
    if (s > bs) {
      bs = s;
      best = p;
    }
  }
  return best.length > max ? best.slice(0, max) + " …" : best;
}

const passes = (d: { kfw: boolean; bmz: boolean; vorgangstyp: string | null; datum: string | null }, f: Filter) =>
  (!f.kfw || d.kfw) && (!f.bmz || d.bmz) && (!f.typ || d.vorgangstyp === f.typ) &&
  (!f.von || (d.datum ?? "") >= f.von) && (!f.bis || (d.datum ?? "9999") <= f.bis);

// ---------------------------------------------------------------- Demo-Modus
function demoSearch(query: string, f: Filter, limit: number): Hit[] {
  const qs = tokens(query).map(stem);
  return DEMO_DOCS.filter((d) => passes(d, f))
    .map((d) => {
      const hay = (d.titel + " " + d.deskriptoren.join(" ") + " " + d.text).toLowerCase();
      const hit = qs.filter((t) => hay.includes(t)).length;
      return { d, relevanz: qs.length ? Math.min(0.95, (hit / qs.length) * 0.9) : 0.5 };
    })
    .filter((x) => !qs.length || x.relevanz > 0)
    .sort((a, b) => b.relevanz - a.relevanz || b.d.datum.localeCompare(a.d.datum))
    .slice(0, limit)
    .map(({ d, relevanz }) => ({
      id: d.id, dokumentnummer: d.dokumentnummer, datum: d.datum, titel: d.titel, vorgangstyp: d.vorgangstyp,
      kfw: d.kfw, bmz: d.bmz, pdf_url: null, passage: bestPassage(d.text, query), relevanz, demo: true,
    }));
}

// -------------------------------------------------------------- Hybrid-Suche
// Vektoren (Azure-Embeddings) + Stichwortsuche, per Reciprocal Rank Fusion – im Speicher, ohne Datenbank.
export async function searchAntworten(query: string, f: Filter = {}, limit = 10): Promise<Hit[]> {
  const store = hasIndex() ? loadStore() : null;
  if (!store) return demoSearch(query, f, limit);

  const toHit = (docId: string, passage: string, relevanz: number): Hit => {
    const d = store.docs.get(docId)!;
    return {
      id: d.id, dokumentnummer: d.dokumentnummer, datum: d.datum, titel: d.titel, vorgangstyp: d.vorgangstyp,
      kfw: d.kfw, bmz: d.bmz, pdf_url: `/api/pdf/${encodeURIComponent(d.id)}`, passage, relevanz,
    };
  };

  if (!query.trim()) {
    return [...store.docs.values()].filter((d) => passes(d, f))
      .sort((a, b) => (b.datum ?? "").localeCompare(a.datum ?? "")).slice(0, limit)
      .map((d) => toHit(d.id, readText(d.id).slice(0, 600), 0));
  }

  const { chunks, vectors, dim, docs } = store;
  const ok = chunks.map((c) => docs.has(c.doc) && passes(docs.get(c.doc)!, f));

  // 1) Vektor: Kosinus (text-embedding-3 liefert normierte Vektoren)
  const qv = (await embed([query]))?.[0];
  const sim = new Float32Array(chunks.length).fill(-1);
  if (qv) {
    for (let i = 0; i < chunks.length; i++) {
      if (!ok[i]) continue;
      let s = 0;
      const o = i * dim;
      for (let k = 0; k < dim; k++) s += vectors[o + k] * qv[k];
      sim[i] = s;
    }
  }

  // 2) Stichwort: IDF-gewichtete Präfix-Treffer (grober Ersatz für Stemming/Dekomposition)
  const terms = [...new Set(tokens(query).map(stem))];
  const lows = chunks.map((c) => c.content.toLowerCase());
  const idf = terms.map((t) => {
    let n = 0;
    for (let i = 0; i < lows.length; i++) if (ok[i] && lows[i].includes(t)) n++;
    return Math.log(1 + chunks.length / (1 + n));
  });
  const kw = new Float32Array(chunks.length);
  for (let i = 0; i < chunks.length; i++) {
    if (!ok[i]) continue;
    terms.forEach((t, j) => { if (lows[i].includes(t)) kw[i] += idf[j]; });
  }

  const rank = (score: ArrayLike<number>, min: number) =>
    [...chunks.keys()].filter((i) => ok[i] && score[i] > min).sort((a, b) => score[b] - score[a]).slice(0, 60);
  const fused = new Map<number, number>();
  for (const list of [rank(sim, -0.5), rank(kw, 0)]) list.forEach((i, r) => fused.set(i, (fused.get(i) ?? 0) + 1 / (60 + r)));

  const kwMax = idf.reduce((a, b) => a + b, 0) || 1;
  const seen = new Set<string>();
  const hits: Hit[] = [];
  for (const [i] of [...fused].sort((a, b) => b[1] - a[1])) {
    const c = chunks[i];
    if (seen.has(c.doc)) continue;
    seen.add(c.doc);
    const relevanz = qv ? Math.max(0, sim[i]) : Math.min(0.95, kw[i] / kwMax);
    hits.push(toHit(c.doc, c.content, relevanz));
    if (hits.length >= limit) break;
  }
  return hits;
}

function readText(id: string) {
  try { return fs.readFileSync(textPath(id), "utf8"); } catch { return ""; }
}

export async function getAntwort(id: string) {
  const store = hasIndex() ? loadStore() : null;
  if (!store) {
    const d = DEMO_DOCS.find((x) => x.id === id);
    return d ? { ...d, pdf_url: null as string | null, demo: true } : null;
  }
  const d = store.docs.get(id) ?? [...store.docs.values()].find((x) => x.dokumentnummer === id);
  if (!d) return null;
  return { ...d, pdf_url: `/api/pdf/${encodeURIComponent(d.id)}`, text: readText(d.id), demo: false };
}
