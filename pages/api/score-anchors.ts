// pages/api/score-anchors.ts
// Lightweight semantic arbitration endpoint.
//
// Takes grounded PDF text spans + studyModel context.
// Returns per-anchor semantic relevance scores (0–100).
//
// OpenAI is the ARBITRATOR — it can prioritize/demote.
// It CANNOT invent text. Only pre-grounded PDF spans are scored.
// Called after groundHighlightAnchors() produces exact PDF spans.

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey });

const InputSchema = z.object({
  pageThesis:      z.string(),
  keyMechanism:    z.string().nullable().optional(),
  commonConfusion: z.string().nullable().optional(),
  conceptTitles:   z.array(z.string()).optional(),
  anchors: z.array(z.object({
    text:       z.string(),
    anchorType: z.string(),
  })).min(1).max(8),
});

const OutputSchema = z.object({
  rankings: z.array(z.object({
    text:          z.string(),
    semanticScore: z.number().min(0).max(100),
  })),
});

let FORMAT: ReturnType<typeof zodTextFormat> | null = null;
try {
  FORMAT = zodTextFormat(OutputSchema, "anchor_rankings");
} catch (e) {
  console.error("[SCORE_ANCHORS:init:SCHEMA_FAIL]", e);
}

function buildPrompt(input: z.infer<typeof InputSchema>): string {
  const lines: string[] = [
    `PAGE THESIS: ${input.pageThesis}`,
  ];
  if (input.keyMechanism)    lines.push(`KEY MECHANISM: ${input.keyMechanism}`);
  if (input.commonConfusion) lines.push(`COMMON CONFUSION: ${input.commonConfusion}`);
  if (input.conceptTitles?.length) lines.push(`KEY CONCEPTS: ${input.conceptTitles.join(", ")}`);

  lines.push("\nANCHORS TO SCORE:");
  for (let i = 0; i < input.anchors.length; i++) {
    lines.push(`${i + 1}. [${input.anchors[i].anchorType}] "${input.anchors[i].text}"`);
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are a study model semantic arbitrator.

Your sole job: score how central each highlighted PDF span is to the current page's educational content.

These spans are EXACT text from the PDF — your only task is to judge educational centrality.
You CANNOT modify, replace, or add spans. Only score what you are given.

SCORING RUBRIC (0–100):
100 — Critical. The page's entire teaching hinges on this sentence. Remove it and understanding collapses.
 80 — Important. Directly proves or explains the page thesis or key mechanism.
 60 — Relevant. Strong supporting detail, worked example, or trap that aids comprehension.
 40 — Marginal. Loosely related but not central. A student could understand the page without it.
 20 — Weak. Generic textbook sentence. Teaches nothing specific about this page's topic.
  0 — Irrelevant. Should not be highlighted. Off-topic, boilerplate, or figure caption.

SCORING PRINCIPLES:
- A short causal sentence ("X causes Y because Z") can score 100 if it IS the page's mechanism.
- A longer, complex sentence is NOT automatically higher-scoring.
- Generic definitional openers ("Elements are substances...") score low even if present on the page.
- Thesis and mechanism anchors should score higher than introductory or supporting sentences.
- If an anchor is a heading-only fragment or a textbook truism, score it 20 or below.

Return the text field EXACTLY as provided — do not truncate or modify.`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (!apiKey) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  }

  if (!FORMAT) {
    return res.status(500).json({ error: "Schema initialization failed" });
  }

  const parsed = InputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
  }

  const input = parsed.data;
  const userPrompt = buildPrompt(input);

  console.log("[SCORE_ANCHORS:start]", {
    thesis: input.pageThesis.slice(0, 60),
    anchorCount: input.anchors.length,
  });

  try {
    const response = await openai.responses.parse({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_output_tokens: 300,
      text: { format: FORMAT },
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: userPrompt },
      ],
    });

    const result = response.output_parsed;
    if (!result) return res.status(500).json({ error: "No structured output" });

    const validated = OutputSchema.parse(result);
    console.log("[SCORE_ANCHORS:done]", {
      scores: validated.rankings.map(r => ({ text: r.text.slice(0, 50), score: r.semanticScore })),
    });

    return res.status(200).json(validated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[SCORE_ANCHORS:error]", msg);
    return res.status(500).json({ error: msg.slice(0, 300) });
  }
}
