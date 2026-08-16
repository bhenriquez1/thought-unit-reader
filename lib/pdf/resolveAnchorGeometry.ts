// lib/pdf/resolveAnchorGeometry.ts
// Phase 2 / 2.5: Anchor-Driven Overlay
//
// Maps a ReaderAnchor (or a HighlightTarget's fields) to viewport-space
// BoundingBoxes without touching the DOM.
//
// Coordinate spaces:
//   Extraction  — TextLayerRegistry stores token bboxes in PDF-point coords at
//                 scale=1 with y-axis flipped to top-left origin:
//                   x = transform[4]  (PDF pts from page left)
//                   y = pageHeight − transform[5]  (PDF pts from page top)
//                 This is set by pdfjs-handler.ts which calls getViewport({scale:1}).
//   Resolution  — resolveAnchorGeometry multiplies by viewportScale:
//                   canvas_px = pdf_pt × viewportScale
//                 Result is CSS-pixel coordinates relative to the page container
//                 top-left, ready for direct use as CSS top/left on an absolute element.
//   Rendering   — PdfEvidenceOverlay places its rects with style.top/left/width/height
//                 as CSS pixels inside an `absolute inset-0` div that shares the same
//                 origin as the react-pdf Page container. No further transform needed.
//
// DPR note: all coordinates are in CSS pixels (logical pixels), not physical
// device pixels. The canvas internally uses physical pixels but that is invisible
// to the overlay positioning which only sees CSS pixels.
//
// Page rotation note: buildPageTextIndex stores raw transform[4]/[5] values;
// on rotated pages the origin handling changes and simple y-flip may be incorrect.
// Callers should fall back to legacy-dom for pages with rotation != 0 until a
// rotation-aware transform is added to buildPageTextIndex.
//
// Crop-box note: PDF.js's getViewport({scale:1}) accounts for crop boxes in the
// reported page height. Text item transforms are in the uncropped PDF coordinate
// space, so stored bboxes are already aligned to the rendered crop-box viewport.
//
// Resolution priority:
//   1. pdfTextItemIndexes present  → exact PDF.js item lookup  (best quality)
//   2. startChar / endChar present → token char-offset overlap  (legacy anchors)
//   3. normalizedSourceText / quote → substring search in fullText  (quote fallback)
//   4. groundingState === "synthetic" → return []  (no PDF geometry available)

import type { ReaderAnchor, BoundingBox } from "../canonical/types";
import { TextLayerRegistry } from "../page-intelligence/textLayerIndex";
import type { TextToken } from "../page-intelligence/textLayerIndex";

// ── Diagnostics type ─────────────────────────────────────────────────────────

/**
 * Which resolution strategy produced the overlay geometry.
 * Exposed only in development diagnostics (never persisted or surfaced in UI).
 *
 *   "item-index"  — resolved via pdfTextItemIndexes (Strategy 1, best quality)
 *   "char-offset" — resolved via startChar/endChar overlap (Strategy 2)
 *   "quote"       — resolved via substring search in fullText (Strategy 3)
 *   "legacy-dom"  — resolved by the DOM getBoundingClientRect() path in SmartPDFViewer
 *   "none"        — not resolved by any strategy (overlay suppressed or registry missing)
 */
export type GeometryResolutionSource =
  | "item-index"
  | "char-offset"
  | "quote"
  | "legacy-dom"
  | "none";

/**
 * Why a candidate highlight was classified unresolved rather than rendered.
 * Development diagnostics only — never surfaced in UI, never persisted.
 */
export type UnresolvedReason =
  | "no-registry"          // TextLayerRegistry has no entry for this page
  | "synthetic"             // groundingState was "synthetic" — no PDF geometry ever existed
  | "no-candidate"          // none of the 3 strategies found ANY candidate tokens
  | "incomplete-match"      // a candidate was found but the full quote didn't verify against it
  | null;                   // resolved successfully — no reason needed

/**
 * Per-candidate diagnostics for a resolved (or rejected) highlight. Every
 * field here is development-only instrumentation — see the stabilization
 * spec's requirement for auditable per-highlight fidelity, never persisted
 * or surfaced to the reader.
 */
