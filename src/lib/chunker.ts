/**
 * Chunking von Antwort-Drucksachen: je Einzelfrage + zugehöriger Antwort ein Abschnitt.
 *
 * - „Die Fragen 1 und 2 werden gemeinsam beantwortet“: beide Fragen bleiben in einem Chunk.
 * - Unterfragen a), b) bleiben bei ihrer Hauptnummer.
 * - Vorbemerkungen (Fragesteller / Bundesregierung) werden eigene Chunks.
 * - Seitenköpfe und Druckvermerk entfallen.
 * - Zu lange Antworten werden mit Überlappung geteilt; die Frage steht in jedem Teil erneut.
 * Portiert und angepasst aus einem Chunker für BMZ-Antworten (Python).
 */

export type TextChunk = {
  content: string;
  typ: "frage_antwort" | "vorbemerkung" | "text";
  /** Nummern der enthaltenen Fragen, z. B. "1,2,2a" (leer bei Vorbemerkung/Fallback). */
  nr: string;
};

// Zahlenlastige Tabellen brauchen fast ein Token je Zeichen; das Embedding-Modell erlaubt 8192 Token je Text.
const MAX_CHARS = Number(process.env.CHUNK_MAX_CHARS) || 4000;
const OVERLAP = 400;
/** Fallback für Texte ohne erkennbare Frage-Struktur. */
const FALLBACK_SIZE = 2000;
const FALLBACK_STEP = 1800;

const WS = "[\\s\\u2000-\\u200b]*";
const QUESTION_RE = new RegExp(`^${WS}(\\d{1,3})\\.\\s+\\S`);
const SUBQUESTION_RE = new RegExp(`^${WS}([a-z])\\)\\s+\\S`);
const PAGE_RE = /^(?:Deutscher Bundestag\s*[–—-].*|Drucksache\s+\d+\/\d+\s*[–—-].*)$/i;
const FOOTER_RE = /^(?:Satz|Druck|Vertrieb)\s*:/;
const JOINT_RE = /Die Fragen?\s+(.+?)\s+werden gemeinsam beantwortet/i;

