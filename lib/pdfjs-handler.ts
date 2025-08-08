// lib/pdfjs-handler.ts
// Unified, SSR-safe PDF.js handler (legacy build + worker auto-config)

/**
 * Configure PDF.js worker (client-only)
 */
export async function configurePdfjs(): Promise<void> {
  if (typeof window === "undefined") return;
  await getPdfjs(); // ensures workerSrc is set
}

/**
 * Extract text from a PDF file (client-only)
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  if (typeof window === "undefined") {
    return "PDF text extraction is only available in browser";
  }

  try {
    const pdfjs = await getPdfjs();
    if (!pdfjs) throw new Error("pdfjs failed to load");

    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    const loadingTask = pdfjs.getDocument({ data });
    const pdf = await loadingTask.promise;

    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => item?.str ?? item?.unicode ?? "")
        .join(" ");
      pages.push(pageText);
    }

    return pages.join("\n\n").trim();
  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    return "Error extracting PDF text. The PDF viewer will still work for viewing.";
  }
}

/* ------------------------------------------------------------------ */
/* Internals: lazy-load + cache pdfjs (legacy build) & set workerSrc  */
/* ------------------------------------------------------------------ */

let _pdfjs: any | null = null;

async function getPdfjs(): Promise<any | null> {
  if (_pdfjs) return _pdfjs;
  if (typeof window === "undefined") return null;

  try {
    // Prefer dynamic import; falls back to require if bundler complains
    // @ts-ignore
    const mod = await import("pdfjs-dist/legacy/build/pdf.js");
    _pdfjs = (mod && (mod as any).default) ? (mod as any).default : mod;
  } catch {
    try {
      // @ts-ignore
      _pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
    } catch (e2) {
      console.error("Failed to load pdfjs-dist legacy build:", e2);
      return null;
    }
  }

  try {
    if (_pdfjs && _pdfjs.GlobalWorkerOptions && !_pdfjs.GlobalWorkerOptions.workerSrc) {
      const version = _pdfjs.version || "4.6.82"; // fallback version if pdfjs doesn’t expose it
      _pdfjs.GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`;
    }
  } catch (e) {
    // non-fatal
  }

  return _pdfjs;
}

export default {
  configurePdfjs,
  extractTextFromPdf,
};