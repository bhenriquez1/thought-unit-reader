// pages/api/claudeEnrichment.ts
// Stage 3 enrichment — Claude adds deeper reasoning on top of OpenAI's study model.
//
// Architecture:
//   OpenAI (Stage 1/2) = primary teacher — reads the page and builds the base study model.
//   Claude (Stage 3)   = expert reviewer — receives the OpenAI model and enriches it.
//
// Claude does NOT re-read the PDF. It receives the OpenAI study model summary
// plus grounded anchor candidates already identified from the page, then adds:
//   deepInsight, alternativeExplanation, subjectConnection, expertView, expertTrap
//   and optional better anchor suggestions if OpenAI missed key evidence.
//
// Claude must stay grounded to the current page — never invent outside content.

const DEV = process.env.NODE_ENV === "development";

import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";

export const config = {
  maxDuration: 30,
  api: { bodyParser: { sizeLimit: "256kb" } },
};

export interface ClaudeEnrichmentInput {
  pageType:                string;
  pageThesis:              string;
  whyThisMatters:          string | null;
  keyMechanism:            string | null;
  commonConfusion:         string | null;
  conceptTitles:           string[];
  domain:                  string;
  pageNumber?:             number;
  /** Verbatim text spans already grounded to the PDF — Claude can suggest better ones */
  groundedAnchorCandidates?: string[];
  /** Diagnostic identifiers only — never used for prompting, logged on failure for observability. */
  pageTruthKey?:           string;
  canonicalUnitId?:        string;
}

export interface ClaudeEnrichmentOutput {
  deepInsight:            string | null;
  alternativeExplanation: string | null;
  subjectConnection:      string | null;
  expertView:             string | null;
  /** The specific trap/pitfall an expert would flag — distinct from commonConfusion */
  expertTrap:             string | null;
  // Math-specific fields — null unless domain is math/calculus
  formulaRule:            string | null;
  workedExampleLogic:     string | null;
  practiceCheckpoint:     string | null;
  /** Better anchor suggestions if OpenAI missed key evidence — verbatim spans ≤ 30 words */
  betterAnchors:          string[] | null;
  /**
   * Degraded-mode envelope — present only when Claude enrichment could not run
   * (missing config or upstream failure after retries). All content fields above
   * are still null-filled so existing consumers of ClaudeEnrichmentOutput keep working;
   * ok/code/message let callers show a specific "temporarily unavailable" message
   * instead of silently hiding the section.
   */
  ok?:                     boolean;
  code?:                   "UPSTREAM_UNAVAILABLE";
  message?:                string;
  fallbackAllowed?:        boolean;
}

const ENRICHMENT_TIMEOUT_MS = 18_000;
const RETRY_BACKOFF_MS      = 600;

function degraded(message: string): ClaudeEnrichmentOutput {
  return { ...emptyOutput(), ok: false, code: "UPSTREAM_UNAVAILABLE", message, fallbackAllowed: true };
}

async function callAnthropic(
  client: Anthropic,
  userPrompt: string,
  timeoutMs: number,
): Promise<Anthropic.Message> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await client.messages.create(
      {
        model:      "claude-sonnet-4-6",
        max_tokens: 640,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userPrompt }],
      } as Parameters<typeof client.messages.create>[0],
      { signal: ctrl.signal },
    ) as Anthropic.Message;
  } finally {
    clearTimeout(timer);
  }
}

