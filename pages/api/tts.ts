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
    // Fallback: Return instructions to use Butler speech synthesis
    console.log("🎵 OpenAI TTS not available, falling back to Butler speech synthesis");
    
    // Process text with Butler speech engine for smart content selection
    let processedScript = script;
    let butlerAnalysis: any = null;
    
    try {
      // Import and use Butler speech processing
      const { butlerSpeechEngine } = await import('../../lib/butlerSpeechEngine');
      const { analyzeTextWithButler, getReadableContent } = await import('../../lib/butlerThoughtUnits');
      
      // Analyze text with Butler to identify important content
      butlerAnalysis = analyzeTextWithButler(script);
      
      // Get readable content based on speech mode (default to 'smart')
      const speechMode = req.query.speechMode as string || 'smart';
      const readableContent = getReadableContent(butlerAnalysis);
      
      // Select content based on speech mode
      if (speechMode === 'smart') {
        processedScript = readableContent.essential || readableContent.supporting;
      } else {
        processedScript = readableContent.full;
      }
      
      // If no essential content found, use supporting or full
      if (!processedScript.trim()) {
        processedScript = readableContent.supporting || readableContent.full;
      }
      
    } catch (error) {
      console.warn('Butler speech processing failed, using original text:', error);
      // Fallback to enhanced speech processing
      try {
        const { EnhancedSpeechService } = await import('../../lib/enhancedSpeech');
        const speechService = EnhancedSpeechService.getInstance();
        processedScript = speechService.preprocessText(script, { mode: 'reading' });
      } catch (fallbackError) {
        console.warn('Enhanced speech processing also failed:', fallbackError);
      }
    }
    
    const wantsJSON =
      req.headers.accept?.includes("application/json") ||
      (typeof req.query.return === "string" && req.query.return.toLowerCase() === "json");

    if (wantsJSON) {
      return res.status(200).json({ 
        useBrowserSpeech: true,
        script: processedScript,
        originalScript: script,
        butlerAnalysis,
        voice,
        message: "Using Butler speech synthesis with smart content selection and natural delivery"
      });
    }

    // Return a simple response indicating browser speech should be used
    return res.status(200).json({ 
      useBrowserSpeech: true,
      script: processedScript,
      originalScript: script,
      butlerAnalysis,
      voice,
      message: "Using Butler speech synthesis with intelligent content filtering and natural flow"
    });
  }

  try {
    const fmt = (format || "mp3").toLowerCase() as NonNullable<Body["format"]>;
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
    
    // Fallback to Butler speech synthesis on error
    console.log("🎵 OpenAI TTS failed, falling back to Butler speech synthesis");
    
    // Process text with Butler speech engine for smart content selection
    let processedScript = script;
    let butlerAnalysis: any = null;
    
    try {
      // Import and use Butler speech processing
      const { butlerSpeechEngine } = await import('../../lib/butlerSpeechEngine');
      const { analyzeTextWithButler, getReadableContent } = await import('../../lib/butlerThoughtUnits');
      
      // Analyze text with Butler to identify important content
      butlerAnalysis = analyzeTextWithButler(script);
      
      // Get readable content based on speech mode (default to 'smart')
      const speechMode = req.query.speechMode as string || 'smart';
      const readableContent = getReadableContent(butlerAnalysis);
      
      // Select content based on speech mode
      if (speechMode === 'smart') {
        processedScript = readableContent.essential || readableContent.supporting;
      } else {
        processedScript = readableContent.full;
      }
      
      // If no essential content found, use supporting or full
      if (!processedScript.trim()) {
        processedScript = readableContent.supporting || readableContent.full;
      }
      
    } catch (error) {
      console.warn('Butler speech processing failed, using original text:', error);
      // Fallback to enhanced speech processing
      try {
        const { EnhancedSpeechService } = await import('../../lib/enhancedSpeech');
        const speechService = EnhancedSpeechService.getInstance();
        processedScript = speechService.preprocessText(script, { mode: 'reading' });
      } catch (fallbackError) {
        console.warn('Enhanced speech processing also failed:', fallbackError);
      }
    }
    
    const wantsJSON =
      req.headers.accept?.includes("application/json") ||
      (typeof req.query.return === "string" && req.query.return.toLowerCase() === "json");

    if (wantsJSON) {
      return res.status(200).json({ 
        useBrowserSpeech: true,
        script: processedScript,
        originalScript: script,
        butlerAnalysis,
        voice,
        message: "OpenAI TTS unavailable, using Butler speech synthesis with smart content selection"
      });
    }

    return res.status(200).json({ 
      useBrowserSpeech: true,
      script: processedScript,
      originalScript: script,
      butlerAnalysis,
      voice,
      message: "Using Butler speech synthesis with intelligent content filtering and natural delivery"
    });
  }
}
