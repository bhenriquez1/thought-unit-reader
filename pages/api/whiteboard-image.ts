// pages/api/whiteboard-image.ts
// "AI Drawing" mode for the Whiteboard — Phase 1 (director) + Phase 2 (artist):
//
//   Phase 1: GPT writes a visual teaching script (Armando Hasudungan style —
//            labeled structures, color-coded relationships, arrows, sequential
//            steps) for the given concept/context.
//   Phase 2: An image model renders that script as a hand-drawn-style
//            educational illustration.
//
// Dual image provider:
//   - "openai"   — OpenAI Images (dall-e-3). Best integration with the
//                   Explain This Step tutor flow; good for anatomy/biology/
//                   chemistry/dental visual explanations.
//   - "ideogram" — Ideogram. Stronger for diagrams that need clean, readable
//                   text labels. Requires IDEOGRAM_API_KEY — if unset, returns
//                   a debug-aware error so the UI can fall back to the
//                   SVG/process-map whiteboard instead of hiding the failure.

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type Provider = "openai" | "ideogram";

type Body = {
  concept?: string;
  context?: string;
  provider?: Provider;
  debug?: boolean;
};

type DebugInfo = {
  failureReason: string;
  model?: string;
  promptSent?: { system: string; user: string };
  rawResponse?: string;
  httpStatus?: number;
};

type Ok = {
  imageUrl: string;
  teachingScript: string;
  provider: Provider;
};

type Err = {
  error: string;
  aiDisabled?: boolean;
  debugInfo?: DebugInfo;
};

const DIRECTOR_SYSTEM_PROMPT = `You are a visual-teaching director, in the style of Armando Hasudungan's hand-drawn educational videos. Given a concept and page context, write a short "visual teaching script" describing exactly what should be drawn to teach this concept visually.

Your script must describe:
- The key structures/objects to draw, with labels.
- Arrows showing relationships, flow, or sequence between them.
- Color-coding for related elements (e.g. "carbon atoms = blue, oxygen = red").
- A sequential, step-by-step layout (so the diagram tells a story / shows a mechanism happening).

Keep it concise (under 150 words), concrete, and visual — describe shapes, positions, labels, arrows, and colors, not abstract prose. This script will be sent directly to an image-generation model.`;

async function buildTeachingScript(concept: string, context: string): Promise<{ script: string; raw: string }> {
  const userPrompt = [
    `Concept to visualize: ${concept}`,
    context ? `Page context: ${context.slice(0, 1200)}` : null,
  ].filter(Boolean).join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: DIRECTOR_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.6,
    max_tokens: 400,
  });

  const script = completion.choices?.[0]?.message?.content?.trim() ?? "";
  return { script, raw: JSON.stringify(completion).slice(0, 4000) };
}

function imagePromptFromScript(script: string, concept: string): string {
  return [
    `Educational hand-drawn whiteboard-style illustration teaching the concept: "${concept}".`,
    script,
    "Style: clean hand-drawn lines on a white background, like a teacher's whiteboard sketch (Armando Hasudungan style). Clearly readable labels next to each structure, directional arrows showing relationships and sequence, distinct colors for related elements as described.",
  ].join("\n\n");
}