export interface GeometryResolutionDiagnostics {
  rects: BoundingBox[];
  source: GeometryResolutionSource;
  /** Number of words in the anchor's own quote/normalizedSourceText. */
  expectedWordCount: number;
  /** Number of those words actually verified present, in order, at the
   *  resolved position — equals expectedWordCount only for a complete match. */
  matchedWordCount: number;
  /** Number of merged geometry rects produced (one per visual line/column). */
  geometryRectCount: number;
  /** True only when the FULL quote was verified at the resolved position —
   *  never true for a prefix-only or partial match. */
  boundaryComplete: boolean;
  unresolvedReason: UnresolvedReason;
}

/** One word matched against the expected sequence, with its ABSOLUTE
 *  character range in the original (unmodified) body string. */
interface VerifiedWordMatch {
  start: number;
  end: number;
}

/**
 * Walks forward from `pos`, matching `expectedWords` one at a time against
 * whatever word actually sits at that position in `bodyLower` — stops at
 * the first mismatch (or once every expected word is matched) and returns
 * only the VERIFIED leading run. This is the shared core both
 * verifyFullQuoteMatch (does the whole quote check out?) and
 * resolveWordGeometry (is word N actually where the arithmetic says it is?)
 * build on, so "trust a bounded-prefix search, then blindly compute the
 * rest by string-length arithmetic" — the root cause of both the
 * fragment-highlight bug and the eye-follow-word-drifts-off-target bug —
 * happens in exactly one place, not two independent copies.
 *
 * Deliberately does NOT strip punctuation or otherwise re-normalize the
 * body text: `pos` and every returned offset are into the UNMODIFIED
 * `bodyLower` string (the same one the caller's prefix search already
 * used), and `TextToken.startChar`/`endChar` are offsets into that same
 * unmodified string — any length-changing transform would silently
 * invalidate them. Word comparison is case-insensitive (both sides already
 * lowercased) and tolerant of whitespace-LENGTH differences between the
 * expected text and the reconstructed page text (a paragraph break can
 * legitimately render as "\n\n" in one and a single space in the other)
 * without tolerating a genuinely different word.
 */
function matchWordsFrom(
  expectedWords: string[],
  bodyLower: string,
  pos: number,
  windowChars: number,
): VerifiedWordMatch[] {
  const windowEnd = Math.min(bodyLower.length, pos + windowChars);
  const windowText = bodyLower.slice(pos, windowEnd);
  const candidates = [...windowText.matchAll(/\S+/g)];

  const verified: VerifiedWordMatch[] = [];
  for (let i = 0; i < expectedWords.length && i < candidates.length; i++) {
    if (candidates[i][0] !== expectedWords[i]) break;
    const start = pos + (candidates[i].index as number);
    verified.push({ start, end: start + candidates[i][0].length });
  }
  return verified;
}

/** Slack added to the search window beyond the expected text's own length,
 *  to tolerate whitespace-length differences without cutting off a
 *  genuinely-matching trailing word. */
const MATCH_WINDOW_SLACK = 80;

/**
 * Verifies that the FULL quote — not just the bounded search prefix used to
 * locate it — actually appears at the candidate position, word by word.
 */
function verifyFullQuoteMatch(
  quote: string,
  bodyLower: string,
  pos: number,
): { boundaryComplete: boolean; expectedWordCount: number; matchedWordCount: number; matchEnd: number } {
  const expectedWords = quote.toLowerCase().split(/\s+/).filter(Boolean);
  const expectedWordCount = expectedWords.length;
  if (expectedWordCount === 0) {
    return { boundaryComplete: false, expectedWordCount: 0, matchedWordCount: 0, matchEnd: pos };
  }

  const verified = matchWordsFrom(expectedWords, bodyLower, pos, quote.length + MATCH_WINDOW_SLACK);
  const matchedWordCount = verified.length;
  const matchEnd = matchedWordCount > 0 ? verified[matchedWordCount - 1].end : pos;

  return { boundaryComplete: matchedWordCount === expectedWordCount, expectedWordCount, matchedWordCount, matchEnd };
}

// ── Core resolver ─────────────────────────────────────────────────────────────

