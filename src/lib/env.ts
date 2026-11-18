import fs from "node:fs";
import path from "node:path";

export const env = {
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  chatDeployment: process.env.AZURE_CHAT_DEPLOYMENT,
  embeddingDeployment: process.env.AZURE_EMBEDDING_DEPLOYMENT,
  dimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? 1536),
  dataDir: path.resolve(process.env.DATA_DIR ?? "data"),
};
export const hasAzure = () => Boolean(env.endpoint && env.apiKey);
export const hasChat = () => hasAzure() && Boolean(env.chatDeployment);
export const hasEmbedding = () => hasAzure() && Boolean(env.embeddingDeployment);
/** true, sobald ein Suchindex (npm run ingest) vorhanden ist */
export const hasIndex = () => fs.existsSync(path.join(env.dataDir, "index", "manifest.json"));

const zahl = (name: string, std: number, min = 1, max = 1000) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= min ? Math.min(Math.floor(n), max) : std;
};
/** Obergrenzen (Anzahl Dokumente); jeweils per Umgebungsvariable änderbar, siehe README */
export const limits = {
  proSuche: zahl("CHECK_PRO_SUCHE", 20),      // Treffer je Suchanfrage im Anfragen-Check
  maxTreffer: zahl("CHECK_MAX_TREFFER", 50),   // Fundstellen je Einzelfrage insgesamt
  anzeige: zahl("CHECK_ANZEIGE", 20),          // zuerst angezeigt (und Schrittweite von „Weitere anzeigen“)
  bewertet: zahl("CHECK_BEWERTET", 6, 1, 15),  // so viele Treffer bewertet GPT (kostet Token)
  sucheMax: zahl("SUCHE_MAX", 100),            // Maximum auf „Antworten durchsuchen“
};
