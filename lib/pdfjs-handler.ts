// lib/pdfjs-handler.ts
// Unified, SSR-safe PDF.js handler (v4) with worker auto-config and text extraction.

/**
 * Public API
 * - configurePdfjs(): ensure worker is set (no-op on server)
 * - extractTextFromPdf(file): get plain text from all pages (client-only)
 */

export async function configurePdfjs(): Promise<void> {
  if (typeof window === "undefined") return;
  await getPdfjs(); // ensures workerSrc is configured
}

export async function extractTextFromPdf(file: File): Promise<string> {
  if (typeof window === "undefined") {
    return "PDF text extraction is only available in the browser.";
  }

  try {
    const pdfjs = await getPdfjs();
    if (!pdfjs) throw new Error("pdfjs failed to load");

    const data = new Uint8Array(await file.arrayBuffer());

    // v4 API
    const loadingTask: any = (pdfjs as any).getDocument({ data });
    const doc = await loadingTask.promise;

    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();

      const pageText = (content.items as any[])
        .map((item: any) => {
          // v4 items have `str`; keep fallbacks for safety
          if (typeof item?.str === "string") return item.str;
          if (typeof item?.unicode === "string") return item.unicode;
          if (typeof item?.text === "string") return item.text;
          return "";
        })
        .join(" ");

      pages.push(pageText);
    }

    // Best-effort cleanup (optional)
    try {
      await doc.cleanup?.();
      await doc.destroy?.();
    } catch {
      /* ignore */
    }

    return pages.join("\n\n").trim();
  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    return "Error extracting PDF text. The PDF viewer will still work for viewing.";
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
};