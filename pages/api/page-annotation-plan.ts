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
//   - Raw SDK errors and stack traces are never exposed. The non-secret model
//     id and structured failure metadata are returned for request correlation.

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import {
  SurgeonAnnotationPlanSchema,
  type SurgeonAnnotationPlan,
} from "@/lib/insights/pageAnnotationPlan";
import type { SurgeonAnnotationInput } from "@/lib/insights/buildSurgeonAnnotationInput";
import { resolveTeachingModel } from "@/lib/insights/resolveOpenAIModel";
import { hashDocumentId, newRequestId } from "@/lib/insights/requestDiagnostics";
import { isInvalidRequestError } from "@/lib/insights/openaiErrorClassification";
import { buildChatCompletionTuning } from "@/lib/insights/openaiChatParams";
import { formatSentenceList, type PageSentence } from "@/lib/insights/segmentPageSentences";
import { assessAnnotationCoverage } from "@/lib/highlights/assessAnnotationCoverage";

export const config = {
  maxDuration: 45,
  // A base64 JPEG page image easily runs 150-400kb — well above the old 32kb cap.
  api: { bodyParser: { sizeLimit: "4mb" } },
};

const PLAN_TIMEOUT_MS  = 25_000;
const RETRY_BACKOFF_MS = 700;

// Exact failure-stage codes for this endpoint — every degraded response
// carries one, alongside requestId, so a specific request's failure point in
// the FULL pipeline can be identified without ever logging page/annotation
// text. This vocabulary is shared end to end (see ClientFailureStage in
// useSurgeonAnnotations.ts, and readingFocusStore.ts's annotationRenderStage
// for the two client-only stages this endpoint can never observe):
//   page_extraction (client, pre-request) -> provider_configuration ->
//   provider_request -> provider_response -> json_parse -> schema_validation
//   -> page_identity (client) -> sentence_grounding -> geometry_resolution
//   (client) -> overlay_render (client)
// timeout/rate_limited/invalid_request are additional, more specific
// subcategories of provider_request retained for their existing,
// already-tested behavior (skip-retry-on-400, distinct rate-limit/timeout
// messages) — not in the canonical 10-stage list above, but a genuine
// refinement of it, not a competing vocabulary.
export type ServerFailureStage =
  | "method_not_allowed"
  | "missing_ptk"
  | "missing_page_text"
  | "missing_page_content_hash"
  | "provider_configuration"
  | "provider_request"
  | "provider_response"
  | "json_parse"
  | "schema_validation"
  | "sentence_grounding"
  | "timeout"
  | "rate_limited"
  | "invalid_request";

export type AnnotationPlanResponse =
  | { ok: true; plan: SurgeonAnnotationPlan; pageContentHash: string; requestId: string; provider: "openai"; model: string }
  | {
      ok: false;
      error: string;
      code: ServerFailureStage;
      requestId: string;
      fallbackAllowed: false;
      provider: "openai";
      model: string | null;
      upstreamStatus: number | null;
      finishReason: string | null;
    };

function degraded(
  message: string,
  code: ServerFailureStage,
  requestId: string,
  diagnostics: { model?: string | null; upstreamStatus?: number | null; finishReason?: string | null } = {},
): AnnotationPlanResponse {
  return {
    ok: false,
    error: message,
    code,
    requestId,
    fallbackAllowed: false,
    provider: "openai",
    model: diagnostics.model ?? null,
    upstreamStatus: diagnostics.upstreamStatus ?? null,
    finishReason: diagnostics.finishReason ?? null,
  };
}

// Rough diagnostic count only — not used for grounding/selection logic
// anywhere, just a cheap signal in logs that the model was actually handed
// a full multi-sentence page (a suspiciously low count for a long page is
// a red flag that page_extraction produced something truncated/wrong).
function countSentences(text: string): number {
  const matches = text.match(/[.!?](?:\s|$)/g);
  return matches ? matches.length : (text.trim().length > 0 ? 1 : 0);
}

// ── Static system prompt ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a surgical annotation planner for a PDF study reader.

You are reading THIS page fresh, right now, from the image and text provided below.
Do NOT treat any pre-existing summary as ground truth — verify everything against what
you actually see in the page image and text. "existingCanonicalUnits" (if provided) are
prior context from an earlier pass, offered only for continuity — re-derive the page's
content yourself rather than assuming they are complete or still accurate.

