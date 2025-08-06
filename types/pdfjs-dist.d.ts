// lib/pdfjs-config.ts
// A utility to configure PDF.js and provide PDF handling functions

import { generateTOC } from "@/lib/tocParser";

/**
 * Configure PDF.js worker
 * This should be called on the client side only
 */
export function configurePdfjs(): void {
  if (typeof window === "undefined") return;

  try {
    const pdfjs = require("react-pdf/dist/esm/pdfjs");
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      const workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
    }
  } catch (error) {
    console.error("Failed to configure PDF.js worker:", error);
  }
}

/**
 * Load a PDF from an ArrayBuffer
 * @param arrayBuffer The PDF file as an ArrayBuffer
 * @returns A promise with the PDF document and number of pages
 */
export async function loadPdfFromBuffer(arrayBuffer: ArrayBuffer) {
  try {
    const pdfjs = await import("pdfjs-dist/build/pdf");

    if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
    }

    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    return { pdf, numPages: pdf.numPages };
  } catch (error) {
    console.error("Error loading PDF with pdfjs-dist:", error);

    try {
      const { pdfjs } = await import("react-pdf");
      const pdf = await pdfjs.getDocument(arrayBuffer).promise;
      return { pdf, numPages: pdf.numPages };
    } catch (fallbackError) {
      console.error("Fallback PDF loading also failed:", fallbackError);
      throw new Error("Failed to load PDF document");
    }
  }
}

/**
 * Extract text content from a PDF
 * @param file The PDF file
 * @param onProgress Optional callback for progress updates
 * @returns A promise with the extracted text and a generated TOC if needed
 */
export async function extractTextFromPdf(
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ text: string; toc: any[] }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const { pdf, numPages } = await loadPdfFromBuffer(arrayBuffer);

    let fullText: string[] = [];

    for (let i = 0; i < numPages; i++) {
      const page = await pdf.getPage(i + 1);
      const content = await page.getTextContent();

      // Preserve punctuation and paragraph structure
      let pageText = "";
      content.items.forEach((item: any) => {
        const str = item.str || "";
        if (str.match(/[.!?]$/)) {
          pageText += str + " "; // keep punctuation
        } else {
          pageText += str + " ";
        }
      });

      fullText.push(pageText.trim());

      if (onProgress) onProgress(((i + 1) / numPages) * 100);
    }

    const joinedText = fullText.join("\n\n");

    // Generate fallback TOC if no embedded outline
    const toc = await generateTOC(joinedText, numPages);

    return { text: joinedText, toc };
  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    return { text: "", toc: [] };
  }
}

export default configurePdfjs;