/**
 * Resolve a ReaderAnchor to viewport-space BoundingBoxes, also reporting
 * which resolution strategy succeeded.
 *
 * Prefer this over resolveAnchorGeometry in contexts that log diagnostics.
 */
export function resolveAnchorGeometryTracked(
  anchor: ReaderAnchor,
  viewportScale: number,
): GeometryResolutionDiagnostics {
  return resolveAnchorGeometryDiagnostic(anchor, viewportScale);
}

/**
 * Full-diagnostics version of resolveAnchorGeometryTracked — same
 * resolution logic, plus the per-candidate fidelity fields the
 * stabilization spec calls for (sourceCharStart/sourceCharEnd live on the
 * ReaderAnchor itself already; this adds the resolution-time fields that
 * only exist once geometry is actually attempted).
 */
export function resolveAnchorGeometryDiagnostic(
  anchor: ReaderAnchor,
  viewportScale: number,
): GeometryResolutionDiagnostics {
  const emptyDiag = (source: GeometryResolutionSource, unresolvedReason: UnresolvedReason): GeometryResolutionDiagnostics => ({
    rects: [], source, expectedWordCount: 0, matchedWordCount: 0, geometryRectCount: 0,
    boundaryComplete: false, unresolvedReason,
  });

  if (anchor.groundingState === "synthetic") {
    return emptyDiag("none", "synthetic");
  }

  const textIndex = TextLayerRegistry.get(anchor.pageIndex);
  if (!textIndex) return emptyDiag("none", "no-registry");

  let tokens: TextToken[] = [];
  let source: GeometryResolutionSource = "none";
  let expectedWordCount = 0;
  let matchedWordCount = 0;
  let boundaryComplete = true; // strategies 1/2 are exact by construction — no quote to verify
  let unresolvedReason: UnresolvedReason = "no-candidate";

  // ── Strategy 1: exact itemIndex lookup ────────────────────────────────────
  if (anchor.pdfTextItemIndexes && anchor.pdfTextItemIndexes.length > 0) {
    const indexSet = new Set(anchor.pdfTextItemIndexes);
    tokens = textIndex.tokens.filter(t => indexSet.has(t.itemIndex));
    if (tokens.length > 0) source = "item-index";
  }

  // ── Strategy 2: char-offset overlap ──────────────────────────────────────
  if (tokens.length === 0) {
    const start = anchor.startChar;
    const end   = anchor.endChar;
    if (end > start) {
      tokens = textIndex.tokens.filter(
        t => t.endChar > start && t.startChar < end,
      );
      if (tokens.length > 0) source = "char-offset";
    }
  }

  // ── Strategy 3: quote substring search ───────────────────────────────────
  // Search using a bounded prefix (robust against a stray mismatch far into a
  // long quote, and necessary to locate a quote that sits deep in the page's
  // fullText past unrelated leading content) — but ACCEPT the match only
  // after verifying the FULL quote, not just that prefix, actually appears
  // at the found position. A prefix-only match that diverges partway
  // through (e.g. because a column-ordering mismatch put unrelated text
  // where the rest of the quote should be) is classified unresolved rather
  // than rendered as a geometrically-wrong-but-present highlight.
  if (tokens.length === 0) {
    const quote = (anchor.normalizedSourceText ?? anchor.quote ?? "").trim();
    if (quote.length >= 10) {
      const SEARCH_PREFIX_LEN = 60;
      const queryNorm = quote.toLowerCase().slice(0, SEARCH_PREFIX_LEN);
      const bodyNorm  = textIndex.fullText.toLowerCase();
      const pos = bodyNorm.indexOf(queryNorm);
      if (pos !== -1) {
        const verify = verifyFullQuoteMatch(quote, bodyNorm, pos);
        expectedWordCount = verify.expectedWordCount;
        matchedWordCount = verify.matchedWordCount;
        boundaryComplete = verify.boundaryComplete;
        if (verify.boundaryComplete) {
          const candidateTokens = textIndex.tokens.filter(
            t => t.endChar > pos && t.startChar < verify.matchEnd,
          );
          if (candidateTokens.length > 0) {
            tokens = candidateTokens;
            source = "quote";
          } else {
            unresolvedReason = "no-candidate";
          }
        } else {
          unresolvedReason = "incomplete-match";
        }
      }
    }
  }

  if (tokens.length === 0) {
    return {
      rects: [], source, expectedWordCount, matchedWordCount, geometryRectCount: 0,
      boundaryComplete, unresolvedReason,
    };
  }

  const scaled: BoundingBox[] = tokens.map(t => ({
    x: t.bbox.x * viewportScale,
    y: t.bbox.y * viewportScale,
    w: t.bbox.w * viewportScale,
    h: t.bbox.h * viewportScale,
  }));
  const rects = mergeLineRects(scaled);

  return {
    rects,
    source,
    expectedWordCount,
    matchedWordCount,
    geometryRectCount: rects.length,
    boundaryComplete,
    unresolvedReason: null,
  };
}

