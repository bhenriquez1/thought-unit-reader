// lib/page-intelligence/textLayerIndex.ts
// PDF Text Layer Index
// Builds a searchable index of PDF.js text-layer tokens so that
// a SourceRef (char offsets) can be mapped back to on-canvas coordinates
// for scroll-to-highlight and TTS cursor positioning.

import type { SourceRef } from './types';
import { orderItemsForReading, buildStructuredPageTextFull, locateItemOffsetsInText } from '../pdf/structuredPageText';

// ============================================================================
// Types
// ============================================================================

/** A single token from the PDF.js text layer */
export interface TextToken {
  str: string;
  /** Char offset of this token's start in the reconstructed page string */
  startChar: number;
  endChar: number;
  /** PDF canvas viewport coordinates */
  bbox: { x: number; y: number; w: number; h: number };
  /** Index within the page's textContent.items array */
  itemIndex: number;
}

/** Index for a single page */
export interface PageTextIndex {
  pageIndex: number;
  /** Reconstructed full text string (matches what paragraphIntelligence sees) */
  fullText: string;
  tokens: TextToken[];
}

/** Highlight region computed from a SourceRef */
export interface HighlightRegion {
  pageIndex: number;
  rects: { x: number; y: number; w: number; h: number }[];
  /** The matched quote text */
  text: string;
}

// ============================================================================
// Builder — given a PDF.js textContent, build the index
// ============================================================================

interface PDFTextItem {
  str: string;
  transform?: number[];
  width?: number;
  height?: number;
}

/**
 * Build a PageTextIndex from a PDF.js textContent object.
 * Call this once per page when the text layer loads.
 *
 * Stabilization item 4C-2: `fullText` is now buildStructuredPageTextFull's
 * own output — literally the same function call Highlight/Current Page
 * speech/CanonicalPageMap already build their text from — not a second,
 * independently-assembled flat single-space join. Before this, the two
 * were only guaranteed to agree on item ORDERING (via orderItemsForReading,
 * see below), not on the actual text bytes: buildPageTextIndex's own join
 * never inserted paragraph breaks or merged hyphenated line-wraps, and
 * never separated two-column text with "\n\n" the way buildColumnFull
 * does. A quote or word position resolved correctly against pageText could
 * therefore still fail to resolve — or resolve to the wrong place — when
 * searched against this index's DIFFERENT fullText. Calling
 * buildStructuredPageTextFull directly makes byte-identity structural
 * (guaranteed by construction), not just similar by two algorithms
 * happening to agree.
 *
 * Per-item char offsets (needed to attach this specific item's geometry to
 * its own char range, not just know the whole page's text) are recovered
 * from that SAME text via locateItemOffsetsInText's sequential forward
 * search — see that function's header comment for why this is safer than
 * retrofitting exact offset math through buildColumnFull's line/paragraph/
 * hyphenation transforms.
 *
 * @param pageIndex 0-based page index
 * @param textContent - the PDF.js textContent returned by page.getTextContent()
 * @param viewport - the PDF.js viewport (used for coordinate transforms).
 *   `transform` is PDF.js's own real PageViewport.transform 6-tuple
 *   [a,b,c,d,e,f] (an affine matrix mapping PDF user-space points to
 *   viewport/canvas-space points) — pass it whenever a real PDF.js page
 *   object is available; it already folds in page rotation, crop-box/
 *   media-box origin offset, and the y-axis flip, none of which the
 *   `height`/`scale`-only fallback below can reconstruct on its own.
 *   `height`/`scale` remain for callers (and tests) that only have a
 *   plain, unrotated, zero-offset page and want the simple formula.
 */
export function buildPageTextIndex(
  pageIndex: number,
  textContent: { items: PDFTextItem[] },
  viewport?: { height: number; scale: number; transform?: number[] },
): PageTextIndex {
  const tagged = textContent.items.map((item, i) => ({ ...item, itemIndex: i }));
  const { items: ordered } = orderItemsForReading(tagged);
  const { text: fullText } = buildStructuredPageTextFull(tagged);
  const itemOffsets = locateItemOffsetsInText(fullText, ordered);
  const itemByIndex = new Map(ordered.map(item => [item.itemIndex, item]));

  const tokens: TextToken[] = [];

  for (const { itemIndex, start: startChar, end: endChar } of itemOffsets) {
    const item = itemByIndex.get(itemIndex);
    const str = item?.str ?? '';
    if (!item || !str) continue;

    // Compute bounding box from the item's own PDF-space origin/size
    // (transform[4]/[5] = tx/ty, plus width/height), mapped into
    // viewport/canvas space.
    let x = 0, y = 0, w = 0, h = 0;
    if (item.transform && item.transform.length >= 6) {
      const [, , , , tx, ty] = item.transform;
      const itemW = item.width ?? str.length * 7;
      const itemH = item.height ?? 12;

      if (viewport?.transform && viewport.transform.length >= 6) {
        // Real PDF.js PageViewport.transform — an affine matrix already
        // folding in page rotation, crop-box/media-box origin offset, and
        // the PDF-bottom-left -> canvas-top-left y-flip. Map all 4 corners
        // of the item's PDF-space box through it and take the axis-aligned
        // bounding box of the result: for 0/180deg rotation this reduces to
        // the same "translate + flip" the old formula did; for 90/270deg
        // it correctly swaps which axis width/height land on, which a
        // height-only formula can never do.
        const [a, b, c, d, e, f] = viewport.transform;
        const apply = (px: number, py: number): [number, number] => [a * px + c * py + e, b * px + d * py + f];
        const corners = [
          apply(tx, ty), apply(tx + itemW, ty),
          apply(tx, ty + itemH), apply(tx + itemW, ty + itemH),
        ];
        const xs = corners.map(p => p[0]);
        const ys = corners.map(p => p[1]);
        x = Math.min(...xs);
        y = Math.min(...ys);
        w = Math.max(...xs) - x;
        h = Math.max(...ys) - y;
      } else {
        // Fallback for callers with only a plain {height, scale} — correct
        // ONLY for an unrotated page with a zero-origin crop box; no real
        // production call site should hit this once pdfjs-handler.ts passes
        // the real viewport transform (see call sites).
        const scale = viewport?.scale ?? 1;
        const vH = viewport?.height ?? 800;
        x = tx * scale;
        y = vH - ty * scale;
        w = itemW * scale;
        h = itemH * scale;
      }
    }

    tokens.push({
      str,
      startChar,
      endChar,
      bbox: { x, y, w, h },
      // Original position in textContent.items — NOT position in reading
      // order — pdfTextItemIndexes elsewhere in the app (Strategy 1 in
      // resolveAnchorGeometry.ts, StructuredPageBridge.itemIndexes) refer
      // to the original array position, so this must too.
      itemIndex,
    });
  }

  return { pageIndex, fullText, tokens };
}

