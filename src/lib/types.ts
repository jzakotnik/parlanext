export type Hit = {
  id: string;
  dokumentnummer: string;
  datum: string | null; // ISO
  titel: string;
  vorgangstyp: string | null;
  kfw: boolean;
  bmz: boolean;
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
  protokoll: { query: string; treffer: number }[];
  bewertung: "ki" | "heuristik";
};

export type CheckResponse = {
  fragen: FrageResult[];
  modus: { ki: boolean; datenbank: boolean };
  schwelle: number;
};

export type Filter = { kfw?: boolean; bmz?: boolean; von?: string; bis?: string; typ?: string };

export const SCHWELLE = 0.55;
