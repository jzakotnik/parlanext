import { NextResponse } from "next/server";
import { searchAntworten } from "@/lib/search";
import { hasIndex, limits } from "@/lib/env";
import { kurz, logUsage } from "@/lib/usage";

export async function POST(req: Request) {
  try {
    const { query = "", filter = {}, limit = 12 } = await req.json();
    const hits = await searchAntworten(String(query).slice(0, 500), filter, Math.min(Number(limit) || 12, limits.sucheMax));
    logUsage("suche", { query: kurz(query, 300), filter, treffer: hits.length }, req);
    return NextResponse.json({ hits, demo: !hasIndex(), max: limits.sucheMax });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Suche fehlgeschlagen" }, { status: 500 });
  }
}
