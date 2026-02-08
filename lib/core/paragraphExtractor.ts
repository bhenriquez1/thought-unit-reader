/**
 * ⚡ Paragraph Extractor
 *
 * Handles paragraph-aware extraction:
 * - Scroll position → paragraph mapping
 * - 4-paragraph window extraction
 * - Character range tracking for highlighting
 */

import type { ParagraphMeta } from './types';
import { CORE_LIMITS } from './schema';

// ============================================================================
// Paragraph Detection
// ============================================================================

/**
 * Extract paragraphs from page text with character ranges
 */
export function extractParagraphs(text: string): Array<{ text: string; charStart: number; charEnd: number }> {
  const paragraphs: Array<{ text: string; charStart: number; charEnd: number }> = [];

  // Split by double newlines or significant whitespace
  const regex = /\n\s*\n/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const paragraphText = text.slice(lastIndex, match.index).trim();

    if (paragraphText.length > 0) {
      paragraphs.push({
        text: paragraphText,
        charStart: lastIndex,
        charEnd: match.index,
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Don't forget the last paragraph
  const lastParagraph = text.slice(lastIndex).trim();
  if (lastParagraph.length > 0) {
    paragraphs.push({
      text: lastParagraph,
      charStart: lastIndex,
      charEnd: text.length,
    });
  }

  return paragraphs;
}

// ============================================================================
// Clause Splitting (sub-paragraph precision)
// ============================================================================

export interface Clause {
  text: string;
  paragraphIndex: number;
  clauseIndex: number;
  /** Higher = more likely testable (definitions, rules, cause-effect) */
  density: number;
}

/**
 * Split paragraphs into clauses for sub-paragraph extraction.
 * Clauses are split on sentence boundaries while preserving meaning.
 */
export function splitIntoClauses(
  paragraphs: Array<{ text: string; charStart: number; charEnd: number }>
): Clause[] {
  const clauses: Clause[] = [];

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const p = paragraphs[pIdx];
    // Split on sentence-ending punctuation followed by space/end
    const sentences = p.text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 10);

    for (let cIdx = 0; cIdx < sentences.length; cIdx++) {
      clauses.push({
        text: sentences[cIdx],
        paragraphIndex: pIdx,
        clauseIndex: cIdx,
        density: scoreClauseDensity(sentences[cIdx]),
      });
    }
  }

  return clauses;
}

/**
 * Score a clause for testable content density.
 * Higher = more likely to be a core concept.
 */
function scoreClauseDensity(text: string): number {
  let score = 0;
  // Definitions
  if (/\bis\s+(defined\s+as|a|an|the)\b|\bmeans\b|\brefers\s+to\b/i.test(text)) score += 3;
  // Rules / conditionals
  if (/\bif\b.*\bthen\b|\bwhen\b.*\b(must|should|will)\b/i.test(text)) score += 3;
  // Cause-effect
  if (/\bbecause\b|\btherefore\b|\bthus\b|\bconsequently\b/i.test(text)) score += 2;
  // Contrast / exceptions
  if (/\bhowever\b|\bbut\b|\bexcept\b|\bunless\b/i.test(text)) score += 2;
  // Enumerations
  if (/\bfirst\b|\bsecond\b|\bsteps?\b|\btypes?\s+(?:of|include)\b/i.test(text)) score += 1;
  // Formulas / calculations
  if (/[=+\-*/]|\bformula\b|\bcalculate\b|\bequation\b/i.test(text)) score += 2;
  // Contains numbers (specificity marker)
  if (/\d/.test(text)) score += 1;
  // Headings / bold-like (ALL CAPS words)
  if (/\b[A-Z]{3,}\b/.test(text)) score += 1;
  return score;
}

/**
 * Select the top N candidate clauses by density.
 */
export function selectTopClauses(clauses: Clause[], max: number = 4): Clause[] {
  return [...clauses]
    .sort((a, b) => b.density - a.density)
    .slice(0, max);
}

/**
 * Build paragraph metadata with pixel positions
 * Used for scroll → paragraph mapping
 */
export function buildParagraphMeta(
  paragraphs: Array<{ text: string; charStart: number; charEnd: number }>,
  containerHeight: number,
  lineHeight: number = 24
): ParagraphMeta[] {
  let currentTop = 0;

  return paragraphs.map((p, index) => {
    // Estimate height based on text length and line wrapping
    const estimatedLines = Math.ceil(p.text.length / 80); // ~80 chars per line
    const paragraphHeight = Math.max(estimatedLines * lineHeight, lineHeight);

    const meta: ParagraphMeta = {
      index,
      topPx: currentTop,
      bottomPx: currentTop + paragraphHeight,
      text: p.text,
      charStart: p.charStart,
      charEnd: p.charEnd,
    };

    currentTop += paragraphHeight + lineHeight; // Add spacing between paragraphs

    return meta;
  });
}

// ============================================================================
// Scroll → Paragraph Mapping
// ============================================================================

/**
 * Find the paragraph at a given scroll position
 */
export function findParagraphAtScroll(
  scrollY: number,
  viewportHeight: number,
  paragraphs: ParagraphMeta[]
): number {
  if (paragraphs.length === 0) return 0;

  // Find the paragraph that's most visible in the viewport
  const viewportCenter = scrollY + viewportHeight / 2;

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (viewportCenter >= p.topPx && viewportCenter < p.bottomPx) {
      return i;
    }
    if (viewportCenter < p.topPx) {
      return Math.max(0, i - 1);
    }
  }

  return paragraphs.length - 1;
}

