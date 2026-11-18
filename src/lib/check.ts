import { z } from "zod";
import { chatJSON } from "./azure";
import { hasChat, hasIndex } from "./env";
import { searchAntworten, tokens } from "./search";
import { SCHWELLE, type CheckResponse, type Filter, type FrageResult, type Hit, type Status } from "./types";

const Decomp = z.object({
  fragen: z.array(
    z.object({
      text: z.string(),
      entitaeten: z.array(z.string()).default([]),
      varianten: z.array(z.string()).default([]),
    }),
  ),
});

const Judge = z.object({
  status: z.enum(["beantwortet", "teilweise", "nichts"]),
  treffer: z.number().int().nullable().optional(),
  zitat: z.string().nullable().optional(),
  begruendung: z.string().default(""),
});

export type FrageInput = { text: string; entitaeten?: string[]; varianten?: string[] };

/** Begrenzte Parallelität: bis zu ~11 Suchanfragen je Frage würden sonst das Embedding-Rate-Limit treffen. */
async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Schritt 1: Anfrage in Einzelfragen + Entitäten + Suchvarianten zerlegen. */
export async function zerlege(text: string): Promise<FrageInput[]> {
  const ai = await chatJSON<unknown>(
    `Du bist Rechercheassistent für parlamentarische Anfragen an die Bundesregierung. Fachgebiet: Entwicklungszusammenarbeit (EZ), internationale Zusammenarbeit, Entwicklungsfinanzierung, KfW Entwicklungsbank, Entwicklungshilfe und verwandte Themen (BMZ, Auswärtiges Amt, Haushalt/Einzelplan 23, multilaterale Organisationen, Klimafinanzierung, humanitäre Hilfe, Wiederaufbau).
Zerlege den Text in Einzelfragen. Antworte NUR als JSON: {"fragen":[{"text":string,"entitaeten":string[],"varianten":string[]}]}.
"entitaeten": Länder, Regionen, Programme, Institutionen, Zeiträume, Beträge.
"varianten": genau 10 verschiedene deutsche Suchanfragen für diese Einzelfrage, damit auch anders formulierte frühere Antworten gefunden werden. Mische:
- wörtliche und umformulierte Fassungen der Frage,
- Fachbegriffe und Synonyme der Domäne, z. B. Finanzielle Zusammenarbeit (FZ), Technische Zusammenarbeit (TZ), Official Development Assistance (ODA), Entwicklungsbank, KfW Entwicklungsbank, DEG, GIZ, Zusagen/Neuzusagen/Auszahlungen/Mittelabfluss, Verpflichtungsermächtigungen, Partnerländer, Vorhaben/Projekte/Programme, Wirksamkeit/Evaluierung, Klimafinanzierung, Kofinanzierung, Zuschüsse/Darlehen/Förderkredite,
- Abkürzungen ausgeschrieben und umgekehrt (BMZ = Bundesministerium für wirtschaftliche Zusammenarbeit und Entwicklung),
- kurze Stichwortanfragen (3 bis 6 Wörter) mit Land/Programm/Zeitraum und Schlagwörter, wie sie in Bundestagsdrucksachen vorkommen (Deskriptoren),
- allgemeinere und speziellere Fassungen (Oberbegriff und Detail).
Gib keine Variante mehrfach aus und erfinde keine Fakten, Zahlen oder Namen, die nicht im Text vorkommen.
Ist der Text nur ein Stichwort oder eine einzelne Frage, gib genau eine Einzelfrage zurück.`,
    text,
  ).catch(() => null);
  const parsed = Decomp.safeParse(ai);
  if (parsed.success && parsed.data.fragen.length) return parsed.data.fragen;

  // Fallback ohne KI: nach nummerierten Fragen / Fragezeichen trennen
  const parts = text
    .split(/\n+(?=\s*\d+[.)]\s)|(?<=\?)\s+/)
    .map((s) => s.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter((s) => s.length > 3);
  return (parts.length ? parts : [text.trim()]).map((t) => ({
    text: t,
    entitaeten: [],
    varianten: [tokens(t).slice(0, 6).join(" ")].filter(Boolean),
  }));
}

