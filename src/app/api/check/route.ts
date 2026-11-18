import { NextResponse } from "next/server";
import { pruefe } from "@/lib/check";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.text && !body.fragen) return NextResponse.json({ error: "Kein Text" }, { status: 400 });
    return NextResponse.json(await pruefe({ ...body, text: String(body.text ?? "").slice(0, 12000) }));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Prüfung fehlgeschlagen" }, { status: 500 });
  }
}
