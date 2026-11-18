import OpenAI from "openai";
import { env, hasChat, hasEmbedding } from "./env";

let client: OpenAI | null = null;
// Nur serverseitig verwenden – der Key darf nie in den Browser.
export function azure() {
  client ??= new OpenAI({ baseURL: env.endpoint, apiKey: env.apiKey });
  return client;
}

export async function embed(texts: string[]): Promise<number[][] | null> {
  if (!hasEmbedding() || texts.length === 0) return null;
  const res = await azure().embeddings.create({
    model: env.embeddingDeployment!,
    input: texts,
    dimensions: env.dimensions,
  });
  return res.data.map((d) => d.embedding);
}

export async function chatJSON<T>(system: string, user: string): Promise<T | null> {
  if (!hasChat()) return null;
  const res = await azure().chat.completions.create({
    model: env.chatDeployment!,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const raw = res.choices[0]?.message?.content;
  return raw ? (JSON.parse(raw) as T) : null;
}
