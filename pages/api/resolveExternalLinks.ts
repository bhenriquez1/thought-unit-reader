// pages/api/resolveExternalLinks.ts
// Resolves OpenAI-generated study link specs to exact article URLs via Wikipedia API.
// Returns only confirmed, exact URLs — items that cannot be resolved are omitted entirely.
// No API key required: uses Wikipedia's public OpenSearch API.

const DEV = process.env.NODE_ENV === "development";

import type { NextApiRequest, NextApiResponse } from "next";

interface LinkInput {
  label: string;
  searchQuery: string;
  type: string;
}

interface ResolvedLink {
  label: string;
  url: string;
  title: string;
  source: string;
}

const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";

async function resolveViaWikipedia(query: string, signal: AbortSignal): Promise<{ url: string; title: string } | null> {
  const url = `${WIKIPEDIA_API}?action=opensearch&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json&redirects=resolve`;
  const resp = await fetch(url, { signal });
  if (!resp.ok) return null;
  const data = await resp.json() as [string, string[], string[], string[]];
  const title = data[1]?.[0];
  const articleUrl = data[3]?.[0];
  if (title && articleUrl && articleUrl.startsWith("https://en.wikipedia.org/wiki/")) {
    return { url: articleUrl, title };
  }
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "HEAD") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const { links } = req.body as { links?: LinkInput[] };
  if (!Array.isArray(links) || !links.length) {
    return res.status(400).json({ error: "links array required" });
  }

  const resolved: ResolvedLink[] = [];
  const controller = new AbortController();
  // Overall 8s budget for all resolutions
  const timer = setTimeout(() => controller.abort(), 8_000);

  try {
    for (const link of links.slice(0, 5)) {
      if (controller.signal.aborted) break;
      try {
        const result = await resolveViaWikipedia(link.searchQuery, controller.signal);
        if (result) {
          resolved.push({ label: link.label, url: result.url, title: result.title, source: "wikipedia" });
        }
        // No fallback — omit items that cannot be resolved to exact URLs
      } catch {
        // Skip this link on timeout or network error
      }
    }
  } finally {
    clearTimeout(timer);
  }

  DEV && console.log("[RESOLVE_EXT:done]", {
    input: links.length,
    resolved: resolved.length,
    labels: resolved.map((r) => r.label),
  });

  return res.status(200).json({ resolved });
}
