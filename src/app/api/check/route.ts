import { NextResponse } from "next/server";
import { pruefe } from "@/lib/check";

export const maxDuration = 120;

/**
 * POST { text | fragen, filter, stream? }
 * Mit stream:true kommt NDJSON: {"type":"log",msg,level} … dann {"type":"result",data} (oder {"type":"error",msg}).
 */
export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 }); }
  if (!body.text && !body.fragen) return NextResponse.json({ error: "Kein Text" }, { status: 400 });
  const input = { ...body, text: String(body.text ?? "").slice(0, 12000) };

  if (!body.stream) {
    try { return NextResponse.json(await pruefe(input)); }
    catch (e) { console.error(e); return NextResponse.json({ error: "Prüfung fehlgeschlagen" }, { status: 500 }); }
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => { try { controller.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch { /* Client weg */ } };
      // Lange GPT-Aufrufe liefern minutenlang keine Meldung: ein Ping alle 8 s hält die Verbindung offen
      // (sonst trennen Proxys wie nginx nach 60 s Stille, ohne dass jemand einen Fehler sieht).
      const ping = setInterval(() => send({ type: "ping" }), 8000);
      try {
        const data = await pruefe(input, (msg, level) => send({ type: "log", msg, level: level ?? "info" }));
        send({ type: "result", data });
      } catch (e) {
        console.error(e);
        send({ type: "error", msg: "Prüfung fehlgeschlagen" });
      } finally { clearInterval(ping); controller.close(); }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
