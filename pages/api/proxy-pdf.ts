// pages/api/proxy-pdf.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "node:stream";

export const config = {
  api: {
    // allow large responses so big PDFs aren’t truncated
    responseLimit: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const url =
      (typeof req.query.url === "string" && req.query.url) ||
      (typeof req.body?.url === "string" && req.body.url);

    if (!url) {
      return res.status(400).json({ error: "Missing ?url=<pdf url>" });
    }

    // (Optional) basic allowlist to avoid open proxy abuse
    // if (!url.startsWith("https://your-allowed-host.com/")) {
    //   return res.status(403).json({ error: "Forbidden URL" });
    // }

    const upstream = await fetch(url, { redirect: "follow" });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => upstream.statusText);
      return res.status(upstream.status).send(text || "Upstream error");
    }

    const contentType = upstream.headers.get("content-type") || "application/pdf";
    res.status(upstream.status);
    res.setHeader("Content-Type", contentType);
    // cache a bit so repeat views are fast (tweak as you like)
    res.setHeader("Cache-Control", "public, max-age=600");

    // Prefer streaming if Node exposes Readable.fromWeb
    const fromWeb = (Readable as any).fromWeb as
      | ((webStream: any) => NodeJS.ReadableStream)
      | undefined;

    if (fromWeb && upstream.body) {
      const nodeStream = fromWeb(upstream.body as any);
      nodeStream.on("error", () => res.status(502).end());
      nodeStream.pipe(res);
      return;
    }

    // Fallback: buffer the whole file (older Node / environments)
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err: any) {
    console.error("proxy-pdf error:", err?.message || err);
    res.status(500).json({ error: "Proxy failed" });
  }
}