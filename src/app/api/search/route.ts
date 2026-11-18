import { NextResponse } from "next/server";
import { searchAntworten } from "@/lib/search";
import { hasDb } from "@/lib/env";

export async function POST(req: Request) {
  try {
    const { query = "", filter = {}, limit = 12 } = await req.json();
    const hits = await searchAntworten(String(query).slice(0, 500), filter, Math.min(Number(limit) || 12, 30));
    return NextResponse.json({ hits, demo: !hasDb() });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Suche fehlgeschlagen" }, { status: 500 });
  }
}
