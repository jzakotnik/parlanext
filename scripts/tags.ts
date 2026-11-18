/**
 * Tags neu berechnen – ohne neue Embeddings. Nach jeder Änderung an config/tags.json ausführen:
 *   npm run tags
 * Liest den Textcache data/index/texts/<id>.txt aller indexierten Dokumente und schreibt data/index/tags.json.
 */
import fs from "node:fs";
import path from "node:path";
import { env } from "../src/lib/env";
import { indexDir, textPath } from "../src/lib/store";
import { loadTagDefs, tagsFor } from "../src/lib/tags";

const manifestFile = path.join(indexDir(), "manifest.json");
if (!fs.existsSync(manifestFile)) throw new Error(`Kein Index in ${env.dataDir} – zuerst npm run ingest ausführen.`);
const defs = loadTagDefs();
if (!defs.length) throw new Error("Keine Tags konfiguriert (config/tags.json).");
const docs: string[] = JSON.parse(fs.readFileSync(manifestFile, "utf8")).docs;

const out: Record<string, string[]> = {};
const counts: Record<string, number> = Object.fromEntries(defs.map((d) => [d.id, 0]));
let ohneText = 0;
for (const id of docs) {
  const f = textPath(id);
  if (!fs.existsSync(f)) { ohneText++; continue; }
  out[id] = tagsFor(fs.readFileSync(f, "utf8"));
  out[id].forEach((t) => counts[t]++);
}
fs.writeFileSync(path.join(indexDir(), "tags.json"), JSON.stringify(out));
console.log(`${Object.keys(out).length} Dokumente getaggt${ohneText ? ` (${ohneText} ohne Textdatei übersprungen)` : ""}:`);
for (const d of defs) console.log(`  ${d.label.padEnd(30)} ${counts[d.id]}`);
