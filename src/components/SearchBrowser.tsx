"use client";
import { useEffect, useState } from "react";
import type { Filter, Hit } from "@/lib/types";
import { tokens } from "@/lib/tokens";
import { HitCard } from "./ui";

export default function SearchBrowser() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>({});
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function go(query = q, f = filter) {
    setBusy(true);
    try {
      const r = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, filter: f, limit: 20 }) });
      setHits((await r.json()).hits ?? []);
    } finally { setBusy(false); }
  }
  useEffect(() => { go("", {}); /* neueste Antworten initial */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const upd = (p: Filter) => { const n = { ...filter, ...p }; setFilter(n); go(q, n); };

  return (
    <>
      <section className="hero">
        <h1>Antworten der Bundesregierung durchsuchen</h1>
        <p>Semantische und Volltextsuche über alle erfassten Antworten auf Kleine und Große Anfragen.</p>
      </section>
      <form className="card search-big" onSubmit={(e) => { e.preventDefault(); go(); }} role="search">
        <label className="sr" htmlFor="q">Suchbegriff</label>
        <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="z. B. Wasserversorgung Sahel, Mikrofinanz, Klimafinanzierung …" />
        <button className="btn primary" disabled={busy}>{busy ? "Suche …" : "Suchen"}</button>
      </form>
      <div className="filters">
        <select className="input" aria-label="Vorgangstyp" value={filter.typ ?? ""} onChange={(e) => upd({ typ: e.target.value || undefined })}>
          <option value="">Alle Vorgangstypen</option><option>Kleine Anfrage</option><option>Große Anfrage</option>
        </select>
        <label className="toggle">von <input type="date" className="input" value={filter.von ?? ""} onChange={(e) => upd({ von: e.target.value || undefined })} /></label>
        <label className="toggle">bis <input type="date" className="input" value={filter.bis ?? ""} onChange={(e) => upd({ bis: e.target.value || undefined })} /></label>
      </div>
      <div className="list" style={{ marginTop: 24 }} aria-live="polite">
        {hits === null && <div className="skeleton" />}
        {hits?.map((h) => <HitCard key={h.id} hit={h} terms={tokens(q)} />)}
        {hits?.length === 0 && <div className="card empty">Keine Treffer. Versuchen Sie andere Begriffe oder lockern Sie die Filter.</div>}
      </div>
    </>
  );
}
