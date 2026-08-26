// lib/page-intelligence/extractor.ts
// Page text extraction with OCR fallback for scanned PDFs
// Uses native PDF text when available, falls back to tesseract.js OCR

import { get, set } from 'idb-keyval';
import type { PageText, PageSource, OCRCacheEntry, OCRWordBox } from './types';

// ============================================================================
// Configuration
// ============================================================================

const MIN_TEXT_LENGTH = 40; // Minimum chars for native text to be considered valid
const OCR_CACHE_PREFIX = 'ocr:';
const OCR_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const EXTRACTION_FAILURE_PATTERNS = [
  /unable to extract text from this document/i,
  /failed to extract/i,
  /no text available/i,
];

function sanitizeExtractionText(text: string): string {
  if (!text) return '';
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (EXTRACTION_FAILURE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return '';
  }
  return text.trim();
}

function scoreTextQuality(text: string): number {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return 0;
  const alphaTokens = normalized.match(/[A-Za-z]{3,}/g)?.length ?? 0;
  const brokenTokens = normalized.match(/[A-Za-z]-\s+[A-Za-z]/g)?.length ?? 0;
  const sentenceMarks = normalized.match(/[.!?]/g)?.length ?? 0;
  const lengthScore = Math.min(60, normalized.length / 8);
  const tokenScore = Math.min(25, alphaTokens / 3);
  const sentenceScore = Math.min(20, sentenceMarks * 2);
  const penalty = Math.min(30, brokenTokens * 6);
  return Math.max(0, Math.min(100, Math.round(lengthScore + tokenScore + sentenceScore - penalty)));
}

// ============================================================================
// OCR Engine (lazy-loaded tesseract.js)
// ============================================================================

let tesseractWorker: any = null;
let tesseractLoading: Promise<any> | null = null;

async function getTesseractWorker(): Promise<any> {
  if (tesseractWorker) return tesseractWorker;
  if (tesseractLoading) return tesseractLoading;

  tesseractLoading = (async () => {
    try {
      const Tesseract = await import('tesseract.js');
      tesseractWorker = await Tesseract.createWorker('eng', 1, {
        logger: () => {} // Silence logging
      });
      return tesseractWorker;
    } catch (error) {
      console.error('[PageIntelligence] Failed to initialize Tesseract:', error);
      tesseractLoading = null;
      throw error;
    }
  })();

  return tesseractLoading;
}

/**
 * Flattens Tesseract's blocks -> paragraphs -> lines -> words hierarchy
 * (only present when recognize() is asked for `{ blocks: true }` output —
 * the default is `blocks: false`, which silently discards every word's
 * bbox even though the library computes it) into a flat reading-order list.
 * Empty/whitespace-only words are dropped — they carry no useful position.
 */
function flattenOcrWords(data: any): OCRWordBox[] {
  const words: OCRWordBox[] = [];
  for (const block of data?.blocks ?? []) {
    for (const paragraph of block?.paragraphs ?? []) {
      for (const line of paragraph?.lines ?? []) {
        for (const word of line?.words ?? []) {
          const text = typeof word?.text === 'string' ? word.text.trim() : '';
          if (!text || !word?.bbox) continue;
          words.push({ text, bbox: word.bbox });
        }
      }
    }
  }
  return words;
}

/**
 * OCR a data URL image and return extracted text with confidence and,
 * when Tesseract found any, word-level bounding boxes in that image's own
 * pixel space (see OCRWordBox). Passing signal allows the caller to cancel
 * before recognition starts; throws AbortError when cancelled so callers
 * can distinguish it from OCR failures.
 */
export async function ocrDataUrlToText(
  dataUrl: string,
  signal?: AbortSignal,
): Promise<{ text: string; confidence: number; words: OCRWordBox[] }> {
  if (signal?.aborted) throw new DOMException('OCR cancelled', 'AbortError');
  try {
    const worker = await getTesseractWorker();
    if (signal?.aborted) throw new DOMException('OCR cancelled', 'AbortError');
    const { data } = await worker.recognize(dataUrl, {}, { blocks: true });
    return {
      text: data.text || '',
      confidence: data.confidence || 0,
      words: flattenOcrWords(data),
    };
  } catch (error) {
    if ((error as any)?.name === 'AbortError') throw error;
    console.error('[PageIntelligence] OCR recognition failed:', error);
    return { text: '', confidence: 0, words: [] };
  }
}