/**
 * Resolve a ReaderAnchor to an array of viewport-space BoundingBoxes.
 *
 * Each returned rect is in canvas pixel coordinates at `viewportScale`:
 *   canvas_px = pdf_point * viewportScale
 *
 * Returns [] when the anchor cannot be resolved:
 *   - groundingState is "synthetic" (no PDF geometry was ever available)
 *   - the TextLayerRegistry has no entry for this page
 *   - no tokens match any of the three strategies
 *
 * The returned rects are sorted top→bottom, left→right, with horizontally
 * adjacent same-line rects merged into single rectangles.
 */
export function resolveAnchorGeometry(
  anchor: ReaderAnchor,
  viewportScale: number,
): BoundingBox[] {
  return resolveAnchorGeometryTracked(anchor, viewportScale).rects;
}

/**
 * Convenience wrapper for SmartPDFViewer — resolves geometry from a
 * HighlightTarget's fields without requiring a full ReaderAnchor object.
 *
 * @param pageIndex   0-based page index (HighlightTarget.page - 1)
 * @param text        Raw anchor text (HighlightTarget.text) — used for quote search
 * @param viewportScale  Current effectiveZoom from react-pdf
 * @param pdfTextItemIndexes  Optional Phase 1B item indexes (HighlightTarget.pdfTextItemIndexes)
 * @param groundingState      Optional Phase 1B grounding state (HighlightTarget.groundingState)
 */
export function resolveTargetGeometry(
  pageIndex: number,
  text: string,
  viewportScale: number,
  pdfTextItemIndexes?: number[],
  groundingState?: string,
): GeometryResolutionDiagnostics {
  const anchor: ReaderAnchor = {
    pageIndex,
    startChar: 0,
    endChar:   0,
    // 1400, not a short snippet cap — matches SurgeonAnnotationPlan's exactQuote max
    // length so a sentence-expanded or multi-sentence quote isn't clipped here before
    // it even reaches Strategy 3's search.
    quote:     text.slice(0, 1400).replace(/\s+/g, " ").trim(),
    ...(pdfTextItemIndexes && pdfTextItemIndexes.length > 0 && { pdfTextItemIndexes }),
    ...(groundingState && { groundingState: groundingState as ReaderAnchor["groundingState"] }),
  };
  return resolveAnchorGeometryDiagnostic(anchor, viewportScale);
}

/**
 * Resolve the bounding box of ONE WORD within a sentence, using the SAME
 * token index (TextLayerRegistry) every other geometry resolver in this file
 * reads from — not an independent DOM text-layer search. This is what lets
 * the Reader's eye-follow/read-aloud word marker share exactly the same
 * grounded PDF geometry as Surgeon highlighting, instead of maintaining its
 * own separate text-matching implementation.
 *
 * Locates the sentence via the same bounded-prefix substring search
 * resolveAnchorGeometryTracked's Strategy 3 uses, then finds the target
 * word's own character range WITHIN that matched sentence text (mirroring
 * how the sentence's own words are split, so a PDF.js text "item" spanning
 * more or fewer characters than one English word never misaligns the
 * result), and returns the bounding box of every token overlapping that
 * word's character range, merged into one rect.
 *
 * @param pageIndex     0-based page index
 * @param sentenceText  the verbatim sentence currently being spoken
 * @param wordIndex     0-based index of the target word within sentenceText
 *                      (split on whitespace) — clamped to a valid range
 * @param viewportScale current effectiveZoom from react-pdf
 * @returns a BoundingBox in the SAME "CSS pixels relative to the page
 *          container top-left" space every other rect from this module
 *          uses, or null if the page isn't indexed yet or the sentence
 *          can't be located.
 */
