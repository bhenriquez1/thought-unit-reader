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

  const { domain, pageObjective, pageThesis, pageSummary, rankedConcepts } = body;

  if (!Array.isArray(rankedConcepts) || rankedConcepts.length === 0) {
    return res.status(400).json({ error: "Missing or empty 'rankedConcepts'." });
  }

  const safeDomain: PageDomain = VALID_DOMAINS.includes(domain as PageDomain)
    ? (domain as PageDomain)
    : "general";

  const safeInput: SynthesisInput = {
    domain: safeDomain,
    pageObjective: typeof pageObjective === "string" ? pageObjective : undefined,
    pageThesis:    typeof pageThesis    === "string" ? pageThesis    : undefined,
    pageSummary:   typeof pageSummary   === "string" ? pageSummary   : undefined,
    rankedConcepts: rankedConcepts.slice(0, 6),
  };

  console.log("[SYNTH:api:request]", {
    domain: safeDomain,
    hasPageThesis:    !!safeInput.pageThesis,
    hasPageSummary:   !!safeInput.pageSummary,
    hasPageObjective: !!safeInput.pageObjective,
    pageThesisSnip:   safeInput.pageThesis?.slice(0, 80) ?? null,
    pageSummarySnip:  safeInput.pageSummary?.slice(0, 80) ?? null,
    rankedConceptCount: safeInput.rankedConcepts.length,
    concepts: safeInput.rankedConcepts.map((c, i) => ({ i, role: c.role, title: c.title?.slice(0, 40) })),
  });

  try {
    console.log("[SYNTH:api:openai-start]", { model: "gpt-4o", maxTokens: 1800 });
    const response = await openai.responses.parse({
      model: "gpt-4o",
      temperature: 0.3,
      max_output_tokens: 1800,
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

    console.log("[SYNTH:api:success]", {
      coreIdea:           validated.coreIdea?.slice(0, 80) ?? null,
      mechanism:          validated.mechanism?.slice(0, 80) ?? null,
      application:        validated.application?.slice(0, 80) ?? null,
      misconceptionAlert: validated.misconceptionAlert?.slice(0, 80) ?? null,
      memoryAnchor:       (validated as any).memoryAnchor?.slice(0, 80) ?? null,
      conceptCount:       validated.concepts?.length ?? 0,
    });

    return res.status(200).json(validated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack?.split("\n").slice(0, 4).join(" | ") : undefined;
    console.error("[SYNTH:api:error]", { message: msg, stack });
    return res.status(500).json({ error: msg.slice(0, 200) });
  }
}