const SYSTEM_PROMPT = `You are an Expert Reviewer for a student study tool.

Architecture:
- OpenAI has already read the current page and built the base study model (thesis, mechanism, confusion, concept blocks, highlight anchors).
- You receive that model plus grounded anchor candidates OpenAI already identified.
- Your job is to ENRICH, not replace. Stay grounded to the current page — do not invent content from outside.

Add these fields:

1. deepInsight — A relationship, implication, or pattern the primary analysis may have missed.
   Ask: "What does an expert notice here that a student would overlook?"
   One sentence. Specific to this page's content. Never a restatement of the thesis.

2. alternativeExplanation — A different angle or analogy for the same concept.
   Ask: "How would a different expert explain this to make it click differently?"
   Works for any subject: math (geometric intuition), medicine (systems thinking), history (structural causation).

3. subjectConnection — A connection to another subject, clinical context, exam pattern, or real-world application.
   For math: where this appears in physics, engineering, or economics.
   For clinical: boards-relevant pattern or differential.
   For science: molecular → systemic hierarchy or ecological connection.
   One sentence. Concrete.

4. expertView — What separates expert understanding from surface-level recall on this topic.
   Ask: "What does a professor watch for when a student misunderstands this?"
   One sentence. Actionable for exam preparation.

5. expertTrap — The specific, non-obvious pitfall an expert would flag about this page's content.
   Different from commonConfusion (which is what students get wrong). This is what separates a B+ from an A.
   One sentence. Must be distinct from the expertView and commonConfusion provided.

For MATH/CALCULUS pages (domain==="math" or pageType contains "math"), also add:
6. formulaRule — The core formula, rule, or theorem stated as a precise, testable rule.
   Include the formula name and what it computes or guarantees.

7. workedExampleLogic — The logical decision sequence for solving this type of problem.
   Focus on WHEN to apply the rule, not just the mechanical steps.

8. practiceCheckpoint — One targeted question to verify the student understood this page.
   Phrase as a question. Specific to this page's content.

For ANCHOR SUGGESTIONS (all page types):
9. betterAnchors — If the grounded anchors provided are weak, vague, or miss a more important span,
   suggest 1–2 better verbatim text spans (≤ 30 words each) from the page content provided.
   Return null if the existing anchors are already good.
   IMPORTANT: Only suggest spans that would realistically appear verbatim in the source page text.

Rules:
- Every text field is ONE complete sentence (≤ 30 words). Never a fragment.
- All fields must be substantively different from each other and from the OpenAI fields.
- null is acceptable only if the field genuinely cannot be derived from the content provided.
- formulaRule, workedExampleLogic, practiceCheckpoint must be null for non-math pages.
- Do NOT mention "OpenAI", "Claude", "the primary analysis", or "the study tool" in any field.
- Never invent facts not supported by the page content described in the input.

Output JSON only. No markdown. Schema:
{
  "deepInsight": "string or null",
  "alternativeExplanation": "string or null",
  "subjectConnection": "string or null",
  "expertView": "string or null",
  "expertTrap": "string or null",
  "formulaRule": "string or null",
  "workedExampleLogic": "string or null",
  "practiceCheckpoint": "string or null",
  "betterAnchors": ["verbatim span 1", "verbatim span 2"] or null
}`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Diagnostic: confirm the env variable name is correct in Render / .env.local
  DEV && console.log("[CLAUDE_ENV_CHECK]", {
    CLAUDE_API_KEY_loaded: Boolean(process.env.CLAUDE_API_KEY),
    note: "If false — add/rename the env variable to CLAUDE_API_KEY in Render and redeploy",
  });

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    // Always log (not DEV-gated) — a missing key in production is a config error, not routine noise.
    console.error("[CLAUDE_ENRICHMENT_UNAVAILABLE]", {
      reason:       "CLAUDE_API_KEY missing",
      pageTruthKey: (req.body as ClaudeEnrichmentInput)?.pageTruthKey ?? null,
    });
    return res.status(200).json(degraded("Claude enrichment is not configured on the server."));
  }

  const body = req.body as ClaudeEnrichmentInput;
  if (!body?.pageThesis) {
    return res.status(400).json({ error: "pageThesis required" });
  }

  const anchorSection = body.groundedAnchorCandidates?.length
    ? `\nGROUNDED ANCHORS (OpenAI already identified these spans):\n${body.groundedAnchorCandidates.map((a, i) => `  ${i + 1}. "${a}"`).join("\n")}`
    : "\nGROUNDED ANCHORS: (none provided)";

  const userPrompt = `PAGE TYPE: ${body.pageType ?? "mixed"}
DOMAIN: ${body.domain ?? "general"}
PAGE: ${body.pageNumber ?? "unknown"}

OPENAI BASE STUDY MODEL:
Thesis: ${body.pageThesis}
Why This Matters: ${body.whyThisMatters ?? "(not available)"}
Key Mechanism: ${body.keyMechanism ?? "(not available)"}
Common Confusion: ${body.commonConfusion ?? "(not available)"}
Concept Titles: ${body.conceptTitles.length ? body.conceptTitles.join(", ") : "(none)"}
${anchorSection}

Add all enrichment fields. Output JSON only.`;

  DEV && console.log("[CLAUDE_EXPERT_START]", {
    page:                    body.pageNumber ?? null,
    domain:                  body.domain,
    pageType:                body.pageType,
    pageThesis:              body.pageThesis.slice(0, 120),
    whyThisMatters:          body.whyThisMatters?.slice(0, 80) ?? null,
    keyMechanism:            body.keyMechanism?.slice(0, 80) ?? null,
    commonConfusion:         body.commonConfusion?.slice(0, 80) ?? null,
    conceptTitles:           body.conceptTitles,
    anchorCandidateCount:    body.groundedAnchorCandidates?.length ?? 0,
  });

  const client = new Anthropic({ apiKey });
  const diagnosticIds = { pageTruthKey: body.pageTruthKey ?? null, canonicalUnitId: body.canonicalUnitId ?? null, page: body.pageNumber ?? null };
  const startedAt = Date.now();

  let message: Anthropic.Message;
  try {
    try {
      message = await callAnthropic(client, userPrompt, ENRICHMENT_TIMEOUT_MS);
    } catch (firstErr: any) {
      console.warn("[CLAUDE_ENRICHMENT_RETRY]", {
        ...diagnosticIds,
        attempt:   1,
        error:     firstErr?.message ?? String(firstErr),
        elapsedMs: Date.now() - startedAt,
      });
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
      message = await callAnthropic(client, userPrompt, ENRICHMENT_TIMEOUT_MS);
    }
  } catch (err: any) {
    console.error("[CLAUDE_ENRICHMENT_FAILED]", {
      ...diagnosticIds,
      attempts:  2,
      error:     err?.message ?? String(err),
      status:    err?.status ?? null,
      durationMs: Date.now() - startedAt,
    });
    return res.status(200).json(degraded("Claude enrichment is temporarily unavailable — showing the base study notes."));
  }

  const raw = message.content[0]?.type === "text" ? message.content[0].text.trim() : "";

  // Strip markdown code fences if present
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  let parsed: ClaudeEnrichmentOutput;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    DEV && console.error("[CLAUDE_EXPERT_ERROR]", { reason: "JSON parse failed", raw: raw.slice(0, 200) });
    return res.status(200).json(emptyOutput());
  }

  const result: ClaudeEnrichmentOutput = {
    deepInsight:            str(parsed.deepInsight),
    alternativeExplanation: str(parsed.alternativeExplanation),
    subjectConnection:      str(parsed.subjectConnection),
    expertView:             str(parsed.expertView),
    expertTrap:             str(parsed.expertTrap),
    formulaRule:            str(parsed.formulaRule),
    workedExampleLogic:     str(parsed.workedExampleLogic),
    practiceCheckpoint:     str(parsed.practiceCheckpoint),
    betterAnchors:          Array.isArray(parsed.betterAnchors) && parsed.betterAnchors.length > 0
                              ? parsed.betterAnchors.filter((a): a is string => typeof a === "string").slice(0, 3)
                              : null,
  };

  DEV && console.log("[CLAUDE_EXPERT_DONE]", {
    ...diagnosticIds,
    durationMs:             Date.now() - startedAt,
    deepInsight:            result.deepInsight?.slice(0, 80) ?? null,
    alternativeExplanation: result.alternativeExplanation?.slice(0, 80) ?? null,
    subjectConnection:      result.subjectConnection?.slice(0, 80) ?? null,
    expertView:             result.expertView?.slice(0, 80) ?? null,
    expertTrap:             result.expertTrap?.slice(0, 80) ?? null,
    formulaRule:            result.formulaRule?.slice(0, 80) ?? null,
    betterAnchorCount:      result.betterAnchors?.length ?? 0,
    inputTokens:            message.usage.input_tokens,
    outputTokens:           message.usage.output_tokens,
  });

  return res.status(200).json(result);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function emptyOutput(): ClaudeEnrichmentOutput {
  return {
    deepInsight: null, alternativeExplanation: null,
    subjectConnection: null, expertView: null, expertTrap: null,
    formulaRule: null, workedExampleLogic: null, practiceCheckpoint: null,
    betterAnchors: null,
  };
}
