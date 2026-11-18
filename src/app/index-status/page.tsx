import fs from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import { FOLDERS, indexDir, pdfPath, readMetadata } from "@/lib/store";
import { fmtDate } from "@/components/ui";

export const metadata = { title: "Index-Status – Anfragen-Check" };

type Manifest = { dim: number; model: string; chunks: number; docs: string[]; endpointHost?: string; updated?: string };

export default function Page() {
  const mf = path.join(indexDir(), "manifest.json");
  const m: Manifest | null = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, "utf8")) : null;
  const meta = readMetadata();
  const indexed = new Set(m?.docs ?? []);

  // Chunks je Dokument + Abgleich: stammt alles im Index aus den eigenen Ordnern?
  const perDoc = new Map<string, number>();
  if (m && fs.existsSync(path.join(indexDir(), "chunks.jsonl"))) {
    for (const l of fs.readFileSync(path.join(indexDir(), "chunks.jsonl"), "utf8").split("\n").slice(0, m.chunks)) {
      if (!l) continue;
      const id = JSON.parse(l).doc as string;
      perDoc.set(id, (perDoc.get(id) ?? 0) + 1);
    }
  }
  const known = new Set(meta.map((d) => d.id));
  const fremd = [...indexed].filter((id) => !known.has(id));
  const ohneChunks = meta.filter((d) => indexed.has(d.id) && !perDoc.has(d.id));
  const offen = meta.filter((d) => !indexed.has(d.id));
  const pdfFehlt = meta.filter((d) => !fs.existsSync(pdfPath(d)));
  const dates = meta.map((d) => d.datum).filter(Boolean).sort() as string[];

  const Row = ({ k, v, warn }: { k: string; v: React.ReactNode; warn?: boolean }) => (
    <div className="row" style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ color: "var(--ink-2)" }}>{k}</span><b className={warn ? "warn" : undefined}>{v}</b>
    </div>
  );

  return (
    <>
      <section className="hero">
        <h1>Index-Status</h1>
        <p>Woraus der Suchindex besteht – und ob er ausschließlich Ihre eigenen Dokumente enthält.</p>
      </section>
      {!m ? (
        <div className="card empty">Noch kein Index vorhanden. PDFs und <code>metadaten.jsonl</code> in <code>{env.dataDir}</code> ablegen und <code>npm run ingest</code> ausführen.</div>
      ) : (
        <div className="workspace" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="card panel">
            <h2>Embeddings</h2>
            <Row k="Deployment (Modell)" v={m.model} />
            <Row k="Dimension" v={m.dim} />
            <Row k="Azure-Host" v={m.endpointHost ?? "unbekannt (älterer Index)"} />
            <Row k="Zuletzt aktualisiert" v={m.updated ? fmtDate(m.updated) : "unbekannt"} />
            <Row k="Chunks im Index" v={m.chunks.toLocaleString("de-DE")} />
            <Row k="Speicherort" v={path.join(env.dataDir, "index")} />
            <p style={{ color: "var(--ink-2)", fontSize: 14 }}>Der Embeddings-Dienst speichert keine Daten; Vektoren liegen nur lokal. Modell und Dimension sind festgeschrieben – ein Wechsel erfordert einen neuen Index.</p>
          </div>
          <div className="card panel">
            <h2>Dokumente</h2>
            {FOLDERS.map((f) => (
              <Row key={f.dir} k={f.typ + "n"} v={`${meta.filter((d) => d.folder === f.dir && indexed.has(d.id)).length} von ${meta.filter((d) => d.folder === f.dir).length} indexiert`} />
            ))}
            <Row k="Zeitraum" v={dates.length ? `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}` : "–"} />
            <Row k="Noch nicht indexiert" v={offen.length} warn={offen.length > 0} />
            <Row k="Fremde Dokument-IDs im Index (nicht in metadaten.jsonl)" v={fremd.length} warn={fremd.length > 0} />
            <Row k="Indexiert, aber ohne Chunks (leer/Verweis)" v={ohneChunks.length} />
            <Row k="PDF-Datei fehlt" v={pdfFehlt.length} warn={pdfFehlt.length > 0} />
            {fremd.length > 0 && <p className="warn" style={{ marginTop: 12 }}>Auffällig: {fremd.slice(0, 5).join(", ")}{fremd.length > 5 ? " …" : ""}</p>}
            {fremd.length === 0 && <p style={{ color: "var(--ok)", marginTop: 12 }}>✓ Alle Dokumente im Index stammen aus Ihren Ordnern.</p>}
          </div>
        </div>
      )}
    </>
  );
}
