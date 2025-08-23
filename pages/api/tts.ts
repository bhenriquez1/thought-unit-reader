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

  const { script, voice = "alloy", format = "mp3" } = (req.body || {}) as Body;

  if (!script || typeof script !== "string" || !script.trim()) {
    return res.status(400).json({ error: "Bad request: 'script' must be a non-empty string." });
  }

  // Check if OpenAI API key is available and valid
  const hasValidOpenAIKey = process.env.OPENAI_API_KEY && 
                            process.env.OPENAI_API_KEY.startsWith('sk-') && 
                            process.env.OPENAI_API_KEY.length > 20;

  if (!hasValidOpenAIKey) {
    // Fallback: Return instructions to use enhanced browser speech synthesis
    console.log("🎵 OpenAI TTS not available, falling back to enhanced browser speech synthesis");
    
    // Process text with enhanced speech service for better naturalness
    let processedScript = script;
    try {
      // Import and use enhanced speech processing
      const { EnhancedSpeechService } = await import('../../lib/enhancedSpeech');
      const speechService = EnhancedSpeechService.getInstance();
      processedScript = speechService.preprocessText(script, { mode: 'reading' });
    } catch (error) {
      console.warn('Enhanced speech processing failed, using original text:', error);
    }
    
    const wantsJSON =
      req.headers.accept?.includes("application/json") ||
      (typeof req.query.return === "string" && req.query.return.toLowerCase() === "json");

    if (wantsJSON) {
      return res.status(200).json({ 
        useBrowserSpeech: true,
        script: processedScript,
        originalScript: script,
        voice,
        message: "Using enhanced browser speech synthesis with natural language processing"
      });
    }

    // Return a simple response indicating browser speech should be used
    return res.status(200).json({ 
      useBrowserSpeech: true,
      script: processedScript,
      originalScript: script,
      voice,
      message: "Using enhanced browser speech synthesis with grammar correction and natural flow"
    });
  }

  try {
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
    
    // Fallback to enhanced browser speech synthesis on error
    console.log("🎵 OpenAI TTS failed, falling back to enhanced browser speech synthesis");
    
    // Process text with enhanced speech service for better naturalness
    let processedScript = script;
    try {
      const { EnhancedSpeechService } = await import('../../lib/enhancedSpeech');
      const speechService = EnhancedSpeechService.getInstance();
      processedScript = speechService.preprocessText(script, { mode: 'reading' });
    } catch (error) {
      console.warn('Enhanced speech processing failed, using original text:', error);
    }
    
    const wantsJSON =
      req.headers.accept?.includes("application/json") ||
      (typeof req.query.return === "string" && req.query.return.toLowerCase() === "json");

    if (wantsJSON) {
      return res.status(200).json({ 
        useBrowserSpeech: true,
        script: processedScript,
        originalScript: script,
        voice,
        message: "OpenAI TTS unavailable, using enhanced browser speech synthesis with natural language processing"
      });
    }

    return res.status(200).json({ 
      useBrowserSpeech: true,
      script: processedScript,
      originalScript: script,
      voice,
      message: "Using enhanced browser speech synthesis with grammar correction and natural flow"
    });
  }
}
