// lib/surgeonView2/anchoring.ts
// Stable anchoring system for linking concepts to PDF source

import type { SourceAnchor } from './types';

// ============================================================================
// Snippet Hash Generation
// ============================================================================

/**
 * Generate a stable hash from text snippet for re-finding
 * Uses first 100 chars normalized (lowercase, no extra whitespace)
 */
export function generateSnippetHash(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100);

  // Simple hash function (FNV-1a style)
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Create a source anchor from page text and selection
 */
export function createSourceAnchor(
  pageIndex: number,
  pageText: string,
  selectedText: string,
  paragraphIndex?: number
): SourceAnchor {
  // Find character positions
  const normalizedPage = pageText.toLowerCase();
  const normalizedSelection = selectedText.toLowerCase().substring(0, 50);
  const charStart = normalizedPage.indexOf(normalizedSelection);

  // Calculate paragraph index if not provided
  let paraIdx = paragraphIndex ?? 0;
  if (paragraphIndex === undefined && charStart >= 0) {
    const textBefore = pageText.substring(0, charStart);
    paraIdx = (textBefore.match(/\n\n|\r\n\r\n/g) || []).length;
  }

  return {
    pageIndex,
    paragraphIndex: paraIdx,
    snippetHash: generateSnippetHash(selectedText),
    charStart: charStart >= 0 ? charStart : undefined,
    charEnd: charStart >= 0 ? charStart + selectedText.length : undefined,
  };
}

/**
 * Find text in page using anchor
 * Returns the matched text range or null if not found
 */
export function findTextByAnchor(
  pageText: string,
  anchor: SourceAnchor
): { start: number; end: number; text: string } | null {
  // First try exact position if available
  if (anchor.charStart !== undefined && anchor.charEnd !== undefined) {
    const candidate = pageText.substring(anchor.charStart, anchor.charEnd);
    if (generateSnippetHash(candidate) === anchor.snippetHash) {
      return {
        start: anchor.charStart,
        end: anchor.charEnd,
        text: candidate,
      };
    }
  }

  // Fall back to paragraph-based search
  const paragraphs = pageText.split(/\n\n|\r\n\r\n/);
  if (anchor.paragraphIndex < paragraphs.length) {
    const para = paragraphs[anchor.paragraphIndex];
    if (generateSnippetHash(para) === anchor.snippetHash) {
      let offset = 0;
      for (let i = 0; i < anchor.paragraphIndex; i++) {
        offset += paragraphs[i].length + 2; // +2 for \n\n
      }
      return {
        start: offset,
        end: offset + para.length,
        text: para,
      };
    }
  }

  // Fuzzy search: find best matching paragraph by hash similarity
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    if (para.length > 20) {
      // Check if snippet hash matches first 100 chars
      const hash = generateSnippetHash(para);
      if (hash === anchor.snippetHash) {
        let offset = 0;
        for (let j = 0; j < i; j++) {
          offset += paragraphs[j].length + 2;
        }
        return {
          start: offset,
          end: offset + para.length,
          text: para,
        };
      }
    }
  }

  // Last resort: sentence-level search
  const sentences = pageText.split(/(?<=[.!?])\s+/);
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    if (generateSnippetHash(sentence) === anchor.snippetHash) {
      const start = pageText.indexOf(sentence);
      return {
        start,
        end: start + sentence.length,
        text: sentence,
      };
    }
  }

  return null;
}

/**
 * Extract paragraph at given index from page text
 */
export function extractParagraph(pageText: string, paragraphIndex: number): string {
  const paragraphs = pageText.split(/\n\n|\r\n\r\n/);
  return paragraphs[paragraphIndex] || '';
}

/**
 * Get all paragraphs with their indices
 */
export function getParagraphsWithIndices(pageText: string): Array<{ index: number; text: string; charStart: number }> {
  const paragraphs = pageText.split(/\n\n|\r\n\r\n/);
  const result: Array<{ index: number; text: string; charStart: number }> = [];

  let offset = 0;
  paragraphs.forEach((para, idx) => {
    if (para.trim().length > 0) {
      result.push({
        index: idx,
        text: para,
        charStart: offset,
      });
    }
    offset += para.length + 2; // +2 for delimiter
  });

  return result;
}

/**
 * Calculate scroll position for anchor in PDF viewer
 */
export function calculateScrollPosition(
  anchor: SourceAnchor,
  pageHeight: number,
  totalParagraphs: number
): number {
  // Estimate position based on paragraph index
  const paragraphRatio = anchor.paragraphIndex / Math.max(1, totalParagraphs);
  return paragraphRatio * pageHeight;
}
