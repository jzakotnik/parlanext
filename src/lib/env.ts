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
