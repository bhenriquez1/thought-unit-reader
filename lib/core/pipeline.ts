/**
 * ⚡ Core Extraction Pipeline - Two-Tier System
 *
 * Tier A (Always works): Page-only extraction using PDF.js getTextContent()
 * Tier B (Optional): Full-book indexing when user clicks "Index Book"
 *
 * Priority: selection → viewport text → 4-paragraph fallback
 */

import type { CoreItem, CoreResponse, CoreExtractionRequest, ParagraphMeta } from './types';
import {
  validateCoreResponse,
  safeParseCoreResponse,
  truncateToLimits,
  CORE_LIMITS,
} from './schema';
import { isBoilerplate } from './boilerplateFilter';

// ============================================================================
// Constants
// ============================================================================

export const PIPELINE_LIMITS = {
  /** Max input characters to model */
  MAX_INPUT_CHARS: 1200,
  /** Max output items */
  MAX_OUTPUT_ITEMS: 8,
  /** Max sentences per item (1 for speed) */
  MAX_SENTENCES_PER_ITEM: 1,
  /** Micro-chunk size (sentences) */
  MICRO_CHUNK_SENTENCES: 3,
  /** Cache TTL in milliseconds (5 minutes) */
  CACHE_TTL_MS: 5 * 60 * 1000,
} as const;

// ============================================================================
// Types
// ============================================================================

export type ExtractionTier = 'page-only' | 'selection' | 'full-book';
export type ExtractionSource = 'selection' | 'viewport' | 'paragraph-window';

export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName?: string;
}

export interface ViewportWindow {
  topY: number;
  bottomY: number;
  pageHeight: number;
}

export interface MicroChunk {
  text: string;
  startY: number;
  endY: number;
  charStart: number;
  charEnd: number;
  sentences: string[];
}

export interface PipelineRequest {
  bookId: string;
  pageNumber: number;
  chapter?: string;
  /** Text items from PDF.js getTextContent() */
  textItems?: TextItem[];
  /** Raw page text (fallback) */
  pageText?: string;
  /** User selection (highest priority) */
  selection?: { text: string; startY?: number; endY?: number };
  /** Current viewport */
  viewport?: ViewportWindow;
  /** Scroll position */
  scrollY?: number;
}

export interface PipelineResult {
  success: boolean;
  data: CoreResponse | null;
  error: string | null;
  tier: ExtractionTier;
  source: ExtractionSource;
  cached: boolean;
  inputChars: number;
  extractionTimeMs: number;
}

// ============================================================================
// Cache
// ============================================================================

interface CacheEntry {
  data: CoreResponse;
  timestamp: number;
  inputHash: string;
}

const pipelineCache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 200;