async function generateWithOpenAI(prompt: string): Promise<{ imageUrl: string; raw: string }> {
  const result = await openai.images.generate({
    model: "dall-e-3",
    prompt: prompt.slice(0, 4000),
    size: "1024x1024",
    quality: "standard",
    response_format: "b64_json",
    n: 1,
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI image response missing b64_json");
  return { imageUrl: `data:image/png;base64,${b64}`, raw: JSON.stringify({ created: result.created, hasB64: !!b64 }) };
}

async function generateWithIdeogram(prompt: string): Promise<{ imageUrl: string; raw: string; status: number }> {
  const resp = await fetch("https://api.ideogram.ai/generate", {
    method: "POST",
    headers: {
      "Api-Key": process.env.IDEOGRAM_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_request: {
        prompt: prompt.slice(0, 2000),
        aspect_ratio: "ASPECT_1_1",
        model: "V_2",
        magic_prompt_option: "AUTO",
      },
    }),
  });
  const raw = await resp.text();
  if (!resp.ok) throw Object.assign(new Error("Ideogram request failed"), { httpStatus: resp.status, raw });
  const data = JSON.parse(raw);
  const imageUrl = data?.data?.[0]?.url;
  if (!imageUrl) throw Object.assign(new Error("Ideogram response missing image URL"), { httpStatus: resp.status, raw });
  return { imageUrl, raw: raw.slice(0, 4000), status: resp.status };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = (req.body || {}) as Body;
  const concept = (body.concept || "").trim();
  const context = (body.context || "").trim();
  const provider: Provider = body.provider === "ideogram" ? "ideogram" : "openai";
  const debug = Boolean(body.debug);

  if (!concept) {
    return res.status(400).json({ error: "Missing 'concept'." });
  }

  if (!process.env.OPENAI_API_KEY) {
    const failureReason = "OPENAI_API_KEY missing — cannot build the visual teaching script (Phase 1).";
    console.error("[WHITEBOARD_IMAGE_FAILURE]", { failureReason });
    return res.status(debug ? 200 : 500).json(
      debug ? { error: failureReason, aiDisabled: true, debugInfo: { failureReason } } : { error: failureReason }
    );
  }

  if (provider === "ideogram" && !process.env.IDEOGRAM_API_KEY) {
    const failureReason = "IDEOGRAM_API_KEY not configured — Ideogram provider is not yet enabled.";
    console.warn("[WHITEBOARD_IMAGE_FAILURE]", { failureReason, provider });
    return res.status(debug ? 200 : 501).json(
      debug
        ? { error: failureReason, aiDisabled: true, debugInfo: { failureReason, model: "ideogram-v2" } }
        : { error: failureReason, aiDisabled: true }
    );
  }

  let script = "";
  let directorRaw = "";
  try {
    const directed = await buildTeachingScript(concept, context);
    script = directed.script;
    directorRaw = directed.raw;
    if (!script) throw new Error("Empty teaching script returned by gpt-4o-mini");
  } catch (err: any) {
    const failureReason = `Phase 1 (visual teaching script) failed: ${err?.message ?? String(err)}`;
    console.error("[WHITEBOARD_IMAGE_FAILURE]", { failureReason, provider });
    return res.status(debug ? 200 : 500).json(
      debug
        ? {
            error: failureReason,
            aiDisabled: true,
            debugInfo: {
              failureReason,
              model: "gpt-4o-mini",
              promptSent: { system: DIRECTOR_SYSTEM_PROMPT, user: `${concept}\n\n${context}`.slice(0, 2000) },
              rawResponse: directorRaw || String(err),
            },
          }
        : { error: failureReason, aiDisabled: true }
    );
  }

  const prompt = imagePromptFromScript(script, concept);

  try {
    const drawn = provider === "ideogram"
      ? await generateWithIdeogram(prompt)
      : await generateWithOpenAI(prompt);

    console.log("[WHITEBOARD_IMAGE_READY]", { provider, concept: concept.slice(0, 80), scriptChars: script.length });
    return res.status(200).json({ imageUrl: drawn.imageUrl, teachingScript: script, provider });
  } catch (err: any) {
    const failureReason = `Phase 2 (${provider} image generation) failed: ${err?.message ?? String(err)}`;
    console.error("[WHITEBOARD_IMAGE_FAILURE]", { failureReason, provider, httpStatus: err?.httpStatus });
    return res.status(debug ? 200 : 502).json(
      debug
        ? {
            error: failureReason,
            aiDisabled: true,
            debugInfo: {
              failureReason,
              model: provider === "ideogram" ? "ideogram-v2" : "dall-e-3",
              promptSent: { system: DIRECTOR_SYSTEM_PROMPT, user: prompt.slice(0, 2000) },
              rawResponse: err?.raw ?? String(err),
              httpStatus: err?.httpStatus,
            },
          }
        : { error: failureReason, aiDisabled: true }
    );
  }
}
