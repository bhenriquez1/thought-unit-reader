// lib/types.d.ts
// Type declarations for project

// Declare modules that don't have proper TypeScript definitions
declare module 'pdfjs-dist/build/pdf' {
  export * from 'pdfjs-dist';
}

declare module 'pdfjs-dist/build/pdf.worker.entry' {
  const worker: any;
  export default worker;
}

// Chapter interface used throughout the application
export interface Chapter {
  title: string;
  content: string;
  page?: number;
}

// PDF viewer props interface
export interface PDFViewerProps {
  fileUrl: string;
  initialScale?: number;
  showControls?: boolean;
}

// ParsedText component props
export interface ParsedTextProps {
  inputText?: string;
  parsedUnits?: string[][] | string[];
  extension?: string;
}

// HybridReader component props
export interface HybridReaderProps {
  inputText?: string;
}