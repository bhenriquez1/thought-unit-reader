// ✅ Server-route–first + local OpenAI fallback
// ✅ Exposes: generateWhiteboardExplanation (no audio)
//            generateWhiteboardExplanationWithAudio (with audio via /api/tts)

import { OpenAI } from "openai";
import { synthesizeVoiceFromText } from "./tts"; // ← server TTS helper

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

export interface WhiteboardStep {
  title: string;
  description: string;
  visualPrompt: string; // what to draw
}

export interface WhiteboardExplanationOutput {
  summary: string;
  steps: WhiteboardStep[];
  narrationScript: string;
}

export interface WhiteboardExplanationOutputWithAudio
  extends WhiteboardExplanationOutput {
  audioBlob: Blob | null; // if null, UI can fall back to browser TTS
}

/* -------------------- helpers -------------------- */

function parseLLMContentToOutput(content: string): WhiteboardExplanationOutput {
  const summaryMatch = content.match(/Summary:\s*"([\s\S]*?)"\s*VoiceScript:/i);
  const voiceScriptMatch = content.match(/VoiceScript:\s*"([\s\S]*?)"\s*WhiteboardSteps:/i);
  const stepsBlock = content.match(/WhiteboardSteps:\s*([\s\S]*)/i);

  const summary = summaryMatch?.[1]?.trim() || "";
  const narrationScript = voiceScriptMatch?.[1]?.trim() || "";
  const rawSteps = (stepsBlock?.[1] || "")
    .trim()
    .split(/\n+/)
    .map((s) => s.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);

  const steps: WhiteboardStep[] = rawSteps.map((line, idx) => ({
    title: `Step ${idx + 1}`,
    description: line,
    visualPrompt: `Illustrate: ${line}`,
  }));

  return { summary, steps, narrationScript };
}

async function localLLMGenerate(
  concept: string,
  context: string
): Promise<WhiteboardExplanationOutput> {
  const prompt = `You are Ninja Nerd giving a whiteboard explanation.

Concept: ${concept}
Context: ${context}

1. Provide a 1-paragraph summary of the concept.
2. Break it down in a clear voice script for explaining aloud to students.
3. Then give 3–6 concise whiteboard animation steps that a teacher would draw while speaking.

Return format:
Summary:
"Short summary here..."

VoiceScript:
"Your spoken explanation here..."

WhiteboardSteps:
- Step 1 drawing instructions...
- Step 2 drawing instructions...
...`;

  const resp = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.5,
  });

  const content = resp.choices?.[0]?.message?.content || "";
  return parseLLMContentToOutput(content);
}

/* -------------------- public API -------------------- */

/**
 * Server-first whiteboard explanation (no audio).
 * Falls back to local OpenAI if the server route fails.
 */
export async function generateWhiteboardExplanation(
  concept: string,
  context: string = "General STEM explanation"
): Promise<WhiteboardExplanationOutput> {
  // 1) Try server route (keeps keys server-side)
  try {
    const res = await fetch("/api/whiteboard-explanation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ concept, context }),
    });

    if (res.ok) {
      const data = (await res.json()) as WhiteboardExplanationOutput;
      if (data?.narrationScript && Array.isArray(data?.steps)) return data;
    }
    // else fall through to local
  } catch {
    // swallow and fall back to local
  }

  // 2) Fallback to local OpenAI (only works if key is exposed client-side — not recommended in prod)
  return await localLLMGenerate(concept, context);
}

/**
 * Same as above, but also tries to get an AI audio blob from /api/tts.
 * If TTS fails (or route is missing), returns audioBlob = null so the UI can use browser TTS.
 */
export async function generateWhiteboardExplanationWithAudio(
  concept: string,
  context: string = "General STEM explanation"
): Promise<WhiteboardExplanationOutputWithAudio> {
  const base = await generateWhiteboardExplanation(concept, context);

  let audioBlob: Blob | null = null;
  try {
    audioBlob = await synthesizeVoiceFromText(base.narrationScript);
  } catch {
    audioBlob = null;
  }

  return { ...base, audioBlob };
}