// pages/api/page-annotation-plan.ts
// Surgeon annotation-planning pass — OpenAI reads the CURRENT page fresh (image +
// text + headings + domain + semantic pack) and proposes a SurgeonAnnotationPlan:
// meaning, not coordinates. It must NOT be given the page's own prior thesis/
// summary as primary context (that is the confirmed cause of stale/incorrect
// annotations) — only buildSurgeonAnnotationInput()'s output, which never
// contains those fields.
//
// The app — not this endpoint — is the authority on whether an exactQuote is
// real: lib/highlights/groundSurgeonQuotes.ts verifies every quote against the
// live PDF text layer and drops anything that doesn't match. This endpoint does
// only a lightweight defense-in-depth check against the extracted text it was
// given (see below) — that is NOT a substitute for the client-side check, since
// the server never sees the actual rendered TextLayerRegistry.
//
// Security notes:
//   - OPENAI_API_KEY is server-side only; never NEXT_PUBLIC_OPENAI_API_KEY.
//   - All user-controlled values go into the messages array only.
//   - The system prompt is 100% static developer-authored text.
//   - Raw SDK errors, model names, and stack traces are never exposed.

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import {
  SurgeonAnnotationPlanSchema,
  type SurgeonAnnotationPlan,
} from "@/lib/insights/pageAnnotationPlan";
import type { SurgeonAnnotationInput } from "@/lib/insights/buildSurgeonAnnotationInput";

const DEV = process.env.NODE_ENV === "development";

export const config = {
  maxDuration: 30,
  // A base64 JPEG page image easily runs 150-400kb — well above the old 32kb cap.
  api: { bodyParser: { sizeLimit: "4mb" } },
};

const PLAN_TIMEOUT_MS  = 25_000;
const RETRY_BACKOFF_MS = 700;

export type AnnotationPlanResponse =
  | { ok: true; plan: SurgeonAnnotationPlan }
  | { ok: false; error: string; code: string; fallbackAllowed: true };

function degraded(message: string, code = "UPSTREAM_UNAVAILABLE"): AnnotationPlanResponse {
  return { ok: false, error: message, code, fallbackAllowed: true };
}

// ── Static system prompt ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a surgical annotation planner for a PDF study reader.

You are reading THIS page fresh, right now, from the image and text provided below.
Do NOT treat any pre-existing summary as ground truth — verify everything against what
you actually see in the page image and text. "existingCanonicalUnits" (if provided) are
prior context from an earlier pass, offered only for continuity — re-derive the page's
content yourself rather than assuming they are complete or still accurate.

Your task: identify what on this page deserves a highlight/annotation, and propose the
EXACT verbatim quote for it. You do NOT propose coordinates — the app finds your quote
in the real PDF text and draws it. If you cannot quote something exactly as it appears
on the page, do not propose it as an annotation.

Rules:
1. Every exactQuote must be copied verbatim from the page text/image — same words, same
   order, same punctuation. Do not paraphrase, summarize, or fix typos in a quote.
2. Prefer fewer, well-chosen annotations over many disconnected ones. Group a multi-step
   mechanism or procedure into one annotation with the fullest verbatim span you can quote,
   rather than five tiny fragments.
3. Assign canonicalType:
   - definition   — a term is being defined
   - mechanism    — a causal chain / how-it-works explanation
   - procedure    — a sequential set of steps to follow
   - decision     — a choice, diagnosis, or comparison-driven decision point
   - comparison   — two or more things being contrasted
   - trap         — a common mistake, exception, or warning
   - clinicalPearl — an expert insight or memorable shortcut
   - supportingEvidence — supporting data, citation, or example
4. Assign importance: "critical" (core to the page's thesis), "high" (important supporting
   idea), or "supporting" (nice-to-have context).
5. Assign treatment based on canonicalType:
   definition→definitionBar, mechanism→mechanismBrace, procedure→procedureRail,
   decision→decisionConnector, comparison→comparisonBracket, trap→trapNotch,
   clinicalPearl→pearlMarker, supportingEvidence→evidenceUnderline.
