// lib/page-intelligence/extractor.ts
// Page text extraction with OCR fallback for scanned PDFs
// Uses native PDF text when available, falls back to tesseract.js OCR

import { get, set } from 'idb-keyval';
import type { PageText, PageSource, OCRCacheEntry } from './types';

// ============================================================================
// Configuration
// ============================================================================

const MIN_TEXT_LENGTH = 40; // Minimum chars for native text to be considered valid
const OCR_CACHE_PREFIX = 'ocr:';
const OCR_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

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
 * OCR a data URL image and return extracted text with confidence
 */
export async function ocrDataUrlToText(dataUrl: string): Promise<{ text: string; confidence: number }> {
  try {
    const worker = await getTesseractWorker();
    const { data } = await worker.recognize(dataUrl);
    return {
      text: data.text || '',
      confidence: data.confidence || 0
    };
  } catch (error) {
    console.error('[PageIntelligence] OCR recognition failed:', error);
    return { text: '', confidence: 0 };
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
    onOCRComplete
  } = options;

  // Step 1: Try native text extraction
  let nativeText = '';
  try {
    nativeText = (await getNativeText())?.trim() || '';

    if (nativeText.length >= minTextLength) {
      return {
        pageNumber,
        text: nativeText,
        source: 'native' as PageSource,
        confidence: 100
      };
    }
  } catch (error) {
    console.warn(`[PageIntelligence] Native text extraction failed for page ${pageNumber}:`, error);
  }

  // Step 2: Check if OCR is enabled
  if (!ocrEnabled) {
    return {
      pageNumber,
      text: '',
      source: 'native' as PageSource,
      confidence: 0
    };
  }

  // Step 3: Check OCR cache
  const cached = await getCachedOCR(docId, pageNumber);
  if (cached) {
    const hasNativeFragment = nativeText.length > 0;
    const shouldMergeNativeAndOCR = hasNativeFragment && nativeText.length < minTextLength;
    const mergedText = shouldMergeNativeAndOCR
      ? `${nativeText}

${cached.text}`.trim()
      : cached.text;

    return {
      pageNumber,
      text: mergedText,
      source: shouldMergeNativeAndOCR ? 'mixed' as PageSource : 'ocr' as PageSource,
      confidence: cached.confidence
    };
  }

  // Step 4: Perform OCR
  try {
    onOCRStart?.();

    const imageDataUrl = await getPageImageDataUrl();
    const ocrResult = await ocrDataUrlToText(imageDataUrl);

    // Cache the result
    await cacheOCR({
      docId,
      pageNumber,
      text: ocrResult.text,
      confidence: ocrResult.confidence,
      extractedAt: Date.now()
    });

    onOCRComplete?.(ocrResult.text, ocrResult.confidence);

    const hasNativeFragment = nativeText.length > 0;
    const shouldMergeNativeAndOCR = hasNativeFragment && nativeText.length < minTextLength;
    const nativeRatio = minTextLength > 0 ? nativeText.length / minTextLength : 0;
    const isMixed = shouldMergeNativeAndOCR && nativeRatio >= mixedLengthRatio;
    const mergedText = shouldMergeNativeAndOCR
      ? `${nativeText}

${ocrResult.text}`.trim()
      : ocrResult.text;

    return {
      pageNumber,
      text: mergedText,
      source: isMixed ? 'mixed' as PageSource : 'ocr' as PageSource,
      confidence: ocrResult.confidence
    };
  } catch (error) {
    console.error(`[PageIntelligence] OCR failed for page ${pageNumber}:`, error);
    return {
      pageNumber,
      text: '',
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
