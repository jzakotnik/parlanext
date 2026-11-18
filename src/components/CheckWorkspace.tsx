"use client";
import { useMemo, useState } from "react";
import type { CheckResponse, Filter, FrageResult } from "@/lib/types";
import { tokens } from "@/lib/tokens";
import LiveLog, { type LogLine } from "./LiveLog";
import { HitCard, StatusBadge, fmtDate, pct } from "./ui";

const BEISPIEL = `1. Wie hoch waren die Neuzusagen der KfW Entwicklungsbank für erneuerbare Energien in Subsahara-Afrika in den Jahren 2020 bis 2024?
2. Welche Länder erhielten die höchsten Zusagen?
3. Wie bewertet die Bundesregierung die Wirksamkeit von Wasserversorgungsvorhaben im Sahel?`;

export default function CheckWorkspace() {
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<Filter>({});
  const [data, setData] = useState<CheckResponse | null>(null);
  const [fragen, setFragen] = useState<FrageResult[]>([]);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [newQ, setNewQ] = useState("");
  const [log, setLog] = useState<LogLine[]>([]);

  /** Ruft die Prüfung als Stream ab: Fortschrittszeilen laufen live ins Log, am Ende kommt das Ergebnis. */
  async function call(body: unknown): Promise<CheckResponse> {
    const t0 = Date.now();
    setLog([]);
    const r = await fetch("/api/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(body as object), stream: true }) });
    if (!r.ok || !r.body) throw new Error("Die Prüfung ist fehlgeschlagen. Bitte erneut versuchen.");
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let result: CheckResponse | null = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = done ? "" : lines.pop() ?? "";
      for (const l of lines) {
        if (!l.trim()) continue;
        const ev = JSON.parse(l);
        if (ev.type === "log") setLog((cur) => [...cur, { t: Date.now() - t0, msg: ev.msg, level: ev.level }]);
        else if (ev.type === "result") result = ev.data;
        else if (ev.type === "error") throw new Error("Die Prüfung ist fehlgeschlagen. Bitte erneut versuchen.");
      }
      if (done) break;
    }
    if (!result) throw new Error("Die Prüfung wurde unvollständig beendet. Bitte erneut versuchen.");
    return result;
  }

  async function run() {
    if (!text.trim()) return;
    setBusy(true); setErr(null); setPicked({});
    try {
      const res = await call({ text, filter });
      setData(res); setFragen(res.fragen); setSel(0);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); setLog([]); }
  }

  async function rerun(i: number, varianten: string[]) {
    const f = fragen[i];
    setBusy(true); setErr(null);
    try {
      const res = await call({ fragen: [{ text: f.text, entitaeten: f.entitaeten, varianten }], filter });
      setFragen((cur) => cur.map((x, j) => (j === i ? { ...res.fragen[0], id: x.id } : x)));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); setLog([]); }
  }

  const f = fragen[sel];
  const terms = useMemo(() => (f ? tokens(f.text + " " + f.varianten.join(" ")) : []), [f]);
  const nearest = f && f.status === "nichts" ? f.treffer[0] : undefined;

  function togglePick(fid: string, hitId: string) {
    setPicked((p) => {
      const cur = p[fid] ?? [];
      return { ...p, [fid]: cur.includes(hitId) ? cur.filter((x) => x !== hitId) : [...cur, hitId] };
    });
  }

  function vermerk() {
    const lines = [`# Recherchevermerk – Anfragen-Check`, `Stand: ${fmtDate(new Date().toISOString())}`, ""];
    fragen.forEach((q, i) => {
      lines.push(`## Frage ${i + 1}: ${q.text}`, `Status: ${q.status === "beantwortet" ? "Beantwortet" : q.status === "teilweise" ? "Teilweise beantwortet" : "Nichts gefunden"}`);
      if (q.begruendung) lines.push(`Begründung: ${q.begruendung}`);
      const ids = new Set([...(picked[q.id] ?? []), ...(q.beleg ? [q.beleg.hitId] : [])]);
      q.treffer.filter((h) => ids.has(h.id)).forEach((h) => {
        lines.push(`- Fundstelle: ${h.dokumentnummer} vom ${fmtDate(h.datum)} – ${h.titel}${h.pdf_url ? ` (${h.pdf_url})` : ""}`);
        if (q.beleg?.hitId === h.id) lines.push(`  > „${q.beleg.zitat}“`);
      });
      lines.push(`Suchanfragen: ${q.protokoll.map((p) => `„${p.query}“ (${p.treffer})`).join("; ")}`, "");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "recherchevermerk.md"; a.click();
  }

  const counts = fragen.reduce((a, q) => ({ ...a, [q.status]: (a[q.status] ?? 0) + 1 }), {} as Record<string, number>);

  return (
    <>
      <section className="hero">
        <h1>Wurde diese Anfrage schon einmal beantwortet?</h1>
        <p>Fügen Sie eine ganze Kleine oder Große Anfrage, eine einzelne Frage oder nur Stichworte ein. Wir durchsuchen die Antworten der Bundesregierung – und belegen jedes Ergebnis mit Zitat, Datum und Quelle.</p>
      </section>

      <div className={`composer-row ${busy ? "live" : ""}`}>
      <div className="card composer">
        <label className="sr" htmlFor="anfrage">Anfrage, Frage oder Stichworte</label>
        <textarea id="anfrage" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Anfrage, einzelne Frage oder Stichworte einfügen …"
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run(); }} />
        <div className="bar">
          <label className="toggle">ab <input type="date" className="input" style={{ padding: "2px 8px" }} value={filter.von ?? ""} onChange={(e) => setFilter({ ...filter, von: e.target.value || undefined })} /></label>
          <span className="spacer" />
          <button className="btn ghost" onClick={() => setText(BEISPIEL)}>Beispiel einfügen</button>
          <button className="btn primary" onClick={run} disabled={busy || !text.trim()}>{busy ? "Prüfe …" : "Prüfen"} <span aria-hidden>→</span></button>
        </div>
      </div>
      {busy && <LiveLog lines={log} busy={busy} />}
      </div>

      {err && <div className="banner" role="alert" style={{ marginTop: 16 }}>{err}</div>}

      {data && f && (
        <div className="workspace">
          {/* links: Einzelfragen */}
          <aside aria-label="Einzelfragen">
            <h2 className="col-title">Einzelfragen · {fragen.length}</h2>
            <div className="row" style={{ margin: "0 4px 12px" }}>
              {(["beantwortet", "teilweise", "nichts"] as const).map((s) => counts[s] ? <StatusBadge key={s} status={s} /> : null)}
            </div>
            {fragen.map((q, i) => (
              <button key={q.id} className="qitem fade" aria-current={i === sel} onClick={() => setSel(i)}>
                <span className="row"><span className="n">Frage {i + 1}</span><span className="spacer" /><StatusBadge status={q.status} /></span>
                <p>{q.text}</p>
              </button>
            ))}
          </aside>

          {/* Mitte: Suchanfragen + Belege */}
          <main className="stack" key={f.id} aria-live="polite">
            <div className="card panel fade">
              <div className="row"><StatusBadge status={f.status} />
                {f.bewertung === "heuristik" && <span className="tag" title="Ohne KI-Bewertung – nur Ähnlichkeitsschwelle">Heuristik</span>}
              </div>
              <h2 style={{ marginTop: 12 }}>{f.text}</h2>
              {f.entitaeten.length > 0 && <div className="row sect">{f.entitaeten.map((e) => <span key={e} className="tag ent">{e}</span>)}</div>}

              <div className="sect">
                <h3 style={{ fontSize: 15, marginBottom: 8 }}>Suchanfragen <span className="tag">bearbeitbar</span></h3>
                <div className="row">
                  {f.varianten.map((v) => (
                    <span key={v} className="chip">{v}
                      <button aria-label={`Suchanfrage „${v}“ entfernen`} onClick={() => rerun(sel, f.varianten.filter((x) => x !== v))}>×</button>
                    </span>
                  ))}
                  <form className="addq" onSubmit={(e) => { e.preventDefault(); if (newQ.trim()) { rerun(sel, [...f.varianten, newQ.trim()]); setNewQ(""); } }}>
                    <input aria-label="Suchanfrage hinzufügen" placeholder="+ Suchanfrage" value={newQ} onChange={(e) => setNewQ(e.target.value)} />
                  </form>
                </div>
              </div>

              <div className="verdict">
                {f.beleg ? (
                  <>
                    <b>{f.status === "beantwortet" ? "Beantwortet – Beleg:" : "Teilweise beantwortet – Beleg:"}</b> {f.begruendung}
                    {(() => { const h = f.treffer.find((t) => t.id === f.beleg!.hitId); return (
                      <blockquote className="quote">„{f.beleg!.zitat}“
                        {h && <cite>{h.dokumentnummer} · {fmtDate(h.datum)} · <a href={`/antwort/${encodeURIComponent(h.id)}`}>Volltext</a>{h.pdf_url && <> · <a href={h.pdf_url} target="_blank" rel="noreferrer">PDF ↗</a></>}</cite>}
                      </blockquote>); })()}
                  </>
                ) : (
                  <>
                    <b>Kein belegbares Ergebnis.</b> {f.begruendung}
                    {nearest && <p style={{ margin: "8px 0 0", color: "var(--ink-2)", fontSize: 14 }}>Nächster Treffer: {nearest.dokumentnummer} ({pct(nearest.relevanz)}, unter der Schwelle von {pct(data.schwelle)}).</p>}
                  </>
                )}
              </div>
            </div>

            <h2 className="col-title" style={{ marginBottom: 0 }}>Fundstellen · {f.treffer.length}</h2>
            <div className="list">
              {busy && <div className="skeleton" />}
              {f.treffer.map((h) => (
                <HitCard key={h.id} hit={h} terms={terms}
                  picked={(picked[f.id] ?? []).includes(h.id)} onPick={() => togglePick(f.id, h.id)} />
              ))}
              {!f.treffer.length && <div className="card empty">Keine Fundstellen mit diesen Suchanfragen und Filtern.</div>}
            </div>
          </main>

          {/* rechts: Protokoll */}
          <aside className="stack sticky" aria-label="Rechercheprotokoll">
            <div className="card log">
              <h2 className="col-title" style={{ margin: 0 }}>Rechercheprotokoll</h2>
              <ol>{f.protokoll.map((p) => <li key={p.query}>„{p.query}“ <span className="tag">{p.treffer} Treffer</span></li>)}</ol>
              <p style={{ color: "var(--ink-3)", margin: "10px 0 0" }}>
                Filter: {[filter.von && `ab ${fmtDate(filter.von)}`].filter(Boolean).join(", ") || "keine"} · Schwelle {pct(data.schwelle)}
                <br />Modus: {data.modus.ki ? "KI-Bewertung" : "ohne KI"} · {data.modus.datenbank ? "Suchindex" : "Demo-Daten"}
              </p>
            </div>
            <div className="card log">
              <h2 className="col-title" style={{ margin: 0 }}>Export</h2>
              <p style={{ color: "var(--ink-2)" }}>Recherchevermerk mit Status je Einzelfrage, Zitaten und gewählten Fundstellen.</p>
              <button className="btn primary" style={{ padding: "9px 16px", fontSize: 14 }} onClick={vermerk}>Vermerk herunterladen</button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
