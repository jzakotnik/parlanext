import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Anfragen-Check",
    short_name: "Anfragen-Check",
    description: "Prüfen, ob eine parlamentarische Anfrage schon einmal von der Bundesregierung beantwortet wurde.",
    lang: "de",
    start_url: "/",
    display: "standalone",
    background_color: "#eef3fb",
    theme_color: "#062254",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