function generateCacheKey(bookId: string, page: number, inputHash: string): string {
  return `${bookId}|${page}|${inputHash}`;
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function getCached(key: string): CoreResponse | null {
  const entry = pipelineCache.get(key);
  if (!entry) return null;

  // Check TTL
  if (Date.now() - entry.timestamp > PIPELINE_LIMITS.CACHE_TTL_MS) {
    pipelineCache.delete(key);
    return null;
  }

  return entry.data;
}

function setCache(key: string, data: CoreResponse, inputHash: string): void {
  // Evict oldest if full
  if (pipelineCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = pipelineCache.keys().next().value;
    if (oldestKey) pipelineCache.delete(oldestKey);
  }

  pipelineCache.set(key, {
    data,
    timestamp: Date.now(),
    inputHash,
  });
}

export function clearPipelineCache(): void {
  pipelineCache.clear();
}

// ============================================================================
// Text Processing
// ============================================================================

/**
 * Extract visible text from PDF.js text items within viewport
 */
export function extractVisibleText(
  textItems: TextItem[],
  viewport: ViewportWindow
): { text: string; items: TextItem[] } {
  const visibleItems = textItems.filter((item) => {
    const itemBottom = item.y;
    const itemTop = item.y - item.height;
    return itemBottom >= viewport.topY && itemTop <= viewport.bottomY;
  });

  const text = visibleItems.map((item) => item.str).join(' ').trim();
  return { text, items: visibleItems };
}

/**
 * Build micro-chunks from text items (~2-5 sentences each)
 */
export function buildMicroChunks(
  textItems: TextItem[],
  sentencesPerChunk: number = PIPELINE_LIMITS.MICRO_CHUNK_SENTENCES
): MicroChunk[] {
  if (textItems.length === 0) return [];

  // Combine into full text
  const fullText = textItems.map((item) => item.str).join(' ');

  // Split into sentences
  const sentences = fullText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0) return [];

  // Group into chunks
  const chunks: MicroChunk[] = [];
  let charOffset = 0;

  for (let i = 0; i < sentences.length; i += sentencesPerChunk) {
    const chunkSentences = sentences.slice(i, i + sentencesPerChunk);
    const chunkText = chunkSentences.join(' ');

    // Find Y position (approximate from text items)
    const ratio = i / sentences.length;
    const itemIndex = Math.floor(ratio * textItems.length);
    const startItem = textItems[Math.min(itemIndex, textItems.length - 1)];
    const endIndex = Math.min(itemIndex + Math.ceil(sentencesPerChunk * 2), textItems.length - 1);
    const endItem = textItems[endIndex];

    chunks.push({
      text: chunkText,
      startY: startItem?.y || 0,
      endY: endItem?.y || 0,
      charStart: charOffset,
      charEnd: charOffset + chunkText.length,
      sentences: chunkSentences,
    });

    charOffset += chunkText.length + 1;
  }

  return chunks;
}

/**
 * Find the micro-chunk nearest to scroll center
 */
export function findCenterChunk(
  chunks: MicroChunk[],
  scrollY: number,
  viewportHeight: number
): MicroChunk | null {
  if (chunks.length === 0) return null;

  const viewportCenter = scrollY + viewportHeight / 2;

  let bestChunk = chunks[0];
  let bestDistance = Infinity;

  for (const chunk of chunks) {
    const chunkCenter = (chunk.startY + chunk.endY) / 2;
    const distance = Math.abs(chunkCenter - viewportCenter);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestChunk = chunk;
    }
  }

  return bestChunk;
}

/**
 * Truncate text to max input chars
 */
export function truncateInput(text: string, maxChars: number = PIPELINE_LIMITS.MAX_INPUT_CHARS): string {
  if (text.length <= maxChars) return text;

  // Try to cut at sentence boundary
  const truncated = text.slice(0, maxChars);
  const lastSentenceEnd = truncated.lastIndexOf('. ');

  if (lastSentenceEnd > maxChars * 0.7) {
    return truncated.slice(0, lastSentenceEnd + 1);
  }

  return truncated + '...';
}

// ============================================================================
// Tier A: Page-Only Extraction
// ============================================================================

/**
 * Tier A extraction - works with just current page text
 * Priority: selection → viewport → paragraph window
 */
