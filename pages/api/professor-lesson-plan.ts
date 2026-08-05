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

export const config = {
  maxDuration: 30,
};

const PLAN_TIMEOUT_MS  = 25_000;
const RETRY_BACKOFF_MS = 700;

export type ProfessorLessonPlanResponse =
  | { ok: true; script: ProfessorLessonScript }
  | { ok: false; error: string; code: string; fallbackAllowed: true };

function degraded(message: string, code = "UPSTREAM_UNAVAILABLE"): ProfessorLessonPlanResponse {
  return { ok: false, error: message, code, fallbackAllowed: true };
}

// ── Static system prompt ───────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a professor performing a live, spoken lesson at a whiteboard, teaching
one page of a textbook to a student who is watching you draw.

You are NOT writing a diagram caption generator. You are behaving like a real instructor:
you write a few words by hand, you say what you're thinking while you draw it, you pause,
you add a connection, you circle the one point that matters most, and you end with a
question that makes the student think.

You are given the page's nodes and edges — already-selected, already-laid-out points, each
with an id and its full source text. You do NOT invent new nodes or edges, and you NEVER
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
6. visualGrammar: choose the ONE that best matches how this page's ideas actually relate —
   "procedure" (ordered steps), "mechanism" (cause leads to effect leads to effect),
   "anatomy" (a structure with labeled parts), "diagnosis" (branching decision points),
   "comparison" (two things contrasted), "equation" (a formula worked through), or
   "concept-map" (a looser network of related ideas) — when nothing else clearly fits.
   You are told this page's pageTeachingType — the classification the SAME page already
   received from the highlighting pass (e.g. "anatomy", "pharmacology", "decision-tree",
   "workflow"). Let it strongly inform BOTH your visualGrammar choice and how you narrate:
   an "anatomy" page should be taught by naming structures and their relationships, a
   "pharmacology" page by walking drug -> mechanism -> indication -> contraindication, a
   "decision-tree" or "diagnosis" page by walking the branching decision logic, a
   "workflow"/"procedure" page as an ordered sequence, a "classification" page as a
   taxonomy of related categories. Don't ignore pageTeachingType and default to a generic
   "concept-map" when a more specific grammar clearly fits it.
7. title is a short, hand-written page title — 2 to 6 words, written in your own words for
   what this page is fundamentally about (e.g. "ASPIRIN OVERDOSE"), not copied verbatim
   from a heading. "definition" is also a valid visualGrammar choice — use it when the page
   is fundamentally introducing/defining one core term rather than a process or comparison.
8. learningObjective is ONE sentence stating what the student should be able to DO after
   this lesson (e.g. "Explain the five stages of the diagnostic process and why the patient's
   own stated concern matters."), not a restatement of the title.
9. synthesisQuestion is ONE question you'd ask the student at the end to make them explain
   the idea back, not a yes/no question.
10. Every exactQuote-free field must still be YOUR OWN spoken teaching language — never copy
    long verbatim spans of the given node/edge text into narration; teach it, don't read it.

Respond with a ProfessorLessonScript matching the required structure exactly.`;

async function callOpenAI(
  client: OpenAI,
  model: string,
  userContent: string,
  timeoutMs: number,
) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await client.chat.completions.create(
      {
        model,
        temperature:      0.4, // some genuine variety in phrasing/tone is desirable here, unlike the strict-extraction annotation pass
        max_tokens:       2000,
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
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "Method not allowed", code: "method_not_allowed", fallbackAllowed: true });
    return;
  }

  const body = req.body as Partial<ProfessorLessonInput>;
  const requestId = newRequestId();
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
    res.status(400).json({ ok: false, error: "pageTruthKey is required", code: "missing_ptk", fallbackAllowed: true });
    return;
  }
  if (!Array.isArray(body.nodes) || body.nodes.length === 0) {
    res.status(400).json({ ok: false, error: "nodes is required", code: "missing_nodes", fallbackAllowed: true });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[PROFESSOR_LESSON_UNAVAILABLE]", { reason: "OPENAI_API_KEY missing", ...diagnosticIds });
    res.status(200).json(degraded("The professor lesson planner is not configured on the server."));
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
  diagnosticIds = { ...diagnosticIds, model };

  let completion: Awaited<ReturnType<typeof callOpenAI>>;
  try {
    try {
      completion = await callOpenAI(client, model, userContent, PLAN_TIMEOUT_MS);
    } catch (firstErr: any) {
      console.warn("[PROFESSOR_LESSON_RETRY]", {
        ...diagnosticIds,
        attempt:   1,
        error:     firstErr?.message ?? String(firstErr),
        elapsedMs: Date.now() - startedAt,
      });
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
      completion = await callOpenAI(client, model, userContent, PLAN_TIMEOUT_MS);
    }
  } catch (err: any) {
    const isRateLimited = err instanceof OpenAI.APIError && err.status === 429;
    console.error("[PROFESSOR_LESSON_FAILED]", {
      ...diagnosticIds,
      attempts:   2,
      error:      err?.message ?? String(err),
      status:     err?.status ?? null,
      durationMs: Date.now() - startedAt,
    });
    res.status(200).json(degraded(
      isRateLimited ? "The professor lesson planner is rate-limited — try again shortly." : "The professor lesson planner is temporarily unavailable.",
      isRateLimited ? "RATE_LIMITED" : "UPSTREAM_UNAVAILABLE",
    ));
    return;
  }

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    console.error("[PROFESSOR_LESSON_FAILED]", { ...diagnosticIds, reason: "empty_response", durationMs: Date.now() - startedAt });
    res.status(200).json(degraded("The professor lesson planner returned no content."));
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
    res.status(200).json(degraded("The professor lesson planner returned invalid output."));
    return;
  }

  const result = ProfessorLessonScriptSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[PROFESSOR_LESSON_FAILED]", { ...diagnosticIds, reason: "schema_error", durationMs: Date.now() - startedAt });
    res.status(200).json(degraded("The professor lesson planner returned a malformed script."));
    return;
  }

  if (!targetsPlausible(result.data, validIds)) {
    console.error("[PROFESSOR_LESSON_FAILED]", { ...diagnosticIds, reason: "targets_implausible", durationMs: Date.now() - startedAt });
    res.status(200).json(degraded("The professor lesson planner could not be grounded to this page."));
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

  res.status(200).json({ ok: true, script: result.data });
}
