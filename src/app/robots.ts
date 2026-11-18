import type { MetadataRoute } from "next";

// Suchmaschinen- und KI-Crawler ausschließen. Wirkt nur bei Crawlern, die robots.txt beachten;
// zusätzlich setzen Meta-Tag und X-Robots-Tag-Header (siehe layout.tsx / next.config.mjs) "noindex".
const KI_CRAWLER = [
  "GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-Web", "anthropic-ai", "Google-Extended",
  "CCBot", "PerplexityBot", "Bytespider", "Amazonbot", "Applebot-Extended", "FacebookBot", "meta-externalagent",
  "cohere-ai", "Diffbot", "ImagesiftBot", "omgili", "YouBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", disallow: "/" },
      ...KI_CRAWLER.map((userAgent) => ({ userAgent, disallow: "/" })),
    ],
  };
}
