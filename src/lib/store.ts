import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

export const FOLDERS = [
  { dir: "kleine-anfragen", typ: "Kleine Anfrage" },
  { dir: "grosse-anfragen", typ: "Große Anfrage" },
] as const;

export type Doc = {
  id: string;
  dokumentnummer: string;
  datum: string | null;
  titel: string;
  vorgangstyp: string;
  kfw: boolean;
  bmz: boolean;
  deskriptoren: string[];
  sachgebiete: string[];
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
      const datei = r.datei ?? r.file ?? r.filename ?? (nr ? `${String(nr).replace("/", "-")}.pdf` : undefined);
      if (!nr || !datei) continue;
      out.push({
        id: String(r.id ?? nr),
        dokumentnummer: String(nr),
        datum: r.datum ? String(r.datum).slice(0, 10) : null,
        titel: r.titel ?? String(nr),
        vorgangstyp: r.vorgangstyp ?? typ,
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
  const docs = new Map(readMetadata().filter((d) => done.has(d.id)).map((d) => [d.id, d]));
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
