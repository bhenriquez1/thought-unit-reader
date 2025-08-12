// pages/api/proxy-pdf.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "node:stream";

// Allow large files
export const config = { api: { responseLimit: false } };

const PASS_HEADERS = [
  "content-type",
  "content-length",
  "accept-ranges",
  "content-range",
  "last-modified",
  "etag",
  "cache-control",
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const src = typeof req.query.src === "string" ? req.query.src : "";
  if (!src) {
    res.status(400).json({ error: "Missing ?src=<PDF URL>" });
    return;
  }

  try {
    // Forward the original Range header for streaming/seek support.
    const headers: Record<string, string> = {};
    if (req.headers.range) headers["range"] = String(req.headers.range);

    // HEAD/GET passthrough only
    const method = req.method === "HEAD" ? "HEAD" : "GET";
    const upstream = await fetch(src, { method, headers });

    if (!upstream.ok && upstream.status !== 206) {
      res.status(upstream.status).end(await upstream.text());
      return;
    }

    // Copy useful headers from the upstream response
    PASS_HEADERS.forEach((h) => {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    });

    // Encourage CDN/proxy caching (tweak to taste)
    if (!res.getHeader("cache-control")) {
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=600");
    }

    // Stream body to the client (works for both 200 and 206)
    if (method === "HEAD" || !upstream.body) {
      res.status(upstream.status).end();
      return;
    }

    // Convert Web ReadableStream → Node stream
    const nodeStream = Readable.fromWeb(upstream.body as unknown as ReadableStream);
    res.status(upstream.status);
    nodeStream.pipe(res);
  } catch (err: any) {
    console.error("proxy-pdf error:", err?.message || err);
    res.status(502).json({ error: "Failed to fetch PDF" });
  }
}