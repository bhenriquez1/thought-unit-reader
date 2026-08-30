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

const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey });

// Same rationale as intelligenceSynthesis.ts's own maxDuration: a
// structured-output call at this size routinely takes well past the
// platform's default serverless timeout.
export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: "1mb" } },
};

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
  const { units, bookTitle, pageNumber, professorExplanation, studentNotes, supplementalSources, existingNotebookSummary, relatedConceptKnowledge, styleProfile } = body;

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
  });

  const t0 = Date.now();
  try {
    const response = await openai.responses.parse({
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
          }),
        },
      ],
    });

    const plan = response.output_parsed;
    if (!plan) {
      DEV && console.error("[NOTEBOOK_PLAN:null-output]");
      return res.status(500).json({ error: "Model returned no structured output." });
    }

    const validated = NotebookPlanSchema.parse(plan);
    DEV && console.log("[NOTEBOOK_PLAN:success]", {
      elapsedMs: Date.now() - t0,
      blockCount: validated.blocks.length,
      primitives: validated.blocks.map((b) => b.primitive),
    });

    return res.status(200).json(validated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    DEV && console.error("[NOTEBOOK_PLAN:error]", { elapsedMs: Date.now() - t0, msg });
    return res.status(500).json({ error: msg.slice(0, 300) });
  }
}