/**
 * Get the window of paragraphs around a center index
 */
export function getParagraphWindow(
  centerIndex: number,
  totalParagraphs: number,
  windowSize: number = CORE_LIMITS.DEFAULT_PARAGRAPH_WINDOW
): [number, number] {
  const halfWindow = Math.floor(windowSize / 2);

  let start = Math.max(0, centerIndex - halfWindow);
  let end = Math.min(totalParagraphs, start + windowSize);

  // Adjust start if we hit the end boundary
  if (end === totalParagraphs && end - start < windowSize) {
    start = Math.max(0, end - windowSize);
  }

  return [start, end];
}

// ============================================================================
// Window Extraction
// ============================================================================

/**
 * Extract paragraphs for the current viewport
 */
export function extractViewportParagraphs(
  allParagraphs: ParagraphMeta[],
  scrollY: number,
  viewportHeight: number,
  windowSize: number = CORE_LIMITS.DEFAULT_PARAGRAPH_WINDOW
): {
  paragraphs: ParagraphMeta[];
  range: [number, number];
  centerIndex: number;
} {
  if (allParagraphs.length === 0) {
    return {
      paragraphs: [],
      range: [0, 0],
      centerIndex: 0,
    };
  }

  const centerIndex = findParagraphAtScroll(scrollY, viewportHeight, allParagraphs);
  const [start, end] = getParagraphWindow(centerIndex, allParagraphs.length, windowSize);

  return {
    paragraphs: allParagraphs.slice(start, end),
    range: [start, end],
    centerIndex,
  };
}

/**
 * Get combined text from a paragraph window
 */
export function getCombinedText(paragraphs: ParagraphMeta[]): string {
  return paragraphs.map(p => p.text).join('\n\n');
}

// ============================================================================
// Highlighting Support
// ============================================================================

/**
 * Find the paragraph containing a character position
 */
export function findParagraphForChar(
  charPos: number,
  paragraphs: ParagraphMeta[]
): ParagraphMeta | null {
  return paragraphs.find(p => charPos >= p.charStart && charPos < p.charEnd) || null;
}

/**
 * Convert global char range to paragraph-local range
 */
export function toLocalCharRange(
  globalRange: [number, number],
  paragraph: ParagraphMeta
): [number, number] {
  return [
    Math.max(0, globalRange[0] - paragraph.charStart),
    Math.min(paragraph.text.length, globalRange[1] - paragraph.charStart),
  ];
}

// ============================================================================
// Debounce Helper for Scroll
// ============================================================================

/**
 * Create a debounced scroll handler
 */
export function createScrollDebouncer(
  callback: (scrollY: number) => void,
  delay: number = 150
): (scrollY: number) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (scrollY: number) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      callback(scrollY);
      timeoutId = null;
    }, delay);
  };
}

// ============================================================================
// Cache Key Generation
// ============================================================================

/**
 * Generate a cache key for a paragraph window
 */
export function generateWindowCacheKey(
  documentId: string,
  pageNumber: number,
  paragraphRange: [number, number]
): string {
  return `${documentId}:p${pageNumber}:${paragraphRange[0]}-${paragraphRange[1]}`;
}