export async function tierAExtract(request: PipelineRequest): Promise<PipelineResult> {
  const startTime = performance.now();

  // Determine source and extract text
  let sourceText: string;
  let source: ExtractionSource;

  // Priority 1: Selection
  if (request.selection?.text && request.selection.text.trim().length > 20) {
    sourceText = request.selection.text;
    source = 'selection';
  }
  // Priority 2: Viewport text (from PDF.js items) - also filter boilerplate
  else if (request.textItems && request.viewport) {
    const { text } = extractVisibleText(request.textItems, request.viewport);
    if (text.length > 50 && !isBoilerplate(text)) {
      sourceText = text;
      source = 'viewport';
    } else {
      // Fallback to page text (paragraph windowing handles boilerplate below)
      sourceText = request.pageText || '';
      source = 'paragraph-window';
    }
  }
  // Priority 3: Page text with paragraph windowing (max 4 paragraphs)
  else if (request.pageText) {
    // Split into paragraphs and apply 4-paragraph window
    const rawParagraphs = request.pageText
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    // Filter out boilerplate paragraphs
    const contentParagraphs = rawParagraphs.filter(p => !isBoilerplate(p));

    if (contentParagraphs.length > 0) {
      // Use scroll position to pick the active window (max 4 paragraphs)
      const windowSize = Math.min(4, contentParagraphs.length);
      const scrollRatio = request.scrollY
        ? Math.min(1, Math.max(0, request.scrollY / (request.viewport?.pageHeight || 1000)))
        : 0;
      const centerIdx = Math.floor(scrollRatio * contentParagraphs.length);
      const halfWin = Math.floor(windowSize / 2);
      let start = Math.max(0, centerIdx - halfWin);
      let end = Math.min(contentParagraphs.length, start + windowSize);
      if (end === contentParagraphs.length && end - start < windowSize) {
        start = Math.max(0, end - windowSize);
      }
      sourceText = contentParagraphs.slice(start, end).join('\n\n');
    } else {
      sourceText = '';
    }
    source = 'paragraph-window';
  } else {
    return {
      success: false,
      data: null,
      error: 'No text available for extraction',
      tier: 'page-only',
      source: 'paragraph-window',
      cached: false,
      inputChars: 0,
      extractionTimeMs: performance.now() - startTime,
    };
  }

  // Truncate to limit
  const truncatedText = truncateInput(sourceText);
  const inputHash = hashString(truncatedText);

  // Check cache
  const cacheKey = generateCacheKey(request.bookId, request.pageNumber, inputHash);
  const cached = getCached(cacheKey);

  if (cached) {
    return {
      success: true,
      data: cached,
      error: null,
      tier: 'page-only',
      source,
      cached: true,
      inputChars: truncatedText.length,
      extractionTimeMs: performance.now() - startTime,
    };
  }

  // Mock extraction (replace with actual API call)
  try {
    const response = mockTierAExtract(request, truncatedText);

    // Cache result
    setCache(cacheKey, response, inputHash);

    return {
      success: true,
      data: response,
      error: null,
      tier: 'page-only',
      source,
      cached: false,
      inputChars: truncatedText.length,
      extractionTimeMs: performance.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Extraction failed',
      tier: 'page-only',
      source,
      cached: false,
      inputChars: truncatedText.length,
      extractionTimeMs: performance.now() - startTime,
    };
  }
}

/**
 * Mock Tier A extraction (fast, single-sentence items)
 */
function mockTierAExtract(request: PipelineRequest, text: string): CoreResponse {
  // Split into sentences and extract key ones
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length <= 160);

  // Score sentences by importance markers
  const scored = sentences.map((sentence) => {
    let score = 0;
    if (/\bif\b.*\bthen\b/i.test(sentence)) score += 3; // Conditional
    if (/\bbecause\b|\btherefore\b/i.test(sentence)) score += 2; // Causation
    if (/\bis\s+defined\s+as\b|\bmeans\b/i.test(sentence)) score += 2; // Definition
    if (/\bhowever\b|\bbut\b|\bexcept\b/i.test(sentence)) score += 2; // Contrast
    if (/\bfirst\b|\bsecond\b|\bstep\b/i.test(sentence)) score += 1; // Procedure
    if (/\d/.test(sentence)) score += 1; // Contains numbers
    return { sentence, score };
  });

  // Sort by score and take top items
  const topSentences = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, PIPELINE_LIMITS.MAX_OUTPUT_ITEMS);

  const items: CoreItem[] = topSentences.map((s, i) => ({
    id: `${request.bookId}-p${request.pageNumber}-${i}`,
    core_sentence: s.sentence.slice(0, 160),
    triggers: detectTriggers(s.sentence),
    exceptions: [],
    confidence: 0.7 + (s.score * 0.05),
    source: {
      page: request.pageNumber,
      paragraph_index: i,
      char_range: [0, s.sentence.length] as [number, number],
    },
    attachments_available: {
      procedure: /step|first|then/i.test(s.sentence),
      example: /example|instance/i.test(s.sentence),
      visual: /figure|diagram|chart/i.test(s.sentence),
    },
  }));

  return {
    version: 'core.v1',
    scope: {
      book_id: request.bookId,
      chapter: request.chapter || null,
      page: request.pageNumber,
      paragraph_range: [0, Math.min(4, sentences.length)],
    },
    items,
    stats: {
      input_paragraphs: Math.ceil(sentences.length / 3),
      items_returned: items.length,
      sentences_total: items.length,
    },
    stop_reason: items.length >= PIPELINE_LIMITS.MAX_OUTPUT_ITEMS ? 'cap_reached' : 'clarity_reached',
  };
}

