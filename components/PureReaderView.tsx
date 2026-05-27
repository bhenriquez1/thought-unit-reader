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
import type { RenderGuidedReadingPathResult } from '@/lib/highlights/renderGuidedReadingPath';

// Universal specificity scorer — subject-agnostic ranking of anchor quality.
// Higher score = more specific, more informative, better highlight candidate.
// This is a client-side guard: OpenAI already applies similar logic, but this
// catches anything that slips through and reorders anchors before rendering.
function universalSpecificityScore(
  text: string,
  pageText: string,
  anchorType: string
): number {
  let score = 0;
  const lower = text.toLowerCase().trim();
  const words = lower.split(/\s+/).filter(Boolean);

  // Token length: longer phrases are more specific (cap at 24pts for 12+ words)
  score += Math.min(words.length * 2, 24);

  // Causal / relational language
  if (/\b(causes?|caused by|leads? to|results? in|because|therefore|due to|since|thus|hence|produces?|triggers?|inhibits?|activates?|stimulates?|converts?|transforms?|prevents?|blocks?|reduces?|increases?|decreases?|promotes?|requires?|depends? on|is responsible for|accounts? for|underlies?|mediates?)\b/.test(lower)) {
    score += 8;
  }

  // Numbers, thresholds, formulas, units
  if (/\d/.test(text)) score += 6;
  if (/%|mg|ml|mmol|μg|μmol|≤|≥|>|<|°C|°F|pH\s*\d/.test(text)) score += 4;

  // Contrast / exception language
  if (/\b(however|but|unlike|not\b|except|contrast|versus|vs\.|differ|whereas|although|despite|while\b|rather than|instead of)\b/.test(lower)) {
    score += 5;
  }

  // Internal capitalized words (named entities: molecules, diseases, people, places)
  const wordTokens = text.trim().split(/\s+/);
  const internalCaps = wordTokens.slice(1).filter(w => /^[A-Z][a-z]{2,}/.test(w)).length;
  score += Math.min(internalCaps * 3, 9);

  // Role bonus: mechanism/trap/application carry more instructional weight than generic labels
  if (anchorType === "mechanism") score += 6;
  if (anchorType === "trap")      score += 5;
  if (anchorType === "application") score += 4;

  // Rarity penalty: words that appear many times on the page are low-information
  if (pageText) {
    const pageWords = pageText.toLowerCase().split(/\s+/);
    const freq = new Map<string, number>();
    for (const w of pageWords) freq.set(w, (freq.get(w) ?? 0) + 1);
    const avgFreq = words.reduce((s, w) => s + (freq.get(w) ?? 0), 0) / Math.max(words.length, 1);
    score -= Math.min(Math.floor(avgFreq / 2), 12);
  }

  // Generic isolated noun penalty
  if (/^(elements?|compounds?|substances?|cells?|organisms?|matter|materials?|properties|processes?|structures?|functions?|types?|forms?|kinds?|ways?|parts?|units?|levels?|states?|stages?|steps?|phases?|areas?|regions?|concepts?|ideas?|topics?|objects?|systems?|components?|factors?)\.?$/.test(lower)) {
    score -= 18;
  }

  // Chapter-opener / topic-announcement penalty
  if (/^(in this (chapter|section|unit)|this (chapter|section) (discusses?|covers?|introduces?|examines?)|we (will|shall) (discuss|examine|study|explore|learn))/.test(lower)) {
    score -= 15;
  }

  // Heading-only penalty: very short + all-caps or ends with colon
  if (words.length <= 3 && (text === text.toUpperCase() || text.endsWith(':'))) score -= 10;

  // Verb-less fragment penalty
  if (words.length < 7 && !/\b(is|are|was|were|has|have|had|can|could|will|would|does|do|did|causes?|leads?|results?|produces?|inhibits?|activates?|converts?|triggers?|prevents?|depends?|requires?)\b/.test(lower)) {
    score -= 6;
  }

  return score;
}

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
  /** pageTruthKey from pages/index.tsx — baked into highlightKey to force overlay clear on any synthesis change */
  pageTruthKey?: string;
  /** Forwarded to SmartPDFViewer for guided reading path sync */
  onReadingPath?: (path: RenderGuidedReadingPathResult | null) => void;
  /** Maps conceptId → role label for badge role pills */
  roleLabelByConceptId?: Map<string, string>;
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
  pageTruthKey,
  onReadingPath,
  roleLabelByConceptId,
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

  // Convert aiHighlightAnchors (grounded + semantically arbitrated in pages/index.tsx)
  // into HighlightTarget[] for SmartPDFViewer.
  // Anchors arrive pre-grounded — text fields contain exact PDF spans.
  // Specificity scoring is a secondary sort (tiebreaker within semantic scores).
  const effectiveHighlightTargets: HighlightTarget[] = (() => {
    if (!aiHighlightAnchors?.length) return [];

    // Rank by universal specificity (secondary sort — semantic arbitration is primary)
    const scored = aiHighlightAnchors.map((a, i) => ({
      anchor: a,
      originalIndex: i,
      specScore: universalSpecificityScore(a.text, pageText || "", a.anchorType),
    })).sort((a, b) => b.specScore - a.specScore);

    console.log("[ANCHOR_RANK]", scored.map(s => ({
      text:      s.anchor.text.slice(0, 70),
      type:      s.anchor.anchorType,
      score:     s.specScore,
    })));

    const aiTargets: HighlightTarget[] = scored.map((s, i) => ({
          id:                   `ai-anchor-${i}`,
          page:                 currentPage,
          text:                 s.anchor.text,  // already grounded in pages/index.tsx
          normalizedText:       s.anchor.text,
          level:                "important" as const,
          score:                100 - i,
          sourceParagraphIndex: 0,
          kind:                 anchorTypeToKind(s.anchor.anchorType),
          evidenceRefId:        `ai-anchor-${i}`,
        }));

    // Validate: reject anchors whose text does not appear in the current raw page text.
    // This prevents template/example phrases from the prompt from leaking as highlights.
    const norm = (s: string) =>
      s.toLowerCase()
        .replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl')
        .replace(/ﬀ/g, 'ff').replace(/ﬃ/g, 'ffi')
        .replace(/['']/g, "'").replace(/[""]/g, '"')
        .replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
    const normedPage = pageText ? norm(pageText) : "";

    const validated = (normedPage.length > 0)
      ? aiTargets.filter((t) => {
          const found = normedPage.includes(norm(t.text));
          if (!found) {
            console.warn("[ANCHOR_REJECTED_GENERIC] not found in page text:", t.text.slice(0, 60));
          } else {
            console.log("[ANCHOR_SELECTED]", { text: t.text.slice(0, 70), kind: t.kind, score: scored.find(s => s.anchor.text === t.text)?.specScore });
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

  // Bake pageTruthKey + anchor texts into highlightKey so SmartPDFViewer clears stale
  // overlays whenever synthesis changes (even if anchorTexts happen to be identical).
  const highlightKey = `${pageTruthKey ?? ""}:${currentPage}:${effectiveHighlightTargets?.map(t => t.text).join("|") ?? ""}`;
  const authorizedHighlightIds = effectiveHighlightTargets?.map(t => t.evidenceRefId) ?? [];

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
            if (effectiveHighlightTargets.length === 0) {
              console.log("[LEFT_PANEL_CLEAR] effectiveHighlightTargets empty — zero overlays", { page: currentPage });
            }
            return effectiveHighlightTargets;
          })()}
          highlightNeighborhoods={undefined}
          highlightKey={`${pageTruthKey ?? ""}:${currentPage}:${effectiveHighlightTargets?.map(t => t.text).join("|") ?? ""}`}
          authorizedHighlightIds={effectiveHighlightTargets?.map(t => t.evidenceRefId) ?? []}
          focusedEvidenceId={focusedEvidenceId}
          onEvidenceFocus={onEvidenceFocus}
          isPageChanging={isPageChanging}
          onPageRenderComplete={() => setIsPageChanging(false)}
          onPageTextExtracted={onPageTextExtracted}
          onReadingPath={onReadingPath}
          roleLabelByConceptId={roleLabelByConceptId}
        />
      </div>
    </div>
  );
}