export function resolveWordGeometry(
  pageIndex: number,
  sentenceText: string,
  wordIndex: number,
  viewportScale: number,
): BoundingBox | null {
  const textIndex = TextLayerRegistry.get(pageIndex);
  if (!textIndex) return null;

  const sentence = sentenceText.trim();
  if (sentence.length < 4) return null;

  const bodyNorm = textIndex.fullText.toLowerCase();
  const sentenceNorm = sentence.toLowerCase();
  const SEARCH_PREFIX_LEN = 60;
  let pos = bodyNorm.indexOf(sentenceNorm.slice(0, SEARCH_PREFIX_LEN));
  if (pos === -1 && sentenceNorm.length > 20) pos = bodyNorm.indexOf(sentenceNorm.slice(0, 20));
  if (pos === -1) return null;

  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const idx = Math.min(Math.max(wordIndex, 0), words.length - 1);

  // Verify every word from the sentence start up through the target index
  // actually sits where the search found it — the words a plain
  // length-arithmetic offset would previously compute WITHOUT ever
  // confirming they match what's really at that position in fullText. If
  // the page's fullText has diverged from the sentence at any point before
  // the target word (e.g. leftover column-ordering skew, an extraction gap
  // this page's PDF stream introduced), the mismatch is caught here instead
  // of quietly pointing the eye-follow marker at the wrong word.
  const expectedWords = words.slice(0, idx + 1).map(w => w.toLowerCase());
  const verified = matchWordsFrom(expectedWords, bodyNorm, pos, sentence.length + MATCH_WINDOW_SLACK);
  if (verified.length <= idx) return null;
  const { start: wordStart, end: wordEnd } = verified[idx];

  const overlapping = textIndex.tokens.filter(t => t.endChar > wordStart && t.startChar < wordEnd);
  if (overlapping.length === 0) return null;

  let top = Infinity, left = Infinity, bottom = -Infinity, right = -Infinity;
  for (const t of overlapping) {
    top = Math.min(top, t.bbox.y);
    bottom = Math.max(bottom, t.bbox.y + t.bbox.h);
    left = Math.min(left, t.bbox.x);
    right = Math.max(right, t.bbox.x + t.bbox.w);
  }
  if (!isFinite(top) || !isFinite(left) || right <= left) return null;

  return {
    x: left * viewportScale,
    y: top * viewportScale,
    w: Math.max(3, (right - left) * viewportScale),
    h: Math.max(10, (bottom - top) * viewportScale),
  };
}

/**
 * Merge horizontally adjacent tokens on the same visual line into single rects.
 * Rects from different lines (or different columns) are kept separate.
 *
 * "Same line" heuristic: vertical centres within 60 % of the taller glyph's height.
 * "Touching"  heuristic: horizontal gap ≤ one em (approximated by glyph height).
 */
function mergeLineRects(rects: BoundingBox[]): BoundingBox[] {
  if (rects.length <= 1) return rects;

  // Sort top → bottom, then left → right within a line.
  const sorted = [...rects].sort((a, b) =>
    a.y !== b.y ? a.y - b.y : a.x - b.x,
  );

  const merged: BoundingBox[] = [];

  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...r });
      continue;
    }

    const lineH    = Math.max(last.h, r.h);
    const centerA  = last.y + last.h / 2;
    const centerB  = r.y   + r.h   / 2;
    const sameLine = Math.abs(centerA - centerB) < lineH * 0.6;
    const gap      = r.x - (last.x + last.w);
    const touching = gap <= lineH; // one em gap tolerance

    if (sameLine && touching) {
      // Extend the running rect to cover this token.
      const newY2 = Math.max(last.y + last.h, r.y + r.h);
      last.y  = Math.min(last.y, r.y);
      last.w  = (r.x + r.w) - last.x;
      last.h  = newY2 - last.y;
    } else {
      merged.push({ ...r });
    }
  }

  return merged;
}