6. Keep "reason" to one factual sentence (≤ 40 words) explaining why this span matters.
7. pageThesis is a single sentence stating the page's main subject, derived fresh from
   what you read — not copied from any prior-pass context.
8. Produce at most 10 annotations per page. Prefer fewer, more precise ones.
9. SENTENCE BOUNDARIES — this is the most important rule for how the annotation actually
   looks on the page. Never quote a mid-sentence fragment. Set spanScope to control this:
   - spanScope: "fullSentence" (the default — use this for almost everything) — exactQuote
     MUST run from the sentence's first meaningful word to its ending punctuation (. ; or :).
     Bad:  "...before considering a diagnosis or treatment..."
     Good: "Before considering a diagnosis or treatment, the clinician should interview the
            patient to identify and explore all the concerns, related conditions, and
            expectations that prompted the patient to seek care."
   - spanScope: "entity" — ONLY for a single term being defined, a drug name, an anatomical
     structure, an equation, a chemical formula, or a short symbol/definition-term where
     highlighting just that span (not the whole sentence) is the deliberately correct
     teaching behavior. Do not use "entity" as a shortcut to avoid quoting a full sentence —
     it is the narrow exception, "fullSentence" is the default for everything else.
10. MULTI-SENTENCE CONCEPTS — if one concept's explanation naturally runs across two or more
    consecutive sentences (e.g. "Phase 1 is X. Phase 2 is Y. Phase 3 is Z." describing one
    procedure), do NOT create several separate annotations for it. Instead return ONE
    annotation whose exactQuote is the full verbatim run of all those sentences together,
    so the page renders one continuous highlight with one margin label — not several
    disconnected fragments for what is really a single idea.

