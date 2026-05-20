// pages/api/resolveVideoLinks.ts
import type { NextApiRequest, NextApiResponse } from "next";

interface VideoLink {
  query: string;
  title: string;
  videoId: string;
  url: string;
  channelTitle: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { queries } = req.body as { queries?: string[] };
  if (!Array.isArray(queries) || !queries.length) {
    return res.status(400).json({ error: "queries array required" });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    // No API key — return empty so UI falls back to search links
    return res.status(200).json({ links: [] });
  }

  const results: VideoLink[] = [];

  for (const query of queries.slice(0, 5)) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(query)}&key=${apiKey}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!resp.ok) continue;
      const data = await resp.json();
      const item = data.items?.[0];
      if (!item) continue;
      results.push({
        query,
        title: item.snippet.title,
        videoId: item.id.videoId,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        channelTitle: item.snippet.channelTitle,
      });
    } catch {
      // Skip this query on error
    }
  }

  res.status(200).json({ links: results });
}
