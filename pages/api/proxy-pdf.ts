// pages/api/proxy-pdf.ts
const DEV = process.env.NODE_ENV === "development";

import type { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "node:stream";

export const config = {
  api: { responseLimit: false }, // big PDFs welcome
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const urlParam =
      (typeof req.query.url === "string" && req.query.url) ||
      (typeof req.body?.url === "string" && req.body.url);

    if (!urlParam) return res.status(400).json({ error: "Missing ?url=<pdf url>" });

    // Basic validation — only http(s)
    let parsed: URL;
    try {
      parsed = new URL(urlParam);
      if (!/^https?:$/i.test(parsed.protocol)) throw new Error("Only http(s) allowed");
    } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }

    const upstream = await fetch(parsed.toString(), {
      redirect: "follow",
      cache: "no-store",
      headers: {
        // Some hosts block generic fetch; pretend to be a browser
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
        Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
      },
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => upstream.statusText);
      return res.status(upstream.status).send(text || "Upstream error");
    }

    // Forward key headers
    const ct = upstream.headers.get("content-type") || "application/pdf";
    const cl = upstream.headers.get("content-length");
    res.status(upstream.status);
    res.setHeader("Content-Type", ct);
    if (cl) res.setHeader("Content-Length", cl);
    res.setHeader("Cache-Control", "no-store");      // easier debugging; change if you want caching
    res.setHeader("Content-Disposition", "inline");  // display in browser

    // Stream WebReadable → Node stream if available
    const fromWeb: any = (Readable as any).fromWeb;
    if (typeof fromWeb === "function" && upstream.body) {
      const nodeStream = fromWeb(upstream.body as any);
      nodeStream.on("error", () => res.status(502).end());
      nodeStream.pipe(res);
      return;
    }

    // Fallback: buffer then send
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err: any) {
    DEV && console.error("proxy-pdf error:", err?.message || err);
    res.status(500).json({ error: "Proxy failed" });
  }
}