// lib/pdfjs-config.ts
// A utility to configure PDF.js and provide PDF handling functions

/**
 * Configure PDF.js worker
 * This should be called on the client side only
 */
export function configurePdfjs(): void {
  // Skip in SSR context
  if (typeof window === 'undefined') {
    return;
  }

  try {
    // Import pdfjs from react-pdf
    const pdfjs = require('react-pdf/dist/esm/pdfjs');
    
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      // Set worker source from CDN
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
    // Method 1: Using dynamic import (recommended for Next.js)
    const pdfjs = await import('pdfjs-dist/build/pdf');
    
    // Configure worker if not already configured
    if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = 
        `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
    }
    
    // Load the PDF
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    return {
      pdf,
      numPages: pdf.numPages
    };
  } catch (error) {
    console.error("Error loading PDF with pdfjs-dist:", error);
    
    // Fallback to react-pdf's version
    try {
      const { pdfjs } = await import('react-pdf');
      const pdf = await pdfjs.getDocument(arrayBuffer).promise;
      
      return {
        pdf,
        numPages: pdf.numPages
      };
    } catch (fallbackError) {
      console.error("Fallback PDF loading also failed:", fallbackError);
      throw new Error("Failed to load PDF document");
    }
  }
}

/**
 * Extract text content from a PDF
 * @param file The PDF file
 * @returns A promise with the extracted text
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const { pdf, numPages } = await loadPdfFromBuffer(arrayBuffer);
    
    // Extract text from each page
    const textContent = await Promise.all(
      Array.from({ length: numPages }, async (_, i) => {
        const page = await pdf.getPage(i + 1);
        const content = await page.getTextContent();
        return content.items
          .map((item: any) => item.str || '')
          .join(" ");
      })
    );

    return textContent.join("\n\n");
  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    return "Error extracting PDF text. The PDF viewer will still work for viewing.";
  }
}

// Export default configuration function for easy importing
export default configurePdfjs;