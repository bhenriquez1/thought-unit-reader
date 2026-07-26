// components/LazyPDFViewer.tsx
"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { useReaderSync } from "@/lib/readerSync";
import { usePDFLoading } from "@/lib/pdfLoadingManager";

const DEV = process.env.NODE_ENV === "development";

// Optimized worker configuration
try {
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
} catch {
  // Fallback handled by react-pdf
}

export type TocItem = {
  title: string;
  pageNumber?: number;
  items?: TocItem[];
};

export interface LazyPDFViewerProps {
  fileUrl: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  scale?: number;
  onTextSelect?: (text: string) => void;
  onPageCount?: (n: number) => void;
  onOutline?: (items: TocItem[]) => void;
}

// LRU-bounded caches — 50 entries each so they don't grow unboundedly over a session
const MAX_CACHE = 50;
function lruSet<K, V>(map: Map<K, V>, key: K, value: V) {
  if (map.size >= MAX_CACHE) map.delete(map.keys().next().value as K);
  map.set(key, value);
}

// Enhanced same-origin conversion with caching
const urlCache = new Map<string, string>();

function toSameOrigin(url: string): string {
  if (urlCache.has(url)) {
    return urlCache.get(url)!;
  }

  try {
    if (!/^https?:/i.test(url)) {
      lruSet(urlCache, url, url);
      return url;
    }
    if (typeof window !== "undefined") {
      const u = new URL(url);
      if (u.origin === window.location.origin) {
        lruSet(urlCache, url, url);
        return url;
      }
    }
    const proxiedUrl = `/api/proxy-pdf?url=${encodeURIComponent(url)}`;
    lruSet(urlCache, url, proxiedUrl);
    return proxiedUrl;
  } catch {
    lruSet(urlCache, url, url);
    return url;
  }
}

// Optimized outline resolver with caching
const outlineCache = new Map<string, TocItem[]>();

async function resolveOutline(
  pdf: PDFDocumentProxy,
  nodes: any[] | null | undefined,
  cacheKey: string
): Promise<TocItem[]> {
  if (outlineCache.has(cacheKey)) {
    return outlineCache.get(cacheKey)!;
  }

  if (!nodes || !nodes.length) {
    lruSet(outlineCache, cacheKey, []);
    return [];
  }

  const out: TocItem[] = [];

  for (const node of nodes) {
    let pageNumber: number | undefined = undefined;

    let dest: any = node?.dest;
    try {
      if (typeof dest === "string") dest = await (pdf as any).getDestination(dest);
      if (Array.isArray(dest) && dest.length) {
        const pageRef = dest[0];
        const index = await (pdf as any).getPageIndex(pageRef);
        if (Number.isFinite(index)) pageNumber = (index as number) + 1;
      }
    } catch {
      // Ignore resolution failures
    }

    const children = await resolveOutline(pdf, node.items || node.children, `${cacheKey}-${node.title}`);
    out.push({
      title: node?.title || "Untitled",
      pageNumber,
      items: children,
    });
  }

  lruSet(outlineCache, cacheKey, out);
  return out;
}

// Performance monitoring hook
function usePerformanceMonitor() {
  const [loadTime, setLoadTime] = useState<number>(0);
  const [renderTime, setRenderTime] = useState<number>(0);
  const startTime = useRef<number>(0);

  const startTimer = useCallback(() => {
    startTime.current = performance.now();
  }, []);

  const endTimer = useCallback((type: 'load' | 'render') => {
    const elapsed = performance.now() - startTime.current;
    if (type === 'load') {
      setLoadTime(elapsed);
    } else {
      setRenderTime(elapsed);
    }
  }, []);

  return { loadTime, renderTime, startTimer, endTimer };
}

