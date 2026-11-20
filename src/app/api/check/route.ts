import { NextResponse } from "next/server";
import { pruefe } from "@/lib/check";
import { kurz, logUsage } from "@/lib/usage";
import { dlog, withRequest } from "@/lib/debug";

export const maxDuration = 120;

/**
 * POST { text | fragen, filter, stream? }
 * Mit stream:true kommt NDJSON: {"type":"log",msg,level} … dann {"type":"result",data} (oder {"type":"error",msg}).
 */
export async function POST(req: Request) {
  return withRequest("check", () => handle(req));
}

async function handle(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 }); }
  if (!body.text && !body.fragen) return NextResponse.json({ error: "Kein Text" }, { status: 400 });
  const input = { ...body, text: String(body.text ?? "").slice(0, 12000) };
  const t0 = Date.now();
  dlog(`Prüfung gestartet: ${body.text ? `${String(body.text).length} Zeichen` : `Neusuche mit ${body.fragen?.[0]?.varianten?.length ?? 0} Varianten`}${body.filter && Object.keys(body.filter).length ? `, Filter ${JSON.stringify(body.filter)}` : ""}`);
  const neusuche = !body.text && Array.isArray(body.fragen);
  logUsage(neusuche ? "check_neusuche" : "check_start", neusuche
    ? { frage: kurz(body.fragen?.[0]?.text), varianten: body.fragen?.[0]?.varianten?.length ?? 0, filter: body.filter }
    : { text: kurz(input.text), zeichen: input.text.length, filter: body.filter }, req);
  const fertig = (data: Awaited<ReturnType<typeof pruefe>>) =>
    logUsage("check_fertig", {
      dauer_ms: Date.now() - t0, ki: data.modus.ki,
      fragen: data.fragen.map((f) => ({ frage: kurz(f.text, 200), status: f.status, treffer: f.treffer.length, bewertung: f.bewertung, beleg: f.beleg ? f.treffer.find((h) => h.id === f.beleg!.hitId)?.dokumentnummer : undefined })),
    }, req);

  if (!body.stream) {
    try { const data = await pruefe(input); fertig(data); return NextResponse.json(data); }
    catch (e) { console.error(e); logUsage("check_fehler", { dauer_ms: Date.now() - t0, fehler: String((e as Error)?.message ?? e).slice(0, 300) }, req); return NextResponse.json({ error: "Prüfung fehlgeschlagen" }, { status: 500 }); }
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => { try { controller.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch { /* Client weg */ } };
      // Lange GPT-Aufrufe liefern minutenlang keine Meldung: ein Ping alle 8 s hält die Verbindung offen
      // (sonst trennen Proxys wie nginx nach 60 s Stille, ohne dass jemand einen Fehler sieht).
      const ping = setInterval(() => send({ type: "ping" }), 8000);
      try {
        const data = await pruefe(input, (msg, level) => { send({ type: "log", msg, level: level ?? "info" }); dlog(`» ${msg}`, level === "warn" ? "warn" : "info"); });
        send({ type: "result", data });
        dlog(`Prüfung beendet nach ${Date.now() - t0} ms: ${data.fragen.map((f) => f.status).join(", ")}`);
        fertig(data);
      } catch (e) {
        console.error(e);
        logUsage("check_fehler", { dauer_ms: Date.now() - t0, fehler: String((e as Error)?.message ?? e).slice(0, 300) }, req);
        send({ type: "error", msg: "Prüfung fehlgeschlagen" });
      } finally { clearInterval(ping); controller.close(); }
    },
    cancel() { dlog(`Client hat die Verbindung getrennt (Browser geschlossen, Nginx-Timeout oder Abbruch) nach ${Date.now() - t0} ms`, "warn"); },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