Respond ONLY with a JSON object matching this schema — no prose, no markdown fences:
{
  "pageTruthKey": "<string — copy from input>",
  "pageThesis": "<one-sentence string>",
  "annotations": [
    {
      "canonicalType": "<definition|mechanism|procedure|decision|comparison|trap|clinicalPearl|supportingEvidence>",
      "exactQuote": "<verbatim span from the page — full sentence(s) unless spanScope is entity>",
      "reason": "<one sentence>",
      "importance": "<critical|high|supporting>",
      "treatment": "<definitionBar|mechanismBrace|procedureRail|decisionConnector|comparisonBracket|trapNotch|pearlMarker|evidenceUnderline>",
      "spanScope": "<fullSentence|entity — defaults to fullSentence>"
    }
  ]
}`;

// ── OpenAI call with timeout ───────────────────────────────────────────────────

async function callOpenAI(
  client: OpenAI,
  userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[],
  timeoutMs: number,
) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await client.chat.completions.create(
      {
        model:            "gpt-4o",
        temperature:      0,
        max_tokens:       2500,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: userContent },
        ],
        response_format:  { type: "json_object" },
      },
      { signal: ctrl.signal },
    );
  } finally {
    clearTimeout(timer);
  }
}

// ── Lightweight defense-in-depth check ─────────────────────────────────────────
// NOT authoritative — this only checks against the extracted text the server was
// given. The client's check against the live rendered PDF text layer (via
// lib/highlights/groundSurgeonQuotes.ts) is the real gate before anything draws.

function normalizeForServerCheck(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function quotesPlausible(plan: SurgeonAnnotationPlan, pageText: string): boolean {
  const normPage = normalizeForServerCheck(pageText);
  const plausible = plan.annotations.filter(a => normPage.includes(normalizeForServerCheck(a.exactQuote)));
  // Require at least half the proposed quotes to plausibly appear — a lower bar
  // than the client's strict per-quote gate, just enough to catch a badly
  // hallucinated response before it's returned at all.
  return plan.annotations.length === 0 || plausible.length >= plan.annotations.length / 2;
}

// ── Handler ────────────────────────────────────────────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AnnotationPlanResponse>,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "Method not allowed", code: "method_not_allowed", fallbackAllowed: true });
    return;
  }

  const body = req.body as Partial<SurgeonAnnotationInput>;
  const diagnosticIds = { pageTruthKey: body?.pageTruthKey ?? null, pageNumber: body?.pageNumber ?? null };

  if (!body.pageTruthKey || typeof body.pageTruthKey !== "string") {
    res.status(400).json({ ok: false, error: "pageTruthKey is required", code: "missing_ptk", fallbackAllowed: true });
    return;
  }
  if (!body.pageText || typeof body.pageText !== "string") {
    res.status(400).json({ ok: false, error: "pageText is required", code: "missing_page_text", fallbackAllowed: true });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[SURGEON_PLAN_UNAVAILABLE]", { reason: "OPENAI_API_KEY missing", ...diagnosticIds });
    res.status(200).json(degraded("Advanced page analysis is not configured on the server."));
    return;
  }

  const userTextBlock =
    `pageTruthKey: ${body.pageTruthKey}\n` +
    `pageNumber: ${body.pageNumber ?? "unknown"}\n` +
    `domain: ${body.domain ?? "general"}\n` +
    `semanticPack: ${JSON.stringify(body.semanticPack ?? {})}\n` +
    `headings: ${JSON.stringify(body.headings ?? {})}\n` +
    `existingCanonicalUnits (context only — re-verify against the page, do not trust blindly): ${JSON.stringify((body.existingCanonicalUnits ?? []).slice(0, 20))}\n` +
    `\nCurrent page text:\n${body.pageText.slice(0, 6000)}\n` +
    `\nProduce the SurgeonAnnotationPlan JSON.`;

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: userTextBlock },
  ];
  if (body.pageImageDataUrl) {
    userContent.push({ type: "image_url", image_url: { url: body.pageImageDataUrl, detail: "high" } });
  }

  const client = new OpenAI({ apiKey });
  const startedAt = Date.now();

  let completion: Awaited<ReturnType<typeof callOpenAI>>;
  try {
    try {
      completion = await callOpenAI(client, userContent, PLAN_TIMEOUT_MS);
    } catch (firstErr: any) {
      console.warn("[SURGEON_PLAN_RETRY]", {
        ...diagnosticIds,
        attempt:   1,
        error:     firstErr?.message ?? String(firstErr),
        elapsedMs: Date.now() - startedAt,
      });
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
      completion = await callOpenAI(client, userContent, PLAN_TIMEOUT_MS);
    }
  } catch (err: any) {
    const isRateLimited = err instanceof OpenAI.APIError && err.status === 429;
    console.error("[SURGEON_PLAN_FAILED]", {
      ...diagnosticIds,
      attempts:   2,
      error:      err?.message ?? String(err),
      status:     err?.status ?? null,
      durationMs: Date.now() - startedAt,
    });
    res.status(200).json(degraded(
      isRateLimited ? "Advanced page analysis is rate-limited — try again shortly." : "Advanced page analysis is temporarily unavailable.",
      isRateLimited ? "RATE_LIMITED" : "UPSTREAM_UNAVAILABLE",
    ));
    return;
  }

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    console.error("[SURGEON_PLAN_FAILED]", { ...diagnosticIds, reason: "empty_response", durationMs: Date.now() - startedAt });
    res.status(200).json(degraded("Advanced page analysis returned no content."));
    return;
  }

  let parsed: unknown;
  try {
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error("[SURGEON_PLAN_FAILED]", { ...diagnosticIds, reason: "parse_error", durationMs: Date.now() - startedAt });
    res.status(200).json(degraded("Advanced page analysis returned invalid output."));
    return;
  }

  const result = SurgeonAnnotationPlanSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[SURGEON_PLAN_FAILED]", { ...diagnosticIds, reason: "schema_error", durationMs: Date.now() - startedAt });
    res.status(200).json(degraded("Advanced page analysis returned a malformed plan."));
    return;
  }

  if (!quotesPlausible(result.data, body.pageText)) {
    console.error("[SURGEON_PLAN_FAILED]", { ...diagnosticIds, reason: "quotes_implausible", durationMs: Date.now() - startedAt });
    res.status(200).json(degraded("Advanced page analysis could not be grounded to this page."));
    return;
  }

  DEV && console.log("[SURGEON_PLAN_OK]", {
    ...diagnosticIds,
    annotationCount: result.data.annotations.length,
    durationMs:      Date.now() - startedAt,
  });

  res.status(200).json({ ok: true, plan: result.data });
}