// ============================================================================
// OCR Cache (IndexedDB via idb-keyval)
// ============================================================================

function getOCRCacheKey(docId: string, pageNumber: number): string {
  return `${OCR_CACHE_PREFIX}${docId}:${pageNumber}`;
}

export async function getCachedOCR(docId: string, pageNumber: number): Promise<OCRCacheEntry | null> {
  try {
    const key = getOCRCacheKey(docId, pageNumber);
    const entry = await get<OCRCacheEntry>(key);

    if (entry) {
      // Check if cache is still valid
      if (Date.now() - entry.extractedAt < OCR_CACHE_TTL) {
        return entry;
      }
      // Cache expired, clean it up
      await set(key, undefined);
    }
    return null;
  } catch (error) {
    console.warn('[PageIntelligence] Failed to read OCR cache:', error);
    return null;
  }
}

export async function cacheOCR(entry: OCRCacheEntry): Promise<void> {
  try {
    const key = getOCRCacheKey(entry.docId, entry.pageNumber);
    await set(key, entry);
  } catch (error) {
    console.warn('[PageIntelligence] Failed to cache OCR result:', error);
  }
}

// ============================================================================
// PDF Page to Image Rendering
// ============================================================================

/**
 * Render a PDF page to a data URL for OCR processing
 * Requires access to the PDF document object from pdfjs-dist
 */
export async function renderPdfPageToDataUrl(
  pdfDocument: any,
  pageNumber: number,
  scale: number = 2.0
): Promise<string> {
  try {
    // PDF.js uses 1-based page numbers
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get canvas 2D context');
    }

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport
    }).promise;

    const dataUrl = canvas.toDataURL('image/png');

    // Cleanup
    canvas.width = 0;
    canvas.height = 0;

    return dataUrl;
  } catch (error) {
    console.error('[PageIntelligence] Failed to render PDF page to image:', error);
    throw error;
  }
}

// ============================================================================
// Main Page Text Extractor
// ============================================================================

export interface ExtractPageTextOptions {
  pageNumber: number;
  docId: string;
  getNativeText: () => Promise<string>;
  getPageImageDataUrl: () => Promise<string>;
  ocrEnabled?: boolean;
  minTextLength?: number;
  mixedLengthRatio?: number;
  onOCRStart?: () => void;
  onOCRComplete?: (text: string, confidence: number) => void;
  /** Cancels in-flight OCR when aborted. Native-text extraction is unaffected. */
  signal?: AbortSignal;
}

/**
 * Extract text from a PDF page with OCR fallback
 *
 * Logic:
 * 1. Try native text extraction from PDF text layer
 * 2. If empty or too short, check OCR cache
 * 3. If not cached, render page to image and OCR it
 * 4. Cache OCR result for future use
 */
