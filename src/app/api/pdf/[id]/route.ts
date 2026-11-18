import fs from "node:fs";
import { loadStore, pdfPath } from "@/lib/store";

// Liefert die lokal gespeicherte PDF (nur Dokumente aus dem Index, keine freien Pfade).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = loadStore()?.docs.get(decodeURIComponent(id));
  if (!d || !fs.existsSync(pdfPath(d))) return new Response("Nicht gefunden", { status: 404 });
  return new Response(fs.readFileSync(pdfPath(d)), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${d.datei}"` },
  });
}
