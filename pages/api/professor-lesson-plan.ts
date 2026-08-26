// pages/api/professor-lesson-plan.ts
// Professor Lesson Planner — reads the current page's already-built,
// already-grounded VisualSceneGraph (node/edge ids + short source text, no
// raw page text, no coordinates) and returns a ProfessorLessonScript: a
// short hand-written label + a conversational spoken teaching line for each
// point, tone/pacing, and which single point is the high-yield one to
// circle. It never proposes x/y/bounds — lib/whiteboard/
// buildProfessorTeachingActions.ts (deterministic, non-AI) owns geometry,
// exactly as groundSurgeonQuotes.ts keeps the PDF-annotation model out of
// the coordinate business.
//
// Security notes mirror pages/api/page-annotation-plan.ts: OPENAI_API_KEY is
// server-side only, the system prompt is static developer-authored text, and
// every user-controlled value goes into the messages array only. The
// server-side plausibility check here is defense-in-depth, not authoritative
// — lib/whiteboard/groundProfessorLesson.ts is the real gate before anything
// renders, run client-side against the live VisualSceneGraph.

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import {
  ProfessorLessonScriptSchema,
  type ProfessorLessonScript,
} from "@/lib/whiteboard/professorLessonPlan";
import type { ProfessorLessonInput } from "@/lib/whiteboard/buildProfessorLessonInput";
import { resolveTeachingModel } from "@/lib/insights/resolveOpenAIModel";
import { hashDocumentId, newRequestId } from "@/lib/insights/requestDiagnostics";
import { isInvalidRequestError } from "@/lib/insights/openaiErrorClassification";
import { buildChatCompletionTuning } from "@/lib/insights/openaiChatParams";

export const config = {
  // Two bounded attempts plus backoff must fit inside the route budget. The
  // previous 30s route budget was shorter than its own worst-case retry path.
  maxDuration: 60,
};

const PLAN_TIMEOUT_MS  = 28_000;
const RETRY_BACKOFF_MS = 700;

const MIN_COMPLETION_TOKENS = 4_000;
const TOKENS_PER_NODE       = 650;
const MAX_COMPLETION_TOKENS = 9_000;

export function professorCompletionBudget(nodeCount: number): number {
  const boundedCount = Number.isFinite(nodeCount) ? Math.max(1, Math.floor(nodeCount)) : 1;
  return Math.min(MAX_COMPLETION_TOKENS, MIN_COMPLETION_TOKENS + boundedCount * TOKENS_PER_NODE);
}

export type ProfessorFailureStage =
  | "request_validation"
  | "provider_configuration"
  | "provider_request"
  | "provider_response"
  | "json_parse"
  | "schema_validation"
  | "target_grounding";

interface ProfessorFailureDiagnostics {
  requestId: string;
  provider: "openai";
  model: string | null;
  failureStage: ProfessorFailureStage;
  upstreamStatus: number | null;
  finishReason: string | null;
}

export type ProfessorLessonPlanResponse =
  | { ok: true; script: ProfessorLessonScript; requestId: string; provider: "openai"; model: string }
  | ({ ok: false; error: string; code: string; fallbackAllowed: true } & ProfessorFailureDiagnostics);

function degraded(
  message: string,
  diagnostics: ProfessorFailureDiagnostics,
  code = "UPSTREAM_UNAVAILABLE",
): ProfessorLessonPlanResponse {
  return { ok: false, error: message, code, fallbackAllowed: true, ...diagnostics };
}

// ── Static system prompt ───────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a professor performing a live, spoken lesson at a whiteboard, teaching
one page of a textbook to a student who is watching you draw.

You are NOT writing a diagram caption generator. You are behaving like a real instructor:
you write a few words by hand, you say what you're thinking while you draw it, you pause,
you add a connection, you circle the one point that matters most, and you end with a
question that makes the student think.

You are given the page's nodes and edges — already-selected, already-laid-out points, each
with an id, its full source text, and (when available) a "reason" — one sentence from the
page's own highlighting pass explaining WHY that point was judged worth teaching. Use reason
as context for your narration, not as something to read aloud verbatim — it tells you what
to emphasize, not what to say. You do NOT invent new nodes or edges, and you NEVER
propose coordinates — the app already knows where everything goes on the canvas. Your job
is purely: what short phrase gets written by hand at each point, and what you SAY while
you write and connect it.

