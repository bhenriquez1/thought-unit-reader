// pages/api/gemini-visual.ts
// Gemini's role in this app is narrow and specific: describe the figures,
// diagrams, charts, tables, radiographs, histology/anatomy images on the
// CURRENT page — nothing else. It never proposes highlights, never plans the
// Whiteboard, never re-derives the page thesis. Its output is merged INTO
// pages/api/page-annotation-plan.ts's request as additional input (see
// buildSurgeonAnnotationInput.ts's visualContext field) so OpenAI's own
// single annotation-selection pass can incorporate it — the SAME one
// SurgeonAnnotationPlan every downstream feature (Highlights, Whiteboard,
// RightPanel) already reads from stays the sole shared understanding. This
// endpoint is never called by, or exposed to, any of those consumers
// directly.
//
// Best-effort and strictly additive: on ANY failure (missing key, timeout,
// malformed response), callers proceed with text-only analysis exactly as
// before Gemini existed — this must never block or degrade the core
// pipeline. See useSurgeonAnnotations.ts's resolveVisualContext().
//
// Security notes mirror pages/api/page-annotation-plan.ts: GEMINI_API_KEY is
// server-side only, the prompt is 100% static developer-authored text, and
// the only user-controlled value (the page image) goes into the request
// content only. Never log the page image or the extracted visual
// description text — counts/booleans only.

import type { NextApiRequest, NextApiResponse } from "next";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { hashDocumentId, newRequestId } from "@/lib/insights/requestDiagnostics";

export const config = {
  maxDuration: 20,
  // A base64 JPEG page image easily runs 150-400kb.
  api: { bodyParser: { sizeLimit: "4mb" } },
};

const VISUAL_TIMEOUT_MS = 12_000;
const DEFAULT_MODEL = "gemini-2.0-flash";

export type GeminiVisualResponse =
  | { ok: true; hasVisualContent: boolean; visualDescription: string | null }
  | { ok: false; error: string; code: string; fallbackAllowed: true };

function degraded(message: string, code = "UPSTREAM_UNAVAILABLE"): GeminiVisualResponse {
  return { ok: false, error: message, code, fallbackAllowed: true };
}

const GeminiVisualOutputSchema = z.object({
  hasVisualContent: z.boolean(),
  /** In the model's own words — never verbatim page text, never displayed
   *  as a PDF annotation. Purely additional context for the OpenAI pass. */
  visualDescription: z.string().max(1200).nullable(),
});