export async function extractPageText(options: ExtractPageTextOptions): Promise<PageText> {
  const {
    pageNumber,
    docId,
    getNativeText,
    getPageImageDataUrl,
    ocrEnabled = true,
    minTextLength = MIN_TEXT_LENGTH,
    mixedLengthRatio = 0.75,
    onOCRStart,
    onOCRComplete,
    signal,
  } = options;

  // Step 1: Try native text extraction
  let nativeText = '';
  try {
    nativeText = sanitizeExtractionText((await getNativeText()) || '');

    const nativeQuality = scoreTextQuality(nativeText);
    const shouldUseNative = nativeText.length >= minTextLength && nativeQuality >= 35;
    if (shouldUseNative) {
      return {
        pageNumber,
        text: nativeText,
        nativeText,
        ocrText: '',
        mergedText: nativeText,
        source: 'native' as PageSource,
        confidence: Math.max(80, nativeQuality)
      };
    }
  } catch (error) {
    console.warn(`[PageIntelligence] Native text extraction failed for page ${pageNumber}:`, error);
  }

  // Step 2: Check if OCR is enabled or already cancelled
  if (signal?.aborted) {
    return { pageNumber, text: '', nativeText, ocrText: '', mergedText: '', source: 'native' as PageSource, confidence: 0 };
  }
  if (!ocrEnabled) {
    return {
      pageNumber,
      text: '',
      nativeText,
      ocrText: '',
      mergedText: '',
      source: 'native' as PageSource,
      confidence: 0
    };
  }

  // Step 3: Check OCR cache
  const cached = await getCachedOCR(docId, pageNumber);
  if (cached) {
    const cachedText = sanitizeExtractionText(cached.text);
    const hasNativeFragment = nativeText.length > 0;
    const shouldMergeNativeAndOCR = hasNativeFragment && nativeText.length < minTextLength;
    const mergedText = shouldMergeNativeAndOCR
      ? `${nativeText}

${cachedText}`.trim()
      : cachedText;

    return {
      pageNumber,
      text: mergedText,
      nativeText,
      ocrText: cachedText,
      mergedText,
      source: shouldMergeNativeAndOCR ? 'mixed' as PageSource : 'ocr' as PageSource,
      confidence: cached.confidence,
      ocrWords: cached.words,
    };
  }

  // Step 4: Perform OCR
  try {
    onOCRStart?.();

    const imageDataUrl = await getPageImageDataUrl();
    const ocrResult = await ocrDataUrlToText(imageDataUrl, signal);
    const sanitizedOcrText = sanitizeExtractionText(ocrResult.text);

    // Cache the result (words alongside text, so a revisited page gets
    // geometry back from cache without re-running Tesseract).
    await cacheOCR({
      docId,
      pageNumber,
      text: sanitizedOcrText,
      confidence: ocrResult.confidence,
      extractedAt: Date.now(),
      words: ocrResult.words,
    });

    onOCRComplete?.(sanitizedOcrText, ocrResult.confidence);

    const hasNativeFragment = nativeText.length > 0;
    const shouldMergeNativeAndOCR = hasNativeFragment && nativeText.length < minTextLength;
    const nativeRatio = minTextLength > 0 ? nativeText.length / minTextLength : 0;
    const isMixed = shouldMergeNativeAndOCR && nativeRatio >= mixedLengthRatio;
    const mergedText = shouldMergeNativeAndOCR
      ? `${nativeText}

${sanitizedOcrText}`.trim()
      : sanitizedOcrText;

    return {
      pageNumber,
      text: mergedText,
      nativeText,
      ocrText: sanitizedOcrText,
      mergedText,
      source: isMixed ? 'mixed' as PageSource : 'ocr' as PageSource,
      confidence: ocrResult.confidence,
      ocrWords: ocrResult.words,
    };
  } catch (error) {
    if ((error as any)?.name === 'AbortError') throw error;
    console.error(`[PageIntelligence] OCR failed for page ${pageNumber}:`, error);
    return {
      pageNumber,
      text: '',
      nativeText,
      ocrText: '',
      mergedText: '',
      source: 'ocr' as PageSource,
      confidence: 0
    };
  }
}

// ============================================================================
// Utility: Check if page likely needs OCR
// ============================================================================

export function shouldUseOCR(nativeText: string, minLength: number = MIN_TEXT_LENGTH): boolean {
  const trimmed = nativeText?.trim() || '';
  return trimmed.length < minLength;
}

// ============================================================================
// Cleanup
// ============================================================================

export async function terminateOCRWorker(): Promise<void> {
  if (tesseractWorker) {
    try {
      await tesseractWorker.terminate();
      tesseractWorker = null;
      tesseractLoading = null;
    } catch (error) {
      console.warn('[PageIntelligence] Failed to terminate Tesseract worker:', error);
    }
  }
}

// ============================================================================
// Clear OCR cache for a document
// ============================================================================

export async function clearOCRCache(docId: string): Promise<void> {
  // Note: idb-keyval doesn't support prefix deletion easily,
  // so this would need to be done via the main IndexedDB interface
  // For now, individual cache entries expire after TTL
  console.log(`[PageIntelligence] OCR cache for ${docId} will expire after TTL`);
}
