import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

/**
 * Nutzungsprotokoll: eine JSON-Zeile je Ereignis, auf der Konsole (pm2 logs) und in data/logs/nutzung.jsonl.
 * USAGE_LOG=off schaltet es aus; USAGE_LOG_IP=full|anon|off steuert die IP-Adresse (Standard: anon = letztes Oktett maskiert).
 * ACHTUNG: Die Texte der Anfragen werden im Klartext protokolliert – Nutzer entsprechend informieren.
 */
const aus = () => (process.env.USAGE_LOG ?? "on").toLowerCase() === "off";

export const kurz = (t: unknown, n = 1500) => {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
};

/** IP aus den Proxy-Headern (nginx: X-Forwarded-For / X-Real-IP), je nach USAGE_LOG_IP gekürzt. */
export function clientIp(req?: Request): string | undefined {
  const mode = (process.env.USAGE_LOG_IP ?? "anon").toLowerCase();
  if (mode === "off" || !req) return undefined;
  const raw = (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "").trim();
  if (!raw) return undefined;
  if (mode === "full") return raw;
  if (raw.includes(":")) return raw.split(":").slice(0, 3).join(":") + "::"; // IPv6: erste drei Blöcke
  return raw.replace(/\.\d+$/, ".0"); // IPv4: letztes Oktett maskieren
}

export function logUsage(event: string, data: Record<string, unknown>, req?: Request) {
  if (aus()) return;
  const entry = { t: new Date().toISOString(), event, ip: clientIp(req), ...data };
  console.log("[nutzung]", JSON.stringify(entry));
  try {
    const dir = path.join(env.dataDir, "logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFile(path.join(dir, "nutzung.jsonl"), JSON.stringify(entry) + "\n", () => {});
  } catch { /* Logging darf die App nie stören */ }
}
