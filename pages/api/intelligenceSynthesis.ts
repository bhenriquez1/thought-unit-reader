// pages/api/intelligenceSynthesis.ts
// Educational Interpretation Engine — professor layer.
// Receives structured concept data; returns LLM-reasoned educational output.
// Uses OpenAI Responses API + Zod structured outputs for schema-enforced JSON.
//
// Staged synthesis:
//   stage=1 → fast path: coreIdea + highlightAnchors + miniTestItems only (~1–3s, 600 tokens)
//   stage=2 (or unset) → full path: all study fields (~5–15s, 1800 tokens)

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  buildSystemPrompt,
  buildUserPrompt,
  TeachingSynthesisSchema,
  Stage1SynthesisSchema,
  buildStage1SystemPrompt,
  buildStage1UserPrompt,
  type SynthesisInput,
} from "@/lib/insights/synthesizeTeachingOutput";
import type { PageDomain } from "@/lib/insights/detectPageDomain";

const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey });

// CRITICAL: Stage 2 (max_output_tokens 1800, gpt-4o) routinely takes 15–30s.
// The platform default serverless timeout is 10s (Vercel Hobby) / 15s (Pro), which
// kills the function before OpenAI returns — Stage 1 (600 tokens, ~3s) survives but
// Stage 2 never resolves. Raising maxDuration is the root-cause fix for "Stage 2 stuck".
export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: "1mb" } },
};