The current page's text is provided below as a list of typed BLOCKS (heading, paragraph,
list, table, caption, equation, figure-label), each carrying its reading order. Read every
block — a heading names what the page is about, a table's rows are as quotable as a
paragraph's sentences, and neither is decoration to skip past. "headings.previous" and
"headings.next" (if present) name the neighboring pages ONLY so you understand this page's
place in the book — they are NOT this page's content. Never propose an exactQuote drawn
from headings.previous or headings.next; every exactQuote must come from THIS page's own
blocks.

Your task: identify what on this page deserves a highlight/annotation, and identify EXACTLY
which span of the page it is. You do NOT propose coordinates — the app finds your quote (or
sentenceId) in the real PDF text and draws it. If you cannot identify something exactly as
it appears on the page, do not propose it as an annotation.

The current page's text is ALSO provided below as a numbered list of complete sentences
(pageSentences: "S001: ...", "S002: ...", etc.) — every sentence the app was able to isolate
from this page's raw text, in reading order. For any "fullSentence"-scope annotation (the
default — see rule 11), set sentenceId to the id of the sentence you are annotating INSTEAD
OF relying on exactQuote to be typed perfectly: this is the preferred, more reliable path —
the app resolves sentenceId directly against its own copy of this exact same numbered list,
so there is zero risk of a small paraphrase (a dropped comma, a contraction) causing your
annotation to be silently rejected. Still fill in exactQuote as your best verbatim
transcription too (required by the schema either way, and it is the ONLY path used for
"entity"-scope annotations, which are sub-sentence spans not covered by pageSentences) — but
whenever a fullSentence annotation's content matches one of the numbered sentences, prefer
setting sentenceId over leaving it blank. If your annotation spans MULTIPLE consecutive
sentences (rule 12), set sentenceId to the FIRST sentence's id and let exactQuote carry the
full multi-sentence span — the app will still ground exactQuote normally for the remainder.

Rules:
1. Every exactQuote must be copied verbatim from the page text/image — same words, same
   order, same punctuation. Do not paraphrase, summarize, or fix typos in a quote.
2. Prefer complete instructional units. A mechanism/procedure may be one multi-sentence
   annotation when it is one continuous source span, or several sequenced annotations when
   its essential steps occur separately. Never collapse distinct required steps merely to
   hit a fixed count, and never paint a whole paragraph unless all of it is instructional.
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
8. pageRole is the PAGE CLASSIFIER — decide this FIRST, before you pick any annotation, by
   asking "what kind of page is this?" rather than "can I find a definition/procedure/danger
   zone?". It drives both this plan's highlight selection (rule 8a) and, downstream, the
   Whiteboard's choice of teaching style for this same page — one classification shared by
   both, not two independent guesses. Pick the single best-fitting value:
   - anatomy       — structures, origins/insertions, innervation, blood supply, relationships
   - physiology     — mechanisms, sequences, feedback loops, cause-and-effect processes
   - pharmacology   — drug -> mechanism -> indication -> contraindication -> adverse effect
   - diagnosis      — clinical/dental decision-making: history -> exam -> diagnosis -> treatment
   - histology      — tissue identification, distinguishing features, comparisons
   - classification — a taxonomy or hierarchy of related categories/types
   - decision-tree   — branching yes/no or either/or decision logic
   - workflow        — an ordered clinical or procedural sequence of steps
   - mathematical-derivation — given -> formula -> solve -> answer
   - organic-chemistry-reaction — reaction mechanism -> intermediates -> products
   - definition / procedure / mechanism / comparison / example — use only when none of the
     more specific values above fits; these are the generic fallback classifications.
   Choose independently of pageThesis's content summary (e.g. a page can be primarily
   "pharmacology" even though its thesis describes one specific drug's clinical use).
   ALSO return pageRoles: one or more domain-neutral instructional roles chosen from:
   definition-heavy, mechanism-causal, procedure-sequence, comparison, worked-example,
   equation-calculation, anatomy-spatial, clinical-diagnostic, narrative-history,
   argument-evidence, table-figure-driven, mixed. A page may have multiple roles. These
   roles control coverage and density; domain only influences vocabulary.
