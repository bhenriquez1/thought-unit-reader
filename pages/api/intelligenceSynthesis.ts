// pages/api/intelligenceSynthesis.ts
// Educational Interpretation Engine — professor layer.
// Receives structured concept data; returns LLM-reasoned educational output.
// Uses OpenAI Responses API + Zod structured outputs for schema-enforced JSON.
//
// Staged synthesis:
//   stage=1 → fast path: coreIdea + highlightAnchors + miniTestItems only (~1–3s, 600 tokens)
//   stage=2 (or unset) → full path: all study fields (~5–15s, 1800 tokens)

const DEV = process.env.NODE_ENV === "development";

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
  buildPresetUserAugmentation,
  type SynthesisInput,
} from "@/lib/insights/synthesizeTeachingOutput";
import type { PageDomain } from "@/lib/insights/detectPageDomain";
import { isInvalidRequestError, isInsufficientQuotaError } from "@/lib/insights/openaiErrorClassification";

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

// L11 — live-testing diagnosis: this route had no request timeout, no retry,
// and no failure classification at all (unlike its sibling
// pages/api/notebook-plan.ts, which got the same fix in an earlier phase) —
// every failure mode (timeout, rate limit, exhausted credits, malformed
// output) collapsed into the same undifferentiated 500, AND every log line
// in this file was DEV-gated, so a production failure ("OpenAI synthesis
// failed", the observed "429 You have no credits remaining") left no server-
// side trace at all to diagnose it by.
//
// Review follow-up (PR #759): the caller (components/reader/useTeachingSynthesis.ts)
// aborts Stage 1 at 12_000ms and Stage 2 at 20_000ms. A single shared
// 28_000ms per-attempt budget meant the server's first attempt regularly
// outlived the caller's own deadline, and a retry after that ran with no
// consumer left to receive it. Per-stage budgets below are sized with a
// margin under each caller deadline; retrying is skipped entirely when the
// first attempt's own failure was itself a timeout, since a second
// full-length attempt structurally cannot finish before the caller has
// already given up.
const STAGE1_TIMEOUT_MS = 10_000; // caller aborts Stage 1 at 12_000ms
const STAGE2_TIMEOUT_MS = 18_000; // caller aborts Stage 2 at 20_000ms
const RETRY_BACKOFF_MS  = 700;

