import Link from "next/link";
import { notFound } from "next/navigation";
import { getAntwort } from "@/lib/search";
import { fmtDate, isOld } from "@/components/ui";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getAntwort(decodeURIComponent(id));
  if (!d) notFound();
  return (
    <article style={{ marginTop: 16 }}>
      <Link href="/stoebern" className="btn ghost">← Zurück zur Suche</Link>
      <div className="hero">
        <div className="row"><b>{d.dokumentnummer}</b><span>{fmtDate(d.datum)}</span>
          {d.vorgangstyp && <span className="tag">{d.vorgangstyp}</span>}
          {d.tags.map((t) => <span key={t.id} className="tag bezug">{t.label}</span>)}
          {isOld(d.datum) && <span className="warn">⏱ älter als 12 Monate</span>}
        </div>
        <h1 style={{ marginTop: 12 }}>{d.titel}</h1>
        <div className="row" style={{ marginTop: 14 }}>
          {(d.deskriptoren ?? []).map((x: string) => <span key={x} className="tag ent">{x}</span>)}
          {d.pdf_url && <a className="btn" href={d.pdf_url} target="_blank" rel="noreferrer">PDF öffnen ↗</a>}
          {"quelle_url" in d && d.quelle_url && <a className="btn" href={d.quelle_url} target="_blank" rel="noreferrer">Beim Bundestag ↗</a>}
        </div>
      </div>
      <div className="card fulltext">{d.text}</div>
    </article>
  );
}
