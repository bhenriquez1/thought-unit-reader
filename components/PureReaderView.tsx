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
import type { HighlightNeighborhood } from '@/lib/highlights/buildHighlightNeighborhoods';

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
  highlightTargets?: HighlightTarget[];
  highlightNeighborhoods?: HighlightNeighborhood[];
  /** AI-selected anchor texts from synthesis — when present, displayed as a separate highlight tier */
  aiHighlightTexts?: string[];
  /** Full anchor objects from synthesis — preferred over aiHighlightTexts; includes anchorType for legend */
  aiHighlightAnchors?: import("@/lib/insights/synthesizeTeachingOutput").SynthHighlightAnchor[];
  focusedEvidenceId?: string | null;
  onEvidenceFocus?: (id: string) => void;
  onOpenFocusCycle?: () => void;
  /** Live per-page text extracted from the PDF text layer. Forwarded to SmartPDFViewer. */
  onPageTextExtracted?: (page: number, text: string) => void;
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
  highlightTargets,
  highlightNeighborhoods,
  aiHighlightTexts,
  aiHighlightAnchors,
  focusedEvidenceId,
  onEvidenceFocus,
  onOpenFocusCycle,
  onPageTextExtracted,
}: PureReaderViewProps) {
  // Global zoom store
  const { zoom } = useZoomStore();
  const [isPageChanging, setIsPageChanging] = useState(false);

  // Map AI anchor types to ParagraphKind for highlight legend colors.
  const anchorTypeToKind = (anchorType: string): import("@/lib/readerContracts").ParagraphKind => {
    switch (anchorType) {
      case "mechanism":    return "mechanism";
      case "formula":      return "formula";
      case "clinicalTrap": return "clinical";
      case "application":  return "application";
      default:             return "definition"; // thesis, definition, examSignal
    }
  };

  // When AI anchors exist, convert them to HighlightTarget[] and suppress heuristic main highlights.
  // Prefer full anchor objects (aiHighlightAnchors) over plain text (aiHighlightTexts).
  // AI anchors take precedence; heuristic "support"/"additional"/"trap" tiers are kept as-is.
  const effectiveHighlightTargets: HighlightTarget[] | undefined = (() => {
    const anchors = aiHighlightAnchors?.length ? aiHighlightAnchors : null;
    const texts   = !anchors && aiHighlightTexts?.length ? aiHighlightTexts : null;
    if (!anchors && !texts) return []; // No heuristic fallback — OpenAI owns the left panel

    const aiTargets: HighlightTarget[] = anchors
      ? anchors.map((a, i) => ({
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
        }))
      : texts!.map((text, i) => ({
          id:                   `ai-anchor-${i}`,
          page:                 currentPage,
          text,
          normalizedText:       text,
          level:                "important" as const,
          score:                100 - i,
          sourceParagraphIndex: 0,
          kind:                 "definition" as const,
          evidenceRefId:        `ai-anchor-${i}`,
        }));

    console.log("[HIGHLIGHT:converted]", {
      source: anchors ? "anchors" : "texts",
      count: aiTargets.length,
      kinds: aiTargets.map((t) => t.kind),
    });
    return aiTargets; // OpenAI owns the left panel — no heuristic mixing
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
      <div className="flex-1 overflow-auto bg-gray-950">
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
          highlightTargets={effectiveHighlightTargets}
          highlightNeighborhoods={aiHighlightAnchors?.length ? undefined : highlightNeighborhoods}
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