8a. ADAPTIVE HIGHLIGHTING — let pageRole shape WHICH canonicalTypes you actually reach for on
    this page, instead of forcing every page through the same fixed checklist:
    - anatomy/histology pages: favor definition (structure/tissue identification) and
      supportingEvidence (relationships/comparisons between structures) over mechanism.
    - physiology/mechanism/organic-chemistry-reaction pages: favor mechanism annotations that
      capture the full causal chain in one span, per rule 2.
    - pharmacology pages: favor mechanism (drug action) plus trap (contraindications/adverse
      effects) — a page like this often legitimately needs both, unlike a purely mechanistic
      physiology page.
    - diagnosis/decision-tree/workflow/procedure pages: favor procedure/decision annotations
      grouped into ONE sequence span (rule 2, rule 12) rather than one annotation per step.
    - classification/comparison pages: favor comparison annotations over definition.
    - mathematical-derivation pages: favor procedure (the solve sequence) with entity spanScope
      (rule 11) for the formula/final-answer terms themselves.
    This shapes emphasis, not a hard requirement — still ground every annotation in what the
    page actually contains (rule 1), never invent a category the page doesn't support.
9. DENSITY IS PAGE-ADAPTIVE, never a universal count. A simple definition page may need
   2-4 marks; a mechanism must capture the complete causal chain; a procedure every essential
   step; a comparison both sides and distinguishing features; an equation the formula,
   variable meanings and worked transformation; a dense protocol may need 8-15; a narrative
   only events/evidence that materially support its teaching point. Do not annotate the same
   idea twice under different types. Under-annotation is a failure when it drops an essential
   instructional unit; over-annotation is a failure when it repeats or marks filler.
10. Before finishing, check central idea, required definitions, every essential mechanism or
    procedure step, meaningful traps/exceptions, teaching examples/evidence, and redundancy.
11. SENTENCE BOUNDARIES — this is the most important rule for how the annotation actually
    looks on the page. Never quote a mid-sentence fragment. Set spanScope to control this:
      MUST run from the sentence's first meaningful word to its ending punctuation (. ; or :).
      This worked example is deliberately generic, invented prose — never copy real textbook
      wording into this instruction, or a page containing a similar real passage will bias you
      toward echoing the example instead of reading that page fresh.
      Bad:  "...before recording the findings..."
      Good: "Before recording the findings, the examiner should re-check the instrument
             calibration, confirm the patient's identity against the chart, and note the
             time the measurement was taken."
    - spanScope: "entity" — ONLY for a single term being defined, a drug name, an anatomical
      structure, an equation, a chemical formula, or a short symbol/definition-term where
      highlighting just that span (not the whole sentence) is the deliberately correct
      teaching behavior. Do not use "entity" as a shortcut to avoid quoting a full sentence —
      it is the narrow exception, "fullSentence" is the default for everything else.
12. MULTI-SENTENCE CONCEPTS — if one concept's explanation naturally runs across two or more
    consecutive sentences (e.g. "Phase 1 is X. Phase 2 is Y. Phase 3 is Z." describing one
    procedure), do NOT create several separate annotations for it. Instead return ONE
    annotation whose exactQuote is the full verbatim run of all those sentences together,
    so the page renders one continuous highlight with one margin label — not several
    disconnected fragments for what is really a single idea.
13. RELATIONSHIP (optional) — when two SEPARATE annotations on this page are genuinely
    connected (one is the cause of the other, one is the step before the other, they're being
    directly contrasted, or one is evidence for the other), set relationship on the LATER
    annotation, pointing back at the earlier one: {"type": "sequence"|"cause-effect"|
    "comparison"|"supports", "targetIndex": <the OTHER annotation's 0-based position in this
    same annotations array>}. This becomes a real connecting line on the Whiteboard, not just
    two disconnected boxes. Only set it when the connection is genuinely part of the page's
    content — do not force a relationship between two annotations that merely happen to be
    on the same page. Omit the field entirely when there isn't one.
14. VISUAL CONTEXT (when provided) — a separate pass may tell you what figure/diagram/chart/
    table/radiograph/histology image appears on this page, below your other input. Use it only
    as CONTEXT for judging what the page is about and which surrounding text deserves an
    annotation (e.g. text that explains or captions that visual is more likely to matter) — never
    quote from it, never treat it as if it were page text you read yourself, and never let its
    absence change how you analyze the page. If no visual context is provided, proceed exactly
    as you would for a plain text-only page.

