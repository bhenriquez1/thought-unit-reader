// components/SmartPDFViewer.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api"; // ✅ correct type source
import { useReaderSync } from "@/lib/readerSync";

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
  const [highlightPulse, setHighlightPulse] = useState<boolean>(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Enhanced sync integration
  const { 
    setPage, 
    startVisibleTextObserver, 
    stopVisibleTextObserver,
    syncPDFToChunk 
  } = useReaderSync();

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  // Enhanced page change handler with sync integration and fallback
  const handlePageChangeWithSync = (newPage: number, source: 'scroll' | 'navigation' | 'programmatic' = 'navigation') => {
    console.log(`📄 SmartPDFViewer: Page change ${currentPage} -> ${newPage} (${source})`);
    
    // Validate page bounds
    if (newPage < 1 || (numPages > 0 && newPage > numPages)) {
      console.warn(`📄 SmartPDFViewer: Invalid page ${newPage}, bounds: 1-${numPages}`);
      return;
    }
    
    try {
      // Update sync store first
      setPage(newPage, source === 'scroll' ? 'pdf' : 'manual');
      
      // Call parent callback with fallback
      onPageChange(newPage);
      
      console.log(`📄 SmartPDFViewer: Successfully navigated to page ${newPage}`);
    } catch (error) {
      console.error(`📄 SmartPDFViewer: Navigation error for page ${newPage}:`, error);
      
      // Fallback: direct parent callback without sync
      try {
        onPageChange(newPage);
        console.log(`📄 SmartPDFViewer: Fallback navigation to page ${newPage} succeeded`);
      } catch (fallbackError) {
        console.error(`📄 SmartPDFViewer: Fallback navigation failed:`, fallbackError);
      }
    }
  };

  // Enhanced visible text observer with optimized sync timing
  useEffect(() => {
    if (!pageContainerRef.current || !fileUrl) return;

    const container = pageContainerRef.current;
    
    // Enhanced debounced callback with pulse animation
    const handleVisibleTextChange = (visibleText: string, topElement: HTMLElement | null) => {
      console.log(`👁️ SmartPDFViewer: Visible text changed (${visibleText.length} chars)`);
      
      // Clear any existing sync timeout
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      
      // Debounce sync to achieve ~200ms target
      syncTimeoutRef.current = setTimeout(() => {
        if (visibleText.length > 50) { // Only sync if we have substantial text
          syncPDFToChunk(container, [visibleText]).then(matchedChunkId => {
            if (matchedChunkId) {
              console.log(`🔄 SmartPDFViewer: Synced to chunk ${matchedChunkId}`);
              
              // Trigger highlight pulse animation
              setHighlightPulse(true);
              setTimeout(() => setHighlightPulse(false), 1000);
            }
          }).catch(error => {
            console.warn('PDF to chunk sync failed:', error);
          });
        }
      }, 150); // 150ms debounce for ~200ms total response time
    };

    // Start the observer
    startVisibleTextObserver(container, handleVisibleTextChange);

    // Cleanup on unmount
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      stopVisibleTextObserver();
    };
  }, [fileUrl, startVisibleTextObserver, stopVisibleTextObserver, syncPDFToChunk]);

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
    console.log(`✅ SmartPDFViewer: PDF loaded successfully with ${pdf.numPages} pages`);
    onPageCount?.(pdf.numPages);

    if (onOutline) {
      try {
        const raw = await (pdf as any).getOutline?.();
        if (raw?.length) {
          const items = await resolveOutline(pdf, raw);
          onOutline(items);
          console.log(`📋 SmartPDFViewer: Outline loaded with ${items.length} items`);
        } else {
          onOutline([]);
          console.log(`📋 SmartPDFViewer: No outline found`);
        }
      } catch (error) {
        console.warn(`📋 SmartPDFViewer: Outline loading failed:`, error);
        onOutline?.([]);
      }
    }
  };

  const onDocumentLoadError = (err: unknown) => {
    const errorObj = err as any;
    const message = errorObj?.message || String(err);
    const name = errorObj?.name || 'PDFError';
    
    console.error("❌ SmartPDFViewer Document Load Error:", { name, message, err });
    
    // Set a more user-friendly error message
    const userMessage = message.includes('fetch') 
      ? `Failed to fetch PDF. Please check if the file exists and is accessible.`
      : message.includes('Invalid PDF')
      ? `Invalid PDF file. Please ensure the file is not corrupted.`
      : `PDF loading failed: ${message}`;
    
    setErrMsg(userMessage);
    setNumPages(0); // Explicitly set to 0 to avoid showing "?"
  };

  const onSourceError = (err: unknown) => {
    const errorObj = err as any;
    const message = errorObj?.message || String(err);
    const name = errorObj?.name || 'SourceError';
    
    console.error("❌ SmartPDFViewer Source Error:", { name, message, err });
    
    // Set a more user-friendly error message
    const userMessage = message.includes('NetworkError') || message.includes('fetch')
      ? `Network error loading PDF. Check your internet connection and try again.`
      : message.includes('cors')
      ? `CORS error loading PDF. The PDF source may not allow cross-origin requests.`
      : `PDF source error: ${message}`;
    
    setErrMsg(userMessage);
    setNumPages(0); // Explicitly set to 0 to avoid showing "?"
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));

  const handlePrevPage = () => {
    if (currentPage > 1) {
      const next = currentPage - 1;
      handlePageChangeWithSync(next, 'navigation');
      setPageInput(String(next));
    }
  };

  const handleNextPage = () => {
    if (currentPage < numPages) {
      const next = currentPage + 1;
      handlePageChangeWithSync(next, 'navigation');
      setPageInput(String(next));
    }
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(pageInput, 10);
    if (!Number.isNaN(pageNum) && pageNum >= 1 && pageNum <= numPages) {
      handlePageChangeWithSync(pageNum, 'navigation');
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

      <div 
        ref={pageContainerRef}
        className="relative flex justify-center items-start h-full overflow-auto p-4 transition-all duration-300"
      >
        {fileSpec ? (
          <div className="relative">
            <Document
              key={(fileSpec as any).url}
              file={fileSpec}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              onSourceError={onSourceError}
            >
              <Page pageNumber={currentPage} scale={zoom} renderTextLayer renderAnnotationLayer />
            </Document>
            
            {/* Highlight pulse animation overlay */}
            {highlightPulse && (
              <div 
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(255, 255, 0, 0.2) 0%, rgba(255, 255, 0, 0.1) 50%, transparent 100%)',
                  animation: 'pulse 1s ease-out',
                }}
              />
            )}
          </div>
        ) : (
          <p className="text-gray-400">📂 No PDF loaded.</p>
        )}
      </div>

      {errMsg && (
        <div className="absolute inset-x-4 bottom-4 bg-red-600 text-white rounded-lg p-4 shadow-lg z-40">
          <div className="flex items-start gap-3">
            <div className="text-xl">❌</div>
            <div className="flex-1">
              <div className="font-semibold mb-1">PDF Loading Failed</div>
              <div className="text-sm opacity-90">{errMsg}</div>
              <div className="mt-2 text-xs opacity-75">
                Try refreshing the page or uploading a different PDF file.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