function detectTriggers(text: string): Array<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'> {
  const triggers: Array<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'> = [];

  if (/\bif\b.*\bthen\b|\bwhen\b.*\bmust\b/i.test(text)) triggers.push('A');
  if (/\bbut\b|\bhowever\b|\bexcept\b/i.test(text)) triggers.push('B');
  if (/\bbecause\b|\btherefore\b|\bthus\b/i.test(text)) triggers.push('C');
  if (/\bis\s+(defined\s+as|a|an)\b|\bmeans\b/i.test(text)) triggers.push('D');
  if (/\bfirst\b.*\bsecond\b|\bsteps?\b|\btypes?\b/i.test(text)) triggers.push('E');
  if (/[=+\-*/]|\bformula\b|\bcalculate\b/i.test(text)) triggers.push('F');
  if (/\brange\b|\bspectrum\b|\blevels?\b/i.test(text)) triggers.push('G');
  if (/\bcategory\b|\bclassif|\btype\s+of\b/i.test(text)) triggers.push('H');

  return triggers.slice(0, 3);
}

// ============================================================================
// Main Pipeline Function
// ============================================================================

/**
 * Run the Core extraction pipeline
 * Uses Tier A (page-only) by default, Tier B only when explicitly requested
 */
export async function runPipeline(
  request: PipelineRequest,
  options: { forceFullBook?: boolean } = {}
): Promise<PipelineResult> {
  // Always try Tier A first (fast, reliable)
  const tierAResult = await tierAExtract(request);

  // If Tier A succeeds or full-book not requested, return
  if (tierAResult.success || !options.forceFullBook) {
    return tierAResult;
  }

  // Tier B would go here (full-book indexing)
  // For now, return Tier A result
  return tierAResult;
}

// ============================================================================
// Stream Support (for live extraction)
// ============================================================================

export interface StreamState {
  isExtracting: boolean;
  lastRequest: PipelineRequest | null;
  lastResult: PipelineResult | null;
  pendingRequest: PipelineRequest | null;
}

/**
 * Create a stream controller for live Core extraction
 */
export function createStreamController() {
  let state: StreamState = {
    isExtracting: false,
    lastRequest: null,
    lastResult: null,
    pendingRequest: null,
  };

  let extractionPromise: Promise<PipelineResult> | null = null;

  async function extract(request: PipelineRequest): Promise<PipelineResult> {
    // If already extracting, queue this request
    if (state.isExtracting) {
      state.pendingRequest = request;
      // Wait for current extraction to finish
      if (extractionPromise) {
        await extractionPromise;
      }
    }

    state.isExtracting = true;
    state.lastRequest = request;

    extractionPromise = runPipeline(request);
    const result = await extractionPromise;

    state.lastResult = result;
    state.isExtracting = false;

    // Process pending request if any
    if (state.pendingRequest) {
      const pending = state.pendingRequest;
      state.pendingRequest = null;
      return extract(pending);
    }

    return result;
  }

  return {
    extract,
    getState: () => state,
    cancel: () => {
      state.pendingRequest = null;
    },
  };
}
