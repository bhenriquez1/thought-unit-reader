// pages/api/notebook-plan.ts
// M2 — the first live route calling NotebookPlanner end-to-end. Same
// pattern intelligenceSynthesis.ts already proves in production: OpenAI
// Responses API + Zod structured outputs (zodTextFormat) for
// schema-enforced JSON, OPENAI_API_KEY read server-side only.
//
// Receives a page's CanonicalThoughtUnit[] plus optional multi-source
// synthesis material (professorExplanation/studentNotes/
// supplementalSources/existingNotebookSummary/relatedConceptKnowledge —
// see notebookPlanner.ts's NoteSynthesisSources) and an optional
// personalization styleProfile (N6), and returns a validated
// NotebookPlan — the AI-facing shape. finalizeNotebookScene (called
// client-side via generateNotebookScene, since it needs the SAME units
// array the caller already has) resolves that into a real
// VisualNotebookScene; this route never resolves provenance itself.

const DEV = process.env.NODE_ENV === "development";

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  NotebookPlanSchema,
  buildNotebookPlannerSystemPrompt,
  buildNotebookPlannerUserPrompt,
  type NoteSynthesisSources,
} from "@/lib/notelab/notebookPlanner";
import type { CanonicalThoughtUnit } from "@/lib/canonical/types";
import type { NotebookStyleProfile } from "@/lib/notelab/notebookStyleProfile";
import { isInvalidRequestError } from "@/lib/insights/openaiErrorClassification";

const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey });

// Same rationale as intelligenceSynthesis.ts's own maxDuration: a
// structured-output call at this size routinely takes well past the
// platform's default serverless timeout.
export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: "1mb" } },
};

// P1 remediation L6 — this route had no timeout, no retry, and no failure
// classification, unlike its Chat-Completions-based siblings
// (page-annotation-plan.ts, professor-lesson-plan.ts): an upstream hang
// rode all the way to the platform's own maxDuration cutoff (a generic
// 504, not an informative error), and every failure — timeout, rate
// limit, malformed request, null output, schema mismatch — collapsed into
// the same undifferentiated 500. PLAN_TIMEOUT_MS leaves headroom under
// maxDuration for one retry within the request's own budget, same
// reasoning as professor-lesson-plan.ts's own PLAN_TIMEOUT_MS.
const PLAN_TIMEOUT_MS  = 28_000;
const RETRY_BACKOFF_MS = 700;

