"use client";

// components/PureReaderView.tsx
// PURE READER MODE - PDF ONLY, no thought units, no annotations, no TOC
// ❌ No Surgeon View elements
// ❌ No TOC sidebar
// ❌ No NoteLab
// ❌ No Thought Units (those belong in Surgeon View)
// ✅ Uses global zoom store for shared zoom across views

import React, { useCallback, useState } from 'react';
import SmartPDFViewer, { type TocItem } from './SmartPDFViewer';
import { useZoomStore } from '@/lib/stores/zoomStore';
import type { HighlightTarget } from '@/lib/readerContracts';

interface PureReaderViewProps {
  fileUrl: string | null;
  /** Stable document ID forwarded to SmartPDFViewer for reliable Page keying */
  docId?: string;
  currentPage: number;
  pdfPageCount: number;
  onPageChange: (page: number) => void;
  onPageCount: (count: number) => void;
  onTextSelect?: (text: string) => void;
  onOutline?: (items: TocItem[]) => void;
  fontSize?: number;
  fontFamily?: string;
  /** Forwarded to SmartPDFViewer for scroll → active paragraph detection */
  onActiveParagraphChange?: (snippet: string | null) => void;
  focusSnippet?: string | null;
  /** Highlight anchors from currentPageStudyModel — single source of truth */
  aiHighlightAnchors?: import("@/lib/insights/synthesizeTeachingOutput").SynthHighlightAnchor[];
  focusedEvidenceId?: string | null;
  onEvidenceFocus?: (id: string) => void;
  onOpenFocusCycle?: () => void;
  /** Live per-page text extracted from the PDF text layer. Forwarded to SmartPDFViewer. */
  onPageTextExtracted?: (page: number, text: string) => void;
  /** Raw text of the current page — used to validate highlight anchors before rendering */
  pageText?: string;
  /** Synthesis loading status — used to show "Reading page..." overlay until highlights arrive */
  synthStatus?: "loading" | "ready";
}

