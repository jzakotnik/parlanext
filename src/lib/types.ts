export type Hit = {
  id: string;
  dokumentnummer: string;
  datum: string | null; // ISO
  titel: string;
  vorgangstyp: string | null;
  tags: { id: string; label: string }[];
  pdf_url: string | null;
  passage: string;
  relevanz: number; // 0..1
  demo?: boolean;
};

export type Status = "beantwortet" | "teilweise" | "nichts";

export type FrageResult = {
  id: string;
  text: string;
  entitaeten: string[];
  varianten: string[];
  status: Status;
  begruendung: string;
  beleg: { hitId: string; zitat: string } | null;
  treffer: Hit[];
  protokoll: { query: string; treffer: number; folgesuche?: boolean }[];
  bewertung: "ki" | "heuristik";
  /** Aspekte der Frage, die die gefundenen Antworten nicht abdecken (nur bei teilweise/nichts, nur mit KI). */
  offen?: string[];
};

export type CheckResponse = {
  fragen: FrageResult[];
  modus: { ki: boolean; datenbank: boolean };
  schwelle: number;
  limits: { anzeige: number; max: number };
};

export type Filter = { tags?: string[]; von?: string; bis?: string; typ?: string };

export const SCHWELLE = 0.55;

/** Fortschrittsmeldung der Prüfung (wird live an die Oberfläche gestreamt). */
export type LogLevel = "info" | "ok" | "warn";
export type Emit = (msg: string, level?: LogLevel) => void;
