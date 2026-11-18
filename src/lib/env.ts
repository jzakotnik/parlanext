export const env = {
  databaseUrl: process.env.DATABASE_URL,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  chatDeployment: process.env.AZURE_CHAT_DEPLOYMENT,
  embeddingDeployment: process.env.AZURE_EMBEDDING_DEPLOYMENT,
  dimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? 1536),
};
export const hasAzure = () => Boolean(env.endpoint && env.apiKey);
export const hasChat = () => hasAzure() && Boolean(env.chatDeployment);
export const hasEmbedding = () => hasAzure() && Boolean(env.embeddingDeployment);
export const hasDb = () => Boolean(env.databaseUrl);
