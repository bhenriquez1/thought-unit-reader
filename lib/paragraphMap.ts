// lib/paragraphMap.ts
// Stable paragraph block extraction for ANY uploaded document.
// Paragraphs are derived from raw page text (no DOM access needed).
// Each block gets a stable ID: `${docId}:${pageNumber}:${index}`
// suitable for use as anchorIds in insight items and for scroll sync.

export interface ParagraphBlock {
  /** Stable cross-render identifier */
  id: string;
  pageNumber: number;
  /** The paragraph text (trimmed, whitespace-normalised) */
  text: string;
  /** 0-based order within the page */
  index: number;
}

/**
 * Split page text into paragraph blocks with stable IDs.
 * Works for any source: native PDF text, OCR output, DOCX/TXT.
 *
 * Splitting strategy (in priority order):
 *  1. Double line-breaks  (\n\n or \r\n\r\n)
 *  2. Single line-break followed by an uppercase letter or digit
 *     (common in PDF text-extraction which strips paragraph spacing)
 *  3. Sentence clusters: group into ~40-word chunks when no structural
 *     breaks are found (fallback for single-line pages)
 *
 * Blocks shorter than `minLength` chars are merged into the next block or dropped.
 */
export function extractParagraphBlocks(
  text: string,
  pageNumber: number,
  docId: string,
  minLength = 30,
): ParagraphBlock[] {
  if (!text || !text.trim()) return [];

  const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Strategy 1: double line-breaks
  let rawParts = normalised.split(/\n{2,}/);

  // Strategy 2: if we still have only 1 part, try single \n before capital/digit
  if (rawParts.length === 1) {
    rawParts = normalised.split(/\n(?=[A-Z0-9])/);
  }

  // Strategy 3: sentence-cluster fallback — split on sentence boundaries
  if (rawParts.length === 1 && normalised.length > 300) {
    rawParts = normalised
      .split(/(?<=[.!?])\s+(?=[A-Z("])/)
      .reduce<string[]>((acc, sent) => {
        const last = acc[acc.length - 1] ?? '';
        if (!last || last.split(/\s+/).length >= 40) {
          acc.push(sent.trim());
        } else {
          acc[acc.length - 1] = last + ' ' + sent.trim();
        }
        return acc;
      }, []);
  }

  // Normalise, filter short blocks, and assign stable IDs
  const blocks: ParagraphBlock[] = [];
  let idx = 0;

  for (const part of rawParts) {
    const trimmed = part.replace(/\s+/g, ' ').trim();
    if (trimmed.length < minLength) continue;

    blocks.push({
      id: `${docId}:${pageNumber}:${idx}`,
      pageNumber,
      text: trimmed,
      index: idx,
    });
    idx++;
  }

  return blocks;
}

/**
 * Find the best-matching paragraph block for a given search text.
 * Returns the block whose text most closely overlaps with the search text.
 */
export function findBestMatchingBlock(
  searchText: string,
  blocks: ParagraphBlock[],
): ParagraphBlock | null {
  if (!blocks.length || !searchText.trim()) return null;

  const needle = searchText.replace(/\s+/g, ' ').trim().toLowerCase();
  const needleWords = new Set(needle.split(/\s+/).filter(w => w.length > 4));

  let bestBlock: ParagraphBlock | null = null;
  let bestScore = 0;

  for (const block of blocks) {
    const haystack = block.text.toLowerCase();

    // Direct substring match (fastest)
    if (haystack.includes(needle.slice(0, 40))) {
      return block;
    }

    // Word overlap score
    let score = 0;
    for (const word of needleWords) {
      if (haystack.includes(word)) score++;
    }

    if (score > bestScore) {
      bestScore = score;
      bestBlock = block;
    }
  }

  // Only return if we matched at least 30% of the needle words
  const threshold = Math.max(1, Math.floor(needleWords.size * 0.3));
  return bestScore >= threshold ? bestBlock : null;
}