async function callSynthesis(
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

type SynthesisFailureStage =
  | "timeout" | "rate_limited" | "insufficient_quota" | "invalid_request"
  | "provider_request" | "provider_response" | "schema_validation";

function classifySynthesisFailure(err: any): SynthesisFailureStage {
  const isTimeout = err?.name === "AbortError" || /aborted|timed? ?out/i.test(err?.message ?? "");
  if (isTimeout) return "timeout";
  if (isInsufficientQuotaError(err)) return "insufficient_quota";
  if (err instanceof OpenAI.APIError && err.status === 429) return "rate_limited";
  if (isInvalidRequestError(err)) return "invalid_request";
  return "provider_request";
}

// A timeout means the prior attempt already spent its whole per-attempt
// budget, so a same-size retry cannot finish before the caller's own
// deadline — retrying just burns compute with no consumer left to receive
// it. Permanent provider errors (malformed request, exhausted quota)
// reproduce identically on retry. Only fast, transient failures — network
// blips, retryable 5xx, genuine rate limits — are worth the backoff+retry.
function isRetryableSynthesisFailure(err: unknown): boolean {
  const failureStage = classifySynthesisFailure(err);
  return failureStage !== "timeout" && failureStage !== "invalid_request" && failureStage !== "insufficient_quota";
}

function synthesisFailureMessage(failureStage: SynthesisFailureStage, label: string): string {
  switch (failureStage) {
    case "timeout": return `${label} timed out.`;
    case "rate_limited": return `${label} is rate-limited — try again shortly.`;
    case "insufficient_quota": return `${label} is unavailable — the AI service account has run out of credits.`;
    case "invalid_request": return `${label} failed due to a request configuration error.`;
    default: return `${label} is temporarily unavailable.`;
  }
}

// Pre-build format objects at module load — schema errors surface at startup.
let FORMAT_FULL: ReturnType<typeof zodTextFormat> | null = null;
let FORMAT_STAGE1: ReturnType<typeof zodTextFormat> | null = null;
try {
  FORMAT_FULL   = zodTextFormat(TeachingSynthesisSchema,  "teaching_synthesis");
  FORMAT_STAGE1 = zodTextFormat(Stage1SynthesisSchema,    "stage1_synthesis");
  DEV && console.log("[SYNTH:init:schema-ok]");
} catch (schemaErr) {
  DEV && console.error("[SYNTH:init:SCHEMA_FAIL]", schemaErr instanceof Error ? schemaErr.message : String(schemaErr));
}

const VALID_DOMAINS: PageDomain[] = ["math", "science", "clinical", "fiction", "general"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "HEAD") return res.status(200).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, HEAD");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (!apiKey) {
    DEV && console.error("[SYNTH:cp0:MISSING_KEY] OPENAI_API_KEY is not set");
    return res.status(500).json({ error: "AI service is not configured for this deployment." });
  }

  if (!FORMAT_FULL || !FORMAT_STAGE1) {
    DEV && console.error("[SYNTH:cp1:SCHEMA_UNINIT]");
    return res.status(500).json({ error: "Schema init failed" });
  }

  const body = (req.body ?? {}) as Partial<SynthesisInput> & { stage?: string };
  const { stage = "2", domain, presetId, pageObjective, pageThesis, pageSummary, pageText, rankedConcepts } = body;

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
  DEV && console.log("[SYNTH:received]", {
    stage,
    page: (body as any).pageNumber ?? null,
    receivedChars,
    pageTextChars: typeof pageText === "string" ? pageText.length : 0,
    conceptCount: rankedConcepts.length,
  });
  if (receivedChars > 50_000) {
    DEV && console.error("[SYNTH:PAYLOAD_TOO_LARGE] book-level text reached the API — synthesis should be page-scoped", { receivedChars });
  }

  const safeDomain: PageDomain = VALID_DOMAINS.includes(domain as PageDomain)
    ? (domain as PageDomain)
    : "general";
  const safePresetId: string | undefined = typeof presetId === "string" ? presetId : undefined;

  const safeInput: SynthesisInput = {
    domain:        safeDomain,
    presetId:      safePresetId,
    pageObjective: typeof pageObjective === "string" ? pageObjective : undefined,
    pageThesis:    typeof pageThesis    === "string" ? pageThesis    : undefined,
    pageSummary:   typeof pageSummary   === "string" ? pageSummary   : undefined,
    pageText:      typeof pageText      === "string" ? pageText.slice(0, 8000) : undefined,
    rankedConcepts: rankedConcepts.slice(0, 15),
  };

  // ── Stage 1: Fast path ─────────────────────────────────────────────────────
  if (stage === "1") {
    DEV && console.log("[SYNTH:stage1:api-start]", {
      domain: safeDomain,
      conceptCount: safeInput.rankedConcepts.length,
      hasPageThesis: !!safeInput.pageThesis,
    });
    const s1Start = Date.now();
    const s1Input: Parameters<typeof openai.responses.parse>[0] = {
      model: "gpt-4o",
      temperature: 0.2,
      max_output_tokens: 1000,  // expanded: study fields add ~400 tokens
      text: { format: FORMAT_STAGE1 },
      input: [
        { role: "system", content: buildStage1SystemPrompt(safeDomain) },
        { role: "user",   content: buildPresetUserAugmentation(safePresetId) + "\n\n" + buildStage1UserPrompt(safeInput) },
      ],
    };

    let response: Awaited<ReturnType<typeof callSynthesis>>;
    let attempts = 1;
    try {
      try {
        response = await callSynthesis(s1Input, STAGE1_TIMEOUT_MS);
      } catch (firstErr: any) {
        if (!isRetryableSynthesisFailure(firstErr)) throw firstErr;
        attempts = 2;
        console.warn("[SYNTH:stage1:retry]", { attempt: 1, error: firstErr?.message ?? String(firstErr), elapsedMs: Date.now() - s1Start });
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
        response = await callSynthesis(s1Input, STAGE1_TIMEOUT_MS);
      }
    } catch (err: any) {
      const failureStage = classifySynthesisFailure(err);
      console.error("[SYNTH:stage1:failed]", {
        stage: failureStage, attempts, error: err?.message ?? String(err), status: err?.status ?? null, elapsedMs: Date.now() - s1Start,
      });
      return res.status(500).json({ error: synthesisFailureMessage(failureStage, "Stage 1 synthesis"), code: failureStage });
    }

    DEV && console.log("[SYNTH:stage1:openai-elapsed-ms]", Date.now() - s1Start);
    const s1 = response.output_parsed;
    if (!s1) {
      console.error("[SYNTH:stage1:failed]", { stage: "provider_response", attempts, elapsedMs: Date.now() - s1Start });
      return res.status(500).json({ error: "Stage 1: no structured output", code: "provider_response" });
    }

    let validated: ReturnType<typeof Stage1SynthesisSchema.parse>;
    try {
      validated = Stage1SynthesisSchema.parse(s1);
    } catch (schemaErr: unknown) {
      console.error("[SYNTH:stage1:failed]", {
        stage: "schema_validation", attempts, elapsedMs: Date.now() - s1Start,
        error: schemaErr instanceof Error ? schemaErr.message : String(schemaErr),
      });
      return res.status(500).json({ error: "Stage 1 synthesis returned a malformed result.", code: "schema_validation" });
    }

    DEV && console.log("[SYNTH:stage1:api-done]", {
      elapsedMs:      Date.now() - s1Start,
      coreIdea:       validated.coreIdea?.slice(0, 60),
      whyThisMatters: !!validated.whyThisMatters,
      keyMechanism:   !!validated.keyMechanism,
      commonConfusion: !!validated.commonConfusion,
      anchors:        validated.highlightAnchors?.length ?? 0,
      miniTest:       validated.miniTestItems?.length ?? 0,
    });
    console.log("[SYNTH:stage1:success]", { attempts, elapsedMs: Date.now() - s1Start });
    return res.status(200).json(validated);
  }

  // ── Stage 2: Full synthesis ─────────────────────────────────────────────────
  DEV && console.log("[SYNTH:cp2:request-start]", {
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
  DEV && console.log("[SYNTH:cp3:openai-start]", { model: "gpt-4o", maxTokens: 1800 });

  const s2Input: Parameters<typeof openai.responses.parse>[0] = {
    model: "gpt-4o",
    temperature: 0.3,
    max_output_tokens: 1800,
    text: { format: FORMAT_FULL },
    input: [
      { role: "system", content: buildSystemPrompt(safeDomain) },
      { role: "user",   content: buildPresetUserAugmentation(safePresetId) + "\n\n" + buildUserPrompt(safeInput) },
    ],
  };

  let response: Awaited<ReturnType<typeof callSynthesis>>;
  let attempts = 1;
  try {
    try {
      response = await callSynthesis(s2Input, STAGE2_TIMEOUT_MS);
    } catch (firstErr: any) {
      if (!isRetryableSynthesisFailure(firstErr)) throw firstErr;
      attempts = 2;
      console.warn("[SYNTH:stage2:retry]", { attempt: 1, error: firstErr?.message ?? String(firstErr), elapsedMs: Date.now() - s2Start });
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
      response = await callSynthesis(s2Input, STAGE2_TIMEOUT_MS);
    }
  } catch (err: any) {
    const failureStage = classifySynthesisFailure(err);
    console.error("[SYNTH:stage2:failed]", {
      stage: failureStage, attempts, error: err?.message ?? String(err), status: err?.status ?? null, elapsedMs: Date.now() - s2Start,
    });
    return res.status(500).json({ error: synthesisFailureMessage(failureStage, "Synthesis"), code: failureStage });
  }

  const synthesis = response.output_parsed;
  DEV && console.log("[SYNTH:cp4:openai-returned]", {
    elapsedMs: Date.now() - s2Start,
    hasOutput: !!synthesis,
    rawSnip: JSON.stringify(synthesis ?? {}).slice(0, 300),
  });

  if (!synthesis) {
    console.error("[SYNTH:stage2:failed]", { stage: "provider_response", attempts, elapsedMs: Date.now() - s2Start });
    return res.status(500).json({ error: "Model returned no structured output.", code: "provider_response" });
  }

  let validated: ReturnType<typeof TeachingSynthesisSchema.parse>;
  try {
    validated = TeachingSynthesisSchema.parse(synthesis);
  } catch (schemaErr: unknown) {
    console.error("[SYNTH:stage2:failed]", {
      stage: "schema_validation", attempts, elapsedMs: Date.now() - s2Start,
      error: schemaErr instanceof Error ? schemaErr.message : String(schemaErr),
    });
    return res.status(500).json({ error: "Synthesis returned a malformed result.", code: "schema_validation" });
  }

  DEV && console.log("[SYNTH:cp5:success]", {
    coreIdea:     validated.coreIdea?.slice(0, 80) ?? null,
    mechanism:    validated.mechanism?.slice(0, 80) ?? null,
    conceptCount: validated.concepts?.length ?? 0,
    anchorCount:  validated.highlightAnchors?.length ?? 0,
  });
  console.log("[SYNTH:stage2:success]", { attempts, elapsedMs: Date.now() - s2Start });

  return res.status(200).json(validated);
}
