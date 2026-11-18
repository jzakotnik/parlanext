import type { Hit, Status } from "@/lib/types";

export const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" }) : "Datum unbekannt";
export const pct = (n: number) => Math.round(n * 100) + " %";
export const isOld = (d: string | null) => (d ? Date.now() - new Date(d).getTime() > 365 * 24 * 3600 * 1000 : false);

const LABEL: Record<Status, [string, string]> = {
  beantwortet: ["✓", "Beantwortet"],
  teilweise: ["◐", "Teilweise"],
  nichts: ["○", "Nichts gefunden"],
};
export function StatusBadge({ status }: { status: Status }) {
  const [icon, text] = LABEL[status];
  return <span className={`status ${status}`}><span aria-hidden>{icon}</span>{text}</span>;
}

export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const t = terms.filter((x) => x.length > 3).map((x) => x.slice(0, Math.max(4, x.length - 2)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!t.length) return <>{text}</>;
  const re = new RegExp(`((?:${t.join("|")})[a-zäöüß]*)`, "gi");
  return <>{text.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>;
}

export function HitCard({ hit, terms = [], picked, onPick, quote }: {
  hit: Hit; terms?: string[]; picked?: boolean; onPick?: () => void; quote?: string;
}) {
  return (
    <article className={`card hit fade ${picked ? "picked" : ""}`}>
      <div className="meta">
        <b>{hit.dokumentnummer}</b>
        <span>{fmtDate(hit.datum)}</span>
        {hit.vorgangstyp && <span className="tag">{hit.vorgangstyp}</span>}
        {hit.tags.map((t) => <span key={t.id} className="tag bezug">{t.label}</span>)}
        {isOld(hit.datum) && <span className="warn" title="Antwort ist älter als 12 Monate – Aktualität prüfen">⏱ älter als 12 Monate</span>}
        <span className="spacer" />
        {hit.relevanz > 0 && (
          <span title="Ähnlichkeit zur Suchanfrage">
            <span className="meter" aria-hidden><b style={{ width: pct(hit.relevanz) }} /></span> {pct(hit.relevanz)}
          </span>
        )}
      </div>
      <h3><a href={`/antwort/${encodeURIComponent(hit.id)}`} style={{ textDecoration: "none" }}>{hit.titel}</a></h3>
      <div className="passage"><Highlight text={quote ?? hit.passage} terms={terms} /></div>
      <div className="row">
        <a className="btn" href={`/antwort/${encodeURIComponent(hit.id)}`}>Volltext</a>
        {hit.pdf_url && <a className="btn" href={hit.pdf_url} target="_blank" rel="noreferrer">PDF öffnen ↗</a>}
        {onPick && <button className="btn" onClick={onPick} aria-pressed={picked}>{picked ? "★ Fundstelle gewählt" : "☆ Als Fundstelle übernehmen"}</button>}
      </div>
    </article>
  );
}
