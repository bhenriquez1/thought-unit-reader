// lib/highlights/groundSurgeonQuotes.ts
// Strict verification layer for SurgeonAnnotationPlan.annotations[].exactQuote.
//
// Deliberately NOT groundHighlightAnchors.ts: that pipeline exists to rescue
// paraphrased AI anchors by substituting the best-scoring real sentence — useful
// when the model was never asked to be verbatim, wrong here because a
// SurgeonAnnotationPlan's exactQuote IS supposed to already be verbatim. Silently
// substituting a different sentence when a quote doesn't match would reintroduce
// the "wrong sentence gets highlighted" risk the strict-reject design explicitly
// rules out. So this file only ever accepts or drops — never rewrites to a
// DIFFERENT sentence. It does, however, EXPAND an accepted match to sentence
// boundaries by default (see below) — that's widening the same match, not
// substituting a different one.
//
// Pipeline per annotation:
//   0. sentenceId lookup       → keep, confidence 1.0, guaranteed-exact by
//      construction (see lib/insights/segmentPageSentences.ts) — no string
//      matching involved at all, so it can't be defeated by a small
//      paraphrase the way Stage 1/2 can. Preferred path for "fullSentence"
//      scope; skipped entirely for "entity" scope (sub-sentence spans aren't
//      covered by sentence segmentation) or when sentenceId is absent/stale.
//   1. Exact substring match   → keep, confidence 1.0
//   2. Normalized match        → keep, confidence 0.95 (ligatures/quotes/dashes/whitespace)
//   3. No match                → drop entirely — "no highlight is better than a wrong highlight"
//
// Sentence-boundary expansion (default, spanScope "fullSentence"):
//   A verified match is expanded to run from the first meaningful word of its
//   sentence to that sentence's ending punctuation (. ; or :) — never a
//   mid-sentence fragment. spanScope "entity" (single term/drug name/anatomy/
//   formula/equation/short definition-term) opts out and keeps the match exactly
//   as quoted. This is a pure boundary WIDENING of the already-verified match —
//   never a substitution — so it can't introduce a wrong-sentence highlight.
//
// Duplicate collapse (final step): two annotations that expand/normalize to the
// same groundedText (e.g. the model proposed the same sentence twice under
// different canonicalTypes, or a fragment and its containing sentence both
// survived) collapse to the FIRST occurrence only — the model's own priority
// order is preserved, never re-ranked by importance.

import { normText } from "./groundHighlightAnchors";
import type { SurgeonAnnotationPlan } from "../insights/pageAnnotationPlan";

const DEV = process.env.NODE_ENV === "development";

export type GroundedSurgeonAnnotation = SurgeonAnnotationPlan["annotations"][number] & {
  /** Exact text as it appears in the PDF page — guaranteed findable by the
   *  coordinate resolver. Equal to exactQuote for "entity"-scope matches;
   *  expanded to full sentence boundaries for "fullSentence"-scope matches
   *  (the default) whenever a raw-text position could be located. */
  groundedText: string;
  groundingState: "sentenceId" | "exact" | "normalized";
  confidence: number;
  /** This annotation's index in the ORIGINAL annotations[] array passed in —
   *  preserved through rejection/dedup so a surviving annotation.relationship
   *  .targetIndex (also an index into that same original array) can still be
   *  resolved against whichever OTHER annotations also survived, even though
   *  some entries were dropped and the surviving array is shorter/reordered
   *  relative to the input. */
  originalIndex: number;
};

/**
 * Deterministic id for the i-th grounded annotation on a page — shared by
 * useSurgeonAnnotations.ts (HighlightTarget.id/evidenceRefId) and the
 * Scene Builder's surgeonAnnotationsToCanonicalEntries adapter
 * (lib/whiteboard/visualSceneGraph.ts), so a PDF highlight and its
 * corresponding whiteboard node cross-highlight with no extra sync code —
 * both already write to the same global focusedEvidenceId/activeAnchorId state.
 * Both callers MUST index into the same GroundedSurgeonAnnotation[] (same
 * order) for the ids to line up.
 */