export function cleanText(text: string): string {
  text = text.replace(/^[﻿[ \n]+/, "");
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/­/g, "").replace(/ /g, " ").trimEnd();
    const t = line.trim();
    if (FOOTER_RE.test(t)) break;
    if (!t || PAGE_RE.test(t)) {
      if (lines.length && lines[lines.length - 1] !== "") lines.push("");
      continue;
    }
    lines.push(t);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Zeilenindex + Nummer jeder Frage; verlangt fortlaufende Nummerierung 1, 2, 3 … und ein „?“ im Block. */
function questionStarts(lines: string[]): { index: number; nr: number }[] {
  const numbered: { index: number; nr: number }[] = [];
  lines.forEach((l, index) => {
    const m = QUESTION_RE.exec(l);
    if (m) numbered.push({ index, nr: Number(m[1]) });
  });
  const starts: { index: number; nr: number }[] = [];
  let expected = 1;
  let cursor = 0;
  for (;;) {
    let found: { index: number; nr: number } | null = null;
    for (let p = cursor; p < numbered.length; p++) {
      const { index, nr } = numbered[p];
      if (nr !== expected) continue;
      let end = lines.length;
      for (let q = p + 1; q < numbered.length; q++) {
        if (numbered[q].nr === expected + 1) { end = numbered[q].index; break; }
      }
      if (lines.slice(index, end).join("\n").includes("?")) {
        found = { index, nr: expected };
        cursor = p + 1;
        break;
      }
    }
    if (!found) return starts;
    starts.push(found);
    expected++;
  }
}

type Block = { nr: number; frage: string; antwort: string; unter: string[] };

function splitQuestionAnswer(lines: string[]): Omit<Block, "nr"> {
  const question: string[] = [];
  const answer: string[] = [];
  const unter: string[] = [];
  let inQuestion = true;
  for (const line of lines) {
    const sub = SUBQUESTION_RE.exec(line);
    if (inQuestion) {
      question.push(line);
      if (sub) unter.push(sub[1]);
      if (line.trimEnd().endsWith("?")) inQuestion = false;
      continue;
    }
    if (sub && !answer.length) {
      question.push(line);
      unter.push(sub[1]);
      inQuestion = true;
      continue;
    }
    answer.push(line);
  }
  return { frage: question.join("\n").trim(), antwort: answer.join("\n").trim(), unter };
}

function blocksFor(lines: string[], starts: { index: number; nr: number }[]): Block[] {
  return starts.map((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : lines.length;
    return { nr: s.nr, ...splitQuestionAnswer(lines.slice(s.index, end)) };
  });
}

/** Fragen ohne eigene Antwort („1 und 2 werden gemeinsam beantwortet“) mit der nächsten Antwort zusammenfassen. */
function groupBlocks(blocks: Block[]): Block[][] {
  const groups: Block[][] = [];
  let pending: Block[] = [];
  for (const b of blocks) {
    if (!b.antwort) { pending.push(b); continue; }
    groups.push([...pending, b]);
    pending = [];
  }
  if (pending.length) groups.push(pending);
  return groups;
}

const label = (g: Block[]) => g.flatMap((b) => [String(b.nr), ...b.unter.map((u) => `${b.nr}${u}`)]).join(",");

/** Teilt zu lange Chunks; Kopf (Frage + „Antwort:“) steht in jedem Teil. */
export function splitLong(doc: string, max = MAX_CHARS): string[] {
  if (doc.length <= max) return [doc];
  const marker = "\nAntwort:\n";
  const at = doc.indexOf(marker);
  const plain = at < 0 || at + marker.length >= max - 2000;
  const head = plain ? "" : doc.slice(0, at + marker.length);
  const body = plain ? doc : doc.slice(at + marker.length);
  const room = max - head.length;
  const parts: string[] = [];
  for (let start = 0; start < body.length; ) {
    const end = Math.min(body.length, start + room);
    parts.push((head + body.slice(start, end)).trim());
    if (end === body.length) break;
    start = Math.max(0, end - OVERLAP);
  }
  return parts;
}

function preface(lines: string[], firstQuestionAt: number): string[] {
  const text = lines.slice(0, firstQuestionAt).join("\n");
  const headings = ["Vorbemerkung der Fragesteller", "Vorbemerkung der Bundesregierung"];
  const found: { start: number; label: string }[] = [];
  for (const h of headings) {
    const re = new RegExp([...h].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"), "i");
    const m = re.exec(text);
    if (m) found.push({ start: m.index, label: h });
  }
  found.sort((a, b) => a.start - b.start);
  const out: string[] = [];
  found.forEach((f, i) => {
    const body = text.slice(f.start, i + 1 < found.length ? found[i + 1].start : text.length).trim();
    if (body.length > f.label.length + 40) out.push(body);
  });
  return out;
}

function fallback(text: string): TextChunk[] {
  const t = text.trim();
  if (t.length <= FALLBACK_SIZE + 400) return t ? [{ content: t, typ: "text", nr: "" }] : [];
  const out: TextChunk[] = [];
  for (let i = 0; i < t.length; i += FALLBACK_STEP) out.push({ content: t.slice(i, i + FALLBACK_SIZE), typ: "text", nr: "" });
  return out;
}

export function chunkAntwort(raw: string): TextChunk[] {
  const text = cleanText(raw);
  const lines = text.split("\n");
  const starts = questionStarts(lines);
  if (!starts.length) return fallback(text);

  const out: TextChunk[] = [];
  for (const body of preface(lines, starts[0].index))
    for (const part of splitLong(body)) out.push({ content: part, typ: "vorbemerkung", nr: "" });

  for (const g of groupBlocks(blocksFor(lines, starts))) {
    const frage = g.map((b) => b.frage).join("\n\n");
    const antwort = [...g].reverse().find((b) => b.antwort)?.antwort ?? "";
    const doc = antwort ? `${frage}\n\nAntwort:\n${antwort}` : frage;
    for (const part of splitLong(doc)) out.push({ content: part, typ: "frage_antwort", nr: label(g) });
  }
  return out;
}

/** Nummern aus „Die Fragen 1 bis 3 und 5 werden gemeinsam beantwortet“. */
export function gemeinsamBeantwortet(antwort: string): number[] {
  const m = JOINT_RE.exec(antwort);
  if (!m) return [];
  const nums: number[] = [];
  for (const part of m[1].replace(/und/g, ",").split(",").map((s) => s.trim())) {
    const span = /^(\d+)\s*bis\s*(\d+)[a-z]?$/.exec(part);
    const one = /^(\d+)[a-z]?$/.exec(part);
    if (span) {
      const a = Number(span[1]), b = Number(span[2]);
      if (b >= a && b - a <= 30) for (let n = a; n <= b; n++) nums.push(n);
    } else if (one) nums.push(Number(one[1]));
  }
  return nums;
}