async function callNotebookPlanner(
  input: Parameters<typeof openai.responses.parse>[0],
  timeoutMs: number,
) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await openai.responses.parse(input, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

let FORMAT: ReturnType<typeof zodTextFormat> | null = null;
try {
  FORMAT = zodTextFormat(NotebookPlanSchema, "notebook_plan");
  DEV && console.log("[NOTEBOOK_PLAN:init:schema-ok]");
} catch (schemaErr) {
  DEV && console.error("[NOTEBOOK_PLAN:init:SCHEMA_FAIL]", schemaErr instanceof Error ? schemaErr.message : String(schemaErr));
}

interface RequestBody extends NoteSynthesisSources {
  units: CanonicalThoughtUnit[];
  bookTitle?: string;
  pageNumber: number;
  styleProfile?: NotebookStyleProfile | null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "HEAD") return res.status(200).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, HEAD");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (!apiKey) {
    DEV && console.error("[NOTEBOOK_PLAN:MISSING_KEY] OPENAI_API_KEY is not set");
    return res.status(500).json({ error: "AI service is not configured for this deployment." });
  }

  if (!FORMAT) {
    DEV && console.error("[NOTEBOOK_PLAN:SCHEMA_UNINIT]");
    return res.status(500).json({ error: "Schema init failed" });
  }

  const body = (req.body ?? {}) as Partial<RequestBody>;
  const { units, bookTitle, pageNumber, professorExplanation, studentNotes, supplementalSources, existingNotebookSummary, relatedConceptKnowledge, correctionFeedback, styleProfile } = body;

  if (!Array.isArray(units)) {
    return res.status(400).json({ error: "'units' must be an array." });
  }
  if (typeof pageNumber !== "number") {
    return res.status(400).json({ error: "'pageNumber' is required." });
  }

  DEV && console.log("[NOTEBOOK_PLAN:request]", {
    page: pageNumber,
    unitCount: units.length,
    hasProfessorExplanation: !!professorExplanation?.length,
    hasStudentNotes: !!studentNotes,
    supplementalSourceCount: supplementalSources?.length ?? 0,
    hasExistingNotebookSummary: !!existingNotebookSummary,
    hasRelatedConceptKnowledge: !!relatedConceptKnowledge,
    hasStyleProfile: !!styleProfile,
    hasCorrectionFeedback: !!correctionFeedback,
  });

  const input: Parameters<typeof openai.responses.parse>[0] = {
    model: "gpt-4o",
    temperature: 0.3,
    max_output_tokens: 2200,
    text: { format: FORMAT },
    input: [
      { role: "system", content: buildNotebookPlannerSystemPrompt({ styleProfile: styleProfile ?? null }) },
      {
        role: "user",
        content: buildNotebookPlannerUserPrompt(units, {
          bookTitle,
          pageNumber,
          professorExplanation: professorExplanation ?? null,
          studentNotes: studentNotes ?? null,
          supplementalSources: supplementalSources ?? null,
          existingNotebookSummary: existingNotebookSummary ?? null,
          relatedConceptKnowledge: relatedConceptKnowledge ?? null,
          correctionFeedback: correctionFeedback ?? null,
        }),
      },
    ],
  };

  const t0 = Date.now();
  let response: Awaited<ReturnType<typeof callNotebookPlanner>>;
  let attempts = 1;
  try {
    try {
      response = await callNotebookPlanner(input, PLAN_TIMEOUT_MS);
    } catch (firstErr: any) {
      // Same reasoning as page-annotation-plan.ts's own retry guard: a 400
      // means THIS request is malformed for the resolved model — retrying
      // the identical request just reproduces the identical failure.
      if (isInvalidRequestError(firstErr)) throw firstErr;
      attempts = 2;
      console.warn("[NOTEBOOK_PLAN:retry]", {
        page: pageNumber,
        attempt: 1,
        error: firstErr?.message ?? String(firstErr),
        elapsedMs: Date.now() - t0,
      });
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
      response = await callNotebookPlanner(input, PLAN_TIMEOUT_MS);
    }
  } catch (err: any) {
    const isTimeout       = err?.name === "AbortError" || /aborted|timed? ?out/i.test(err?.message ?? "");
    const isRateLimited   = err instanceof OpenAI.APIError && err.status === 429;
    const isInvalidRequest = isInvalidRequestError(err);
    const stage = isTimeout ? "timeout" : isRateLimited ? "rate_limited" : isInvalidRequest ? "invalid_request" : "provider_request";
    console.error("[NOTEBOOK_PLAN:failed]", {
      stage,
      attempts,
      page: pageNumber,
      unitCount: units.length,
      error:     err?.message ?? String(err),
      status:    err?.status ?? null,
      elapsedMs: Date.now() - t0,
    });
    return res.status(500).json({
      error: isTimeout
        ? "Notebook plan generation timed out."
        : isRateLimited
        ? "Notebook plan generation is rate-limited — try again shortly."
        : isInvalidRequest
        ? "Notebook plan generation failed due to a request configuration error."
        : "Notebook plan generation is temporarily unavailable.",
      code: stage,
    });
  }

  const plan = response.output_parsed;
  if (!plan) {
    console.error("[NOTEBOOK_PLAN:failed]", { stage: "provider_response", page: pageNumber, attempts, elapsedMs: Date.now() - t0 });
    return res.status(500).json({ error: "Model returned no structured output.", code: "provider_response" });
  }

  let validated: ReturnType<typeof NotebookPlanSchema.parse>;
  try {
    validated = NotebookPlanSchema.parse(plan);
  } catch (schemaErr: unknown) {
    console.error("[NOTEBOOK_PLAN:failed]", {
      stage: "schema_validation",
      page: pageNumber,
      attempts,
      elapsedMs: Date.now() - t0,
      error: schemaErr instanceof Error ? schemaErr.message : String(schemaErr),
    });
    return res.status(500).json({ error: "Notebook plan generation returned a malformed plan.", code: "schema_validation" });
  }

  console.log("[NOTEBOOK_PLAN:success]", {
    page: pageNumber,
    attempts,
    elapsedMs: Date.now() - t0,
    blockCount: validated.blocks.length,
    primitives: validated.blocks.map((b) => b.primitive),
  });

  return res.status(200).json(validated);
}
