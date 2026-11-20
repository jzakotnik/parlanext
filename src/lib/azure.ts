import OpenAI from "openai";
import { env, hasChat, hasEmbedding } from "./env";
import { dlog } from "./debug";

const zahl = (name: string, std: number) => (Number(process.env[name]) > 0 ? Number(process.env[name]) : std);
// Zeitlimits je Aufruf, bewusst großzügig: ein langsamer, aber gesunder Aufruf soll nie abgeschnitten werden.
// Ohne Limit hängt ein Aufruf, bis Node nach 5 Minuten (undici headersTimeout) selbst aufgibt – deshalb liegt auch
// das Chat-Limit knapp darunter; ein höherer Wert hätte keine Wirkung.
const EMBED_TIMEOUT = zahl("AZURE_EMBED_TIMEOUT_MS", 120000);
const CHAT_TIMEOUT = zahl("AZURE_CHAT_TIMEOUT_MS", 290000);

let client: OpenAI | null = null;
// Nur serverseitig verwenden – der Key darf nie in den Browser.
export function azure() {
  client ??= new OpenAI({ baseURL: env.endpoint, apiKey: env.apiKey, maxRetries: 0 });
  return client;
}

/** Führt einen Aufruf aus und protokolliert Start, Ende, Dauer, Fehler – und meldet alle 15 s, solange er hängt. */
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  dlog(`${label} → gesendet`);
  const watch = setInterval(() => dlog(`${label} läuft seit ${Math.round((Date.now() - t0) / 1000)} s noch …`, "warn"), 15000);
  try {
    const r = await fn();
    dlog(`${label} ← ok nach ${Date.now() - t0} ms`);
    return r;
  } catch (e: any) {
    dlog(`${label} ✗ nach ${Date.now() - t0} ms: ${e?.constructor?.name ?? "Fehler"}${e?.status ? ` HTTP ${e.status}` : ""}: ${String(e?.message ?? e).slice(0, 200)}`, "error");
    throw e;
  } finally { clearInterval(watch); }
}

const istVerbindungsfehler = (e: any) => e instanceof OpenAI.APIConnectionError || (typeof e?.status === "number" && (e.status === 429 || e.status >= 500));

export async function embed(texts: string[]): Promise<number[][] | null> {
  if (!hasEmbedding() || texts.length === 0) return null;
  const chars = texts.reduce((a, t) => a + t.length, 0);
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await timed(`Embedding (${texts.length} Text, ${chars} Zeichen)${attempt ? ` Versuch ${attempt + 1}` : ""}`, () =>
        azure().embeddings.create({ model: env.embeddingDeployment!, input: texts, dimensions: env.dimensions }, { timeout: EMBED_TIMEOUT }));
      return res.data.map((d) => d.embedding);
    } catch (e) {
      if (attempt === 0 && istVerbindungsfehler(e)) { dlog("Embedding wird einmal wiederholt …", "warn"); continue; }
      throw e;
    }
  }
}

export async function chatJSON<T>(system: string, user: string): Promise<T | null> {
  if (!hasChat()) return null;
  const res = await timed(`Chat ${env.chatDeployment} (${system.length + user.length} Zeichen Eingabe)`, () =>
    azure().chat.completions.create({
      model: env.chatDeployment!,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }, { timeout: CHAT_TIMEOUT }));
  const choice = res.choices[0];
  dlog(`Chat-Antwort: finish_reason=${choice?.finish_reason}, Token ein/aus=${res.usage?.prompt_tokens ?? "?"}/${res.usage?.completion_tokens ?? "?"}, ${choice?.message?.content?.length ?? 0} Zeichen`);
  const raw = choice?.message?.content;
  if (!raw) dlog("Chat lieferte keinen Inhalt (finish_reason siehe oben)", "warn");
  return raw ? (JSON.parse(raw) as T) : null;
}
