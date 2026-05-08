// pages/api/intelligenceSynthesis.ts
// Educational Interpretation Engine — professor layer.
// Receives structured concept data; returns LLM-reasoned educational output.
// Uses OpenAI Responses API + Zod structured outputs for schema-enforced JSON.

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  buildSystemPrompt,
  buildUserPrompt,
  TeachingSynthesisSchema,
  type SynthesisInput,
} from "@/lib/insights/synthesizeTeachingOutput";
import type { PageDomain } from "@/lib/insights/detectPageDomain";

const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey });

const VALID_DOMAINS: PageDomain[] = ["math", "science", "clinical", "fiction", "general"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "HEAD") return res.status(200).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, HEAD");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (!apiKey) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  }

  const body = (req.body ?? {}) as Partial<SynthesisInput>;

  const { domain, pageObjective, rankedConcepts } = body;

  if (!Array.isArray(rankedConcepts) || rankedConcepts.length === 0) {
    return res.status(400).json({ error: "Missing or empty 'rankedConcepts'." });
  }

  const safeDomain: PageDomain = VALID_DOMAINS.includes(domain as PageDomain)
    ? (domain as PageDomain)
    : "general";

  const safeInput: SynthesisInput = {
    domain: safeDomain,
    pageObjective: typeof pageObjective === "string" ? pageObjective : undefined,
    rankedConcepts: rankedConcepts.slice(0, 6),
  };

  try {
    const response = await openai.responses.parse({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_output_tokens: 1200,
      text: { format: zodTextFormat(TeachingSynthesisSchema, "teaching_synthesis") },
      input: [
        { role: "system", content: buildSystemPrompt(safeDomain) },
        { role: "user", content: buildUserPrompt(safeInput) },
      ],
    });

    const synthesis = response.output_parsed;

    if (!synthesis) {
      return res.status(500).json({ error: "Model returned no structured output." });
    }

    const validated = TeachingSynthesisSchema.parse(synthesis);

    return res.status(200).json(validated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("intelligenceSynthesis API error:", msg);
    return res.status(500).json({ error: "Failed to synthesize teaching output." });
  }
}
