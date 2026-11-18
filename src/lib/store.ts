import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

export const FOLDERS = [
  { dir: "kleine_anfragen", typ: "Kleine Anfrage" },
  { dir: "grosse_anfragen", typ: "Große Anfrage" },
] as const;

/** Welche Drucksachentypen indexiert werden (Standard: nur Antworten der Bundesregierung). */
export const INDEX_TYPEN = (process.env.INDEX_TYPEN ?? "Antwort").split(",").map((t) => t.trim());

export type Doc = {
  id: string;
  dokumentnummer: string;
  datum: string | null;
  titel: string;
  vorgangstyp: string;
  drucksachetyp: string; // "Antwort", "Kleine Anfrage", …
  kfw: boolean;
  bmz: boolean;
  deskriptoren: string[];
  sachgebiete: string[];
  quelle_url: string | null; // Original beim Bundestag (aus den Metadaten)
  urheber: string | null;
  folder: string;
  datei: string; // Dateiname der PDF im Ordner
};

export type Chunk = { doc: string; ord: number; content: string };

type Store = { docs: Map<string, Doc>; chunks: Chunk[]; vectors: Float32Array; dim: number; mtime: number };
const g = globalThis as unknown as { __store?: Store };

export const indexDir = () => path.join(env.dataDir, "index");
export const textPath = (id: string) => path.join(indexDir(), "texts", `${safeId(id)}.txt`);
export const safeId = (id: string) => id.replace(/[^a-zA-Z0-9._-]+/g, "_");

/** Liest die metadaten.jsonl beider Ordner. Feldnamen sind tolerant (siehe README). */
export function readMetadata(): Doc[] {
  const out: Doc[] = [];
  for (const { dir, typ } of FOLDERS) {
    const f = path.join(env.dataDir, dir, "metadaten.jsonl");
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      const nr = r.dokumentnummer ?? r.drucksache ?? r.id;
      // Dateiname: explizites Feld, sonst Drucksachen-ID (z. B. 281908.pdf), sonst Dokumentnummer (21-5091.pdf)
      const cands = [r.datei, r.file, r.filename, r.pdf, r.pdf_datei, r.id && `${r.id}.pdf`, nr && `${String(nr).replace(/\//g, "-")}.pdf`]
        .filter(Boolean)
        .map((c) => (String(c).toLowerCase().endsWith(".pdf") ? String(c) : `${c}.pdf`))
        .map((c) => path.basename(c));
      const datei = cands.find((c) => fs.existsSync(path.join(env.dataDir, dir, c))) ?? cands[0];
      if (!nr || !datei) continue;
      out.push({
        id: String(r.id ?? nr),
        dokumentnummer: String(nr),
        datum: r.datum ? String(r.datum).slice(0, 10) : null,
        titel: r.titel ?? String(nr),
        vorgangstyp: r.vorgangsbezug?.[0]?.vorgangstyp ?? r.vorgangstyp ?? r.drucksachetyp ?? typ,
        drucksachetyp: r.drucksachetyp ?? "",
        quelle_url: r.fundstelle?.pdf_url ?? r.pdf_url ?? null,
        urheber: r.urheber?.[0]?.titel ?? null,
        kfw: !!r.kfw,
        bmz: !!r.bmz,
        deskriptoren: r.deskriptoren ?? [],
        sachgebiete: r.sachgebiete ?? [],
        folder: dir,
        datei,
      });
    }
  }
  return out;
}

export function loadStore(): Store | null {
  const manifest = path.join(indexDir(), "manifest.json");
  if (!fs.existsSync(manifest)) return null;
  const mtime = fs.statSync(manifest).mtimeMs;
  if (g.__store && g.__store.mtime === mtime) return g.__store;

  const m = JSON.parse(fs.readFileSync(manifest, "utf8")) as { dim: number; chunks: number };
  const done = new Set<string>(JSON.parse(fs.readFileSync(manifest, "utf8")).docs ?? []);
  // KfW-/BMZ-Flags: aus den Metadaten, sonst vom Ingest aus dem Volltext abgeleitet (flags.json)
  const flagsFile = path.join(indexDir(), "flags.json");
  const flags: Record<string, { kfw: boolean; bmz: boolean }> = fs.existsSync(flagsFile) ? JSON.parse(fs.readFileSync(flagsFile, "utf8")) : {};
  const docs = new Map(
    readMetadata().filter((d) => done.has(d.id)).map((d) => [d.id, { ...d, kfw: d.kfw || !!flags[d.id]?.kfw, bmz: d.bmz || !!flags[d.id]?.bmz }]),
  );
  const chunks = fs
    .readFileSync(path.join(indexDir(), "chunks.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .slice(0, m.chunks)
    .map((l) => JSON.parse(l) as Chunk);
  const buf = fs.readFileSync(path.join(indexDir(), "vectors.f32"));
  const vectors = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + m.chunks * m.dim * 4));
  g.__store = { docs, chunks, vectors, dim: m.dim, mtime };
  return g.__store;
}

export function pdfPath(d: Doc) {
  return path.join(env.dataDir, d.folder, d.datei);
}
