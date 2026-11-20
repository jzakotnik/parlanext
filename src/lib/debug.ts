import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Ausführliches Server-Log (pm2 logs). Jede Zeile trägt die Anfrage-ID und die Sekunden seit Start der Anfrage,
 * damit sich Hänger zuordnen lassen: [check a1b2c3 +12.4s] Embedding … ← ok nach 310 ms
 * DEBUG_LOG=off schaltet es ab.
 */
const als = new AsyncLocalStorage<{ tag: string; id: string; t0: number }>();
const aus = () => (process.env.DEBUG_LOG ?? "on").toLowerCase() === "off";

export const withRequest = <T>(tag: string, fn: () => T): T =>
  als.run({ tag, id: Math.random().toString(16).slice(2, 8), t0: Date.now() }, fn);

export function dlog(msg: string, level: "info" | "warn" | "error" = "info") {
  if (aus()) return;
  const s = als.getStore();
  const prefix = s ? `[${s.tag} ${s.id} +${((Date.now() - s.t0) / 1000).toFixed(1)}s]` : "[app]";
  (level === "info" ? console.log : level === "warn" ? console.warn : console.error)(`${prefix} ${msg}`);
}
