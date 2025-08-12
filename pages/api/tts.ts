// pages/api/tts.ts
import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!, // server-only
});

type Body = {
  script?: string;
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  format?: "mp3" | "wav" | "ogg";
};

const FORMAT_TO_MIME: Record<NonNullable<Body["format"]>, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Quick health check
  if (req.method === "HEAD") return res.status(200).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  }

  try {
    const { script, voice = "alloy", format = "mp3" } = (req.body || {}) as Body;

    if (!script || typeof script !== "string" || !script.trim()) {
      return res.status(400).json({ error: "Bad request: 'script' must be a non-empty string." });
    }

    const fmt = (format || "mp3").toLowerCase() as Body["format"];
    const mime = FORMAT_TO_MIME[fmt] || "audio/mpeg";

    // Generate audio with OpenAI (Node SDK v5)
    const speech = await openai.audio.speech.create({
      model: "tts-1", // or "gpt-4o-mini-tts" if enabled for your org
      voice,
      input: script,
      // @ts-expect-error: the SDK accepts `format`; typings may lag
      format: fmt,
    });

    const buffer = Buffer.from(await speech.arrayBuffer());

    // If client asked JSON, return base64 + mime (handy for fetch(...).json())
    const wantsJSON =
      req.headers.accept?.includes("application/json") ||
      (typeof req.query.return === "string" && req.query.return.toLowerCase() === "json");

    if (wantsJSON) {
      return res.status(200).json({ audioBase64: buffer.toString("base64"), mimeType: mime });
    }

    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Length", buffer.length.toString());
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(buffer);
  } catch (err: any) {
    console.error("TTS API error:", err?.message || err);
    return res.status(500).json({ error: "TTS generation failed" });
  }
}