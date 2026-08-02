// lib/highlights/groundSurgeonQuotes.ts
// Strict verification layer for SurgeonAnnotationPlan.annotations[].exactQuote.
//
// Deliberately NOT groundHighlightAnchors.ts: that pipeline exists to rescue
// paraphrased AI anchors by substituting the best-scoring real sentence — useful
// when the model was never asked to be verbatim, wrong here because a
// SurgeonAnnotationPlan's exactQuote IS supposed to already be verbatim. Silently
// substituting a different sentence when a quote doesn't match would reintroduce
// the "wrong sentence gets highlighted" risk the strict-reject design explicitly
// rules out. So this file only ever accepts or drops — never rewrites.
//
// Pipeline per annotation:
//   1. Exact substring match   → keep, confidence 1.0
//   2. Normalized match        → keep, confidence 0.95 (ligatures/quotes/dashes/whitespace)
//   3. No match                → drop entirely — "no highlight is better than a wrong highlight"

import { normText } from "./groundHighlightAnchors";
import type { SurgeonAnnotationPlan } from "../insights/pageAnnotationPlan";

const DEV = process.env.NODE_ENV === "development";

export type GroundedSurgeonAnnotation = SurgeonAnnotationPlan["annotations"][number] & {
  /** Exact text as it appears in the PDF page — guaranteed findable by the
   *  coordinate resolver. Equal to exactQuote for "exact" matches; the
   *  page-text-verbatim variant for "normalized" matches (same content,
   *  different incidental characters). */
  groundedText: string;
  groundingState: "exact" | "normalized";
  confidence: number;
};

/**
 * Verify every annotation's exactQuote against the current page's real text.
 * Only annotations that match (exact or normalized) are returned — anything
 * that doesn't match is dropped, never substituted or guessed.
 */
export function groundSurgeonQuotes(
  annotations: SurgeonAnnotationPlan["annotations"],
  pageText: string,
): GroundedSurgeonAnnotation[] {
  if (!pageText || pageText.length < 10) return [];

  const normedPage = normText(pageText);
  const grounded: GroundedSurgeonAnnotation[] = [];

  for (const annotation of annotations) {
    const quote = annotation.exactQuote;

    // ── Stage 1: exact substring match ──────────────────────────────────────
    if (pageText.includes(quote)) {
      grounded.push({ ...annotation, groundedText: quote, groundingState: "exact", confidence: 1.0 });
      continue;
    }

    // ── Stage 2: normalized match (ligatures, smart quotes, dashes, whitespace) ──
    const normedQuote = normText(quote);
    if (normedQuote.length >= 5 && normedPage.includes(normedQuote)) {
      grounded.push({ ...annotation, groundedText: quote, groundingState: "normalized", confidence: 0.95 });
      continue;
    }

    // ── Stage 3: none — reject. No semantic substitution for this pipeline. ──
    DEV && console.log("[SURGEON_QUOTE_REJECTED]", {
      quote:         quote.slice(0, 100),
      canonicalType: annotation.canonicalType,
    });
  }

  DEV && console.log("[SURGEON_QUOTES_GROUNDED]", {
    input:    annotations.length,
    grounded: grounded.length,
    rejected: annotations.length - grounded.length,
  });

  return grounded;
}
