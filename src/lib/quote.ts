/**
 * Zitate auf ganze Sätze „einrasten“ lassen und unbrauchbare Zitate (nur URL / Satzfragment) verwerfen.
 * Portiert und angepasst aus dem Zitat-Check eines BMZ-Rechercheassistenten (Python).
 */
import { tokens } from "./tokens";

export const compact = (s: string) => s.replace(/\s+/g, " ").trim();

const MIN = 40; // kürzere Sätze sind als Beleg meist wertlos
const MAX = 900;
const URL_RE = /https?:\/\/\S+|www\.\S+/gi;
const ABBR = /(?:bzw|vgl|inkl|etc|ggf|evtl|ca|nr|dr|abs|mio|mrd|tsd|usw|sog|bspw|insb|u\.a|z\.b|d\.h|i\.d\.r|s\.o|u\.u|o\.ä|ff|f|vs|prof|str|art)$/i;
const MONTH = /^(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b/;

/** Chunks beginnen mit einem Kontext-Präfix „Dokumentnummer | Datum | Titel | Deskriptoren“ (siehe ingest). */
export function stripPrefix(passage: string): string {
  const nl = passage.indexOf("\n");
  if (nl > 0 && (passage.slice(0, nl).match(/ \| /g)?.length ?? 0) >= 2) return passage.slice(nl + 1);
  return passage;
}

/** Ist das Satzzeichen an Position i ein Satzende? (Abkürzungen, Dezimal-/Tausenderpunkte, Ordnungszahlen: nein) */
function isBoundary(t: string, i: number): boolean {
  const c = t[i];
  const next = t.slice(i + 1, i + 14);
  if (c === "?" || c === "!") return true;
  if (/^\d/.test(next)) return false; // 2.500, 21/1234.5, Aufzählungen ohne Leerzeichen
  const before = t.slice(Math.max(0, i - 8), i);
  if (/(?:^|[\s(„"])[A-Za-zÄÖÜäöü]$/.test(before)) return false; // einzelner Buchstabe: „z. B.“, „d. h.“, Initialen
  if (ABBR.test(before)) return false;
  if (/(?:^|\s)\d{1,2}$/.test(before) && MONTH.test(next.trimStart())) return false; // „am 1. Januar“
  if (/^\s*[a-zäöüß(]/.test(next)) return false; // Satz geht klein weiter
  return true;
}

function bounds(t: string, index: number, length: number): [number, number] {
  let start = 0;
  for (let i = index - 1; i >= 0; i--) if (".!?".includes(t[i]) && isBoundary(t, i)) { start = i + 1; break; }
  let end = t.length;
  for (let i = index + Math.max(length - 1, 0); i < t.length; i++) if (".!?".includes(t[i]) && isBoundary(t, i)) { end = i + 1; break; }
  return [start, end];
}

const wortzeichen = (s: string) => s.replace(URL_RE, "").replace(/[^A-Za-zÄÖÜäöüß]/g, "").length;

/**
 * Erweitert ein (bereits als wörtlich verifiziertes) Zitat auf die umgebenden ganzen Sätze.
 * Liefert null, wenn nichts Brauchbares übrig bleibt (reine URL, Satzfragment unter 40 Zeichen).
 * Ist der umgebende Satz zu lang oder nicht eindeutig auffindbar, bleibt das Zitat selbst, sofern es lang genug ist.
 */
export function rasteEin(quote: string, passage: string): string | null {
  const q = compact(quote);
  if (wortzeichen(q) < 10) return null; // z. B. nur ein Link
  const fallback = q.length >= MIN && wortzeichen(q) >= 25 ? q : null;
  const src = compact(stripPrefix(passage));
  const lq = q.toLowerCase(), ls = src.toLowerCase();
  if (lq.length !== q.length || ls.length !== src.length) return fallback;
  const probe = [lq, lq.replace(/[.!?…\s]+$/, "")].find((p) => p.length >= 8 && ls.includes(p));
  if (!probe) return fallback;
  const [s, e] = bounds(src, ls.indexOf(probe), probe.length);
  const satz = src.slice(s, e).replace(/^Antwort:\s*/, "").trim(); // Label aus dem Chunk gehört nicht zum Zitat
  if (satz.length >= MIN && satz.length <= MAX && /^[A-ZÄÖÜ0-9„"(]/.test(satz) && /[.!?]$/.test(satz) && wortzeichen(satz) >= 25) return satz;
  return fallback;
}

/** Zerlegt Text in Sätze (für die Heuristik ohne KI). */
export function saetze(text: string): string[] {
  const t = compact(text);
  const out: string[] = [];
  let from = 0;
  for (let i = 0; i < t.length; i++) {
    if (".!?".includes(t[i]) && isBoundary(t, i)) { out.push(t.slice(from, i + 1).trim()); from = i + 1; }
  }
  if (from < t.length) out.push(t.slice(from).trim());
  return out.filter(Boolean);
}

/** Der Satz mit den meisten Suchbegriffen der Frage (Heuristik ohne KI: statt eines abgeschnittenen Textanfangs). */
export function bestSatz(passage: string, frage: string): string {
  const stem = (t: string) => t.slice(0, Math.max(5, t.length - 3));
  const qs = [...new Set(tokens(frage).map(stem))];
  let best = "", rank = 0, len = 0;
  for (const s of saetze(stripPrefix(passage))) {
    if (s.length < MIN || s.length > MAX || wortzeichen(s) < 25) continue;
    const low = s.toLowerCase();
    const hit = qs.filter((t) => low.includes(t));
    const r = hit.length, l = Math.max(0, ...hit.map((t) => t.length));
    if (r > rank || (r === rank && r > 0 && l > len)) { best = s; rank = r; len = l; }
  }
  return best;
}
