"use client";
import { useEffect, useRef } from "react";
import type { LogLevel } from "@/lib/types";

export type LogLine = { t: number; msg: string; level: LogLevel };

const ICON: Record<LogLevel, string> = { info: "›", ok: "✓", warn: "⚠" };

/** Live-Ablauf der Prüfung: zeigt, was die App gerade tut (Zerlegen, Suchen, Bewerten, Verifizieren). */
export default function LiveLog({ lines, busy }: { lines: LogLine[]; busy: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }); }, [lines.length]);
  return (
    <aside className="card livelog fade" aria-label="Live-Ablauf der Prüfung">
      <div className="livelog-head">
        <span className={`pulse ${busy ? "on" : ""}`} aria-hidden />
        <h2>Was gerade passiert</h2>
      </div>
      <div className="livelog-body" ref={box} role="log" aria-live="polite">
        {lines.length === 0 && <p className="livelog-wait">Starte …</p>}
        {lines.map((l, i) => (
          <div key={i} className={`ll ${l.level} ${busy && i === lines.length - 1 ? "active" : ""}`}>
            <span className="ll-t">{(l.t / 1000).toFixed(1).replace(".", ",")} s</span>
            <span className="ll-i" aria-hidden>{ICON[l.level]}</span>
            <span className="ll-m">{l.level === "warn" && <span className="sr">Warnung: </span>}{l.msg}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
