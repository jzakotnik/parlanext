/** @type {import('next').NextConfig} */
export default {
  serverExternalPackages: ["pg"],
  // Auch für PDFs, API-Antworten und Icons: nicht indexieren, nicht archivieren
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex" }],
      },
    ];
  },
};
