import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * Konfigurierbare Tags: config/tags.json (oder Pfad in TAGS_FILE).
 * Ein Tag trifft zu, wenn mindestens `mindestens` (Standard 1) seiner Begriffe im Volltext vorkommen.
 * Kurze Abkürzungen (≤ 6 Zeichen, mind. zwei Großbuchstaben: KfW, BMZ, GIZ, ODA) gelten nur als ganzes Wort,
 * längere Begriffe auch als Wortteil ("Entwicklungsbank" findet auch "KfW-Entwicklungsbanken").
 */
const TagDef = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/i),
  label: z.string().min(1),
  begriffe: z.array(z.string().min(2)).min(1),
  mindestens: z.number().int().min(1).default(1),
});
export type TagDef = z.infer<typeof TagDef>;
const Config = z.object({ tags: z.array(TagDef) });

export type TagRef = { id: string; label: string };

const g = globalThis as unknown as { __tagcfg?: { mtime: number; defs: TagDef[]; res: Map<string, RegExp> } };
const file = () => path.resolve(process.env.TAGS_FILE ?? "config/tags.json");

const istAbkuerzung = (t: string) => !/\s/.test(t) && t.length <= 6 && (t.match(/[A-ZÄÖÜ]/g) ?? []).length >= 2;
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const regexFor = (d: TagDef) =>
  new RegExp(
    d.begriffe.map((t) => (istAbkuerzung(t) ? `(?<![\\p{L}\\p{N}])${esc(t)}(?![\\p{L}\\p{N}])` : esc(t))).join("|"),
    "giu",
  );

export function loadTagDefs(): TagDef[] {
  const f = file();
  if (!fs.existsSync(f)) return [];
  const mtime = fs.statSync(f).mtimeMs;
  if (g.__tagcfg?.mtime === mtime) return g.__tagcfg.defs;
  const defs = Config.parse(JSON.parse(fs.readFileSync(f, "utf8"))).tags;
  g.__tagcfg = { mtime, defs, res: new Map(defs.map((d) => [d.id, regexFor(d)])) };
  return defs;
}

/** IDs aller Tags, die auf den Text zutreffen. */
export function tagsFor(text: string): string[] {
  const defs = loadTagDefs();
  return defs
    .filter((d) => (text.match(g.__tagcfg!.res.get(d.id)!) ?? []).length >= d.mindestens)
    .map((d) => d.id);
}

/** Tag-IDs -> Anzeigeobjekte (unbekannte, z. B. aus der Konfiguration entfernte Tags, entfallen). */
export function tagRefs(ids: string[]): TagRef[] {
  const defs = loadTagDefs();
  return ids.map((id) => defs.find((d) => d.id === id)).filter((d): d is TagDef => !!d).map((d) => ({ id: d.id, label: d.label }));
}
