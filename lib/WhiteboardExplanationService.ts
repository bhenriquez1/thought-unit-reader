// lib/WhiteboardExplanationService.ts
import { OpenAI } from "openai";
import { synthesizeVoiceFromText } from "./voiceTools";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

export interface WhiteboardStep {
  title: string;
  description: string;
  visualPrompt: string;
}

export interface WhiteboardExplanationOutput {
  summary: string;
  steps: WhiteboardStep[];
  narrationScript: string;
}

export interface WhiteboardExplanationOutputWithAudio
  extends WhiteboardExplanationOutput {
  audioBlob: Blob; // 🎧 AI-narrated audio (TTS from narrationScript)
}

/**
 * 🧠 Whiteboard Explanation Generator (Ninja Nerd style)
 * Returns summary, voice script, visual animation steps, and an audio narration blob.
 */
export async function generateWhiteboardExplanation(
  concept: string,
  context: string = "General STEM explanation"
): Promise<WhiteboardExplanationOutputWithAudio> {
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

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.5
  });

  const content = response.choices[0].message.content || "";

  const summaryMatch = content.match(/Summary:\s*"([\s\S]*?)"\s*VoiceScript:/);
  const voiceScriptMatch = content.match(/VoiceScript:\s*"([\s\S]*?)"\s*WhiteboardSteps:/);
  const stepsBlock = content.match(/WhiteboardSteps:\s*([\s\S]*)/);

  const summary = summaryMatch?.[1]?.trim() || "";
  const narrationScript = voiceScriptMatch?.[1]?.trim() || "";
  const rawSteps = stepsBlock?.[1]?.trim().split(/\n+/) || [];

  const steps: WhiteboardStep[] = rawSteps.map((line, index) => ({
    title: `Step ${index + 1}`,
    description: line,
    visualPrompt: `Illustrate: ${line}`
  }));

  const audioBlob = await synthesizeVoiceFromText(narrationScript);

  return {
    summary,
    steps,
    narrationScript,
    audioBlob
  };
}