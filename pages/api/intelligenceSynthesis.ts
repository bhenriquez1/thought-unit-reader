// pages/api/intelligenceSynthesis.ts
// Educational interpretation endpoint.
// Uses OpenAI Responses API with Zod structured outputs for reliable JSON.

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  buildSystemPrompt,
  buildUserPrompt,
  TeachingSynthesisSchema,
} from "@/lib/insights/synthesizeTeachingOutput";
import type { TeachingSynthesis } from "@/lib/insights/synthesizeTeachingOutput";
import type { PageDomain } from "@/lib/insights/detectPageDomain";
import type { UltraConceptBlock } from "@/lib/insights/buildUltraPageView";

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

  const { pageText, domain, extractedConcepts } = (req.body ?? {}) as {
    pageText?: string;
    domain?: PageDomain;
    extractedConcepts?: UltraConceptBlock[];
  };

  if (!pageText || typeof pageText !== "string" || pageText.trim().length < 30) {
    return res.status(400).json({ error: "Missing or too-short 'pageText'." });
  }

  const safeDomain: PageDomain = VALID_DOMAINS.includes(domain as PageDomain)
    ? (domain as PageDomain)
    : "general";

  const safeConcepts: UltraConceptBlock[] = Array.isArray(extractedConcepts)
    ? extractedConcepts.slice(0, 6)
    : [];

  try {
    const response = await openai.responses.parse({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_output_tokens: 1000,
      text: { format: zodTextFormat(TeachingSynthesisSchema, "teaching_synthesis") },
      input: [
        { role: "system", content: buildSystemPrompt(safeDomain) },
        { role: "user", content: buildUserPrompt(pageText, safeDomain, safeConcepts) },
      ],
    });

    const synthesis: TeachingSynthesis | null = response.output_parsed;

    if (!synthesis) {
      return res.status(500).json({ error: "Model returned no structured output." });
    }

    // Zod validation is already applied by the Responses API parse step,
    // but run it again to catch any unexpected shape mismatches.
    const validated = TeachingSynthesisSchema.parse(synthesis);

    return res.status(200).json(validated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("intelligenceSynthesis API error:", msg);
    return res.status(500).json({ error: "Failed to synthesize teaching output." });
  }
}
