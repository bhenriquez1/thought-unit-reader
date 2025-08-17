// pages/api/whiteboard-explain.ts
import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

type Step = {
  type?: "draw" | "erase" | "text" | "image";
  title?: string;
  description?: string;
  visualPrompt?: string;
  payload?: any;   // renderer can ignore if not used
  delayMs?: number;
};

type ExplainResp = {
  steps: Step[];
  narrationScript: string;
  audioUrl?: string;
  audioBase64?: string;
  audioMime?: string;
};

const HAS_KEY = !!process.env.OPENAI_API_KEY;
const openai = HAS_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY! }) : (null as any);

/** Safe fallback so UI still works without an API key or on errors */
function localFallback(concept: string, context: string): ExplainResp {
  const steps: Step[] = [
    {
      type: "text",
      title: "Big Picture",
      description: `${context || "This section"} — why this matters.`,
      payload: { text: `${context || "This section"} — why this matters.` },
      delayMs: 1200,
    },
    {
      type: "text",
      title: "Core Idea",
      description: concept,
      payload: { text: concept },
      delayMs: 1200,
    },
    {
      type: "draw",
      title: "Sketch",
      description: "Simple diagram with 2–4 labeled parts",
      visualPrompt: "clean whiteboard illustration, 3 boxes, arrows, short labels",
      payload: { prompt: "3 boxes -> arrows -> short labels" },
      delayMs: 1400,
    },
    {
      type: "text",
      title: "Common Pitfall",
      description: "A frequent misconception and how to avoid it.",
      payload: { text: "Common pitfall + fix" },
      delayMs: 1200,
    },
    {
      type: "text",
      title: "Apply It",
      description: "Where this shows up in practice/exams.",
      payload: { text: "Application/use-cases" },
      delayMs: 1200,
    },
  ];
  const narrationScript =
    `Let's walk through ${concept} in the context of ${context}. ` +
    `First, big picture, then a quick sketch, a pitfall, and how to apply it.`;
  return { steps, narrationScript };
}

function coerceToShape(data: any): ExplainResp {
  const narrationScript =
    typeof data?.narrationScript === "string" ? data.narrationScript : "";

  const rawSteps = Array.isArray(data?.steps) ? data.steps : [];
  const steps: Step[] = rawSteps.map((s: any, i: number) => {
    const title =
      typeof s?.title === "string" && s.title.trim() ? s.title.trim() : `Step ${i + 1}`;
    const description =
      typeof s?.description === "string" ? s.description : "";
    const visualPrompt =
      typeof s?.visualPrompt === "string" ? s.visualPrompt : (s?.payload?.prompt ?? "");
    const type: Step["type"] = ["draw", "erase", "text", "image"].includes(s?.type)
      ? s.type
      : (visualPrompt ? "draw" : "text");
    const delayMs = typeof s?.delayMs === "number" ? s.delayMs : 1200;

    return {
      type,
      title,
      description,
      visualPrompt,
      payload: s?.payload ?? (type === "text" ? { text: description } : {}),
      delayMs,
    };
  });

  return {
    steps,
    narrationScript,
    audioUrl: typeof data?.audioUrl === "string" ? data.audioUrl : undefined,
    audioBase64: typeof data?.audioBase64 === "string" ? data.audioBase64 : undefined,
    audioMime: typeof data?.audioMime === "string" ? data.audioMime : undefined,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { concept, context = "General STEM explanation" } = req.body || {};
  if (!concept?.trim()) return res.status(400).json({ error: "Missing concept" });

  // No key? Return local scaffold so the UI doesn’t break
  if (!HAS_KEY) {
    return res.status(200).json(localFallback(concept, context));
  }

  try {
    const system = `
You are a world-class instructor giving a concise **whiteboard** lesson.
Return STRICT JSON ONLY with keys: narrationScript (string) and steps (array).
Each step: { title, description, visualPrompt, type?, payload?, delayMs? }.
- 4–7 steps max.
- Keep language simple, short sentences.
- visualPrompt: one terse line describing what to draw on a whiteboard (no camera terms).
- type: "draw" for visuals, "text" for pure narration.
- No markdown, no code fences.
`;

    const user = `Concept: ${concept}\nContext: ${context}`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const content = resp.choices?.[0]?.message?.content ?? "";
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }

    const shaped = coerceToShape(parsed);
    if (!shaped.steps.length) {
      return res.status(200).json(localFallback(concept, context));
    }
    return res.status(200).json(shaped);
  } catch (err) {
    console.error("whiteboard-explain error:", err);
    return res.status(200).json(localFallback(concept, context));
  }
}