// Pre-build format objects at module load — schema errors surface at startup.
let FORMAT_FULL: ReturnType<typeof zodTextFormat> | null = null;
let FORMAT_STAGE1: ReturnType<typeof zodTextFormat> | null = null;
try {
  FORMAT_FULL   = zodTextFormat(TeachingSynthesisSchema,  "teaching_synthesis");
  FORMAT_STAGE1 = zodTextFormat(Stage1SynthesisSchema,    "stage1_synthesis");
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

  if (!apiKey) {
    console.error("[SYNTH:cp0:MISSING_KEY] OPENAI_API_KEY is not set");
    return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  }

  if (!FORMAT_FULL || !FORMAT_STAGE1) {
    console.error("[SYNTH:cp1:SCHEMA_UNINIT]");
    return res.status(500).json({ error: "Schema init failed" });
  }

  const body = (req.body ?? {}) as Partial<SynthesisInput> & { stage?: string };
  const { stage = "2", domain, pageObjective, pageThesis, pageSummary, pageText, rankedConcepts } = body;

  if (!Array.isArray(rankedConcepts)) {
    return res.status(400).json({ error: "'rankedConcepts' must be an array." });
  }
  // Stage 1 is page-text-first: allow empty rankedConcepts when pageText is present.
  // Stage 2 requires at least some content to synthesize from.
  if (rankedConcepts.length === 0 && stage !== "1" && !pageText) {
    return res.status(400).json({ error: "Stage 2 requires rankedConcepts or pageText." });
  }

  // Measure received payload — confirms server gets ONE page, not the whole book.
  const receivedChars =
    (typeof pageText === "string" ? pageText.length : 0) +
    (typeof pageSummary === "string" ? pageSummary.length : 0) +
    (typeof pageThesis === "string" ? pageThesis.length : 0) +
    (typeof pageObjective === "string" ? pageObjective.length : 0) +
    rankedConcepts.reduce((s: number, c: any) => s + (typeof c?.text === "string" ? c.text.length : 0), 0);
  console.log("[SYNTH:received]", {
    stage,
    page: (body as any).pageNumber ?? null,
    receivedChars,
    pageTextChars: typeof pageText === "string" ? pageText.length : 0,
    conceptCount: rankedConcepts.length,
  });
  if (receivedChars > 50_000) {
    console.error("[SYNTH:PAYLOAD_TOO_LARGE] book-level text reached the API — synthesis should be page-scoped", { receivedChars });
  }

  const safeDomain: PageDomain = VALID_DOMAINS.includes(domain as PageDomain)
    ? (domain as PageDomain)
    : "general";

  const safeInput: SynthesisInput = {
    domain:        safeDomain,
    pageObjective: typeof pageObjective === "string" ? pageObjective : undefined,
    pageThesis:    typeof pageThesis    === "string" ? pageThesis    : undefined,
    pageSummary:   typeof pageSummary   === "string" ? pageSummary   : undefined,
    pageText:      typeof pageText      === "string" ? pageText.slice(0, 1500) : undefined,
    rankedConcepts: rankedConcepts.slice(0, 6),
  };

  // ── Stage 1: Fast path ─────────────────────────────────────────────────────
  if (stage === "1") {
    console.log("[SYNTH:stage1:api-start]", {
      domain: safeDomain,
      conceptCount: safeInput.rankedConcepts.length,
      hasPageThesis: !!safeInput.pageThesis,
    });
    const s1Start = Date.now();
    try {
      const response = await openai.responses.parse({
        model: "gpt-4o",
        temperature: 0.2,
        max_output_tokens: 1000,  // expanded: study fields add ~400 tokens
        text: { format: FORMAT_STAGE1 },
        input: [
          { role: "system", content: buildStage1SystemPrompt(safeDomain) },
          { role: "user",   content: buildStage1UserPrompt(safeInput) },
        ],
      });
      console.log("[SYNTH:stage1:openai-elapsed-ms]", Date.now() - s1Start);
      const s1 = response.output_parsed;
      if (!s1) return res.status(500).json({ error: "Stage 1: no structured output" });
      const validated = Stage1SynthesisSchema.parse(s1);
      console.log("[SYNTH:stage1:api-done]", {
        elapsedMs:      Date.now() - s1Start,
        coreIdea:       validated.coreIdea?.slice(0, 60),
        whyThisMatters: !!validated.whyThisMatters,
        keyMechanism:   !!validated.keyMechanism,
        commonConfusion: !!validated.commonConfusion,
        anchors:        validated.highlightAnchors?.length ?? 0,
        miniTest:       validated.miniTestItems?.length ?? 0,
      });
      return res.status(200).json(validated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[SYNTH:stage1:api-error]", { elapsedMs: Date.now() - s1Start, msg });
      return res.status(500).json({ error: msg.slice(0, 300) });
    }
  }

  // ── Stage 2: Full synthesis ─────────────────────────────────────────────────
  console.log("[SYNTH:cp2:request-start]", {
    domain: safeDomain,
    rankedConceptCount: safeInput.rankedConcepts.length,
    hasPageThesis:    !!safeInput.pageThesis,
    hasPageSummary:   !!safeInput.pageSummary,
    hasPageObjective: !!safeInput.pageObjective,
    pageThesisSnip:   safeInput.pageThesis?.slice(0, 80) ?? null,
    apiKeyPrefix: apiKey.slice(0, 14) + "...",
    concepts: safeInput.rankedConcepts.map((c, i) => ({ i, role: c.role, title: c.title?.slice(0, 40) })),
  });

  const s2Start = Date.now();
  try {
    console.log("[SYNTH:cp3:openai-start]", { model: "gpt-4o", maxTokens: 1800 });

    const response = await openai.responses.parse({
      model: "gpt-4o",
      temperature: 0.3,
      max_output_tokens: 1800,
      text: { format: FORMAT_FULL },
      input: [
        { role: "system", content: buildSystemPrompt(safeDomain) },
        { role: "user",   content: buildUserPrompt(safeInput) },
      ],
    });

    const synthesis = response.output_parsed;
    console.log("[SYNTH:cp4:openai-returned]", {
      elapsedMs: Date.now() - s2Start,
      hasOutput: !!synthesis,
      rawSnip: JSON.stringify(synthesis ?? {}).slice(0, 300),
    });

    if (!synthesis) {
      console.error("[SYNTH:cp4:null-output]");
      return res.status(500).json({ error: "Model returned no structured output." });
    }

    const validated = TeachingSynthesisSchema.parse(synthesis);
    console.log("[SYNTH:cp5:success]", {
      coreIdea:     validated.coreIdea?.slice(0, 80) ?? null,
      mechanism:    validated.mechanism?.slice(0, 80) ?? null,
      conceptCount: validated.concepts?.length ?? 0,
      anchorCount:  validated.highlightAnchors?.length ?? 0,
    });

    return res.status(200).json(validated);

  } catch (err: unknown) {
    const msg   = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack   : undefined;
    console.error("[SYNTH:error]", {
      elapsedMs: Date.now() - s2Start,
      message: msg,
      stack: stack?.split("\n").slice(0, 10).join(" | "),
    });
    return res.status(500).json({ error: msg.slice(0, 300) });
  }
}
