// pages/api/tts.ts
const DEV = process.env.NODE_ENV === "development";
import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import type { SpeechContentRole } from "@/lib/speech/speechContentRole";

type Body = {
  script?: string;
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  format?: "mp3" | "wav" | "ogg";
  contentRole?: SpeechContentRole;
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
    DEV && console.error("[OPENAI_API_KEY_MISSING] Set OPENAI_API_KEY in .env.local");
  }
  // Quick health check
  if (req.method === "HEAD") return res.status(200).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    script,
    voice = "alloy",
    format = "mp3",
    contentRole = "PROFESSOR_EXPLANATION",
  } = (req.body || {}) as Body;

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
    DEV && console.log("[OPENAI_SPEECH_SKIP]", {
      reason: "OPENAI_API_KEY missing or invalid",
      hasKey: !!process.env.OPENAI_API_KEY,
      keyPrefix: process.env.OPENAI_API_KEY
        ? process.env.OPENAI_API_KEY.slice(0, 7) + "…"
        : null,
      fallback: "browser-speech",
      scriptChars: script.length,
      voice,
    });

    const processedScript = contentRole === "SOURCE_VERBATIM"
      ? script
      : preprocessForBrowserTTS(script);
    DEV && console.log("[SPEECH_TEXT_PREPROCESSED]", {
      inputChars: script.length,
      outputChars: processedScript.length,
      provider: "browser",
    });
    DEV && console.log("[SPEECH_FALLBACK_USED]", {
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

    DEV && console.log("[OPENAI_SPEECH_START]", { scriptChars: script.length, voice, format: fmt });

    const ttsInput = contentRole === "SOURCE_VERBATIM"
      ? script
      : preprocessForTTS(script);
    DEV && console.log("[SPEECH_TEXT_PREPROCESSED]", {
      inputChars: script.length,
      outputChars: ttsInput.length,
      provider: "openai",
    });

    // Constructed here, not at module scope — the OpenAI SDK throws
    // synchronously in its constructor when apiKey is empty, which used to
    // crash this whole module (and every /api/tts request, a 500 instead of
    // the graceful useBrowserSpeech fallback below) on any deployment where
    // OPENAI_API_KEY is entirely unset. hasValidOpenAIKey above already
    // guarantees a real key by the time this line runs.
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    // Generate audio with OpenAI (Node SDK v5)
    const speech = await openai.audio.speech.create({
      model: "tts-1", // or "gpt-4o-mini-tts" if enabled for your org
      voice,
      input: ttsInput,
      // @ts-expect-error: the SDK accepts `format`; typings may lag
      format: fmt,
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    DEV && console.log("[OPENAI_SPEECH_DONE]", {
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
    DEV && console.error("[OPENAI_SPEECH_ERROR]", {
      error: err?.message ?? String(err),
      fallback: "browser-speech",
    });
    DEV && console.error("TTS API error:", err?.message || err);

    const processedScript = contentRole === "SOURCE_VERBATIM"
      ? script
      : preprocessForBrowserTTS(script);
    DEV && console.log("[SPEECH_TEXT_PREPROCESSED]", {
      inputChars: script.length,
      outputChars: processedScript.length,
      provider: "browser",
    });
    DEV && console.log("[SPEECH_FALLBACK_USED]", {
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