Respond ONLY with a JSON object matching this schema — no prose, no markdown fences:
{
  "pageTruthKey": "<string — copy from input>",
  "pageThesis": "<one-sentence string>",
  "pageRole": "<anatomy|physiology|pharmacology|diagnosis|histology|classification|decision-tree|workflow|mathematical-derivation|organic-chemistry-reaction|definition|procedure|mechanism|comparison|example>",
  "pageRoles": ["<one or more domain-neutral instructional roles from rule 8>"],
  "annotations": [
    {
      "canonicalType": "<definition|mechanism|procedure|decision|comparison|trap|clinicalPearl|supportingEvidence>",
      "exactQuote": "<verbatim span from the page — full sentence(s) unless spanScope is entity>",
      "reason": "<one sentence>",
      "importance": "<critical|high|supporting>",
      "treatment": "<definitionBar|mechanismBrace|procedureRail|decisionConnector|comparisonBracket|trapNotch|pearlMarker|evidenceUnderline>",
      "spanScope": "<fullSentence|entity — defaults to fullSentence>",
      "relationship": "<optional: {\"type\": \"sequence\"|\"cause-effect\"|\"comparison\"|\"supports\", \"targetIndex\": <number>} — see rule 13>",
      "sentenceId": "<optional but PREFERRED for fullSentence scope — the id from the numbered pageSentences list below, e.g. \"S004\">",
      "sourceQuote": "<same verbatim source span as exactQuote>",
      "sourceSentenceId": "<sentence id or null>",
      "conceptId": "<stable local concept id for this plan>",
      "annotationType": "<core-concept|definition|mechanism|cause-effect|procedure-step|decision-point|comparison|formula-equation|worked-example-step|exception|common-trap|clinical-pearl|evidence-example|transition|high-yield-fact>",
      "pedagogicalReason": "<why the learner needs this mark>",
      "pageRoles": ["<the applicable pageRoles>"],
      "sequenceIndex": "<zero-based step index or null>"
    }
  ]
}`;

// ── OpenAI call with timeout ───────────────────────────────────────────────────

async function callOpenAI(
  client: OpenAI,
  model: string,
  userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[],
  timeoutMs: number,
) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await client.chat.completions.create(
      {
        model,
        // temperature/max_tokens are only sent when the resolved model
        // actually supports overriding them — a newer reasoning-family
        // model (o-series, gpt-5.x) that resolveTeachingModel can
        // dynamically select REJECTS both with HTTP 400. See
        // lib/insights/openaiChatParams.ts for the shared rule.
        ...buildChatCompletionTuning(model, { temperature: 0, maxCompletionTokens: 2500 }),
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

function quotesPlausible(plan: SurgeonAnnotationPlan, pageText: string, validSentenceIds: Set<string>): boolean {
  const normPage = normalizeForServerCheck(pageText);
  const plausible = plan.annotations.filter(a =>
    // A sentenceId this server itself handed the model (in the numbered
    // pageSentences list) is authoritative — the real grounding check
    // happens client-side by id lookup, not text matching, so there is
    // nothing to plausibility-check here beyond "is this a real id."
    (a.sentenceId && validSentenceIds.has(a.sentenceId)) ||
    normPage.includes(normalizeForServerCheck(a.exactQuote)),
  );
  // Require at least half the proposed quotes to plausibly appear — a lower bar
  // than the client's strict per-quote gate, just enough to catch a badly
  // hallucinated response before it's returned at all.
  return plan.annotations.length === 0 || plausible.length >= plan.annotations.length / 2;
}

function inferredInstructionalRoles(plan: SurgeonAnnotationPlan): NonNullable<SurgeonAnnotationPlan["pageRoles"]> {
  if (plan.pageRoles?.length) return plan.pageRoles;
  const map: Record<string, NonNullable<SurgeonAnnotationPlan["pageRoles"]>[number]> = {
    definition: "definition-heavy", mechanism: "mechanism-causal", physiology: "mechanism-causal",
    procedure: "procedure-sequence", workflow: "procedure-sequence", comparison: "comparison",
    example: "worked-example", "mathematical-derivation": "equation-calculation",
    anatomy: "anatomy-spatial", histology: "anatomy-spatial", diagnosis: "clinical-diagnostic",
  };
  return [map[plan.pageRole] ?? "mixed"];
}

// ── Handler ────────────────────────────────────────────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AnnotationPlanResponse>,
): Promise<void> {
  // Generated before any validation so even a rejected request (wrong
  // method, missing field) carries a traceable, privacy-safe requestId —
  // never the page/annotation text itself.
  const requestId = newRequestId();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json(degraded("Method not allowed", "method_not_allowed", requestId));
    return;
  }

  const body = req.body as Partial<SurgeonAnnotationInput>;
  // Diagnostic identifiers only — never the page/annotation TEXT itself.
  // documentId is hashed (one-way) so a book's identity never appears in logs.
  let diagnosticIds: Record<string, unknown> = {
    requestId,
    documentIdHash: body?.documentId ? hashDocumentId(body.documentId) : null,
    pageTruthKey:   body?.pageTruthKey ?? null,
    pageNumber:     body?.pageNumber ?? null,
    normalizedPageCharacters: body?.pageText?.length ?? null,
    sentenceCount:  body?.pageText ? countSentences(body.pageText) : null,
  };

  if (!body.pageTruthKey || typeof body.pageTruthKey !== "string") {
    res.status(400).json(degraded("pageTruthKey is required", "missing_ptk", requestId));
    return;
  }
  if (!body.pageText || typeof body.pageText !== "string") {
    res.status(400).json(degraded("pageText is required", "missing_page_text", requestId));
    return;
  }
  if (!body.pageContentHash || typeof body.pageContentHash !== "string") {
    res.status(400).json(degraded("pageContentHash is required", "missing_page_content_hash", requestId));
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[SURGEON_PLAN_UNAVAILABLE]", { reason: "OPENAI_API_KEY missing", ...diagnosticIds });
    res.status(200).json(degraded("Advanced page analysis is not configured on the server.", "provider_configuration", requestId));
    return;
  }

  // Fallback path only (no structured blocks provided) — the primary path
  // sends the complete typed blocks[] decomposition below, uncapped. This
  // fallback is bounded to a generous upper bound for an ordinary textbook
  // page rather than the old, much tighter 6000-char cut — truncation is
  // reported explicitly (never silent) so an unusually dense page's loss is
  // visible in the diagnostic log, not just guessed at.
  const PAGE_TEXT_FALLBACK_LIMIT = 18_000;
  const blocks = Array.isArray(body.blocks) ? body.blocks.slice(0, 200) : [];
  const pageTextTruncated = blocks.length === 0 && body.pageText.length > PAGE_TEXT_FALLBACK_LIMIT;
  const blocksBlock = blocks.length > 0
    ? blocks.map(b => `[${b.readingOrder}][${String(b.type).toUpperCase()}] ${b.text}`).join("\n")
    : body.pageText.slice(0, PAGE_TEXT_FALLBACK_LIMIT);
  if (pageTextTruncated) {
    console.warn("[SURGEON_PLAN_PAGE_TEXT_TRUNCATED]", { ...diagnosticIds, limit: PAGE_TEXT_FALLBACK_LIMIT, actualLength: body.pageText.length });
  }

  // Gemini's description of any figure/diagram/chart/table/radiograph on this
  // page (pages/api/gemini-visual.ts), resolved BEFORE this request was built
  // — additive merge input, not a second independent analysis. Null whenever
  // Gemini is unconfigured, found nothing, or its call failed/timed out; the
  // prompt below is written so its absence changes nothing about how you read
  // the page otherwise.
  const visualContextBlock = body.visualContext
    ? `\nA separate visual-understanding pass identified this on the page (context only — a data point about what's on the page, not a substitute for reading the page yourself, and never a source for an exactQuote):\n${body.visualContext}\n`
    : "";

  // Segmented server-side from the fallback pageText path is NOT used here —
  // pageSentences is built CLIENT-side (buildSurgeonAnnotationInput.ts) against
  // the raw page text and sent as part of the request body, so the exact same
  // list this prompt shows the model is the one groundSurgeonQuotes.ts resolves
  // sentenceId against later — the server never re-segments on its own copy,
  // which could drift from the client's raw text extraction.
  const pageSentences: PageSentence[] = Array.isArray(body.pageSentences) ? body.pageSentences : [];
  const pageSentencesBlock = pageSentences.length > 0
    ? `\nCurrent page — numbered sentences (use sentenceId, see the instructions above):\n${formatSentenceList(pageSentences)}\n`
    : "";

  const userTextBlock =
    `pageTruthKey: ${body.pageTruthKey}\n` +
    `pageNumber: ${body.pageNumber ?? "unknown"}\n` +
    `domain: ${body.domain ?? "general"}\n` +
    `semanticPack: ${JSON.stringify(body.semanticPack ?? {})}\n` +
    `headings: ${JSON.stringify(body.headings ?? {})}\n` +
    `existingCanonicalUnits (context only — re-verify against the page, do not trust blindly): ${JSON.stringify((body.existingCanonicalUnits ?? []).slice(0, 20))}\n` +
    `\nCurrent page — structured blocks in reading order (read ALL of them; headings and tables carry real content, not decoration):\n${blocksBlock}\n` +
    pageSentencesBlock +
    visualContextBlock +
    `\nProduce the SurgeonAnnotationPlan JSON.`;

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: userTextBlock },
  ];
  if (body.pageImageDataUrl) {
    userContent.push({ type: "image_url", image_url: { url: body.pageImageDataUrl, detail: "high" } });
  }

  const client = new OpenAI({ apiKey });
  const startedAt = Date.now();
  const model = await resolveTeachingModel(client);
  diagnosticIds = { ...diagnosticIds, model };

  let completion: Awaited<ReturnType<typeof callOpenAI>>;
  let attempts = 1;
  try {
    try {
      completion = await callOpenAI(client, model, userContent, PLAN_TIMEOUT_MS);
    } catch (firstErr: any) {
      // A 400 (invalid_request_error) means THIS request is malformed for the
      // resolved model — e.g. an unsupported parameter. Retrying the exact
      // same request just reproduces the exact same failure a second time;
      // it never resolves a config bug, so don't mask it behind a retry.
      if (isInvalidRequestError(firstErr)) throw firstErr;
      attempts = 2;
      console.warn("[SURGEON_PLAN_RETRY]", {
        ...diagnosticIds,
        attempt:   1,
        error:     firstErr?.message ?? String(firstErr),
        elapsedMs: Date.now() - startedAt,
      });
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
      completion = await callOpenAI(client, model, userContent, PLAN_TIMEOUT_MS);
    }
  } catch (err: any) {
    const isTimeout        = err?.name === "AbortError" || /aborted|timed? ?out/i.test(err?.message ?? "");
    const isRateLimited     = err instanceof OpenAI.APIError && err.status === 429;
    const isInvalidRequest  = isInvalidRequestError(err);
    const code: ServerFailureStage =
      isTimeout ? "timeout" : isRateLimited ? "rate_limited" : isInvalidRequest ? "invalid_request" : "provider_request";
    console.error("[SURGEON_PLAN_FAILED]", {
      ...diagnosticIds,
      stage:      code,
      attempts,
      error:      err?.message ?? String(err),
      status:     err?.status ?? null,
      durationMs: Date.now() - startedAt,
    });
    res.status(200).json(degraded(
      isTimeout
        ? "Advanced page analysis timed out."
        : isRateLimited
        ? "Advanced page analysis is rate-limited — try again shortly."
        : isInvalidRequest
        ? "Advanced page analysis failed due to a request configuration error."
        : "Advanced page analysis is temporarily unavailable.",
      code,
      requestId,
      { model, upstreamStatus: err?.status ?? null },
    ));
    return;
  }

  const choice = completion.choices[0];
  const raw = choice?.message?.content;
  if (!raw) {
    const finishReason = choice?.finish_reason ?? null;
    console.error("[SURGEON_PLAN_FAILED]", {
      ...diagnosticIds,
      stage: "provider_response",
      finishReason,
      completionTokens: completion.usage?.completion_tokens ?? null,
      reasoningTokens: completion.usage?.completion_tokens_details?.reasoning_tokens ?? null,
      durationMs: Date.now() - startedAt,
    });
    res.status(200).json(degraded(
      "Advanced page analysis returned no content.",
      "provider_response",
      requestId,
      { model, upstreamStatus: 200, finishReason },
    ));
    return;
  }

  let parsed: unknown;
  try {
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error("[SURGEON_PLAN_FAILED]", { ...diagnosticIds, stage: "json_parse", durationMs: Date.now() - startedAt });
    res.status(200).json(degraded("Advanced page analysis returned invalid output.", "json_parse", requestId, { model, upstreamStatus: 200, finishReason: choice?.finish_reason ?? null }));
    return;
  }

  const result = SurgeonAnnotationPlanSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[SURGEON_PLAN_FAILED]", { ...diagnosticIds, stage: "schema_validation", durationMs: Date.now() - startedAt });
    res.status(200).json(degraded("Advanced page analysis returned a malformed plan.", "schema_validation", requestId, { model, upstreamStatus: 200, finishReason: choice?.finish_reason ?? null }));
    return;
  }

  const validSentenceIds = new Set(pageSentences.map(s => s.id));
  let finalPlan: SurgeonAnnotationPlan = { ...result.data, pageRoles: inferredInstructionalRoles(result.data) };
  if (!quotesPlausible(finalPlan, body.pageText, validSentenceIds)) {
    console.error("[SURGEON_PLAN_FAILED]", { ...diagnosticIds, stage: "sentence_grounding", durationMs: Date.now() - startedAt });
    res.status(200).json(degraded("Advanced page analysis could not be grounded to this page.", "sentence_grounding", requestId, { model, upstreamStatus: 200, finishReason: choice?.finish_reason ?? null }));
    return;
  }

  // One bounded coverage-repair pass. This is not a legacy/generic fallback:
  // it receives the same complete current-page evidence plus the first plan
  // and may only fill explicitly missing instructional categories.
  const coverage = assessAnnotationCoverage(finalPlan.annotations, finalPlan.pageRoles ?? ["mixed"]);
  if (!coverage.complete) {
    try {
      const repairContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        ...userContent,
        { type: "text", text: `Coverage repair pass (final pass). The first grounded plan missed: ${coverage.missing.join(", ") || "duplicate removal"}. Re-read the complete current page, preserve correct annotations, remove duplicates, and add only exact-source instructional units required to close those gaps. First plan: ${JSON.stringify(finalPlan)}` },
      ];
      const repairCompletion = await callOpenAI(client, model, repairContent, 12_000);
      const repairRaw = repairCompletion.choices[0]?.message?.content;
      if (repairRaw) {
        const repairParsed = JSON.parse(repairRaw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim());
        const repaired = SurgeonAnnotationPlanSchema.safeParse(repairParsed);
        if (repaired.success) {
          const candidate = { ...repaired.data, pageRoles: inferredInstructionalRoles(repaired.data) };
          if (candidate.pageTruthKey === body.pageTruthKey && quotesPlausible(candidate, body.pageText, validSentenceIds)) {
            finalPlan = candidate;
          }
        }
      }
    } catch (repairError) {
      console.warn("[SURGEON_PLAN_COVERAGE_REPAIR_FAILED]", {
        ...diagnosticIds, missingCount: coverage.missing.length,
        reason: repairError instanceof Error ? repairError.name : "unknown",
      });
    }
  }

  // Production-safe — counts and timings only, never the annotation/quote text.
  // returnedAnnotationCount is what the model proposed BEFORE client-side
  // sentence_grounding/geometry_resolution/overlay_render — see
  // useSurgeonAnnotations.ts's [SURGEON_PIPELINE_DIAGNOSTIC] log for
  // groundedCount, and SmartPDFViewer.tsx's for geometryResolvedCount — this
  // server has no visibility into either of those later stages.
  console.log("[SURGEON_PLAN_OK]", {
    ...diagnosticIds,
    returnedAnnotationCount: finalPlan.annotations.length,
    coverageRepairRequested: !coverage.complete,
    durationMs:              Date.now() - startedAt,
  });

  // pageContentHash is echoed back unchanged, never re-derived server-side —
  // the client's own fresh recomputation at response-apply time (against
  // whatever page is ACTUALLY on screen then) is the real check; this is
  // just carrying the request's identity through to that comparison.
  res.status(200).json({ ok: true, plan: finalPlan, pageContentHash: body.pageContentHash, requestId, provider: "openai", model });
}
