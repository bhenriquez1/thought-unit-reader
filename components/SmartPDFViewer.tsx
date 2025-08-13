// components/SmartPDFViewer.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api"; // ✅ correct type source

// Keep react-pdf CSS imports in pages/_app.tsx (do not import here).

/** Use the same-origin worker we ship in /public to avoid CDN/CORS issues */
try {
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
} catch {
  // react-pdf will surface a clearer error if this fails
}

/** Outline (TOC) shape bubbled up to the page */
export type TocItem = {
  title: string;
  pageNumber?: number; // 1-based; may be undefined when unresolved
  items?: TocItem[];
};

export interface SmartPDFViewerProps {
  fileUrl: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  scale?: number;
  onTextSelect?: (text: string) => void;
  onPageCount?: (n: number) => void;
  /** Emit PDF outline/bookmarks with resolved page numbers */
  onOutline?: (items: TocItem[]) => void;
}

/** Convert remote http(s) PDFs to same-origin via /api/proxy-pdf */
function toSameOrigin(url: string): string {
  try {
    if (!/^https?:/i.test(url)) return url; // blob:, data:, relative paths
    if (typeof window !== "undefined") {
      const u = new URL(url);
      if (u.origin === window.location.origin) return url;
    }
    return `/api/proxy-pdf?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}

/** Resolve a PDF.js outline tree to {title, pageNumber, items[]} */
async function resolveOutline(
  pdf: PDFDocumentProxy,
  nodes: any[] | null | undefined
): Promise<TocItem[]> {
  if (!nodes || !nodes.length) return [];
  const out: TocItem[] = [];

  for (const node of nodes) {
    let pageNumber: number | undefined = undefined;

    // dest can be a named destination (string) or an array
    let dest: any = node?.dest;
    try {
      if (typeof dest === "string") dest = await (pdf as any).getDestination(dest);
      if (Array.isArray(dest) && dest.length) {
        const pageRef = dest[0]; // Ref to page
        const index = await (pdf as any).getPageIndex(pageRef);
        if (Number.isFinite(index)) pageNumber = (index as number) + 1;
      }
    } catch {
      // ignore if we can't resolve a page number
    }

    const children = await resolveOutline(pdf, node.items || node.children);
    out.push({
      title: node?.title || "Untitled",
      pageNumber,
      items: children,
    });
  }

  return out;
}

export default function SmartPDFViewer({
  fileUrl,
  currentPage,
  onPageChange,
  scale = 1.25,
  onTextSelect,
  onPageCount,
  onOutline,
}: SmartPDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(scale);
  const [pageInput, setPageInput] = useState<string>(String(currentPage));
  const [showToolbar, setShowToolbar] = useState<boolean>(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  // Resolve & memoize what the <Document /> will fetch
  const fileSpec = useMemo(() => {
    if (!fileUrl) return null;
    const resolved = toSameOrigin(fileUrl);
    return { url: resolved };
  }, [fileUrl]);

  /** react-pdf v7 passes the PDFDocumentProxy directly */
  const onDocumentLoadSuccess = async (pdf: PDFDocumentProxy) => {
    setErrMsg(null);
    setNumPages(pdf.numPages);
    onPageCount?.(pdf.numPages);

    if (onOutline) {
      try {
        const raw = await (pdf as any).getOutline?.();
        if (raw?.length) {
          const items = await resolveOutline(pdf, raw);
          onOutline(items);
        } else {
          onOutline([]);
        }
      } catch {
        onOutline?.([]);
      }
    }
  };

  const onDocumentLoadError = (err: unknown) => {
    const m = (err as any)?.message || String(err);
    setErrMsg(m);
    console.error("❌ PDF load error", err);
  };

  const onSourceError = (err: unknown) => {
    const m = (err as any)?.message || String(err);
    setErrMsg(m);
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
    } else {
      setPageInput(String(currentPage));
    }
  };

  const handleMouseUp = () => {
    const selection = window.getSelection()?.toString().trim();
    if (selection && onTextSelect) onTextSelect(selection);
  };

  return (
    <div
      className="relative h-full w-full bg-gray-900"
      ref={viewerRef}
      onMouseUp={handleMouseUp}
    >
      {showToolbar ? (
        <div className="absolute top-4 right-4 bg-black/60 text-white rounded-lg px-3 py-2 flex gap-2 items-center shadow-lg z-50">
          <button onClick={handleZoomOut} className="hover:text-yellow-400" aria-label="Zoom out">➖</button>
          <button onClick={handleZoomIn} className="hover:text-yellow-400" aria-label="Zoom in">➕</button>
          <button onClick={handlePrevPage} disabled={currentPage <= 1} aria-label="Previous page">◀</button>
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
        {fileSpec ? (
          <Document
            key={(fileSpec as any).url}
            file={fileSpec}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            onSourceError={onSourceError}
          >
            <Page pageNumber={currentPage} scale={zoom} renderTextLayer renderAnnotationLayer />
          </Document>
        ) : (
          <p className="text-gray-400">📂 No PDF loaded.</p>
        )}
      </div>

      {errMsg && (
        <div className="absolute left-4 bottom-4 bg-red-600 text-white text-xs rounded px-2 py-1 shadow">
          Failed to load PDF: {errMsg}
        </div>
      )}
    </div>
  );
}