Rules:
1. For EVERY node id and EVERY edge id you are given that deserves a teaching moment,
   return one entry in nodeScripts with that exact id as targetId. You may skip an edge
   whose relationship is already obvious from its endpoints' narration, but do not skip
   more than a couple of nodes — the student needs to see the whole page taught.
2. shortLabel is a SHORT, hand-written phrase — normally 2 to 8 words. Never a full
   sentence, never something that would wrap onto three lines in a small box. Compress:
   "Rapid assessment" not "The clinician should perform a rapid initial assessment of the
   patient's condition."
   For an EDGE target, shortLabel should explain the causal link in 2-5 words when the page
   supports it (for example "reduces tissue seal"), not merely repeat "leads to". Use a
   generic connective only when the evidence does not support a more specific reason.
3. narration is what you SAY out loud while you draw that point — conversational teaching
   language, like you're actually talking to a student, not textbook prose read aloud.
   Example: "Start with the central problem: aspirin toxicity can deteriorate quickly. The
   first job is stabilization — not memorizing a drug list." Keep each narration to 1-3
   sentences.
4. tone is one of: "introduce" (opening a new point), "explain" (walking through it),
   "warn" (a danger/trap/exception), "connect" (explaining why two points relate), or
   "question" (posing something to think about). pace is "slow" for anything a student
   needs time to absorb (warnings, the synthesis question), "normal" otherwise.
5. Set emphasize:true on EXACTLY ONE node or edge across the whole script — the single
   highest-yield point on this page, the one thing you'd circle if you could only circle
   one thing. Leave it false on everything else.
6. Classify the ACTUAL CURRENT PAGE, not the book title. teachingStructures is the smallest
   set (1-4) that correctly describes this page, chosen from: definition-concept,
   mechanism-causal-process, sequence-procedure, comparison-contrast,
   classification-hierarchy, anatomy-spatial-relationship, equation-calculation,
   worked-example-problem-solving, timeline-history, argument-evidence,
   narrative-event-sequence, decision-tree, diagnostic-reasoning,
   table-data-interpretation, figure-image-interpretation, exception-trap-warning,
   synthesis-summary. A mixed page may use several. Unknown disciplines still use these
   semantic structures; never fall back merely because the subject is unfamiliar.
   visualGrammar: choose the ONE that best matches how this page's ideas actually relate —
   "procedure" (ordered steps), "mechanism" (cause leads to effect leads to effect),
   "anatomy" (a structure with labeled parts), "diagnosis" (branching decision points),
   "comparison" (two things contrasted), "equation" (a formula worked through),
   "hierarchy", "timeline", "argument", "narrative", "decision-tree",
   "data-interpretation", "figure-interpretation", "summary", or "concept-map"
   (a looser network of related ideas) — when nothing else clearly fits.
   You are told this page's pageTeachingType — the classification the SAME page already
   received from the highlighting pass (e.g. "anatomy", "pharmacology", "decision-tree",
   "workflow"). Let it strongly inform BOTH your visualGrammar choice and how you narrate:
   an "anatomy" page should be taught by naming structures and their relationships, a
   "pharmacology" page by walking drug -> mechanism -> indication -> contraindication, a
   "decision-tree" or "diagnosis" page by walking the branching decision logic, a
   "workflow"/"procedure" page as an ordered sequence, a "classification" page as a
   taxonomy of related categories. Don't ignore pageTeachingType and default to a generic
   "concept-map" when a more specific grammar clearly fits it.
   On equation/calculation and worked-example pages, visibly build the mathematical
   relationship: identify variables, transform the expression one step at a time, and
   connect it to the relevant axes, graph, mapping, or application when those nodes are
   present. Do not reduce a mathematics page to generic labeled rectangles.
   On narrative-event-sequence pages, teach characters, event order, motivation, and
   consequences as a light story board. Use reading-coach language rather than an adult
   clinical lecture, and never invent events that are not represented by the supplied nodes.
