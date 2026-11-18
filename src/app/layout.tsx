import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { hasDb } from "@/lib/env";

export const metadata: Metadata = {
  title: "Anfragen-Check – Parlamentarische Anfragen zur KfW Entwicklungsbank",
  description: "Prüfen, ob eine parlamentarische Anfrage bereits von der Bundesregierung beantwortet wurde.",
};
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <div className="wrap">
          <Nav />
          {!hasDb() && (
            <div className="banner" role="status">
              <span aria-hidden>⚠︎</span>
              <span><b>Demo-Modus:</b> Es ist keine Datenbank verbunden. Angezeigt werden fiktive Beispieldaten – siehe README zur Einrichtung.</span>
            </div>
          )}
          {children}
        </div>
      </body>
    </html>
  );
}