const SYSTEM_PROMPT = `You are a visual-content specialist looking at ONE page from a textbook.

Your ONLY job: identify whether this page contains a figure, diagram, chart, graph, table,
radiograph, histology image, anatomy illustration, or other meaningful visual element (beyond
plain body text) — and if so, describe what it shows in plain language a study-app pipeline can
use as context. You are NOT selecting highlights, NOT writing a lesson plan, NOT summarizing the
page's text content — another system already reads the page's text separately; your only
contribution is the VISUAL content, and only when there genuinely is some.

Rules:
1. If the page is plain body text with no meaningful figure/diagram/chart/table/image, set
   hasVisualContent to false and visualDescription to null. Do not invent a description for a
   page that doesn't have one — a page of prose describing a process is NOT itself a "diagram."
2. When a real visual element IS present, describe: what TYPE it is (e.g. "anatomical diagram",
   "flow chart", "data table", "histology slide"), what it depicts, and — if apparent — how it
   relates to the surrounding text. Keep this to 2-4 sentences, plain prose, your own words.
3. Never transcribe body text you can also read on the page — that is handled by a separate
   text-reading pass. Only describe the VISUAL element itself.
4. If there are multiple distinct visual elements, describe each briefly rather than picking one.

Respond ONLY with a JSON object matching this schema — no prose, no markdown fences:
{
  "hasVisualContent": <boolean>,
  "visualDescription": "<string, 2-4 sentences, or null if hasVisualContent is false>"
}`;

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GeminiVisualResponse>,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "Method not allowed", code: "method_not_allowed", fallbackAllowed: true });
    return;
  }

  const body = req.body as { pageImageDataUrl?: string; documentId?: string; pageNumber?: number; pageTruthKey?: string };
  const requestId = newRequestId();
  // Diagnostic identifiers only — never the page image or the extracted
  // visual description text.
  const diagnosticIds = {
    requestId,
    documentIdHash: body?.documentId ? hashDocumentId(body.documentId) : null,
    pageTruthKey:   body?.pageTruthKey ?? null,
    pageNumber:     body?.pageNumber ?? null,
  };

  if (!body.pageImageDataUrl || typeof body.pageImageDataUrl !== "string") {
    res.status(400).json({ ok: false, error: "pageImageDataUrl is required", code: "missing_page_image", fallbackAllowed: true });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Not an error — Gemini visual understanding is optional. DEV-only log
    // (unlike the required-provider routes) since a missing optional
    // provider on every page load would otherwise spam production logs.
    if (process.env.NODE_ENV === "development") {
      console.log("[GEMINI_VISUAL_UNAVAILABLE]", { reason: "GEMINI_API_KEY missing", ...diagnosticIds });
    }
    res.status(200).json(degraded("Gemini is not configured.", "NOT_CONFIGURED"));
    return;
  }

  const image = parseDataUrl(body.pageImageDataUrl);
  if (!image) {
    res.status(400).json({ ok: false, error: "pageImageDataUrl is not a valid data: URL", code: "invalid_page_image", fallbackAllowed: true });
    return;
  }

  const startedAt = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), VISUAL_TIMEOUT_MS);

  try {
    const client = new GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

    const response = await client.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { text: SYSTEM_PROMPT },
            { inlineData: { mimeType: image.mimeType, data: image.data } },
          ],
        },
      ],
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        abortSignal: ctrl.signal,
      },
    });

    const raw = response.text;
    if (!raw) {
      console.error("[GEMINI_VISUAL_FAILED]", { ...diagnosticIds, reason: "empty_response", durationMs: Date.now() - startedAt });
      res.status(200).json(degraded("Gemini returned no content."));
      return;
    }

    let parsed: unknown;
    try {
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("[GEMINI_VISUAL_FAILED]", { ...diagnosticIds, reason: "parse_error", durationMs: Date.now() - startedAt });
      res.status(200).json(degraded("Gemini returned invalid output."));
      return;
    }

    const result = GeminiVisualOutputSchema.safeParse(parsed);
    if (!result.success) {
      console.error("[GEMINI_VISUAL_FAILED]", { ...diagnosticIds, reason: "schema_error", durationMs: Date.now() - startedAt });
      res.status(200).json(degraded("Gemini returned a malformed response."));
      return;
    }

    // Production-safe — booleans and counts only, never the description text.
    console.log("[GEMINI_VISUAL_OK]", {
      ...diagnosticIds,
      hasVisualContent: result.data.hasVisualContent,
      descriptionLength: result.data.visualDescription?.length ?? 0,
      durationMs: Date.now() - startedAt,
    });

    res.status(200).json({
      ok: true,
      hasVisualContent: result.data.hasVisualContent,
      visualDescription: result.data.hasVisualContent ? result.data.visualDescription : null,
    });
  } catch (err: any) {
    const isTimeout = ctrl.signal.aborted;
    console.error("[GEMINI_VISUAL_FAILED]", {
      ...diagnosticIds,
      reason:     isTimeout ? "timeout" : "request_error",
      error:      err?.message ?? String(err),
      durationMs: Date.now() - startedAt,
    });
    res.status(200).json(degraded(
      isTimeout ? "Gemini timed out." : "Gemini is temporarily unavailable.",
      isTimeout ? "TIMEOUT" : "UPSTREAM_UNAVAILABLE",
    ));
  } finally {
    clearTimeout(timer);
  }
}
