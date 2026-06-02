// pages/api/claudeEnrichment.ts
// Stage 3 enrichment — Claude adds depth to OpenAI's study model.
//
// Role: Expert Reviewer. Claude does NOT replace OpenAI fields.
// It only adds: deepInsight, alternativeExplanation, subjectConnection, expertView.
//
// Input:  the completed OpenAI study model summary (no raw PDF text)
// Output: 4 enrichment fields, all nullable

import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";

export const config = {
  maxDuration: 30,
  api: { bodyParser: { sizeLimit: "256kb" } },
};

export interface ClaudeEnrichmentInput {
  pageType:        string;
  pageThesis:      string;
  whyThisMatters:  string | null;
  keyMechanism:    string | null;
  commonConfusion: string | null;
  conceptTitles:   string[];
  domain:          string;
  pageNumber?:     number;
}

export interface ClaudeEnrichmentOutput {
  deepInsight:            string | null;
  alternativeExplanation: string | null;
  subjectConnection:      string | null;
  expertView:             string | null;
}

const SYSTEM_PROMPT = `You are an Expert Reviewer for a student study tool.

OpenAI has already generated:
- Page Thesis
- Why This Matters
- Key Mechanism
- Common Confusion
- Concept Blocks

Your role is to ENRICH, not replace. Add exactly 4 fields:

1. deepInsight — A relationship, implication, or pattern the primary analysis may have missed.
   Ask: "What does an expert notice here that a student would overlook?"
   One sentence. Specific to this page's content. Never a restatement of the thesis.

2. alternativeExplanation — A different angle or analogy for the same concept.
   Ask: "How would a different expert explain this to make it click differently?"
   Works for math (geometric intuition for an algebraic proof), medicine (mechanism via systems thinking), history (structural vs. individual causation), etc.

3. subjectConnection — A connection to another subject, clinical context, exam pattern, or real-world application.
   For medical/dental pages: clinical implication or boards-relevant pattern.
   For math: where this appears in physics, engineering, or economics.
   For history/humanities: parallel event, policy implication, or contemporary relevance.
   For science: molecular → cellular → systemic hierarchy, or ecological/environmental connection.
   One sentence. Concrete.

4. expertView — What separates expert understanding from surface-level recall on this topic.
   Ask: "What does a professor watch for when a student misunderstands this concept?"
   One sentence. Actionable for exam preparation.

Rules:
- Every field is ONE complete sentence (≤25 words). Never a fragment.
- All four fields must be substantively different from each other and from the OpenAI fields.
- Null is acceptable only if the field genuinely cannot be derived from the provided content.
- Do NOT mention "OpenAI", "the primary analysis", or "the study tool" in any field.
- Works for any academic subject — never hardcode biology, dental, or calculus examples.

Output JSON only. No markdown. Schema:
{
  "deepInsight": "string or null",
  "alternativeExplanation": "string or null",
  "subjectConnection": "string or null",
  "expertView": "string or null"
}`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "Claude enrichment not configured — ANTHROPIC_API_KEY missing" });
  }

  const body = req.body as ClaudeEnrichmentInput;
  if (!body?.pageThesis) {
    return res.status(400).json({ error: "pageThesis required" });
  }

  const userPrompt = `PAGE TYPE: ${body.pageType ?? "mixed"}
DOMAIN: ${body.domain ?? "general"}
PAGE: ${body.pageNumber ?? "unknown"}

OPENAI STUDY MODEL:
Thesis: ${body.pageThesis}
Why This Matters: ${body.whyThisMatters ?? "(not available)"}
Key Mechanism: ${body.keyMechanism ?? "(not available)"}
Common Confusion: ${body.commonConfusion ?? "(not available)"}
Concept Titles: ${body.conceptTitles.length ? body.conceptTitles.join(", ") : "(none)"}

Add deepInsight, alternativeExplanation, subjectConnection, and expertView.
Output JSON only.`;

  console.log("[CLAUDE_ENRICH_INPUT]", {
    page:            body.pageNumber ?? null,
    domain:          body.domain,
    pageType:        body.pageType,
    pageThesis:      body.pageThesis.slice(0, 120),
    whyThisMatters:  body.whyThisMatters?.slice(0, 80) ?? null,
    keyMechanism:    body.keyMechanism?.slice(0, 80) ?? null,
    commonConfusion: body.commonConfusion?.slice(0, 80) ?? null,
    conceptTitles:   body.conceptTitles,
  });

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 512,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: "user", content: userPrompt }],
    });

    const raw = message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
    console.log("[CLAUDE_ENRICH_OUTPUT]", {
      page:    body.pageNumber ?? null,
      rawLen:  raw.length,
      rawPreview: raw.slice(0, 200),
    });

    // Strip markdown code fences if present
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let parsed: ClaudeEnrichmentOutput;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("[CLAUDE_ENRICHMENT_PARSE_FAIL]", { raw: raw.slice(0, 200) });
      return res.status(200).json({
        deepInsight: null, alternativeExplanation: null,
        subjectConnection: null, expertView: null,
      } satisfies ClaudeEnrichmentOutput);
    }

    const result: ClaudeEnrichmentOutput = {
      deepInsight:            typeof parsed.deepInsight            === "string" ? parsed.deepInsight            : null,
      alternativeExplanation: typeof parsed.alternativeExplanation === "string" ? parsed.alternativeExplanation : null,
      subjectConnection:      typeof parsed.subjectConnection      === "string" ? parsed.subjectConnection      : null,
      expertView:             typeof parsed.expertView             === "string" ? parsed.expertView             : null,
    };

    console.log("[CLAUDE_ENRICHMENT_DONE]", {
      page:                 body.pageNumber ?? null,
      deepInsight:          result.deepInsight?.slice(0, 80) ?? null,
      alternativeExplanation: result.alternativeExplanation?.slice(0, 80) ?? null,
      subjectConnection:    result.subjectConnection?.slice(0, 80) ?? null,
      expertView:           result.expertView?.slice(0, 80) ?? null,
      inputTokens:          message.usage.input_tokens,
      outputTokens:         message.usage.output_tokens,
    });

    return res.status(200).json(result);
  } catch (err: any) {
    console.error("[CLAUDE_ENRICHMENT_ERROR]", err?.message ?? String(err));
    return res.status(200).json({
      deepInsight: null, alternativeExplanation: null,
      subjectConnection: null, expertView: null,
    } satisfies ClaudeEnrichmentOutput);
  }
}