7. title is a short, hand-written page title — 2 to 6 words, written in your own words for
   what this page is fundamentally about (e.g. "ASPIRIN OVERDOSE"), not copied verbatim
   from a heading. "definition" is also a valid visualGrammar choice — use it when the page
   is fundamentally introducing/defining one core term rather than a process or comparison.
8. centralQuestion is the motivating question you WRITE immediately under the title before
   drawing the explanation. Keep it to roughly 6-14 words, make it answerable by this page,
   and frame the causal or comparative problem the completed board will explain. Start the
   lesson from this question/central concept, then construct the answer progressively.
9. learningObjective is ONE sentence stating what the student should be able to DO after
   this lesson (e.g. "Explain the five stages of the diagnostic process and why the patient's
   own stated concern matters."), not a restatement of the title.
10. synthesisQuestion is ONE question you'd ask the student at the end to make them explain
   the idea back, not a yes/no question.
11. Every exactQuote-free field must still be YOUR OWN spoken teaching language — never copy
    long verbatim spans of the given node/edge text into narration; teach it, don't read it.
12. GROUPS — organize every node (never edges) into semantic regions before you narrate them.
    This is the ONE piece of visual structure you DO decide — not pixels, but composition: what
    belongs together, what stands apart, and in what order you'd build it on the board. Assign
    each node's id to exactly one group in "groups". Each group has:
      - type: "core" (the page's central anchor idea — usually one group, drawn first),
        "mechanism" (a causal chain), "sequence" (ordered steps), "comparison" (things
        contrasted side by side), "clinical" (significance/application/decision), "warning"
        (a trap/exception/danger — this should read as SET APART from the main flow, not
        crammed into the same line as everything else), "summary" (a closing synthesis
        point, drawn last), "hierarchy" (parent/child classification), "timeline"
        (chronological events), "argument" (claim/evidence/reasoning), "narrative"
        (character/event progression), or "data" (table/chart/figure interpretation).
      - order: the 1-based sequence you'd physically build these regions in, top to bottom —
        the SAME order your nodeScripts narrates that group's nodes in. A page's core idea is
        almost always order 1; a warning is usually NOT order 1 even if it's important, because
        a professor establishes the main idea before flagging an exception to it; summary (if
        used) is always the LAST order value.
      - nodeIds: every node id that belongs in this region.
    A page rarely needs more than 4-5 groups. Every node you narrate in nodeScripts must belong
    to exactly one group — do not leave a node ungrouped, and do not put one node in two groups.
    Example for a page about a diagnostic interview: group "core" (order 1) = the central
    concern; group "mechanism" (order 2) = the physical/psychological/social context nodes;
    group "sequence" (order 3) = interview -> complete picture -> diagnosis; group "warning"
    (order 4) = the "exam alone isn't enough" caution.
13. EXPLAIN — for a node where you're teaching a MECHANISM (why/how something happens, not
    just what it is), add a short "explain" mini-diagram instead of relying on shortLabel and
    narration alone. This is what turns a box into an actual explanation while you talk through
    it — a small aside drawn beside the point, the way a real professor jots "-> less O2 demand"
    next to "hypothermia" while explaining why a cold drowning victim can sometimes still be
    revived. Do NOT add explain to every node — most nodes need none at all (empty array). Use
    it only where there's a real mechanism, cause-effect chain, or contrast worth sketching.
    Each entry in explain is one of four types, and every entry needs EVERY field below present
    (use null for whichever don't apply to that type):
      - "write": id (a short local id you invent, e.g. "metabolism"), text (a SHORT fragment,
        3-5 words, e.g. "less metabolic demand" or "less O2 demand" — never a sentence).
      - "icon": id, icon (one of: thermometer, heart, brain, lungs, warning, arrowDown, arrowUp,
        clock, snowflake, checkmark, xmark), label (an optional short caption).
      - "arrow": from and to, each either "self" (this node's own point) or the id of a write/
        icon entry EARLIER in this SAME explain array — never a forward reference, never an id
        from a different node's explain array.
      - "emphasize": target (same rule as from/to above), style (circle, underline, crossOut,
        or highlight).
    Order matters: declare a write/icon BEFORE any arrow/emphasize that references its id. Keep
    an explain chain SHORT — 2 to 4 entries is typical, 6 is the hard maximum. For the
    hypothermia-drowning example above, a good explain for the "severe hypothermia" node would
    be: write(id:"metabolism", text:"↓ metabolism") -> arrow(from:"self", to:"metabolism") ->
    write(id:"o2", text:"↓ O2 demand") -> arrow(from:"metabolism", to:"o2") -> emphasize
    (target:"o2", style:"circle").

14. TEACHING ROLE — for every nodeScripts entry, set teachingRole to the stage this point plays
    in the lesson: "definition" (introducing/naming a term), "mechanism" (how/why something
    happens), "consequence" (what results from it), "application" (how it's used or applied in
    practice), "warning" (a danger, exception, or misconception), "summary" (the integrated takeaway),
    "reinforcement" (restating/connecting back to something already taught), or "context"
    (background that doesn't fit the others). This is a classification, not a new sentence.
    Reuse a role consistently: the renderer gives each role the same color on every board.
15. SPATIAL INTENT — for every nodeScripts entry, set spatialIntent to where this idea belongs
    in the board's COMPOSITION: "left-branch" or "right-branch" (one of two/several parallel
    ideas branching off the core), "central-mechanism" (the anchor the rest of the board relates
    to), "warning-aside" (a trap/exception, set apart from the main flow), "comparison-column"
    (one side of a two-thing contrast), or "final-summary" (the closing synthesis point). This is
    NOT a coordinate — you are describing composition, like telling a colleague "put this on the
    left" without touching a ruler. The app decides the actual pixels.
16. DRAWING INTENT — for every nodeScripts entry, set drawingIntent to the kind of mark that best
    represents it: "definition" (a term being introduced), "chain" (one link in a cause-effect
    sequence), "contrast" (one side of a comparison), "callout" (a smaller aside/annotation),
    "sequence" (one step in an ordered list), or "plain" (none of the above fit especially well).
17. EMPHASIS TREATMENT — for the ONE entry where emphasize is true, also set emphasisTreatment to
    what that circle/mark should actually look like: "circle" (the single most important idea —
    the default), "crossOut" (this is a common misconception you're debunking or ruling out), or
    "highlight" (a danger/trap worth flagging). Every other entry (emphasize:false) must set
    emphasisTreatment to "none".
18. RELATIONSHIPS — you are given this page's edges already (structural connections the app
    already knows about). relationships is a SEPARATE, optional list (0-3 entries) of additional
    semantic links YOU notice between nodes you're narrating that the given edges do not already
    capture — e.g. two different mechanism nodes that both feed the same complication, or a
    warning that specifically contradicts an earlier point. Each entry has: targetId (another
    node's id from THIS SAME script — never an edge id, never a node you didn't narrate, never
    itself), kind (one of: "supports", "causes", "contrasts", "leads-to", "part-of",
    "warns-about"), and an optional short label (2-4 words). Direction matters: declare the
    relationship on the cause/source node and target the result/affected node. Make a label
    explain WHY the arrow exists when the page supports that reason. Leave this empty for most
    nodes — only use it when there's a real connection worth drawing that isn't already an edge.

19. Build progressively in nodeScripts order: central concept first, mechanism/process while it
    is explained, consequence next, then application and warning. Use anatomy/part-of links when
    the page supports structural relationships. End with a summary-role/final-summary point when
    a real page node can carry it; the app will deterministically zoom out to the compact complete
    picture for synthesis. Never invent a summary node merely to satisfy this preference.

20. PROFESSOR DIRECTOR — every nodeScripts entry must explicitly include:
    - sourceEvidence: 1-4 CURRENT-page node ids that support this teaching point. Include the
      target node itself for node targets; use the edge's endpoint node ids for edge targets.
    - teachingGoal: what the learner should understand or be able to do after this step.
    - teachingStructure: the single semantic structure from rule 6 governing this step.
    - visualNeeded: true only when a progressive visual materially helps. Definitions or plain
      exposition may remain verbal on the PDF; mechanisms, procedures, spatial relationships,
      comparisons, calculations, timelines, decision logic, and difficult interpretations often
      benefit from a visual. Do not force every paragraph onto the Whiteboard.
    - visualIntent: a concise semantic description of what the visual should reveal. When
      visualNeeded is true, describe an illustrative composition for the downstream tldraw
      Agent: use freehand contours, spatial sketches, hatching, pressure zones, symbols, arrows,
      numbered sequences, braces, or handwritten callouts when they teach better than boxes.
      For procedures/timelines/hierarchies/comparisons, describe the semantic composition and
      relationships; the Agent will compose renderer-safe primitives. Do not emit coordinates or
      tool calls. When visualNeeded is false, describe why verbal/source-follow teaching is
      sufficient.
    - cameraIntent: stay-on-pdf (required when visualNeeded=false), active-concept,
      keep-context, comparison, follow-sequence, or summary-overview.
    - checkpoint: a short teach-back question when useful, otherwise null.
    sourceEvidence and all factual narration must remain inside the supplied current-page nodes.
    Context beyond the page must be explicitly labeled as enrichment. Do not invent facts.

21. The renderer builds one step at a time. Do not phrase visualIntent as a request for one
    completed poster. Describe the next reveal only. Do not reveal future steps, recreate the
    whole board, or force every page into boxes and arrows. Match the grammar to the content:
    equations should transform, comparisons should align, timelines should order events,
    arguments should connect claim/evidence/reasoning, and spatial pages should use a simplified
    labeled sketch.

22. The visual executor has real pen and teaching-illustration primitives. Prefer the smallest
    useful explanatory mark over a decorative card. A procedure can accumulate numbered marks
    and directional arrows; anatomy can accumulate freehand contours, labels, and callouts;
    a mechanism can reveal a causal arrow plus a highlighted region; data can be annotated at
    the interpreted feature. These are examples, not subject templates. Infer the composition
    from the current page's semantic structure and keep every factual label grounded in the
    supplied evidence.

Respond with a ProfessorLessonScript matching the required structure exactly.`;

async function callOpenAI(
  client: OpenAI,
  model: string,
  userContent: string,
  timeoutMs: number,
  maxCompletionTokens: number,
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
        // lib/insights/openaiChatParams.ts for the shared rule. 0.4 (some
        // genuine variety in phrasing/tone, unlike the strict-extraction
        // annotation pass) only applies on models that support it.
        ...buildChatCompletionTuning(model, { temperature: 0.4, maxCompletionTokens }),
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: userContent },
        ],
        // Structured Outputs (strict:true) — the API itself enforces the
        // schema shape, rather than this endpoint hoping a "respond only
        // with JSON matching this shape" instruction was followed. OpenAI
        // is never asked to emit tldraw records — this schema is
        // ProfessorLessonScript (meaning: labels/narration/targetId), never
        // coordinates; lib/whiteboard/buildProfessorTeachingActions.ts is
        // the only place geometry gets decided.
        response_format:  zodResponseFormat(ProfessorLessonScriptSchema, "ProfessorLessonScript"),
      },
      { signal: ctrl.signal },
    );
  } finally {
    clearTimeout(timer);
  }
}

// Lightweight, non-authoritative check: did the model reference at least some
// real ids? lib/whiteboard/groundProfessorLesson.ts is the real gate.
function targetsPlausible(script: ProfessorLessonScript, validIds: Set<string>): boolean {
  if (script.nodeScripts.length === 0) return false;
  const matching = script.nodeScripts.filter(n => validIds.has(n.targetId));
  return matching.length >= script.nodeScripts.length / 2;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProfessorLessonPlanResponse>,
): Promise<void> {
  const requestId = newRequestId();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json(degraded("Method not allowed", {
      requestId, provider: "openai", model: null, failureStage: "request_validation",
      upstreamStatus: null, finishReason: null,
    }, "method_not_allowed"));
    return;
  }

  const body = req.body as Partial<ProfessorLessonInput>;
  // Diagnostic identifiers only — documentId is hashed (one-way) so a book's
  // identity never appears in logs, and no node/edge TEXT is ever logged.
  let diagnosticIds: Record<string, unknown> = {
    requestId,
    documentIdHash: body?.documentId ? hashDocumentId(body.documentId) : null,
    pageTruthKey:   body?.pageTruthKey ?? null,
    pageNumber:     body?.pageNumber ?? null,
    nodeCount:      Array.isArray(body?.nodes) ? body.nodes.length : null,
    edgeCount:      Array.isArray(body?.edges) ? body.edges.length : null,
  };

  if (!body.pageTruthKey || typeof body.pageTruthKey !== "string") {
    res.status(400).json(degraded("pageTruthKey is required", {
      requestId, provider: "openai", model: null, failureStage: "request_validation",
      upstreamStatus: null, finishReason: null,
    }, "missing_ptk"));
    return;
  }
  if (!Array.isArray(body.nodes) || body.nodes.length === 0) {
    res.status(400).json(degraded("nodes is required", {
      requestId, provider: "openai", model: null, failureStage: "request_validation",
      upstreamStatus: null, finishReason: null,
    }, "missing_nodes"));
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[PROFESSOR_LESSON_UNAVAILABLE]", { reason: "OPENAI_API_KEY missing", ...diagnosticIds });
    res.status(200).json(degraded("The professor lesson planner is not configured on the server.", {
      requestId, provider: "openai", model: null, failureStage: "provider_configuration",
      upstreamStatus: null, finishReason: null,
    }, "PROVIDER_CONFIGURATION"));
    return;
  }

  const validIds = new Set<string>([
    ...(body.nodes ?? []).map(n => n.id),
    ...(body.edges ?? []).map(e => e.id),
  ]);

  const userContent =
    `pageTruthKey: ${body.pageTruthKey}\n` +
    `documentId: ${body.documentId ?? "unknown"}\n` +
    `pageNumber: ${body.pageNumber ?? "unknown"}\n` +
    `activeCanonicalUnitId: ${body.activeCanonicalUnitId ?? "none"}\n` +
    `pageTeachingType (this page's classification from the highlighting pass — a strong signal for visualGrammar and teaching style, see rule 6): ${body.pageTeachingType ?? "none"}\n` +
    `visualGrammarHint (already chosen by layout — you may confirm or override): ${body.visualGrammarHint ?? "flow"}\n` +
    `\nNodes:\n${JSON.stringify(body.nodes, null, 0)}\n` +
    `\nEdges:\n${JSON.stringify(body.edges ?? [], null, 0)}\n` +
    `\nProduce the ProfessorLessonScript JSON.`;

  const client = new OpenAI({ apiKey });
  const startedAt = Date.now();
  const model = await resolveTeachingModel(client);
  const maxCompletionTokens = professorCompletionBudget(body.nodes.length);
  diagnosticIds = { ...diagnosticIds, model, maxCompletionTokens };

  let completion: Awaited<ReturnType<typeof callOpenAI>>;
  let attempts = 1;
  try {
    try {
      completion = await callOpenAI(client, model, userContent, PLAN_TIMEOUT_MS, maxCompletionTokens);
    } catch (firstErr: any) {
      // A 400 (invalid_request_error) means THIS request is malformed for the
      // resolved model — e.g. an unsupported parameter. Retrying the exact
      // same request just reproduces the exact same failure a second time;
      // it never resolves a config bug, so don't mask it behind a retry.
      if (isInvalidRequestError(firstErr)) throw firstErr;
      attempts = 2;
      console.warn("[PROFESSOR_LESSON_RETRY]", {
        ...diagnosticIds,
        attempt:   1,
        error:     firstErr?.message ?? String(firstErr),
        elapsedMs: Date.now() - startedAt,
      });
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
      completion = await callOpenAI(client, model, userContent, PLAN_TIMEOUT_MS, maxCompletionTokens);
    }
  } catch (err: any) {
    const isTimeout        = err?.name === "AbortError" || /aborted|timed? ?out/i.test(err?.message ?? "");
    const isRateLimited    = err instanceof OpenAI.APIError && err.status === 429;
    const isInvalidRequest = isInvalidRequestError(err);
    console.error("[PROFESSOR_LESSON_FAILED]", {
      ...diagnosticIds,
      attempts,
      error:      err?.message ?? String(err),
      status:     err?.status ?? null,
      durationMs: Date.now() - startedAt,
    });
    res.status(200).json(degraded(
      isTimeout
        ? "The professor lesson planner timed out."
        : isRateLimited
        ? "The professor lesson planner is rate-limited — try again shortly."
        : isInvalidRequest
        ? "The professor lesson planner failed due to a request configuration error."
        : "The professor lesson planner is temporarily unavailable.",
      {
        requestId,
        provider: "openai",
        model,
        failureStage: "provider_request",
        upstreamStatus: err?.status ?? null,
        finishReason: null,
      },
      isTimeout ? "TIMEOUT" : isRateLimited ? "RATE_LIMITED" : isInvalidRequest ? "INVALID_REQUEST" : "UPSTREAM_UNAVAILABLE",
    ));
    return;
  }

  const choice = completion.choices[0];
  const raw = choice?.message?.content;
  if (!raw) {
    const finishReason = choice?.finish_reason ?? null;
    const completionDetails = completion.usage?.completion_tokens_details;
    console.error("[PROFESSOR_LESSON_FAILED]", {
      ...diagnosticIds,
      stage: "provider_response",
      reason: "empty_response",
      finishReason,
      completionTokens: completion.usage?.completion_tokens ?? null,
      reasoningTokens: completionDetails?.reasoning_tokens ?? null,
      durationMs: Date.now() - startedAt,
    });
    res.status(200).json(degraded(
      finishReason === "length"
        ? "The professor lesson planner exhausted its output budget."
        : "The professor lesson planner returned no content.",
      {
        requestId, provider: "openai", model, failureStage: "provider_response",
        upstreamStatus: 200, finishReason,
      },
      finishReason === "length" ? "OUTPUT_TOKEN_LIMIT" : "EMPTY_RESPONSE",
    ));
    return;
  }

  let parsed: unknown;
  try {
    // Structured Outputs (strict:true) guarantees raw is valid JSON matching
    // the schema shape — no markdown-fence stripping needed here, unlike the
    // loose json_object mode. JSON.parse + the Zod safeParse below stay as
    // defense-in-depth, not because either is expected to fail.
    parsed = JSON.parse(raw);
  } catch {
    console.error("[PROFESSOR_LESSON_FAILED]", { ...diagnosticIds, reason: "parse_error", durationMs: Date.now() - startedAt });
    res.status(200).json(degraded("The professor lesson planner returned invalid output.", {
      requestId, provider: "openai", model, failureStage: "json_parse",
      upstreamStatus: 200, finishReason: choice?.finish_reason ?? null,
    }, "JSON_PARSE"));
    return;
  }

  const result = ProfessorLessonScriptSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[PROFESSOR_LESSON_FAILED]", { ...diagnosticIds, reason: "schema_error", durationMs: Date.now() - startedAt });
    res.status(200).json(degraded("The professor lesson planner returned a malformed script.", {
      requestId, provider: "openai", model, failureStage: "schema_validation",
      upstreamStatus: 200, finishReason: choice?.finish_reason ?? null,
    }, "SCHEMA_VALIDATION"));
    return;
  }

  if (!targetsPlausible(result.data, validIds)) {
    console.error("[PROFESSOR_LESSON_FAILED]", { ...diagnosticIds, reason: "targets_implausible", durationMs: Date.now() - startedAt });
    res.status(200).json(degraded("The professor lesson planner could not be grounded to this page.", {
      requestId, provider: "openai", model, failureStage: "target_grounding",
      upstreamStatus: 200, finishReason: choice?.finish_reason ?? null,
    }, "TARGET_GROUNDING"));
    return;
  }

  // Production-safe — counts and timings only, never node/edge/narration text.
  console.log("[PROFESSOR_LESSON_OK]", {
    ...diagnosticIds,
    model,
    nodeScriptCount: result.data.nodeScripts.length,
    // "scene action count" per the required diagnostics — the number of
    // drawing actions this script will expand into is decided downstream by
    // buildProfessorTeachingActions.ts (deterministic, non-AI), but each
    // nodeScript/edgeScript here becomes at least one action, so this count
    // is the direct upstream signal for it.
    durationMs:      Date.now() - startedAt,
  });

  res.status(200).json({ ok: true, script: result.data, requestId, provider: "openai", model });
}
