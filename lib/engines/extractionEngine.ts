// lib/engines/extractionEngine.ts
// Page-aware extraction pipeline with IndexedDB persistence
// Extracts text from current page or chapter, stores results, triggers downstream engines

import type {
  DocID,
  PageIndex,
  ChapterID,
  PageExtractionResult,
  ChapterExtractionResult,
  EvidenceRef,
  ExtractionResult,
  EXTRACTION_STORE_KEYS,
} from './types';
import { putPageCache, getPageCache, putDocCache, getDocCache } from '../storage/indexedDB';

// ============================================================================
// Extraction Engine State (in-memory cache for current session)
// ============================================================================

interface ExtractionCache {
  pages: Map<string, PageExtractionResult>;
  chapters: Map<string, ChapterExtractionResult>;
}

const cache: ExtractionCache = {
  pages: new Map(),
  chapters: new Map(),
};

// ============================================================================
// Page Text Retrieval - Multiple fallback sources
// ============================================================================

export interface PageTextSource {
  // Primary: parsed text from PDF.js
  parsedTextMap?: Map<number, string>;
  // Secondary: thought units from parser
  thoughtUnits?: Array<{ text: string }>;
  // Tertiary: OCR fallback (async)
  getOCRText?: (pageIndex: PageIndex) => Promise<string | null>;
}

/**
 * Get text for a specific page with fallback chain:
 * 1. Parsed text map (if available)
 * 2. Thought units
 * 3. OCR (if configured)
 */
export async function getCurrentPageText(
  pageIndex: PageIndex,
  sources: PageTextSource
): Promise<string | null> {
  // Source 1: Parsed text map
  if (sources.parsedTextMap?.has(pageIndex)) {
    const text = sources.parsedTextMap.get(pageIndex);
    if (text && text.trim().length > 20) {
      return text;
    }
  }

  // Source 2: Thought units (fallback for older documents)
  if (sources.thoughtUnits && sources.thoughtUnits.length > pageIndex) {
    const unit = sources.thoughtUnits[pageIndex];
    if (unit?.text && unit.text.trim().length > 20) {
      return unit.text;
    }
  }

  // Source 3: OCR fallback (for scanned PDFs)
  if (sources.getOCRText) {
    try {
      const ocrText = await sources.getOCRText(pageIndex);
      if (ocrText && ocrText.trim().length > 20) {
        return ocrText;
      }
    } catch (error) {
      console.warn(`[ExtractionEngine] OCR fallback failed for page ${pageIndex}:`, error);
    }
  }

  return null;
}

// ============================================================================
// Extract Page
// ============================================================================

export interface ExtractPageOptions {
  docId: DocID;
  pageIndex: PageIndex;
  text: string;
  forceRefresh?: boolean;
}

export async function extractPage(options: ExtractPageOptions): Promise<PageExtractionResult> {
  const { docId, pageIndex, text, forceRefresh = false } = options;
  const cacheKey = `${docId}:${pageIndex}`;

  // Check in-memory cache
  if (!forceRefresh && cache.pages.has(cacheKey)) {
    return cache.pages.get(cacheKey)!;
  }

  // Check IndexedDB
  if (!forceRefresh) {
    const stored = await getPageCache<PageExtractionResult>(docId, pageIndex);
    if (stored) {
      cache.pages.set(cacheKey, stored);
      return stored;
    }
  }

  // Perform extraction
  const result: PageExtractionResult = {
    docId,
    pageIndex,
    extractedAt: Date.now(),
    mode: "PAGE",
    text: text.trim(),
    evidence: buildEvidenceRefs(docId, pageIndex, text),
  };

  // Store in IndexedDB
  await putPageCache(docId, pageIndex, result);

  // Update in-memory cache
  cache.pages.set(cacheKey, result);

  return result;
}

// ============================================================================
// Extract Chapter
// ============================================================================

export interface ChapterRange {
  chapterId: ChapterID;
  startPage: PageIndex;
  endPage: PageIndex;
}

export interface ExtractChapterOptions {
  docId: DocID;
  chapterRange: ChapterRange;
  pageTextSource: PageTextSource;
  onProgress?: (current: number, total: number) => void;
  forceRefresh?: boolean;
}