// ============================================================================
// Lookup — SourceRef → HighlightRegion
// ============================================================================

/**
 * Given a PageTextIndex and a SourceRef, find all text tokens that overlap
 * with the source anchor's char range and return their bounding boxes.
 *
 * Falls back to fuzzy quote matching if char offsets don't hit any tokens.
 */
export function resolveHighlight(
  index: PageTextIndex,
  ref: SourceRef,
): HighlightRegion | null {
  if (index.pageIndex !== ref.pageIndex) return null;

  const targetStart = ref.sentenceStartChar ?? ref.startChar;
  const targetEnd = ref.sentenceEndChar ?? ref.endChar;

  // Strategy 1: char offset overlap
  let matchedTokens = index.tokens.filter(
    (t) => t.endChar > targetStart && t.startChar < targetEnd,
  );

  // Strategy 2: if no overlap, fuzzy quote search
  if (matchedTokens.length === 0 && ref.quote) {
    const quoteNorm = ref.quote.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 50);
    const textNorm = index.fullText.toLowerCase();
    const pos = textNorm.indexOf(quoteNorm);
    if (pos !== -1) {
      const end = pos + quoteNorm.length;
      matchedTokens = index.tokens.filter(
        (t) => t.endChar > pos && t.startChar < end,
      );
    }
  }

  if (matchedTokens.length === 0) return null;

  return {
    pageIndex: ref.pageIndex,
    rects: matchedTokens.map((t) => t.bbox),
    text: matchedTokens.map((t) => t.str).join(' '),
  };
}

// ============================================================================
// SpeechCursor — maps TTS char progress to a scroll position
// ============================================================================

/**
 * Given the current TTS character index within a page's fullText,
 * return the canvas y-coordinate of the active word (for auto-scroll).
 */
export function getSpeechCursorY(
  index: PageTextIndex,
  charIndex: number,
): number | null {
  const token = index.tokens.find(
    (t) => t.startChar <= charIndex && t.endChar > charIndex,
  );
  return token ? token.bbox.y : null;
}

/**
 * Given TTS char index, return the bounding box of the current word
 * so the PDF viewer can draw a word-level speech cursor highlight.
 */
export function getSpeechCursorBbox(
  index: PageTextIndex,
  charIndex: number,
): { x: number; y: number; w: number; h: number } | null {
  const token = index.tokens.find(
    (t) => t.startChar <= charIndex && t.endChar > charIndex,
  );
  return token ? token.bbox : null;
}

// ============================================================================
// Multi-page registry
// ============================================================================

/** Cache of built indices keyed by pageIndex — no documentId component, same
 *  cross-document race exposure PageBridgeRegistry documents (see that
 *  file's header). Guarded the same way: an epoch counter bumped on every
 *  clear(), and set() drops a write stamped with a since-superseded epoch. */
const indexRegistry = new Map<number, PageTextIndex>();
let epoch = 0;

export const TextLayerRegistry = {
  /** forEpoch, when passed, must match the CURRENT epoch or this write is
   *  silently dropped — see PageBridgeRegistry.set()'s doc comment for the
   *  race this closes. Omitting it skips the check. */
  set(index: PageTextIndex, forEpoch?: number): void {
    if (forEpoch !== undefined && forEpoch !== epoch) return;
    indexRegistry.set(index.pageIndex, index);
  },

  get(pageIndex: number): PageTextIndex | undefined {
    return indexRegistry.get(pageIndex);
  },

  /** Clears all entries and starts a new epoch — see set()'s doc comment.
   *  Returns the new epoch for the caller to stamp its own set() calls with. */
  clear(): number {
    indexRegistry.clear();
    epoch += 1;
    return epoch;
  },

  currentEpoch(): number {
    return epoch;
  },

  /** Resolve a SourceRef across the registry */
  resolve(ref: SourceRef): HighlightRegion | null {
    const index = indexRegistry.get(ref.pageIndex);
    if (!index) return null;
    return resolveHighlight(index, ref);
  },
};
