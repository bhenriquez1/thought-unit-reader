// lib/pdfjs-config.ts
import { pdfjs } from 'react-pdf';

// Configure PDF.js worker only once
const configurePdfjs = () => {
  // Check if we've already configured the worker
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
  }
};

export default configurePdfjs;