export async function extractChapter(options: ExtractChapterOptions): Promise<ChapterExtractionResult> {
  const { docId, chapterRange, pageTextSource, onProgress, forceRefresh = false } = options;
  const { chapterId, startPage, endPage } = chapterRange;
  const cacheKey = `${docId}:${chapterId}`;

  // Check in-memory cache
  if (!forceRefresh && cache.chapters.has(cacheKey)) {
    return cache.chapters.get(cacheKey)!;
  }

  // Check IndexedDB
  if (!forceRefresh) {
    const stored = await getDocCache<ChapterExtractionResult>(`chapter:${cacheKey}`);
    if (stored) {
      cache.chapters.set(cacheKey, stored);
      return stored;
    }
  }

  // Extract all pages in chapter
  const pageTexts: string[] = [];
  const allEvidence: EvidenceRef[] = [];
  const totalPages = endPage - startPage + 1;

  for (let page = startPage; page <= endPage; page++) {
    onProgress?.(page - startPage + 1, totalPages);

    const pageText = await getCurrentPageText(page, pageTextSource);
    if (pageText) {
      pageTexts.push(pageText);
      allEvidence.push(...buildEvidenceRefs(docId, page, pageText));
    }
  }

  const combinedText = pageTexts.join('\n\n');

  const result: ChapterExtractionResult = {
    docId,
    chapterId,
    extractedAt: Date.now(),
    mode: "CHAPTER",
    text: combinedText,
    evidence: allEvidence,
  };

  // Store in IndexedDB
  await putDocCache(`chapter:${cacheKey}`, result);

  // Update in-memory cache
  cache.chapters.set(cacheKey, result);

  return result;
}

// ============================================================================
// Evidence Building
// ============================================================================

function buildEvidenceRefs(docId: DocID, pageIndex: PageIndex, text: string): EvidenceRef[] {
  const evidence: EvidenceRef[] = [];

  // Split into sentences for evidence snippets
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);

  // Take up to 10 key sentences as evidence
  const keySnippets = selectKeySnippets(sentences, 10);

  for (const snippet of keySnippets) {
    evidence.push({
      docId,
      pageIndex,
      snippet: snippet.trim(),
    });
  }

  return evidence;
}

/**
 * Select the most important snippets from a list of sentences
 * Prioritizes: definitions, rules, processes, conditions
 */
function selectKeySnippets(sentences: string[], maxCount: number): string[] {
  const scored = sentences.map(sentence => ({
    sentence,
    score: scoreSnippetImportance(sentence),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxCount).map(s => s.sentence);
}

function scoreSnippetImportance(sentence: string): number {
  let score = 0;
  const lower = sentence.toLowerCase();

  // Definition patterns
  if (/\b(is defined as|is a|refers to|means|consists of)\b/.test(lower)) score += 10;

  // Process/mechanism patterns
  if (/\b(causes|leads to|results in|produces|triggers)\b/.test(lower)) score += 8;

  // Clinical decision patterns
  if (/\b(if|when|should|must|always|never|except)\b/.test(lower)) score += 7;

  // Diagnostic patterns
  if (/\b(diagnos|present with|manifest|symptom|finding)\b/.test(lower)) score += 6;

  // Treatment patterns
  if (/\b(treat|therap|manage|prescribe|administer)\b/.test(lower)) score += 6;

  // Trap/exception patterns
  if (/\b(except|however|but|although|unlike|contraindicated)\b/.test(lower)) score += 9;

  // Numeric thresholds
  if (/\d+\s*(mg|ml|mm|%|days|hours|weeks|years)/.test(lower)) score += 5;

  // Length bonus (prefer medium-length sentences)
  const wordCount = sentence.split(/\s+/).length;
  if (wordCount >= 10 && wordCount <= 40) score += 2;

  return score;
}

// ============================================================================
// Cache Management
// ============================================================================

export function clearExtractionCache(docId?: DocID): void {
  if (docId) {
    // Clear specific document
    for (const [key] of cache.pages) {
      if (key.startsWith(docId + ':')) {
        cache.pages.delete(key);
      }
    }
    for (const [key] of cache.chapters) {
      if (key.startsWith(docId + ':')) {
        cache.chapters.delete(key);
      }
    }
  } else {
    // Clear all
    cache.pages.clear();
    cache.chapters.clear();
  }
}

export function getExtractionFromCache(
  docId: DocID,
  pageIndex?: PageIndex,
  chapterId?: ChapterID
): ExtractionResult | null {
  if (pageIndex !== undefined) {
    return cache.pages.get(`${docId}:${pageIndex}`) || null;
  }
  if (chapterId !== undefined) {
    return cache.chapters.get(`${docId}:${chapterId}`) || null;
  }
  return null;
}

// ============================================================================
// Export index
// ============================================================================

export { cache as extractionCache };
