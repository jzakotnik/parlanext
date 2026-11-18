import fs from "node:fs";
const dir = process.env.DATA_DIR ?? "data";
for (const d of ["kleine_anfragen", "grosse_anfragen", "index"]) fs.mkdirSync(`${dir}/${d}`, { recursive: true });
for (const d of ["kleine_anfragen", "grosse_anfragen"]) {
  const f = `${dir}/${d}/metadaten.jsonl`;
  if (!fs.existsSync(f)) fs.writeFileSync(f, "");
}
console.log(`Ordner in ./${dir} bereit.`);