export default function PureReaderView({
  fileUrl,
  docId,
  currentPage,
  pdfPageCount,
  onPageChange,
  onPageCount,
  onTextSelect,
  onOutline,
  fontSize = 16,
  fontFamily = 'Georgia',
  onActiveParagraphChange,
  focusSnippet,
  aiHighlightAnchors,
  focusedEvidenceId,
  onEvidenceFocus,
  onOpenFocusCycle,
  onPageTextExtracted,
  pageText,
  synthStatus,
}: PureReaderViewProps) {
  // Global zoom store
  const { zoom } = useZoomStore();
  const [isPageChanging, setIsPageChanging] = useState(false);

  // Map AI anchor types to ParagraphKind for highlight legend colors.
  const anchorTypeToKind = (anchorType: string): import("@/lib/readerContracts").ParagraphKind => {
    switch (anchorType) {
      // Current 5-role system
      case "thesis":       return "thesis";
      case "definition":   return "definition";
      case "mechanism":    return "mechanism";
      case "trap":         return "trap";
      case "application":  return "application";
      // Backward compat for old anchor types
      case "memoryAnchor": return "definition";
      case "formula":      return "definition";
      case "clinicalTrap": return "trap";
      case "examSignal":   return "thesis";
      default:             return "thesis";
    }
  };

  // Convert aiHighlightAnchors (from currentPageStudyModel) to HighlightTarget[].
  // No fallback paths — studyModel is the single source of truth.
  const effectiveHighlightTargets: HighlightTarget[] = (() => {
    if (!aiHighlightAnchors?.length) return [];

    const aiTargets: HighlightTarget[] = aiHighlightAnchors.map((a, i) => ({
          id:                   `ai-anchor-${i}`,
          page:                 currentPage,
          text:                 a.text,
          // Pass raw text — SmartPDFViewer applies normForMatch() before matching,
          // which handles ligatures (ﬁ→fi) correctly. Pre-normalizing here would
          // strip ligatures to nothing before normForMatch can convert them.
          normalizedText:       a.text,
          level:                "important" as const,
          score:                100 - i,
          sourceParagraphIndex: 0,
          kind:                 anchorTypeToKind(a.anchorType),
          evidenceRefId:        `ai-anchor-${i}`,
        }));

    // Validate: reject anchors whose text does not appear in the current raw page text.
    // This prevents template/example phrases from the prompt from leaking as highlights.
    const validated = (pageText && pageText.length > 0)
      ? aiTargets.filter((t) => {
          const norm = (s: string) =>
            s.toLowerCase()
              .replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl')
              .replace(/ﬀ/g, 'ff').replace(/ﬃ/g, 'ffi')
              .replace(/['']/g, "'").replace(/[""]/g, '"')
              .replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
          const found = norm(pageText).includes(norm(t.text));
          if (!found) {
            console.warn("[HIGHLIGHT:rejected] not found in page text:", t.text.slice(0, 60));
          }
          return found;
        })
      : aiTargets;

    console.log("[HIGHLIGHT:converted]", {
      total: aiTargets.length,
      valid: validated.length,
      rejected: aiTargets.length - validated.length,
      kinds: validated.map((t) => t.kind),
    });
    return validated;
  })();

  const navigateToPage = useCallback((page: number) => {
    if (isPageChanging || page === currentPage) return;
    setIsPageChanging(true);
    onPageChange(page);
  }, [currentPage, isPageChanging, onPageChange]);

  const handlePrevPage = useCallback(() => {
    if (currentPage > 1) navigateToPage(currentPage - 1);
  }, [currentPage, navigateToPage]);

  const handleNextPage = useCallback(() => {
    if (currentPage < pdfPageCount) navigateToPage(currentPage + 1);
  }, [currentPage, pdfPageCount, navigateToPage]);

  // No file uploaded
  if (!fileUrl) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-white" data-testid="pure-reader-empty">
        <div className="text-center max-w-lg">
          <div className="text-6xl mb-4">📖</div>
          <h2 className="text-2xl font-bold mb-2">Pure Reader Mode</h2>
          <p className="text-gray-400 mb-6">Distraction-free PDF reading experience</p>
          <div className="text-sm text-gray-500 space-y-1">
            <p>• Clean PDF viewing without annotations</p>
            <p>• Use Surgeon View for highlighting & notes</p>
            <p>• Use TOC tab for navigation</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-900" data-testid="pure-reader-view">
      {/* Minimal Toolbar - Only essential reading controls */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        {/* Page Navigation */}
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrevPage}
            disabled={isPageChanging || currentPage <= 1}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm transition-colors"
            data-testid="prev-page-btn"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-300 font-medium">
            Page {currentPage} of {pdfPageCount || '...'} {isPageChanging ? '• loading…' : ''}
          </span>
          <button
            onClick={handleNextPage}
            disabled={isPageChanging || currentPage >= pdfPageCount}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm transition-colors"
            data-testid="next-page-btn"
          >
            Next →
          </button>
        </div>

        {/* Focus Cycle */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenFocusCycle}
            className="px-3 py-1 bg-purple-700 hover:bg-purple-600 rounded text-sm"
            title="Open Focus Cycle"
          >
            ⏱ Focus Cycle
          </button>
        </div>

        {/* Mode indicator */}
        <div className="text-xs text-gray-500">
          📖 Reader Mode
        </div>
      </div>

      {/* PDF Viewer - FULL WIDTH, no split */}
      <div className="flex-1 overflow-auto bg-gray-950 relative">
        {synthStatus === "loading" && (
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              zIndex: 20,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(10,26,24,0.92)",
              border: "1px solid rgba(52,211,153,0.3)",
              borderRadius: 20,
              padding: "4px 10px",
              pointerEvents: "none",
            }}
          >
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            <span style={{ fontSize: 11, color: "rgb(110,231,183)", fontWeight: 600, letterSpacing: "0.03em" }}>
              Reading current page…
            </span>
          </div>
        )}
        <SmartPDFViewer
          fileUrl={fileUrl}
          docId={docId}
          currentPage={currentPage}
          scale={zoom}
          onPageChange={navigateToPage}
          onPageCount={onPageCount}
          onTextSelect={onTextSelect}
          onOutline={onOutline}
          onActiveParagraphChange={onActiveParagraphChange}
          focusSnippet={focusSnippet}
          highlightTargets={(() => {
            console.log("[WIRE] SmartPDFViewer anchors", { page: currentPage, count: effectiveHighlightTargets?.length ?? 0, texts: effectiveHighlightTargets?.map(t => t.text?.slice(0, 40)) ?? [] });
            return effectiveHighlightTargets;
          })()}
          highlightNeighborhoods={undefined}
          highlightKey={`${currentPage}:${effectiveHighlightTargets?.map(t => t.text).join("|") ?? ""}`}
          authorizedHighlightIds={effectiveHighlightTargets?.map(t => t.evidenceRefId) ?? []}
          focusedEvidenceId={focusedEvidenceId}
          onEvidenceFocus={onEvidenceFocus}
          isPageChanging={isPageChanging}
          onPageRenderComplete={() => setIsPageChanging(false)}
          onPageTextExtracted={onPageTextExtracted}
        />
      </div>
    </div>
  );
}
