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

// Pre-build the format object once at module load — if the schema is invalid,
// this will log [SYNTH:init:SCHEMA_FAIL] at startup instead of silently failing per-request.
let FORMAT_OBJ: ReturnType<typeof zodTextFormat> | null = null;
try {
  FORMAT_OBJ = zodTextFormat(TeachingSynthesisSchema, "teaching_synthesis");
  console.log("[SYNTH:init:schema-ok]");
} catch (schemaErr) {
  console.error("[SYNTH:init:SCHEMA_FAIL]", schemaErr instanceof Error ? schemaErr.message : String(schemaErr));
}

const VALID_DOMAINS: PageDomain[] = ["math", "science", "clinical", "fiction", "general"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "HEAD") return res.status(200).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, HEAD");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // CHECKPOINT 0: API key present
  if (!apiKey) {
    console.error("[SYNTH:cp0:MISSING_KEY] OPENAI_API_KEY is not set in this environment");
    return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  }

  // CHECKPOINT 1: schema pre-built successfully at module load
  if (!FORMAT_OBJ) {
    console.error("[SYNTH:cp1:SCHEMA_UNINIT] zodTextFormat failed at startup — see [SYNTH:init:SCHEMA_FAIL]");
    return res.status(500).json({ error: "Schema init failed — see [SYNTH:init:SCHEMA_FAIL] in server log" });
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

  // CHECKPOINT 2: request shape confirmed, before any OpenAI call
  // apiKeyPrefix confirms WHICH key Render loaded (first 14 chars safe to log)
  console.log("[SYNTH:cp2:request-start]", {
    domain: safeDomain,
    rankedConceptCount: safeInput.rankedConcepts.length,
    hasPageThesis:    !!safeInput.pageThesis,
    hasPageSummary:   !!safeInput.pageSummary,
    hasPageObjective: !!safeInput.pageObjective,
    pageThesisSnip:   safeInput.pageThesis?.slice(0, 80) ?? null,
    pageSummarySnip:  safeInput.pageSummary?.slice(0, 80) ?? null,
    apiKeyPrefix: apiKey.slice(0, 14) + "...",
    concepts: safeInput.rankedConcepts.map((c, i) => ({ i, role: c.role, title: c.title?.slice(0, 40) })),
  });

  try {
    // CHECKPOINT 3: about to fire OpenAI request
    console.log("[SYNTH:cp3:openai-start]", { model: "gpt-4o", maxTokens: 1800 });

    const response = await openai.responses.parse({
      model: "gpt-4o",
      temperature: 0.3,
      max_output_tokens: 1800,
      text: { format: FORMAT_OBJ },
      input: [
        { role: "system", content: buildSystemPrompt(safeDomain) },
        { role: "user",   content: buildUserPrompt(safeInput) },
      ],
    });

    // CHECKPOINT 4: OpenAI returned — log raw output before Zod parse
    const synthesis = response.output_parsed;
    console.log("[SYNTH:cp4:openai-returned]", {
      hasOutput: !!synthesis,
      outputKeys: synthesis && typeof synthesis === "object" ? Object.keys(synthesis as object) : null,
      rawSnip: JSON.stringify(synthesis ?? {}).slice(0, 300),
    });

    if (!synthesis) {
      console.error("[SYNTH:cp4:null-output] Model returned no structured output");
      return res.status(500).json({ error: "Model returned no structured output." });
    }

    const validated = TeachingSynthesisSchema.parse(synthesis);

    // CHECKPOINT 5: full pipeline succeeded
    console.log("[SYNTH:cp5:success]", {
      coreIdea:     validated.coreIdea?.slice(0, 80) ?? null,
      mechanism:    validated.mechanism?.slice(0, 80) ?? null,
      application:  validated.application?.slice(0, 80) ?? null,
      conceptCount: validated.concepts?.length ?? 0,
      anchorCount:  validated.highlightAnchors?.length ?? 0,
    });

    return res.status(200).json(validated);

  } catch (err: unknown) {
    const msg   = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack   : undefined;
    // Log full stack (10 frames) so we can identify exact failing line
    console.error("[SYNTH:error]", {
      message: msg,
      stack: stack?.split("\n").slice(0, 10).join(" | "),
    });
    return res.status(500).json({ error: msg.slice(0, 300) });
  }
}
