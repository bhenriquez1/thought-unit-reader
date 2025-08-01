// lib/pdfjs-config.ts
// This file safely configures the PDF.js worker

/**
 * Configure PDF.js worker to avoid SSR issues
 * This is a safe way to configure pdfjs without relying on direct imports
 */
export default function configurePdfjs(): void {
  if (typeof window === 'undefined') {
    // Skip configuration in SSR context
    return;
  }

  try {
    // Dynamically import pdfjs at runtime only
    const pdfjs = require('react-pdf/dist/esm/pdfjs');

    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      // Set worker source from CDN to avoid bundling issues
      const pdfVersion = pdfjs.version;
      pdfjs.GlobalWorkerOptions.workerSrc = 
        `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfVersion}/pdf.worker.min.js`;
    }
  } catch (error) {
    console.error("Failed to configure PDF.js worker:", error);
  }
}