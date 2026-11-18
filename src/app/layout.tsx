import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { hasIndex } from "@/lib/env";

export const metadata: Metadata = {
  title: "Anfragen-Check – Parlamentarische Anfragen zur KfW Entwicklungsbank",
  description: "Prüfen, ob eine parlamentarische Anfrage bereits von der Bundesregierung beantwortet wurde.",
  // Keine Indexierung, kein Folgen von Links, keine Archivkopien, Snippets oder Bildindexierung
  robots: {
    index: false,
    follow: false,
    nocache: true,
    noarchive: true,
    nosnippet: true,
    noimageindex: true,
    googleBot: { index: false, follow: false, noarchive: true, nosnippet: true, noimageindex: true },
  },
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef2fb" },
    { media: "(prefers-color-scheme: dark)", color: "#062254" },
  ],
};
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <div className="wrap">
          <Nav />
          {!hasIndex() && (
            <div className="banner" role="status">
              <span aria-hidden>⚠︎</span>
              <span><b>Demo-Modus:</b> Es ist noch kein Suchindex vorhanden (npm run ingest). Angezeigt werden fiktive Beispieldaten – siehe README zur Einrichtung.</span>
            </div>
          )}
          {children}
        </div>
      </body>
    </html>
  );
}
