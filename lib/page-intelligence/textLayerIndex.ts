// lib/page-intelligence/textLayerIndex.ts
// PDF Text Layer Index
// Builds a searchable index of PDF.js text-layer tokens so that
// a SourceRef (char offsets) can be mapped back to on-canvas coordinates
// for scroll-to-highlight and TTS cursor positioning.

import type { SourceRef } from './types';
import { orderItemsForReading } from '../pdf/structuredPageText';

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
 * Items are visited in READING order (orderItemsForReading — the same
 * column-detection + top-to-bottom/left-to-right sort
 * lib/pdf/structuredPageText.ts uses), not raw textContent.items array
 * order. This matters: pageText (what quotes are built from and verified
 * against — see lib/pdf/structuredPageText.ts) is already reading-order-
 * correct via that same function. Before this, buildPageTextIndex walked
 * items in whatever order the source PDF's content stream happened to emit
 * them, which is not guaranteed to already be left-column-then-right-column
 * on a two-column page — so this index's fullText could disagree with
 * pageText's ordering, and a quote built from one and located in the other
 * could resolve to the wrong position or fail to resolve as a complete
 * match. Reusing the same ordering function keeps them in sync by
 * construction instead of by coincidence.
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

  const tokens: TextToken[] = [];
  let cursor = 0;
  let fullText = '';

  for (let i = 0; i < ordered.length; i++) {
    const item = ordered[i];
    const str = item.str ?? '';
    if (!str) continue;

    const startChar = cursor;
    const endChar = cursor + str.length;

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
      // Original position in textContent.items — NOT `i` (position in
      // reading order) — pdfTextItemIndexes elsewhere in the app (Strategy 1
      // in resolveAnchorGeometry.ts, StructuredPageBridge.itemIndexes) refer
      // to the original array position, so this must too.
      itemIndex: item.itemIndex,
    });

    fullText += str;
    cursor = endChar;

    // PDF.js items don't include whitespace between words; add a space
    // if the next item IN READING ORDER exists and doesn't start with punctuation
    const next = ordered[i + 1];
    if (next && next.str && !/^[,.);\]}'"]/.test(next.str)) {
      fullText += ' ';
      cursor += 1;
    }
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
