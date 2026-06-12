// lib/pdfjs-handler.ts
// Unified, SSR-safe PDF.js handler (v4) with worker auto-config and text extraction.

import { buildStructuredPageText } from "@/lib/pdf/structuredPageText";

/**
 * Public API
 * - configurePdfjs(): ensure worker is set (no-op on server)
 * - extractTextFromPdf(file): get plain text from all pages (client-only)
 * - extractTextByPageFromPdf(file): get { page, text }[] for all pages (client-only)
 */

export async function configurePdfjs(): Promise<void> {
  if (typeof window === "undefined") return;
  await getPdfjs(); // ensures workerSrc is configured
}

/** Shared core: extracts raw per-page text. Throws user-friendly errors. */
async function extractPageTexts(file: File): Promise<string[]> {
  const pdfjs = await getPdfjs();
  if (!pdfjs) throw new Error("pdfjs failed to load");

  // ✅ Create timeout promise to prevent hanging
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error("PDF processing timed out after 30 seconds. The file may be too large or complex."));
    }, 30000); // 30 second timeout
  });

  // ✅ Enhanced PDF loading with validation
  const data = new Uint8Array(await file.arrayBuffer());

  // Check if the file actually contains PDF data
  const pdfHeader = new TextDecoder().decode(data.slice(0, 5));
  if (!pdfHeader.startsWith('%PDF-')) {
    throw new Error("File does not appear to be a valid PDF (missing PDF header)");
  }

  // v4 API with enhanced error handling
  const loadingTask: any = (pdfjs as any).getDocument({
    data,
    verbosity: 0, // Reduce console noise
    maxImageSize: 1024 * 1024, // 1MB max per image to prevent memory issues
    disableFontFace: true, // Speed up loading
  });

  // Race between loading and timeout
  const doc = await Promise.race([loadingTask.promise, timeoutPromise]);

  // ✅ Validate document properties
  if (!doc || typeof doc.numPages !== 'number' || doc.numPages < 1) {
    throw new Error("Invalid PDF document - no readable pages found");
  }

  if (doc.numPages > 500) {
    console.warn(`⚠️ Large PDF detected: ${doc.numPages} pages. Processing may be slow.`);
  }

  const pages: string[] = [];
  let totalCharsExtracted = 0;

  // ✅ Process pages with progress tracking and early text detection
  for (let i = 1; i <= doc.numPages; i++) {
    try {
      // Add timeout for individual page processing
      const pagePromise = doc.getPage(i);
      const page = await Promise.race([
        pagePromise,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Page ${i} processing timed out`)), 10000);
        })
      ]);

      const content = await page.getTextContent();

      // Reconstruct line/paragraph structure from item geometry rather than
      // flattening to a single space-joined string — see lib/pdf/structuredPageText.
      const normalizedItems = (content.items as any[]).map((item: any) => ({
        // v4 items have `str`; keep fallbacks for safety
        str: typeof item?.str === "string" ? item.str
          : typeof item?.unicode === "string" ? item.unicode
          : typeof item?.text === "string" ? item.text
          : "",
        transform: item?.transform,
      }));
      const pageText = buildStructuredPageText(normalizedItems);

      pages.push(pageText);
      totalCharsExtracted += pageText.length;

      // Early detection of text-less PDFs (after first 5 pages)
      if (i === 5 && totalCharsExtracted < 100) {
        console.warn("⚠️ Very little text found in first 5 pages - may be a scanned/image PDF");
      }

      // Memory management for large documents
      if (i % 50 === 0) {
        console.log(`📄 Processed ${i}/${doc.numPages} pages, ${totalCharsExtracted} characters extracted`);
      }

      // Yield the event loop every 25 pages so pending work (in-flight fetch
      // continuations, React renders, the page-synthesis request) is not starved
      // by a long full-book extraction. Without this, a 1000+ page book can keep
      // the main thread busy long enough that the Stage 1 synthesis fetch aborts
      // on its timeout before its response handler ever runs.
      if (i % 25 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

    } catch (pageError) {
      console.warn(`⚠️ Failed to process page ${i}:`, pageError);
      pages.push(`[Page ${i} could not be processed]`);
    }
  }

  // ✅ Validate extracted content
  const fullText = pages.join("\n\n").trim();

  if (!fullText || fullText.length < 50) {
    if (doc.numPages > 0) {
      throw new Error("No readable text content found in PDF. This appears to be a scanned document or contains only images. Consider using OCR software to make it searchable first.");
    } else {
      throw new Error("PDF appears to be empty or corrupted");
    }
  }

  // Log success stats
  console.log(`✅ PDF text extraction complete: ${doc.numPages} pages, ${totalCharsExtracted} characters`);

  // Best-effort cleanup (optional)
  try {
    await doc.cleanup?.();
    await doc.destroy?.();
  } catch {
    /* ignore cleanup errors */
  }

  return pages;
}

function rethrowFriendly(error: unknown): never {
  console.error("Error extracting text from PDF:", error);

  // ✅ Provide specific error messages
  if (error instanceof Error) {
    if (error.message.includes("timeout")) {
      throw new Error("PDF processing took too long. Try a smaller or less complex PDF.");
    }
    if (error.message.includes("password") || error.message.includes("encrypted")) {
      throw new Error("This PDF is password-protected or encrypted. Please provide an unlocked PDF file.");
    }
    if (error.message.includes("Invalid PDF") || error.message.includes("not a valid PDF")) {
      throw new Error("File is corrupted or not a valid PDF. Please try a different file.");
    }
    if (error.message.includes("No readable text")) {
      throw new Error("No readable text content found in PDF");
    }
    // Re-throw the original error if it's already user-friendly
    if (error.message.includes("readable text content") ||
        error.message.includes("scanned document") ||
        error.message.includes("PDF header")) {
      throw error;
    }
  }

  // Generic fallback error
  throw new Error("Failed to extract text from PDF. The file may be corrupted, password-protected, or contain only images.");
}

export async function extractTextFromPdf(file: File): Promise<string> {
  if (typeof window === "undefined") {
    return "PDF text extraction is only available in the browser.";
  }

  try {
    const pages = await extractPageTexts(file);
    return pages.join("\n\n").trim();
  } catch (error) {
    rethrowFriendly(error);
  }
}

/** Returns per-page text, 1-indexed — used for whole-book diagnostics that need
 *  to tag generated questions back to a source page. */
export async function extractTextByPageFromPdf(file: File): Promise<{ page: number; text: string }[]> {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const pages = await extractPageTexts(file);
    return pages.map((text, i) => ({ page: i + 1, text }));
  } catch (error) {
    rethrowFriendly(error);
  }
}

/* ------------------------------------------------------------------ */
/* Internals: lazy-load + cache pdfjs (v4) & set workerSrc (client)   */
/* ------------------------------------------------------------------ */

let _pdfjs: any | null = null;

async function getPdfjs(): Promise<any | null> {
  if (_pdfjs) return _pdfjs;
  if (typeof window === "undefined") return null;

  try {
    // v4-style namespace import (dynamic to avoid SSR issues)
    const mod = await import("pdfjs-dist");
    _pdfjs = mod as any;
  } catch (e) {
    console.error("Failed to load pdfjs-dist:", e);
    return null;
  }

  // Point to worker we ship in /public (see package.json postinstall)
  try {
    const g = (_pdfjs as any).GlobalWorkerOptions;
    if (g && !g.workerSrc) {
      g.workerSrc = "/pdf.worker.min.mjs";
    }
  } catch {
    // non-fatal
  }

  return _pdfjs;
}

export default {
  configurePdfjs,
  extractTextFromPdf,
  extractTextByPageFromPdf,
};
