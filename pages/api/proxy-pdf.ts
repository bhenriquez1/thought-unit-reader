// pages/api/proxy-pdf.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

export const config = {
  api: {
    // allow large responses (so big PDFs don't get truncated)
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

    // (Optional) basic allowlist check to avoid open proxy abuse
    // if (!url.startsWith("https://your-allowed-domain.com/")) {
    //   return res.status(403).json({ error: "Forbidden URL" });
    // }

    const upstream = await fetch(url, {
      // headers: { "User-Agent": "Thought-Unit-Reader/1.0" },
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => upstream.statusText);
      return res.status(upstream.status).send(text || "Upstream error");
    }

    const contentType = upstream.headers.get("content-type") || "application/pdf";
    res.status(upstream.status);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-store");

    // Prefer streaming -> convert Web stream to Node stream
    if (typeof (Readable as any).fromWeb === "function") {
      const webStream = upstream.body as unknown as WebReadableStream;
      const nodeStream = Readable.fromWeb(webStream);
      nodeStream.on("error", () => res.status(502).end());
      nodeStream.pipe(res);
      return;
    }

    // Fallback: buffer the whole thing (older Node)
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err: any) {
    console.error("proxy-pdf error:", err?.message || err);
    res.status(500).json({ error: "Proxy failed" });
  }
}