// pages/api/page-annotation-plan.ts
// Surgeon annotation-planning pass.
//
// Receives the structured content for the current page (canonical units +
// page thesis + pageTruthKey) and returns a validated PageAnnotationPlan.
//
// The planner GROUPS related canonical units into annotation structures before
// any rendering occurs — preventing five disconnected highlights when the
// content is one procedure, one definition set, or one comparison.
//
// Security notes:
//   - OPENAI_API_KEY is server-side only; never NEXT_PUBLIC_OPENAI_API_KEY.
//   - All user-controlled values go into the messages array only.
//   - The system prompt is 100% static developer-authored text.
//   - Raw SDK errors, model names, and stack traces are never exposed.

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { PageAnnotationPlanSchema } from "@/lib/insights/pageAnnotationPlan";

export const config = {
  maxDuration: 30,
  api: { bodyParser: { sizeLimit: "32kb" } },
};

// ── Request / response types ───────────────────────────────────────────────────

export interface AnnotationPlanUnit {
  id: string;
  text: string;
  canonicalType?: string;
  priorityTier?: number;
  title?: string;
}

export interface AnnotationPlanRequest {
  pageTruthKey: string;
  pageText: string;
  canonicalUnits: AnnotationPlanUnit[];
  /** Optional domain hint (e.g. "dentistry", "biology") for type label tuning. */
  domain?: string;
}

export type AnnotationPlanResponse =
  | { ok: true; plan: unknown }
  | { ok: false; error: string; code: string };

// ── Static system prompt ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a surgical annotation planner for a medical/scientific PDF reader.

Your task: given the current page's canonical thought units, group them into annotation structures that will be rendered as visual overlays on the PDF page. You must NOT invent content — every structure must be grounded in the provided canonical units.

Rules:
1. Group related units into one structure rather than creating many disconnected highlights.
   - Multiple definition sentences → one "definition" structure.
   - A chain of mechanism steps → one "mechanism" structure with one brace.
   - Sequential procedure steps → one "procedure" structure with a numbered rail.
2. Each structure MUST reference at least one canonical unit id from the provided list.
3. Do NOT reference canonical unit ids from other pages or invent new ids.
4. The pageThesis must be a single sentence summarising the page's main subject.
5. Assign the appropriate display style:
   - definition → "gold-rule"
   - mechanism  → "brace"
   - procedure  → "numbered-rail"
   - decision   → "decision-marker"
   - trap       → "danger-notch"
   - pearl      → "pearl-marker"
   - comparison → "connector"
   - evidence   → "underline"
6. Keep labels short (≤ 8 words). Keep rationales factual (≤ 60 words).
7. Produce at most 8 structures per page. Prefer fewer, more precise groups.

Respond ONLY with a JSON object matching this schema — no prose, no markdown fences:
{
  "pageTruthKey": "<string — copy from input>",
  "pageThesis": "<one-sentence string>",
  "structures": [
    {
      "id": "<unique string>",
      "type": "<definition|mechanism|procedure|decision|trap|pearl|comparison|evidence>",
      "canonicalUnitIds": ["<id>", ...],
      "label": "<short label>",
      "rationale": "<one sentence>",
      "display": "<gold-rule|brace|numbered-rail|decision-marker|danger-notch|pearl-marker|connector|underline>"
    }
  ]
}`;

// ── Handler ────────────────────────────────────────────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AnnotationPlanResponse>,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "Method not allowed", code: "method_not_allowed" });
    return;
  }

  const body = req.body as Partial<AnnotationPlanRequest>;

  // Validate required fields
  if (!body.pageTruthKey || typeof body.pageTruthKey !== "string") {
    res.status(400).json({ ok: false, error: "pageTruthKey is required", code: "missing_ptk" });
    return;
  }
  if (!Array.isArray(body.canonicalUnits) || body.canonicalUnits.length === 0) {
    res.status(400).json({ ok: false, error: "canonicalUnits must be a non-empty array", code: "missing_units" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ ok: false, error: "Annotation service unavailable", code: "no_api_key" });
    return;
  }

  // Build the user message from page content — all user-controlled values go
  // into the messages array, never into the system prompt.
  const unitLines = body.canonicalUnits
    .slice(0, 20) // cap to prevent oversized prompts
    .map((u) => `[${u.id}] (${u.canonicalType ?? "unknown"}, tier=${u.priorityTier ?? "?"}) ${u.title ? `"${u.title}" — ` : ""}${u.text.slice(0, 300)}`)
    .join("\n");

  const pageTextSnippet = (body.pageText ?? "").slice(0, 1500);
  const domainHint = body.domain ? `Domain: ${body.domain}\n` : "";

  const userMessage =
    `pageTruthKey: ${body.pageTruthKey}\n` +
    `${domainHint}` +
    `\nCurrent page text (excerpt):\n${pageTextSnippet}\n` +
    `\nCanonical units for this page (${body.canonicalUnits.length} total):\n${unitLines}\n` +
    `\nProduce the annotation plan JSON.`;

  try {
    const client = new OpenAI({ apiKey });

    const completion = await client.chat.completions.create({
      model:       "gpt-4o-mini",
      temperature: 0,
      max_tokens:  1500,
      messages: [
        { role: "system",  content: SYSTEM_PROMPT },
        { role: "user",    content: userMessage },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      res.status(502).json({ ok: false, error: "Annotation planner returned no content", code: "empty_response" });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      res.status(502).json({ ok: false, error: "Annotation planner returned invalid JSON", code: "parse_error" });
      return;
    }

    // Zod validation — ensures the plan conforms to the schema before it ever
    // reaches the client or the PDF overlay renderer.
    const result = PageAnnotationPlanSchema.safeParse(parsed);
    if (!result.success) {
      res.status(502).json({
        ok: false,
        error: "Annotation plan failed schema validation",
        code: "schema_error",
      });
      return;
    }

    // Enforce that every canonicalUnitId references an input unit from this page.
    const knownIds = new Set(body.canonicalUnits.map((u) => u.id));
    for (const structure of result.data.structures) {
      for (const id of structure.canonicalUnitIds) {
        if (!knownIds.has(id)) {
          res.status(502).json({
            ok: false,
            error: "Annotation plan references unknown canonical unit id — cross-page bleed prevented",
            code: "cross_page_unit",
          });
          return;
        }
      }
    }

    res.status(200).json({ ok: true, plan: result.data });
  } catch (err) {
    const isOpenAIError = err instanceof OpenAI.APIError;
    if (isOpenAIError && err.status === 429) {
      res.status(429).json({ ok: false, error: "Rate limited — try again shortly", code: "rate_limited" });
      return;
    }
    res.status(502).json({ ok: false, error: "Annotation planner unavailable", code: "upstream_error" });
  }
}