async function bewerteKI(frage: string, treffer: Hit[]) {
  const quellen = treffer
    .slice(0, 4)
    .map((h, i) => `[${i}] ${h.dokumentnummer} (${h.datum ?? "?"})\n${h.passage}`)
    .join("\n\n---\n\n");
  const raw = await chatJSON<unknown>(
    `Du prüfst, ob eine Frage bereits von der Bundesregierung beantwortet wurde. Nutze AUSSCHLIESSLICH die Quellen.
Antworte als JSON: {"status":"beantwortet"|"teilweise"|"nichts","treffer":Index|null,"zitat":string|null,"begruendung":string}.
"zitat" MUSS ein wörtlicher, zusammenhängender Ausschnitt aus der Quelle [treffer] sein (max. 300 Zeichen), der die Antwort belegt.
Ohne Beleg: status "nichts". "beantwortet" nur, wenn alle Aspekte der Frage (Zeitraum, Land, Programm) abgedeckt sind.`,
    `FRAGE:\n${frage}\n\nQUELLEN:\n${quellen}`,
  ).catch(() => null);
  const p = Judge.safeParse(raw);
  return p.success ? p.data : null;
}

/** Schritt 2–4: suchen, bewerten, Beleg verifizieren. */
export async function pruefeFrage(f: FrageInput, idx: number, filter: Filter): Promise<FrageResult> {
  const queries = [...new Set([f.text, ...(f.varianten ?? []).slice(0, 10)].map((q) => q.trim()).filter(Boolean))];
  const protokoll: FrageResult["protokoll"] = [];
  const byId = new Map<string, Hit>();
  const score = new Map<string, number>();

  const runs = await mapLimit(queries, 4, (q) => searchAntworten(q, filter, 8));
  runs.forEach((hits, qi) => {
    protokoll.push({ query: queries[qi], treffer: hits.length });
    hits.forEach((h, r) => {
      score.set(h.id, (score.get(h.id) ?? 0) + 1 / (60 + r));
      const cur = byId.get(h.id);
      if (!cur || h.relevanz > cur.relevanz) byId.set(h.id, h);
    });
  });
  const treffer = [...byId.values()].sort((a, b) => (score.get(b.id)! - score.get(a.id)!) || b.relevanz - a.relevanz).slice(0, 6);

  let status: Status = "nichts";
  let begruendung = "";
  let beleg: FrageResult["beleg"] = null;
  let bewertung: FrageResult["bewertung"] = "heuristik";

  const top = treffer.filter((h) => h.relevanz >= SCHWELLE);
  const ki = treffer.length && hasChat() ? await bewerteKI(f.text, treffer) : null;

  if (ki) {
    bewertung = "ki";
    const h = ki.treffer != null ? treffer[ki.treffer] : undefined;
    const zitat = ki.zitat?.trim();
    const verifiziert = h && zitat && norm(h.passage).includes(norm(zitat));
    if (ki.status !== "nichts" && verifiziert) {
      status = ki.status;
      beleg = { hitId: h!.id, zitat: zitat! };
      begruendung = ki.begruendung;
    } else if (ki.status !== "nichts") {
      begruendung = "Die KI sah einen Treffer, das Zitat ließ sich jedoch nicht wörtlich im Dokument verifizieren – daher keine Aussage.";
    } else begruendung = ki.begruendung;
  } else if (top.length) {
    // Heuristik ohne KI: nur Hinweis, nie "beantwortet"
    status = "teilweise";
    const h = top[0];
    beleg = { hitId: h.id, zitat: h.passage.slice(0, 300) };
    begruendung = "Heuristische Einschätzung (ohne KI-Bewertung): ähnlicher Treffer über der Schwelle – bitte Antwort prüfen.";
  } else {
    begruendung = treffer.length
      ? `Kein Treffer über der Relevanzschwelle von ${SCHWELLE.toString().replace(".", ",")}. Der nächstliegende Treffer wird unten gezeigt.`
      : "Mit den verwendeten Suchanfragen und Filtern wurde nichts gefunden.";
  }

  return {
    id: `f${idx + 1}`, text: f.text, entitaeten: f.entitaeten ?? [], varianten: queries.slice(f.text ? 1 : 0),
    status, begruendung, beleg, treffer, protokoll, bewertung,
  };
}

export async function pruefe(input: { text?: string; fragen?: FrageInput[]; filter?: Filter }): Promise<CheckResponse> {
  const fragen = input.fragen?.length ? input.fragen : await zerlege(input.text ?? "");
  const liste = fragen.slice(0, 12);
  const results = await mapLimit(liste, 2, (f) => pruefeFrage(f, liste.indexOf(f), input.filter ?? {}));
  return { fragen: results, modus: { ki: hasChat(), datenbank: hasIndex() }, schwelle: SCHWELLE };
}
