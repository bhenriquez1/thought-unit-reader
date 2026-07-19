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

// ---------------------------------------------------------------------------
// Text preprocessing for TTS
// ---------------------------------------------------------------------------

/**
 * General TTS preprocessing — fixes OCR artifacts, ligatures, punctuation, and
 * common abbreviations that cause bad TTS pauses.
 */
function preprocessForTTS(text: string): string {
  let out = text;

  // Fix OCR drop caps: standalone capital letter followed by space + word
  // e.g. "T he cell" → "The cell"
  out = out.replace(/\b([A-Z]) ([a-z])/g, "$1$2");

  // Normalize ligatures
  out = out.replace(/ﬃ/g, "ffi");
  out = out.replace(/ﬄ/g, "ffl");
  out = out.replace(/ﬁ/g, "fi");
  out = out.replace(/ﬂ/g, "fl");
  out = out.replace(/ﬀ/g, "ff");

  // Remove soft hyphens (U+00AD)
  out = out.replace(/­/g, "");

  // Normalize em/en dashes to spaced em dash
  out = out.replace(/\s*[–—]\s*/g, " — ");

  // Fix common abbreviations that cause bad TTS pauses
  out = out.replace(/\be\.g\./g, "for example");
  out = out.replace(/\bi\.e\./g, "that is");
  out = out.replace(/\bvs\./g, "versus");
  out = out.replace(/\bFig\./g, "Figure");
  out = out.replace(/\bet al\./g, "and colleagues");

  // Semicolons → commas (shorter pause)
  out = out.replace(/ ; /g, ", ");

  // Collapse multiple spaces
  out = out.replace(/ {2,}/g, " ");

  return out;
}

/**
 * Browser TTS preprocessing — applies general preprocessing then also softens
 * sentence-ending periods into commas to reduce the long pause browsers insert
 * at full stops.
 */
function preprocessForBrowserTTS(text: string): string {
  let out = preprocessForTTS(text);

  // Replace sentence-ending ". " with ", " to reduce long pauses in browser TTS
  out = out.replace(/\. /g, ", ");

  return out;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!process.env.OPENAI_API_KEY) {
    console.error("[OPENAI_API_KEY_MISSING] Set OPENAI_API_KEY in .env.local");
  }
  // Quick health check
  if (req.method === "HEAD") return res.status(200).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { script, voice = "alloy", format = "mp3" } = (req.body || {}) as Body;

  if (!script || typeof script !== "string" || !script.trim()) {
    return res.status(400).json({ error: "Bad request: 'script' must be a non-empty string." });
  }

  // Check if OpenAI API key is available and valid
  const hasValidOpenAIKey =
    process.env.OPENAI_API_KEY &&
    process.env.OPENAI_API_KEY.startsWith("sk-") &&
    process.env.OPENAI_API_KEY.length > 20;

  if (!hasValidOpenAIKey) {
    // DIAGNOSTIC: key missing or invalid — browser fallback will fire
    console.log("[OPENAI_SPEECH_SKIP]", {
      reason: "OPENAI_API_KEY missing or invalid",
      hasKey: !!process.env.OPENAI_API_KEY,
      keyPrefix: process.env.OPENAI_API_KEY
        ? process.env.OPENAI_API_KEY.slice(0, 7) + "…"
        : null,
      fallback: "browser-speech",
      scriptChars: script.length,
      voice,
    });

    const processedScript = preprocessForBrowserTTS(script);
    console.log("[SPEECH_TEXT_PREPROCESSED]", {
      inputChars: script.length,
      outputChars: processedScript.length,
      provider: "browser",
    });
    console.log("[SPEECH_FALLBACK_USED]", {
      provider: "browser",
      fallbackReason: "openai-key-missing",
      scriptChars: script.length,
    });

    return res.status(200).json({
      useBrowserSpeech: true,
      provider: "browser",
      fallbackReason: "openai-key-missing",
      script: processedScript,
      voice,
    });
  }

  try {
    const fmt = (format || "mp3").toLowerCase() as NonNullable<Body["format"]>;
    const mime = FORMAT_TO_MIME[fmt] || "audio/mpeg";

    console.log("[OPENAI_SPEECH_START]", { scriptChars: script.length, voice, format: fmt });

    const ttsInput = preprocessForTTS(script);
    console.log("[SPEECH_TEXT_PREPROCESSED]", {
      inputChars: script.length,
      outputChars: ttsInput.length,
      provider: "openai",
    });

    // Generate audio with OpenAI (Node SDK v5)
    const speech = await openai.audio.speech.create({
      model: "tts-1", // or "gpt-4o-mini-tts" if enabled for your org
      voice,
      input: ttsInput,
      // @ts-expect-error: the SDK accepts `format`; typings may lag
      format: fmt,
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    console.log("[OPENAI_SPEECH_DONE]", {
      audioBytes: buffer.length,
      mimeType: mime,
      provider: "openai",
    });

    // If client asked JSON, return base64 + mime (handy for fetch(...).json())
    const wantsJSON = req.headers.accept?.includes("application/json");

    if (wantsJSON) {
      return res
        .status(200)
        .json({ audioBase64: buffer.toString("base64"), mimeType: mime, provider: "openai" });
    }

    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Length", buffer.length.toString());
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(buffer);
  } catch (err: any) {
    console.error("[OPENAI_SPEECH_ERROR]", {
      error: err?.message ?? String(err),
      fallback: "browser-speech",
    });
    console.error("TTS API error:", err?.message || err);

    const processedScript = preprocessForBrowserTTS(script);
    console.log("[SPEECH_TEXT_PREPROCESSED]", {
      inputChars: script.length,
      outputChars: processedScript.length,
      provider: "browser",
    });
    console.log("[SPEECH_FALLBACK_USED]", {
      provider: "browser",
      fallbackReason: "openai-error",
      scriptChars: script.length,
    });

    return res.status(200).json({
      useBrowserSpeech: true,
      provider: "browser",
      fallbackReason: "openai-error",
      script: processedScript,
      voice,
    });
  }
}
