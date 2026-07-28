// lib/pdf/resolveAnchorGeometry.ts
// Phase 2: Anchor-Driven Overlay
//
// Maps a ReaderAnchor to viewport-space BoundingBoxes without touching the DOM.
// The TextLayerRegistry stores token bboxes in PDF-point coordinates at scale=1
// (y-axis flipped to top-left origin). Multiplying by viewportScale gives
// canvas/CSS pixel coordinates ready for overlay positioning.
//
// Resolution priority:
//   1. pdfTextItemIndexes present  → look up stored tokens by itemIndex
//   2. startChar / endChar present → token char-offset overlap
//   3. normalizedSourceText / quote → substring search in fullText
//   4. groundingState === "synthetic" → return [] (no PDF geometry available)

import type { ReaderAnchor, BoundingBox } from "../canonical/types";
import { TextLayerRegistry } from "../page-intelligence/textLayerIndex";
import type { TextToken } from "../page-intelligence/textLayerIndex";

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
  // Synthetic anchors have no PDF geometry — overlay is disabled.
  if (anchor.groundingState === "synthetic") return [];

  const textIndex = TextLayerRegistry.get(anchor.pageIndex);
  if (!textIndex) return [];

  let tokens: TextToken[] = [];

  // ── Strategy 1: exact itemIndex lookup ────────────────────────────────────
  // Best quality: uses the exact PDF.js item set captured at extraction time.
  // Handles ligatures, rotated pages, and unusual transforms transparently
  // because we never re-derive the geometry from text content.
  if (anchor.pdfTextItemIndexes && anchor.pdfTextItemIndexes.length > 0) {
    const indexSet = new Set(anchor.pdfTextItemIndexes);
    tokens = textIndex.tokens.filter(t => indexSet.has(t.itemIndex));
  }

  // ── Strategy 2: char-offset overlap ──────────────────────────────────────
  // Works for anchors rebuilt from older documents before Phase 1B grounding.
  if (tokens.length === 0) {
    const start = anchor.startChar;
    const end   = anchor.endChar;
    if (end > start) {
      tokens = textIndex.tokens.filter(
        t => t.endChar > start && t.startChar < end,
      );
    }
  }

  // ── Strategy 3: quote substring search ───────────────────────────────────
  // Last-resort fallback: search the reconstructed fullText for the anchor quote.
  // Uses the first occurrence (repeated text returns the first match).
  if (tokens.length === 0) {
    const quote = (anchor.normalizedSourceText ?? anchor.quote ?? "").trim();
    if (quote.length >= 10) {
      const queryNorm = quote.toLowerCase().slice(0, 60);
      const bodyNorm  = textIndex.fullText.toLowerCase();
      const pos = bodyNorm.indexOf(queryNorm);
      if (pos !== -1) {
        const end = pos + queryNorm.length;
        tokens = textIndex.tokens.filter(
          t => t.endChar > pos && t.startChar < end,
        );
      }
    }
  }

  if (tokens.length === 0) return [];

  // ── Scale and merge ───────────────────────────────────────────────────────
  const scaled: BoundingBox[] = tokens.map(t => ({
    x: t.bbox.x * viewportScale,
    y: t.bbox.y * viewportScale,
    w: t.bbox.w * viewportScale,
    h: t.bbox.h * viewportScale,
  }));

  return mergeLineRects(scaled);
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
