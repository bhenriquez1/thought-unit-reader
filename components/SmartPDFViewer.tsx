// components/SmartPDFViewer.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

/**
 * PDF.js worker (v4.x): use same-origin worker we copy to /public.
 * Falls back to CDN if needed.
 */
(() => {
  try {
    const local = "/pdf.worker.min.mjs";
    const cdn = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
    // Prefer local; swap to CDN if your host doesn't serve from /public
    (pdfjs as any).GlobalWorkerOptions.workerSrc = local;
    // To hard-force CDN instead, uncomment:
    // (pdfjs as any).GlobalWorkerOptions.workerSrc = cdn;
  } catch {
    try {
      (pdfjs as any).GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
    } catch {
      /* ignore */
    }
  }
})();

export interface SmartPDFViewerProps {
  fileUrl: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  scale?: number;
  onTextSelect?: (text: string) => void;
  /** Notify parent how many pages the doc has */
  onPageCount?: (n: number) => void;
}

export default function SmartPDFViewer({
  fileUrl,
  currentPage,
  onPageChange,
  scale = 1.25,
  onTextSelect,
  onPageCount,
}: SmartPDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(scale);
  const [pageInput, setPageInput] = useState<string>(String(currentPage));
  const [showToolbar, setShowToolbar] = useState<boolean>(true);
  const viewerRef = useRef<HTMLDivElement>(null);

  // Keep input in sync with external page jumps (e.g., TOC).
  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const log = (msg: string, data?: unknown) =>
    console.log(`🛠 [SmartPDFViewer] ${msg}`, data ?? "");

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    onPageCount?.(numPages);
    log("PDF Loaded", { numPages });
  };

  const onDocumentLoadError = (err: unknown) => {
    console.error("❌ PDF load error", err);
  };

  const onSourceError = (err: unknown) => {
    console.error("❌ PDF source error", err);
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));

  const handlePrevPage = () => {
    if (currentPage > 1) {
      const next = currentPage - 1;
      onPageChange(next);
      setPageInput(String(next));
    }
  };

  const handleNextPage = () => {
    if (currentPage < numPages) {
      const next = currentPage + 1;
      onPageChange(next);
      setPageInput(String(next));
    }
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(pageInput, 10);
    if (!Number.isNaN(pageNum) && pageNum >= 1 && pageNum <= numPages) {
      onPageChange(pageNum);
      log("Jump to page", pageNum);
    } else {
      setPageInput(String(currentPage));
    }
  };

  const handleMouseUp = () => {
    const selection = window.getSelection()?.toString().trim();
    if (selection && onTextSelect) {
      onTextSelect(selection);
      log("Text selected", selection);
    }
  };

  return (
    <div
      className="relative h-full w-full bg-gray-900"
      ref={viewerRef}
      onMouseUp={handleMouseUp}
    >
      {showToolbar ? (
        <div className="absolute top-4 right-4 bg-black/60 text-white rounded-lg px-3 py-2 flex gap-2 items-center shadow-lg z-50">
          <button onClick={handleZoomOut} className="hover:text-yellow-400" aria-label="Zoom out">
            ➖
          </button>
          <button onClick={handleZoomIn} className="hover:text-yellow-400" aria-label="Zoom in">
            ➕
          </button>
          <button onClick={handlePrevPage} disabled={currentPage <= 1} aria-label="Previous page">
            ◀
          </button>
          <form onSubmit={handlePageInputSubmit} className="flex items-center">
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              className="w-12 text-center text-black rounded"
              aria-label="Page number"
            />
            <span className="ml-1 text-sm">/ {numPages || "—"}</span>
          </form>
          <button
            onClick={handleNextPage}
            disabled={numPages === 0 || currentPage >= numPages}
            aria-label="Next page"
          >
            ▶
          </button>
          <button
            onClick={() => setShowToolbar(false)}
            className="ml-2 text-red-400 hover:text-red-300"
            aria-label="Hide toolbar"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowToolbar(true)}
          className="absolute top-4 right-4 bg-yellow-500 text-black px-2 py-1 rounded-lg shadow-lg z-50"
          aria-label="Show toolbar"
        >
          ⚙
        </button>
      )}

      <div className="flex justify-center items-start h-full overflow-auto p-4 transition-all duration-300">
        {fileUrl ? (
          <Document
            key={fileUrl}
            file={fileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            onSourceError={onSourceError}
          >
            <Page
              pageNumber={currentPage}
              scale={zoom}
              renderTextLayer
              renderAnnotationLayer
            />
          </Document>
        ) : (
          <p className="text-gray-400">📂 No PDF loaded.</p>
        )}
      </div>
    </div>
  );
}