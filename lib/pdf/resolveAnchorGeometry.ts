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
): { rects: BoundingBox[]; source: GeometryResolutionSource } {
  if (anchor.groundingState === "synthetic") {
    return { rects: [], source: "none" };
  }

  const textIndex = TextLayerRegistry.get(anchor.pageIndex);
  if (!textIndex) return { rects: [], source: "none" };

  let tokens: TextToken[] = [];
  let source: GeometryResolutionSource = "none";

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
  // Search using a bounded prefix (robust against a stray mismatch far into a long
  // quote), but the highlighted range covers the FULL quote length, not just the
  // search prefix — otherwise a sentence-expanded or multi-sentence
  // SurgeonAnnotationPlan quote (can run several hundred characters) would only
  // ever get its first ~60 chars highlighted, clipping the rest of the sentence(s).
  if (tokens.length === 0) {
    const quote = (anchor.normalizedSourceText ?? anchor.quote ?? "").trim();
    if (quote.length >= 10) {
      const SEARCH_PREFIX_LEN = 60;
      const queryNorm = quote.toLowerCase().slice(0, SEARCH_PREFIX_LEN);
      const bodyNorm  = textIndex.fullText.toLowerCase();
      const pos = bodyNorm.indexOf(queryNorm);
      if (pos !== -1) {
        const end = pos + quote.length; // full quote length — not queryNorm.length
        tokens = textIndex.tokens.filter(
          t => t.endChar > pos && t.startChar < end,
        );
        if (tokens.length > 0) source = "quote";
      }
    }
  }

  if (tokens.length === 0) return { rects: [], source: "none" };

  const scaled: BoundingBox[] = tokens.map(t => ({
    x: t.bbox.x * viewportScale,
    y: t.bbox.y * viewportScale,
    w: t.bbox.w * viewportScale,
    h: t.bbox.h * viewportScale,
  }));

  return { rects: mergeLineRects(scaled), source };
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
): { rects: BoundingBox[]; source: GeometryResolutionSource } {
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
  return resolveAnchorGeometryTracked(anchor, viewportScale);
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
  let charOffset = 0;
  for (let i = 0; i < idx; i++) charOffset += words[i].length + 1; // +1 for the inter-word space
  const wordStart = pos + charOffset;
  const wordEnd = wordStart + words[idx].length;

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
