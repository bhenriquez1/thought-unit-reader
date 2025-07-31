// lib/pdfjs-config.ts
import { pdfjs } from 'react-pdf';

/**
 * Configure PDF.js worker only once
 */
const configurePdfjs = (): void => {
  // Check if we've already configured the worker
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
  }
};

// Export as both named and default export for maximum compatibility
export { configurePdfjs };
export default configurePdfjs;