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
const EXTRACTION_FAILURE_PATTERNS = [
  /unable to extract text from this document/i,
  /failed to extract/i,
  /no text available/i,
];

// Characters PDF.js emits when it cannot map a glyph in the page's (often
// custom/subset) font to a real Unicode codepoint -- the visible symptom is
// literal "tofu" boxes substituted for real letters mid-word (e.g. an "m"
// glyph coming back as a box character, corrupting "audiometric" into
// something like "audio<box>etric"). None of these can be repaired by
// generic text normalization -- there is no correct character to
// reconstruct from an unmapped glyph. The only real fix is to re-read the
// page from its rendered pixels via OCR, which never depends on the PDF's
// own (broken) font CMap.
//
// Expressed as numeric codepoints (String.fromCodePoint / codePointAt), not
// raw literals or \u escapes inside a string/regex, so the exact intended
// characters survive regardless of file/editor/tooling encoding.
const WHITE_SQUARE_CODEPOINT = 0x25a1; // "tofu" box glyph some fonts substitute
const REPLACEMENT_CHAR_CODEPOINT = 0xfffd; // standard Unicode replacement character
const PRIVATE_USE_AREA_START = 0xe000; // custom font subsets often reuse this range
const PRIVATE_USE_AREA_END = 0xf8ff; // for glyph IDs never mapped to real text

/** True when text contains one of PDF.js's own "I couldn't map this glyph
 *  to real text" marker characters -- a distinct signal from mere shortness
 *  or broken hyphenation, since a corrupted page can otherwise look long
 *  enough and well-formed enough to pass every other quality check. */
function hasUnmappedGlyphCorruption(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    if (code === WHITE_SQUARE_CODEPOINT || code === REPLACEMENT_CHAR_CODEPOINT) return true;
    if (code >= PRIVATE_USE_AREA_START && code <= PRIVATE_USE_AREA_END) return true;
  }
  return false;
}

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
 * OCR a data URL image and return extracted text with confidence.
 * Passing signal allows the caller to cancel before recognition starts;
 * throws AbortError when cancelled so callers can distinguish it from
 * OCR failures.
 */
export async function ocrDataUrlToText(
  dataUrl: string,
  signal?: AbortSignal,
): Promise<{ text: string; confidence: number }> {
  if (signal?.aborted) throw new DOMException('OCR cancelled', 'AbortError');
  try {
    const worker = await getTesseractWorker();
    if (signal?.aborted) throw new DOMException('OCR cancelled', 'AbortError');
    const { data } = await worker.recognize(dataUrl);
    return {
      text: data.text || '',
      confidence: data.confidence || 0
    };
  } catch (error) {
    if ((error as any)?.name === 'AbortError') throw error;
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
  /** Cancels in-flight OCR when aborted. Native-text extraction is unaffected. */
  signal?: AbortSignal;
}

/**
 * Extract text from a PDF page with OCR fallback
 *
 * Logic:
 * 1. Try native text extraction from PDF text layer
 * 2. If empty, too short, or corrupted (unmapped-glyph markers), check OCR cache
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
    const shouldUseNative = !shouldUseOCR(nativeText, minTextLength) && nativeQuality >= 35;
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
      confidence: cached.confidence
    };
  }

  // Step 4: Perform OCR
  try {
    onOCRStart?.();

    const imageDataUrl = await getPageImageDataUrl();
    const ocrResult = await ocrDataUrlToText(imageDataUrl, signal);
    const sanitizedOcrText = sanitizeExtractionText(ocrResult.text);

    // Cache the result
    await cacheOCR({
      docId,
      pageNumber,
      text: sanitizedOcrText,
      confidence: ocrResult.confidence,
      extractedAt: Date.now()
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
      confidence: ocrResult.confidence
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

/**
 * True when the native PDF.js text layer is unusable for this page --
 * either because it's (near-)empty (a scanned/image-only page) or because
 * it contains PDF.js's own unmapped-glyph marker characters (a corrupted
 * embedded-font page that LOOKS long enough but has individual letters
 * silently replaced with tofu/replacement characters -- see
 * hasUnmappedGlyphCorruption above). Both cases get the same fix: re-read
 * the page via OCR instead of trusting the broken text layer. The single
 * source of truth for this decision -- both extractPageText's own internal
 * native-vs-OCR choice and SmartPDFViewer's caller-side gate before ever
 * invoking OCR must use this same function, not independently re-derive it.
 */
export function shouldUseOCR(nativeText: string, minLength: number = MIN_TEXT_LENGTH): boolean {
  const trimmed = nativeText?.trim() || '';
  if (trimmed.length < minLength) return true;
  return hasUnmappedGlyphCorruption(trimmed);
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
