import { pool } from "./db";
import { embed } from "./azure";
import { hasDb } from "./env";
import { DEMO_DOCS } from "./demo-data";
import type { Filter, Hit } from "./types";

import { tokens } from "./tokens";
export { tokens };

const stem = (t: string) => t.slice(0, Math.max(5, t.length - 3));
const iso = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);

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

// ---------------------------------------------------------------- Demo-Modus
function demoSearch(query: string, f: Filter, limit: number): Hit[] {
  const qs = tokens(query).map(stem);
  return DEMO_DOCS.filter(
    (d) =>
      (!f.kfw || d.kfw) && (!f.bmz || d.bmz) && (!f.typ || d.vorgangstyp === f.typ) &&
      (!f.von || d.datum >= f.von) && (!f.bis || d.datum <= f.bis),
  )
    .map((d) => {
      const hay = (d.titel + " " + d.deskriptoren.join(" ") + " " + d.text).toLowerCase();
      const hit = qs.filter((t) => hay.includes(t)).length;
      const relevanz = qs.length ? Math.min(0.95, (hit / qs.length) * 0.9) : 0.5;
      return { d, relevanz };
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
export async function searchAntworten(query: string, f: Filter = {}, limit = 10): Promise<Hit[]> {
  if (!hasDb()) return demoSearch(query, f, limit);

  const p = pool();
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (f.kfw) where.push("d.kfw");
  if (f.bmz) where.push("d.bmz");
  if (f.typ) where.push(`d.vorgangstyp = ${add(f.typ)}`);
  if (f.von) where.push(`d.datum >= ${add(f.von)}`);
  if (f.bis) where.push(`d.datum <= ${add(f.bis)}`);
  const W = where.length ? "AND " + where.join(" AND ") : "";
  const sel = `d.id, d.dokumentnummer, d.datum, d.titel, d.vorgangstyp, d.kfw, d.bmz, d.pdf_url`;

  if (!query.trim()) {
    const { rows } = await p.query(
      `SELECT ${sel}, left(d.text, 600) AS passage FROM drucksache d WHERE true ${W} ORDER BY d.datum DESC NULLS LAST LIMIT ${limit}`,
      params,
    );
    return rows.map((r) => ({ ...r, datum: iso(r.datum), passage: r.passage ?? "", relevanz: 0 }));
  }

  const vec = (await embed([query]))?.[0];
  const qParam = add(query);
  const vParam = vec ? add(`[${vec.join(",")}]`) : null;

  const vecCte = vParam
    ? `v AS (SELECT c.id, 1 - (c.embedding <=> ${vParam}::vector) AS sim,
                 row_number() OVER (ORDER BY c.embedding <=> ${vParam}::vector) AS r
          FROM chunk c JOIN drucksache d ON d.id = c.drucksache_id
          WHERE c.embedding IS NOT NULL ${W}
          ORDER BY c.embedding <=> ${vParam}::vector LIMIT 60),`
    : "";
  const unionV = vParam ? "SELECT id, r FROM v UNION ALL" : "";
  const simJoin = vParam ? "LEFT JOIN v ON v.id = c.id" : "";
  const simCol = vParam ? "v.sim" : "NULL::float";

  const sql = `
    WITH ${vecCte}
    f AS (SELECT c.id, row_number() OVER (ORDER BY ts_rank_cd(c.tsv, q) DESC) AS r, ts_rank_cd(c.tsv, q) AS rank
          FROM chunk c JOIN drucksache d ON d.id = c.drucksache_id, websearch_to_tsquery('german', ${qParam}) q
          WHERE c.tsv @@ q ${W} ORDER BY ts_rank_cd(c.tsv, q) DESC LIMIT 60),
    fused AS (SELECT id, sum(1.0 / (60 + r)) AS score FROM (${unionV} SELECT id, r FROM f) u GROUP BY id)
    SELECT ${sel}, c.content AS passage, fused.score, ${simCol} AS sim, f.rank AS fts
    FROM fused JOIN chunk c ON c.id = fused.id JOIN drucksache d ON d.id = c.drucksache_id
    ${simJoin} LEFT JOIN f ON f.id = c.id
    ORDER BY fused.score DESC LIMIT ${limit * 4}`;
  const { rows } = await p.query(sql, params);

  const seen = new Set<string>();
  const hits: Hit[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    // Cosinus-Ähnlichkeit, falls vorhanden; sonst grobe Näherung aus FTS-Rang
    const relevanz = r.sim != null ? Number(r.sim) : Math.min(0.9, 0.45 + Number(r.fts ?? 0));
    hits.push({ ...r, datum: iso(r.datum), passage: r.passage, relevanz });
    if (hits.length >= limit) break;
  }
  return hits;
}

export async function getAntwort(id: string) {
  if (!hasDb()) {
    const d = DEMO_DOCS.find((x) => x.id === id);
    return d ? { ...d, pdf_url: null as string | null, sachgebiete: [] as string[], demo: true } : null;
  }
  const { rows } = await pool().query(`SELECT * FROM drucksache WHERE id = $1 OR dokumentnummer = $1 LIMIT 1`, [id]);
  const r = rows[0];
  return r ? { ...r, datum: iso(r.datum) as string, demo: false } : null;
}
