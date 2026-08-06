// lib/insights/resolveVisualContext.ts
// Calls Gemini's figure/diagram/table-understanding pass
// (pages/api/gemini-visual.ts) and resolves to a plain description string —
// or null on ANY failure: missing key, no page image, Gemini found nothing,
// a malformed response, a network error, or an abort. This function NEVER
// throws. Its result is purely additive merge input for
// buildSurgeonAnnotationInput.ts's visualContext field — when it resolves to
// null, page-annotation-plan.ts proceeds exactly as it did before Gemini
// existed. Never call this expecting a guaranteed answer; it's best-effort.

import type { GeminiVisualResponse } from "@/pages/api/gemini-visual";

export async function resolveVisualContext(args: {
  pageImageDataUrl: string | null;
  documentId: string;
  pageNumber: number;
  pageTruthKey: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  if (!args.pageImageDataUrl) return null;

  try {
    const res = await fetch("/api/gemini-visual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageImageDataUrl: args.pageImageDataUrl,
        documentId:       args.documentId,
        pageNumber:       args.pageNumber,
        pageTruthKey:     args.pageTruthKey,
      }),
      signal: args.signal,
    });
    const data = (await res.json()) as GeminiVisualResponse;
    if (!data.ok || !data.hasVisualContent) return null;
    return data.visualDescription;
  } catch {
    // Network error, timeout, or the caller's own abort (real page
    // navigation) — never surfaced as a failure to the caller, and never
    // blocks the text-only annotation pipeline that follows.
    return null;
  }
}