export default React.memo(function LazyPDFViewer({
  fileUrl,
  currentPage,
  onPageChange,
  scale = 1.25,
  onTextSelect,
  onPageCount,
  onOutline,
}: LazyPDFViewerProps) {
  const [zoom, setZoom] = useState<number>(scale);
  const [pageInput, setPageInput] = useState<string>(String(Math.max(1, currentPage)));
  const [showToolbar, setShowToolbar] = useState<boolean>(true);
  
  // Page rendering optimization
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set([currentPage]));
  const [preloadRange, setPreloadRange] = useState<{start: number, end: number}>({start: currentPage, end: currentPage});
  
  const viewerRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { loadTime, renderTime, startTimer, endTimer } = usePerformanceMonitor();

  // PDF loading management with enhanced error handling
  const pdfLoadState = usePDFLoading(toSameOrigin(fileUrl), {
    onProgress: (progress) => {
      DEV && console.log(`📄 LazyPDFViewer: Loading progress ${progress}%`);
    }
  });

  // Enhanced sync integration
  const { 
    setPage, 
    startVisibleTextObserver, 
    stopVisibleTextObserver,
    syncPDFToChunk 
  } = useReaderSync();

  // Derived state from PDF loading manager
  const numPages = pdfLoadState.pageCount || 0;
  const isLoading = pdfLoadState.isLoading;
  const errMsg = pdfLoadState.error;

  // Update parent when page count is available
  useEffect(() => {
    if (pdfLoadState.pageCount !== null && pdfLoadState.pageCount > 0) {
      DEV && console.log(`✅ LazyPDFViewer: Page count available: ${pdfLoadState.pageCount}`);
      onPageCount?.(pdfLoadState.pageCount);
    }
  }, [pdfLoadState.pageCount, onPageCount]);

  // Handle outline extraction when document is loaded
  useEffect(() => {
    if (pdfLoadState.document && onOutline) {
      DEV && console.log(`📋 LazyPDFViewer: Extracting outline from loaded document`);
      
      const extractOutline = async () => {
        try {
          const raw = await (pdfLoadState.document as any).getOutline?.();
          if (raw?.length) {
            const cacheKey = `outline-${fileUrl}`;
            const items = await resolveOutline(pdfLoadState.document!, raw, cacheKey);
            onOutline(items);
            DEV && console.log(`📋 LazyPDFViewer: Outline extracted with ${items.length} items`);
          } else {
            onOutline([]);
            DEV && console.log(`📋 LazyPDFViewer: No outline found in document`);
          }
        } catch (error) {
          console.warn(`📋 LazyPDFViewer: Outline extraction failed:`, error);
          onOutline?.([]);
        }
      };

      extractOutline();
    }
  }, [pdfLoadState.document, onOutline, fileUrl]);

  // Update page input when currentPage changes - ensure it's never below 1
  useEffect(() => {
    const safePage = Math.max(1, currentPage);
    setPageInput(String(safePage));
    
    // Keep a sliding window of ±3 pages so large books never accumulate
    // hundreds of live page renders (each is an expensive canvas element).
    const windowStart = Math.max(1, currentPage - 3);
    const windowEnd = Math.min(numPages || currentPage + 3, currentPage + 3);
    setPreloadRange({ start: windowStart, end: windowEnd });

    setRenderedPages(() => {
      const next = new Set<number>();
      for (let p = windowStart; p <= windowEnd; p++) next.add(p);
      return next;
    });
  }, [currentPage, numPages]);

  // Enhanced page change handler with performance tracking
  const handlePageChangeWithSync = useCallback((newPage: number, source: 'scroll' | 'navigation' | 'programmatic' = 'navigation') => {
    DEV && console.log(`📄 LazyPDFViewer: Page change ${currentPage} -> ${newPage} (${source})`);
    
    // Ensure newPage is always at least 1
    const safePage = Math.max(1, newPage);
    
    // Validate page bounds - only proceed if PDF is loaded and we have valid page count
    if (!pdfLoadState.isLoaded || pdfLoadState.pageCount === null) {
      console.warn(`📄 LazyPDFViewer: PDF not loaded yet, cannot navigate to page ${safePage}`);
      return;
    }

    if (safePage > pdfLoadState.pageCount) {
      console.warn(`📄 LazyPDFViewer: Invalid page ${safePage}, max: ${pdfLoadState.pageCount}`);
      return;
    }
    
    startTimer();
    
    try {
      setPage(safePage, source === 'scroll' ? 'pdf' : 'manual');
      onPageChange(safePage);
      endTimer('render');
      DEV && console.log(`📄 LazyPDFViewer: Successfully navigated to page ${safePage}`);
    } catch (error) {
      console.error(`📄 LazyPDFViewer: Navigation error for page ${safePage}:`, error);
      // Fallback
      try {
        onPageChange(safePage);
        DEV && console.log(`📄 LazyPDFViewer: Fallback navigation succeeded`);
      } catch (fallbackError) {
        console.error(`📄 LazyPDFViewer: Fallback navigation failed:`, fallbackError);
      }
    }
  }, [currentPage, pdfLoadState.isLoaded, pdfLoadState.pageCount, setPage, onPageChange, startTimer, endTimer]);

  // Optimized visible text observer
  useEffect(() => {
    if (!pageContainerRef.current || !fileUrl) return;

    const container = pageContainerRef.current;
    
    const handleVisibleTextChange = (visibleText: string, topElement: HTMLElement | null) => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      
      syncTimeoutRef.current = setTimeout(() => {
        if (visibleText.length > 30) { // Reduced threshold for faster response
          syncPDFToChunk(container, [visibleText]).catch(error => {
            console.warn('PDF to chunk sync failed:', error);
          });
        }
      }, 100); // Reduced debounce time
    };

    startVisibleTextObserver(container, handleVisibleTextChange);

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      stopVisibleTextObserver();
    };
  }, [fileUrl, startVisibleTextObserver, stopVisibleTextObserver, syncPDFToChunk]);

  // Performance tracking for render operations
  const onPageRenderSuccess = useCallback(() => {
    endTimer('render');
    DEV && console.log(`📊 Page rendered in ${renderTime.toFixed(2)}ms`);
  }, [endTimer, renderTime]);

  // Optimized navigation handlers
  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.25, 3)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.25, 0.5)), []);

  const handlePrevPage = useCallback(() => {
    if (currentPage > 1) {
      const next = currentPage - 1;
      handlePageChangeWithSync(next, 'navigation');
      setPageInput(String(next));
    }
  }, [currentPage, handlePageChangeWithSync]);

  const handleNextPage = useCallback(() => {
    if (currentPage < numPages) {
      const next = currentPage + 1;
      handlePageChangeWithSync(next, 'navigation');
      setPageInput(String(next));
    }
  }, [currentPage, numPages, handlePageChangeWithSync]);

  const handlePageInputSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(pageInput, 10);
    const safePage = Math.max(1, Math.min(pageNum || 1, numPages || 1));
    
    if (!Number.isNaN(pageNum) && pageNum >= 1 && pageNum <= numPages) {
      handlePageChangeWithSync(pageNum, 'navigation');
    } else {
      // Reset to current page if invalid input
      const currentSafePage = Math.max(1, currentPage);
      setPageInput(String(currentSafePage));
    }
  }, [pageInput, numPages, handlePageChangeWithSync, currentPage]);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection()?.toString().trim();
    if (selection && onTextSelect) onTextSelect(selection);
  }, [onTextSelect]);


  return (
    <div
      className="relative h-full w-full bg-gray-900"
      ref={viewerRef}
      onMouseUp={handleMouseUp}
    >
      {/* Enhanced Loading Indicator */}
      {pdfLoadState.isLoading && (
        <div className="absolute inset-0 bg-gray-900 flex flex-col items-center justify-center z-50">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-4 animate-pulse">📄</div>
            <h3 className="text-xl font-bold mb-4 text-white">Loading PDF...</h3>
            
            {/* Progress Bar */}
            <div className="w-full bg-gray-700 rounded-full h-2 mb-4">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${pdfLoadState.progress}%` }}
              />
            </div>
            
            <p className="text-gray-400">
              {pdfLoadState.progress < 30 && "Fetching PDF..."}
              {pdfLoadState.progress >= 30 && pdfLoadState.progress < 60 && "Processing document..."}
              {pdfLoadState.progress >= 60 && pdfLoadState.progress < 95 && "Preparing pages..."}
              {pdfLoadState.progress >= 95 && "Almost ready!"}
            </p>
          </div>
        </div>
      )}

      {/* Toolbar */}
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
            <span className="ml-1 text-sm">
              / {pdfLoadState.pageCount !== null ? pdfLoadState.pageCount : 
                  pdfLoadState.isLoading ? '...' : '?'}
            </span>
          </form>
          <button
            onClick={handleNextPage}
            disabled={numPages === 0 || currentPage >= numPages}
            aria-label="Next page"
          >
            ▶
          </button>
          
          {/* Performance indicator */}
          {loadTime > 0 && renderTime > 0 && (
            <div className="ml-2 text-xs text-green-400" title="Load/Render time">
              ⚡ {loadTime.toFixed(0)}/{renderTime.toFixed(0)}ms
            </div>
          )}
          
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

      {/* PDF Container with Lazy Loading */}
      <div 
        ref={pageContainerRef}
        className="relative flex justify-center items-start h-full overflow-auto p-4"
      >
        {pdfLoadState.hasError ? (
          <div className="p-8 text-center">
            <div className="text-red-600 mb-4">
              <div className="text-6xl mb-4">📄❌</div>
              <h3 className="text-lg font-semibold mb-2">PDF Loading Error</h3>
              <p className="text-sm text-gray-400 mb-4">{pdfLoadState.error}</p>
              <button
                onClick={() => pdfLoadState.retry()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded"
              >
                🔄 Try Again
              </button>
            </div>
          </div>
        ) : pdfLoadState.isLoaded && pdfLoadState.document ? (
          <div className="relative">
            {/* Render current page and preloaded pages */}
            {Array.from(renderedPages).map(pageNum => (
              <Page
                key={`${fileUrl}-${pageNum}`}
                pdf={pdfLoadState.document}
                pageNumber={pageNum}
                scale={zoom}
                renderTextLayer={pageNum === currentPage} // Only render text layer for current page
                renderAnnotationLayer={pageNum === currentPage} // Only render annotations for current page
                onRenderSuccess={pageNum === currentPage ? onPageRenderSuccess : undefined}
                loading={pageNum === currentPage ? 
                  <div className="flex items-center justify-center p-8">
                    <div className="animate-spin text-2xl">⏳</div>
                  </div> : 
                  null
                }
                className={pageNum === currentPage ? 'block' : 'hidden'}
              />
            ))}
          </div>
        ) : !pdfLoadState.isLoading ? (
          <p className="text-gray-400">📂 No PDF loaded.</p>
        ) : null}
      </div>

      
      {/* Memory usage indicator (development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute left-4 top-4 bg-black/60 text-white text-xs rounded px-2 py-1 shadow z-40">
          Pages rendered: {renderedPages.size}/{numPages || '?'}
        </div>
      )}
    </div>
  );
});
