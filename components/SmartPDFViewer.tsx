// components/SmartPDFViewer.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api"; // ✅ correct type source
import { useReaderSync } from "@/lib/readerSync";
import { usePDFLoading } from "@/lib/pdfLoadingManager";
import type { HighlightTarget } from "@/lib/readerContracts";
import PdfEvidenceOverlay, { type OverlayRect } from "@/components/pdf/PdfEvidenceOverlay";

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
  /** Stable document ID used to key the <Page> for reliable re-mounts. Falls back to fileUrl. */
  docId?: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  scale?: number;
  onTextSelect?: (text: string) => void;
  onPageCount?: (n: number) => void;
  /** Emit PDF outline/bookmarks with resolved page numbers */
  onOutline?: (items: TocItem[]) => void;
  /**
   * Called (debounced, ~200 ms) whenever the most-visible paragraph in the
   * rendered text layer changes. The argument is a ~60-char text snippet from
   * that paragraph, or null when no paragraph is visible.
   * Use this to drive PDF scroll → insights-panel sync without DOM overlays.
   */
  onActiveParagraphChange?: (snippet: string | null) => void;
  /** Focus and scroll to a snippet from right-panel evidence cards. */
  focusSnippet?: string | null;
  highlightTargets?: HighlightTarget[];
  focusedEvidenceId?: string | null;
  onEvidenceFocus?: (evidenceId: string) => void;
  /** External page change lock to prevent observer feedback loops while rendering */
  isPageChanging?: boolean;
  /** Fires when the currently requested page render completes */
  onPageRenderComplete?: (page: number) => void;
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
  docId,
  currentPage,
  onPageChange,
  scale = 1.25,
  onTextSelect,
  onPageCount,
  onOutline,
  onActiveParagraphChange,
  focusSnippet,
  highlightTargets,
  focusedEvidenceId,
  onEvidenceFocus,
  isPageChanging = false,
  onPageRenderComplete,
}: SmartPDFViewerProps) {
  // Stable key root: prefer explicit docId, fall back to fileUrl
  const pageKeyRoot = docId ?? fileUrl;
  // Use scale prop directly - parent controls zoom
  // Only use internal zoom if no scale prop provided
  const [internalZoom, setInternalZoom] = useState<number>(scale);
  
  // Sync internal zoom with scale prop changes
  useEffect(() => {
    setInternalZoom(scale);
  }, [scale]);
  
  // Use the effective zoom (prop takes precedence)
  const effectiveZoom = scale;
  
  const [pageInput, setPageInput] = useState<string>(String(currentPage));
  const [showToolbar, setShowToolbar] = useState<boolean>(true);
  const [highlightPulse, setHighlightPulse] = useState<boolean>(false);
  const [overlayRects, setOverlayRects] = useState<OverlayRect[]>([]);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const paragraphScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll → active paragraph detection (no DOM overlays, no IntersectionObserver overhead)
  // Attaches once to the PDF scroll container; debounces at 200 ms.
  useEffect(() => {
    if (!onActiveParagraphChange) return;
    const container = viewerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (isPageChanging) return;
      if (paragraphScrollTimerRef.current) {
        clearTimeout(paragraphScrollTimerRef.current);
      }
      paragraphScrollTimerRef.current = setTimeout(() => {
        // Find text layer spans in the rendered page
        const textLayer = container.querySelector(
          '.react-pdf__Page__textContent, .textLayer'
        );
        if (!textLayer) {
          onActiveParagraphChange(null);
          return;
        }

        const spans = Array.from(textLayer.querySelectorAll('span')) as HTMLElement[];
        if (!spans.length) {
          onActiveParagraphChange(null);
          return;
        }

        // Find the span closest to the vertical centre of the viewport
        const vpMid = window.scrollY + window.innerHeight / 2;
        let bestSpan: HTMLElement | null = null;
        let bestDist = Infinity;

        for (const span of spans) {
          const rect = span.getBoundingClientRect();
          const spanMid = window.scrollY + rect.top + rect.height / 2;
          const dist = Math.abs(spanMid - vpMid);
          if (dist < bestDist) {
            bestDist = dist;
            bestSpan = span;
          }
        }

        if (!bestSpan) {
          onActiveParagraphChange(null);
          return;
        }

        // Collect text from nearby spans (within ±30 px vertically) to form a paragraph snippet
        const bestRect = bestSpan.getBoundingClientRect();
        const bestTop = window.scrollY + bestRect.top;
        const rangeY = 30;
        let snippet = '';
        for (const span of spans) {
          const r = span.getBoundingClientRect();
          const top = window.scrollY + r.top;
          if (Math.abs(top - bestTop) <= rangeY) {
            snippet += (span.textContent || '') + ' ';
            if (snippet.length > 120) break;
          }
        }
        snippet = snippet.trim().slice(0, 80);
        onActiveParagraphChange(snippet || null);
      }, 200);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (paragraphScrollTimerRef.current) clearTimeout(paragraphScrollTimerRef.current);
    };
  }, [isPageChanging, onActiveParagraphChange]);

  useEffect(() => {
    if (!focusSnippet) return;
    const container = viewerRef.current;
    if (!container) return;
    const query = focusSnippet.trim().toLowerCase();
    if (query.length < 12) return;
    const spans = Array.from(container.querySelectorAll('.react-pdf__Page__textContent span, .textLayer span')) as HTMLElement[];
    if (!spans.length) return;
    const needle = query.slice(0, 42);
    const target = spans.find((span) => (span.textContent || "").toLowerCase().includes(needle));
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.add("bg-yellow-300", "text-black", "rounded", "px-0.5");
    const timer = window.setTimeout(() => {
      target.classList.remove("bg-yellow-300", "text-black", "rounded", "px-0.5");
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [focusSnippet, currentPage]);

  useEffect(() => {
    const container = viewerRef.current;
    if (!container || !highlightTargets?.length) {
      setOverlayRects([]);
      return;
    }
    let attempts = 0;
    let cancelled = false;
    const renderRects = () => {
      if (cancelled) return;
      const textLayer = container.querySelector('.react-pdf__Page__textContent, .textLayer');
      if (!textLayer) {
        if (attempts < 10) {
          attempts += 1;
          window.setTimeout(renderRects, 120 + attempts * 40);
        } else {
          console.warn("SmartPDFViewer: highlight targets available but text layer was not mounted.");
          setOverlayRects([]);
        }
        return;
      }
      const layerRect = (textLayer as HTMLElement).getBoundingClientRect();
      const spans = Array.from(textLayer.querySelectorAll("span")) as HTMLElement[];
      if (!spans.length) {
        if (attempts < 10) {
          attempts += 1;
          window.setTimeout(renderRects, 120 + attempts * 40);
        } else {
          console.warn("SmartPDFViewer: text layer mounted but no spans for highlight matching.");
          setOverlayRects([]);
        }
        return;
      }
      const rects: OverlayRect[] = [];

      // Build a concatenated-text index so we can match multi-word phrases
      // across adjacent word-spans (react-pdf renders each word as its own span).
      const spanNorm = spans.map((s) =>
        (s.textContent || "")
          .toLowerCase()
          .replace(/\u00ad/g, "")      // soft hyphens
          .replace(/[^\w\s]/g, " ")    // punctuation → space
          .replace(/\s+/g, " ")
          .trim(),
      );
      const offsets: number[] = [];
      let cursor = 0;
      for (const t of spanNorm) { offsets.push(cursor); cursor += t.length + 1; }
      const concatText = spanNorm.join(" ");

      function spansForNeedle(needle: string): HTMLElement[] {
        const idx = concatText.indexOf(needle);
        if (idx === -1) return [];
        const end = idx + needle.length;
        return spans.filter((_, i) => offsets[i] + spanNorm[i].length > idx && offsets[i] < end);
      }

      function rectFromSpans(matched: HTMLElement[]): { top: number; left: number; width: number; height: number } | null {
        if (!matched.length) return null;
        const dr = matched.map((s) => s.getBoundingClientRect());
        const top = Math.min(...dr.map((r) => r.top)) - layerRect.top;
        const left = Math.min(...dr.map((r) => r.left)) - layerRect.left;
        const bottom = Math.max(...dr.map((r) => r.bottom)) - layerRect.top;
        const right = Math.max(...dr.map((r) => r.right)) - layerRect.left;
        return { top, left, width: right - left, height: Math.max(14, bottom - top) };
      }

      highlightTargets.forEach((target) => {
        // Normalize needle the same way we normalized span text
        const fullNeedle = target.normalizedText
          .replace(/[^\w\s]/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        // Try progressively shorter prefixes: full → 6 words → 4 words → 3 words → 1 long keyword
        const words = fullNeedle.split(" ").filter(Boolean);
        const candidates = [
          words.slice(0, 8).join(" "),
          words.slice(0, 6).join(" "),
          words.slice(0, 4).join(" "),
          words.filter((w) => w.length >= 4).slice(0, 3).join(" "),
          words.filter((w) => w.length >= 6).slice(0, 3).join(" "),
          words.filter((w) => w.length >= 5).slice(0, 2).join(" "),
          words.slice(-4).join(" "),
        ].filter((n) => n.length >= 4);

        let matchedSpans: HTMLElement[] = [];
        for (const needle of candidates) {
          matchedSpans = spansForNeedle(needle);
          if (matchedSpans.length) break;
        }

        // Fallback: try support/evidence strings forwarded from the highlight block
        if (!matchedSpans.length && (target.support?.length || target.evidence?.length)) {
          for (const fallback of [...(target.support ?? []), ...(target.evidence ?? [])]) {
            if (!fallback || fallback.length < 12) continue;
            const fallbackNorm = fallback
              .toLowerCase()
              .replace(/\u00ad/g, "")
              .replace(/[^\w\s]/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            const fbWords = fallbackNorm.split(" ").filter(Boolean);
            const fbCandidates = [
              fbWords.slice(0, 6).join(" "),
              fbWords.slice(0, 4).join(" "),
              fbWords.filter((w) => w.length >= 4).slice(0, 3).join(" "),
            ].filter((n) => n.length >= 4);
            for (const needle of fbCandidates) {
              matchedSpans = spansForNeedle(needle);
              if (matchedSpans.length) break;
            }
            if (matchedSpans.length) break;
          }
        }

        if (!matchedSpans.length) return;

        const geo = rectFromSpans(matchedSpans.slice(0, 12));
        if (!geo) return;
        rects.push({ id: target.evidenceRefId, level: target.level, semanticKind: target.kind as OverlayRect["semanticKind"], ...geo });
      });
      if (!rects.length && highlightTargets.length > 0 && attempts < 10) {
        attempts += 1;
        window.setTimeout(renderRects, 140 + attempts * 40);
        return;
      }
      if (!rects.length && highlightTargets.length > 0) {
        console.warn("SmartPDFViewer: highlight matching completed with zero overlays.");
      }
      setOverlayRects(rects);
    };
    window.requestAnimationFrame(renderRects);
    return () => {
      cancelled = true;
    };
  }, [highlightTargets, currentPage]);

  // Enhanced PDF loading with robust error handling
  const {
    status: loadingStatus,
    progress,
    pageCount,
    error: loadingError,
    document: pdfDocument,
    isLoading,
    isLoaded,
    hasError,
    retry
  } = usePDFLoading(toSameOrigin(fileUrl));

  // Enhanced sync integration
  const { 
    setPage, 
    startVisibleTextObserver, 
    stopVisibleTextObserver,
    syncPDFToChunk 
  } = useReaderSync();

  // Update parent when page count is available
  useEffect(() => {
    if (pageCount !== null && pageCount > 0) {
      console.log(`✅ SmartPDFViewer: Page count available: ${pageCount}`);
      onPageCount?.(pageCount);
    }
  }, [pageCount, onPageCount]);

  // Handle outline extraction when document is loaded
  useEffect(() => {
    if (pdfDocument && onOutline) {
      console.log(`📋 SmartPDFViewer: Extracting outline from loaded document`);
      
      const extractOutline = async () => {
        try {
          const raw = await (pdfDocument as any).getOutline?.();
          if (raw?.length) {
            const items = await resolveOutline(pdfDocument, raw);
            onOutline(items);
            console.log(`📋 SmartPDFViewer: Outline extracted with ${items.length} items`);
          } else {
            onOutline([]);
            console.log(`📋 SmartPDFViewer: No outline found in document`);
          }
        } catch (error) {
          console.warn(`📋 SmartPDFViewer: Outline extraction failed:`, error);
          onOutline?.([]);
        }
      };

      extractOutline();
    }
  }, [pdfDocument, onOutline]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  // Enhanced page change handler with sync integration and fallback
  const handlePageChangeWithSync = (newPage: number, source: 'scroll' | 'navigation' | 'programmatic' = 'navigation') => {
    if (isPageChanging) return;
    console.log(`📄 SmartPDFViewer: Page change ${currentPage} -> ${newPage} (${source})`);
    
    // Validate page bounds - only proceed if PDF is loaded and we have valid page count
    if (!isLoaded || pageCount === null) {
      console.warn(`📄 SmartPDFViewer: PDF not loaded yet, cannot navigate to page ${newPage}`);
      return;
    }

    if (newPage < 1 || newPage > pageCount) {
      console.warn(`📄 SmartPDFViewer: Invalid page ${newPage}, bounds: 1-${pageCount}`);
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
      if (isPageChanging) return;
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
  }, [fileUrl, isPageChanging, startVisibleTextObserver, stopVisibleTextObserver, syncPDFToChunk]);

  const handleZoomIn = () => setInternalZoom((z) => Math.min(z + 0.25, 2.5));
  const handleZoomOut = () => setInternalZoom((z) => Math.max(z - 0.25, 0.6));

  const handlePrevPage = () => {
    if (currentPage > 1) {
      const next = currentPage - 1;
      handlePageChangeWithSync(next, 'navigation');
      setPageInput(String(next));
    }
  };

  const handleNextPage = () => {
    if (pageCount && currentPage < pageCount) {
      const next = currentPage + 1;
      handlePageChangeWithSync(next, 'navigation');
      setPageInput(String(next));
    }
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(pageInput, 10);
    if (!Number.isNaN(pageNum) && pageNum >= 1 && pageCount && pageNum <= pageCount) {
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
      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 bg-gray-900/95 flex items-center justify-center z-50">
          <div className="text-center text-white">
            <div className="text-4xl mb-4 animate-pulse">📄</div>
            <h3 className="text-lg font-semibold mb-2">Loading PDF...</h3>
            <div className="w-64 bg-gray-700 rounded-full h-2 mb-4">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm opacity-75">{progress}% complete</p>
          </div>
        </div>
      )}

      {/* Toolbar - Only show when loaded */}
      {isLoaded && showToolbar && (
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
            <span className="ml-1 text-sm">/ {pageCount || "Loading..."}</span>
          </form>
          <button
            onClick={handleNextPage}
            disabled={!pageCount || currentPage >= pageCount}
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
      )}

      {/* Toolbar toggle when hidden - Only show when loaded */}
      {isLoaded && !showToolbar && (
        <button
          onClick={() => setShowToolbar(true)}
          className="absolute top-4 right-4 bg-yellow-500 text-black px-2 py-1 rounded-lg shadow-lg z-50"
          aria-label="Show toolbar"
        >
          ⚙
        </button>
      )}

      {/* Main Content */}
      <div 
        ref={pageContainerRef}
        className="relative flex justify-center items-start h-full overflow-auto p-4 transition-all duration-300"
      >
        {/* Defensive rendering: Only render Page when ALL conditions are met */}
        {(() => {
          // Guard 1: Must be loaded
          if (!isLoaded) {
            return !isLoading && !hasError ? (
              <p className="text-gray-400">📂 No PDF loaded.</p>
            ) : null;
          }
          
          // Guard 2: Document must exist
          if (!pdfDocument) {
            console.warn('SmartPDFViewer: isLoaded but no pdfDocument');
            return <p className="text-gray-400">⚠️ Document not available.</p>;
          }
          
          // Guard 3: Page count must be valid
          if (typeof pageCount !== 'number' || pageCount <= 0) {
            console.warn('SmartPDFViewer: Invalid pageCount:', pageCount);
            return <p className="text-gray-400">⚠️ Document has no pages.</p>;
          }
          
          // Guard 4: Current page must be within bounds
          if (currentPage < 1 || currentPage > pageCount) {
            console.warn('SmartPDFViewer: currentPage out of bounds:', currentPage, '/', pageCount);
            return <p className="text-gray-400">⚠️ Invalid page number.</p>;
          }
          
          // All guards passed - safe to render Page
          const prefetchPage = currentPage < pageCount ? currentPage + 1 : null;
          return (
            <div className="relative">
              <Page
                key={`${pageKeyRoot}:${currentPage}`}
                pdf={pdfDocument}
                pageNumber={currentPage}
                scale={effectiveZoom}
                renderTextLayer
                renderAnnotationLayer={false}
                loading={
                  <div className="flex items-center justify-center p-8">
                    <div className="text-gray-400">Loading page {currentPage}...</div>
                  </div>
                }
                error={
                  <div className="flex items-center justify-center p-8">
                    <div className="text-red-400">Failed to render page {currentPage}</div>
                  </div>
                }
                onRenderSuccess={() => onPageRenderComplete?.(currentPage)}
                onRenderError={(error) => {
                  console.error(`SmartPDFViewer: Page ${currentPage} render error:`, error);
                }}
              />

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

              {overlayRects.length > 0 && (
                <>
                  {/* Dim veil sits below the evidence overlay (z-[19] < z-20).
                      Non-highlighted text recedes; decoded blocks jump forward. */}
                  <div
                    className="pointer-events-none absolute inset-0 z-[19] bg-slate-900/20"
                    aria-hidden
                  />
                  <PdfEvidenceOverlay
                    rects={overlayRects}
                    focusedId={focusedEvidenceId}
                    onFocus={onEvidenceFocus}
                  />
                </>
              )}

              {/* Hidden prefetch: pre-warm react-pdf render cache for page N+1 */}
              {prefetchPage !== null && (
                <div
                  aria-hidden="true"
                  style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', top: 0, left: 0, width: 1, height: 1, overflow: 'hidden' }}
                >
                  <Page
                    key={`${pageKeyRoot}:${prefetchPage}:prefetch`}
                    pdf={pdfDocument}
                    pageNumber={prefetchPage}
                    scale={effectiveZoom}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    loading={null}
                    error={null}
                    onRenderError={() => {/* silently ignore prefetch errors */}}
                  />
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Error State */}
      {hasError && (
        <div className="absolute inset-x-4 bottom-4 bg-red-600 text-white rounded-lg p-4 shadow-lg z-40">
          <div className="flex items-start gap-3">
            <div className="text-xl">❌</div>
            <div className="flex-1">
              <div className="font-semibold mb-1">PDF Loading Failed</div>
              <div className="text-sm opacity-90 mb-4">{loadingError}</div>
              <button
                onClick={retry}
                className="bg-white text-red-600 px-4 py-2 rounded font-medium hover:bg-gray-100 transition-colors"
              >
                🔄 Try Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