export function buildSurgeonEvidenceId(pageNumber: number, index: number): string {
  return `surgeon-${pageNumber}-${index}`;
}

// ── Sentence-boundary expansion ─────────────────────────────────────────────────

const SENTENCE_END_CHARS = new Set([".", "!", "?", ";", ":"]);
const TRAILING_CLOSERS = new Set(["\"", "'", "”", "’", ")", "]"]);
// Defensive bound so expansion can't run away across an entire page when no
// sentence punctuation is found nearby (e.g. a table or malformed extraction).
const EXPANSION_CAP = 2000;

function findSentenceStart(text: string, fromIdx: number): number {
  let i = fromIdx;
  const floor = Math.max(0, fromIdx - EXPANSION_CAP);
  while (i > floor) {
    const ch = text[i - 1];
    if (ch === "\n" && text[i - 2] === "\n") break; // don't cross a paragraph break
    if (SENTENCE_END_CHARS.has(ch)) break;
    i--;
  }
  // Skip past leftover whitespace / opening quote so the span starts on the
  // first meaningful word, not a stray space or quotation mark.
  while (i < fromIdx && /[\s"'“‘(]/.test(text[i])) i++;
  return i;
}

function findSentenceEnd(text: string, fromIdx: number): number {
  let i = fromIdx;
  // If the match already ends right at a sentence boundary, don't scan forward
  // into the NEXT sentence — just absorb an immediate trailing closer (e.g. a
  // closing quote right after the period) and stop.
  if (i > 0 && SENTENCE_END_CHARS.has(text[i - 1])) {
    while (i < text.length && TRAILING_CLOSERS.has(text[i])) i++;
    return i;
  }
  const ceiling = Math.min(text.length, fromIdx + EXPANSION_CAP);
  while (i < ceiling) {
    const ch = text[i];
    if (ch === "\n" && text[i + 1] === "\n") break; // don't cross a paragraph break
    if (SENTENCE_END_CHARS.has(ch)) {
      i++; // include the punctuation itself
      while (i < text.length && TRAILING_CLOSERS.has(text[i])) i++; // absorb a trailing quote/paren
      break;
    }
    i++;
  }
  return i;
}

/** Widen [startIdx, endIdx) to the full sentence(s) containing it — first
 *  meaningful word to ending punctuation. Never crosses a paragraph break. */
function expandToSentenceBoundaries(
  pageText: string,
  startIdx: number,
  endIdx: number,
): { start: number; end: number } {
  return {
    start: findSentenceStart(pageText, startIdx),
    end:   findSentenceEnd(pageText, endIdx),
  };
}

/**
 * Verify every annotation's exactQuote against the current page's real text.
 * Only annotations that match (sentenceId, exact, or normalized) are
 * returned — anything that doesn't match is dropped, never substituted or
 * guessed.
 *
 * @param sentencesById  id -> exact text, from segmentPageSentences() run
 *   against this SAME pageText — see lib/insights/segmentPageSentences.ts.
 *   Optional so existing callers/tests that only exercise exactQuote-based
 *   grounding keep working unchanged; omit it (or pass an empty map) to
 *   disable Stage 0 entirely.
 */
export function groundSurgeonQuotes(
  annotations: SurgeonAnnotationPlan["annotations"],
  pageText: string,
  sentencesById?: Map<string, string>,
): GroundedSurgeonAnnotation[] {
  if (!pageText || pageText.length < 10) return [];

  const normedPage = normText(pageText);
  const grounded: GroundedSurgeonAnnotation[] = [];

  for (const [originalIndex, annotation] of annotations.entries()) {
    const quote = annotation.exactQuote;
    const isEntity = annotation.spanScope === "entity";

    // ── Stage 0: sentenceId lookup — guaranteed-exact, no string matching ──
    // Only for "fullSentence" scope: an entity is a sub-sentence span the
    // sentence segmentation doesn't represent, so it always uses exactQuote.
    if (!isEntity && annotation.sentenceId && sentencesById?.has(annotation.sentenceId)) {
      const sentenceText = sentencesById.get(annotation.sentenceId)!;
      const startIdx = pageText.indexOf(sentenceText);
      if (startIdx !== -1) {
        let groundedText = sentenceText;
        // Multi-sentence span (prompt rule 12): the model's own exactQuote is
        // meaningfully longer than the single resolved sentence — walk
        // forward, sentence by sentence, until the accumulated span roughly
        // covers what exactQuote implies. Bounded defensively; if this loop
        // can't catch up within a few sentences, keep whatever was
        // accumulated rather than looping indefinitely — a shorter-than-
        // intended (but still 100% real, still useful) grounded span beats
        // both an unbounded expansion and rejecting the annotation outright.
        const wantsMore = normText(quote).length > normText(sentenceText).length + 15;
        if (wantsMore) {
          // +1 to step past sentenceText's own trailing boundary — findSentenceEnd
          // treats "already at a boundary" as "nothing to expand," so starting
          // exactly AT that boundary would return immediately instead of
          // advancing into the next sentence.
          let end = findSentenceEnd(pageText, startIdx + sentenceText.length + 1);
          let guard = 0;
          while (
            normText(pageText.slice(startIdx, end)).length < normText(quote).length - 15 &&
            guard < 5
          ) {
            const next = findSentenceEnd(pageText, end + 1);
            if (next <= end) break;
            end = next;
            guard++;
          }
          groundedText = pageText.slice(startIdx, end);
        }
        grounded.push({ ...annotation, groundedText, groundingState: "sentenceId", confidence: 1.0, originalIndex });
        continue;
      }
      // sentenceId was set but doesn't resolve against this pageText (stale
      // segmentation, id typo) — fall through to exact/normalized/reject
      // below, exactly as if sentenceId had never been provided.
    }

    // ── Stage 1: exact substring match ──────────────────────────────────────
    const exactPos = pageText.indexOf(quote);
    if (exactPos !== -1) {
      const groundedText = isEntity
        ? quote
        : (() => {
            const { start, end } = expandToSentenceBoundaries(pageText, exactPos, exactPos + quote.length);
            return pageText.slice(start, end);
          })();
      grounded.push({ ...annotation, groundedText, groundingState: "exact", confidence: 1.0, originalIndex });
      continue;
    }

    // ── Stage 2: normalized match (ligatures, smart quotes, dashes, whitespace) ──
    const normedQuote = normText(quote);
    if (normedQuote.length >= 5 && normedPage.includes(normedQuote)) {
      // Best-effort raw-text position for expansion: a case-only difference is
      // the common reason a match is normalized-but-not-exact. When the raw
      // position can't be located (e.g. a ligature/dash difference genuinely
      // changed the string), fall back to the original quote unexpanded —
      // still a correct, verified highlight, just not boundary-widened.
      const caseInsensitivePos = pageText.toLowerCase().indexOf(quote.toLowerCase());
      const groundedText = isEntity || caseInsensitivePos === -1
        ? quote
        : (() => {
            const { start, end } = expandToSentenceBoundaries(pageText, caseInsensitivePos, caseInsensitivePos + quote.length);
            return pageText.slice(start, end);
          })();
      grounded.push({ ...annotation, groundedText, groundingState: "normalized", confidence: 0.95, originalIndex });
      continue;
    }

    // ── Stage 3: none — reject. No semantic substitution for this pipeline. ──
    DEV && console.log("[SURGEON_QUOTE_REJECTED]", {
      quote:         quote.slice(0, 100),
      canonicalType: annotation.canonicalType,
    });
  }

  const deduped = dedupeByGroundedText(grounded);

  DEV && console.log("[SURGEON_QUOTES_GROUNDED]", {
    input:     annotations.length,
    grounded:  grounded.length,
    duplicate: grounded.length - deduped.length,
    rejected:  annotations.length - grounded.length,
  });

  return deduped;
}

/** Collapse annotations whose groundedText is the same span (case/whitespace-
 *  insensitive) — keeps the first occurrence, drops later duplicates. */
function dedupeByGroundedText(list: GroundedSurgeonAnnotation[]): GroundedSurgeonAnnotation[] {
  const seen = new Set<string>();
  const out: GroundedSurgeonAnnotation[] = [];
  for (const item of list) {
    const key = normText(item.groundedText);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
