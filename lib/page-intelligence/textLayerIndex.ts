// lib/page-intelligence/textLayerIndex.ts
// PDF Text Layer Index
// Builds a searchable index of PDF.js text-layer tokens so that
// a SourceRef (char offsets) can be mapped back to on-canvas coordinates
// for scroll-to-highlight and TTS cursor positioning.

import type { SourceRef } from './types';

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
 * @param pageIndex 0-based page index
 * @param textContent - the PDF.js textContent returned by page.getTextContent()
 * @param viewport - the PDF.js viewport (used for coordinate transforms)
 */
export function buildPageTextIndex(
  pageIndex: number,
  textContent: { items: PDFTextItem[] },
  viewport?: { height: number; scale: number },
): PageTextIndex {
  const tokens: TextToken[] = [];
  let cursor = 0;
  let fullText = '';

  for (let i = 0; i < textContent.items.length; i++) {
    const item = textContent.items[i];
    const str = item.str ?? '';
    if (!str) continue;

    const startChar = cursor;
    const endChar = cursor + str.length;

    // Compute bounding box from PDF.js transform matrix [a,b,c,d,e,f]
    // transform[4] = tx (x), transform[5] = ty (y)
    let x = 0, y = 0, w = 0, h = 0;
    if (item.transform && item.transform.length >= 6) {
      const [, , , , tx, ty] = item.transform;
      const scale = viewport?.scale ?? 1;
      const vH = viewport?.height ?? 800;
      // PDF coordinates: origin bottom-left; canvas: origin top-left
      x = tx * scale;
      y = vH - ty * scale;
      w = (item.width ?? str.length * 7) * scale;
      h = (item.height ?? 12) * scale;
    }

    tokens.push({
      str,
      startChar,
      endChar,
      bbox: { x, y, w, h },
      itemIndex: i,
    });

    fullText += str;
    cursor = endChar;

    // PDF.js items don't include whitespace between words; add a space
    // if next item exists and doesn't start with punctuation
    const next = textContent.items[i + 1];
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

/** Cache of built indices keyed by pageIndex */
const indexRegistry = new Map<number, PageTextIndex>();

export const TextLayerRegistry = {
  set(index: PageTextIndex): void {
    indexRegistry.set(index.pageIndex, index);
  },

  get(pageIndex: number): PageTextIndex | undefined {
    return indexRegistry.get(pageIndex);
  },

  clear(): void {
    indexRegistry.clear();
  },

  /** Resolve a SourceRef across the registry */
  resolve(ref: SourceRef): HighlightRegion | null {
    const index = indexRegistry.get(ref.pageIndex);
    if (!index) return null;
    return resolveHighlight(index, ref);
  },
};
