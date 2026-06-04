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
  /** Quick memory / study tip from right-panel study model — shown as footer in left panel */
  studyTip?: string | null;
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
  studyTip,
}: PureReaderViewProps) {
  // TRACE: log every prop arriving at PureReaderView boundary
  console.log("[PURE_READER_PROPS]", {
    page: currentPage,
    aiAnchorCount: aiHighlightAnchors?.length ?? 0,
    aiAnchorTexts: aiHighlightAnchors?.map(a => a.text.slice(0, 60)) ?? [],
    pageTruthKey: pageTruthKey ?? null,
    synthStatus,
    pageTextLen: pageText?.length ?? 0,
  });
  // Global zoom store
  const { zoom } = useZoomStore();
  const [isPageChanging, setIsPageChanging] = useState(false);

  // Map AI anchor types to ParagraphKind for highlight legend colors.
  const anchorTypeToKind = (anchorType: string): import("@/lib/readerContracts").ParagraphKind => {
    switch (anchorType) {
      case "thesis":       return "thesis";
      case "definition":   return "definition";
      case "mechanism":    return "mechanism";
      case "trap":         return "trap";
      case "application":  return "application";
      // Math-specific anchor types
      case "formula":      return "definition";    // formula = key term / rule (blue)
      case "example_step": return "application";   // worked step = evidence (purple)
      case "conclusion":   return "thesis";        // conclusion = core idea (yellow)
      // Backward compat
      case "memoryAnchor": return "definition";
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
    console.log("[AI_ANCHORS_ONLY_MODE]", {
      source: "aiHighlightAnchors (finalHighlightAnchors from index.tsx)",
      count: aiHighlightAnchors?.length ?? 0,
      page: currentPage,
      pageTruthKey,
    });
    if (!aiHighlightAnchors?.length) return [];

    // Anchors arrive pre-prioritized by visualAnchors.priority from buildStudyModel.
    // universalSpecificityScore is BLOCKED — left panel uses finalStudyModel order only.
    // Preserve arrival order (priority 1=first → highest in descending sort).
    console.log("[LEFT_PANEL_BLOCKED_LEGACY_FALLBACK]", {
      blocked: "universalSpecificityScore",
      reason:  "left panel uses finalStudyModel.visualAnchors priority order only",
      page:    currentPage,
    });
    console.log("[LEFT_PANEL_USING_FINAL_MODEL_ONLY]", {
      page:   currentPage,
      count:  aiHighlightAnchors.length,
      source: "finalStudyModel.visualAnchors via aiHighlightAnchors prop",
    });
    const scored = aiHighlightAnchors.map((a, i) => ({
      anchor:        a,
      originalIndex: i,
      specScore:     aiHighlightAnchors.length - i, // preserve arrival order — highest first
    }));

    // Normalizer shared by span guard + text validation
    const norm = (s: string) =>
      s.toLowerCase()
        .replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl')
        .replace(/ﬀ/g, 'ff').replace(/ﬃ/g, 'ffi')
        .replace(/['']/g, "'").replace(/[""]/g, '"')
        .replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
    const normedPage = pageText ? norm(pageText) : "";

    // Span guard: if spanStart..spanEnd covers > 250 chars in the page text, clear the span
    // so the highlight renders from anchor.text only (prevents formula-heavy pages turning fully pink).
    const SPAN_CHAR_MAX = 250;
    const aiTargets: HighlightTarget[] = scored.map((s, i) => {
      let spanStart: string | undefined = s.anchor.spanStart ?? undefined;
      let spanEnd:   string | undefined = s.anchor.spanEnd   ?? undefined;

      if (spanStart && spanEnd && normedPage.length > 0) {
        const si = normedPage.indexOf(norm(spanStart));
        const ei = si >= 0 ? normedPage.indexOf(norm(spanEnd), si) : -1;
        const spanLen = ei >= 0 ? (ei - si + norm(spanEnd).length) : 0;
        if (spanLen > SPAN_CHAR_MAX) {
          console.log("[SPAN_GUARD_TRIM]", { text: s.anchor.text.slice(0, 50), spanLen, max: SPAN_CHAR_MAX });
          spanStart = undefined;
          spanEnd   = undefined;
        }
      }

      return {
        id:                   `ai-anchor-${i}`,
        page:                 currentPage,
        text:                 s.anchor.text,  // already grounded in pages/index.tsx
        normalizedText:       s.anchor.text,
        level:                "important" as const,
        score:                100 - i,
        sourceParagraphIndex: 0,
        kind:                 anchorTypeToKind(s.anchor.anchorType),
        evidenceRefId:        `ai-anchor-${i}`,
        spanStart,
        spanEnd,
      };
    });

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

  // ── Highlight Key legend entries ──────────────────────────────────────────
  const hasHighlights = effectiveHighlightTargets.length > 0;
  const usedKinds = new Set(effectiveHighlightTargets.map(t => t.kind as string));

  const HIGHLIGHT_KEY_ENTRIES: Array<{ kind: string; color: string; bg: string; label: string; abbr: string }> = [
    { kind: "thesis",      color: "#fde047", bg: "rgba(253,224,71,0.15)",   label: "Core Idea",            abbr: "CORE" },
    { kind: "definition",  color: "#93c5fd", bg: "rgba(147,197,253,0.15)",  label: "Definition / Term",    abbr: "DEF"  },
    { kind: "mechanism",   color: "#86efac", bg: "rgba(134,239,172,0.15)",  label: "Mechanism / Function", abbr: "FCN"  },
    { kind: "application", color: "#c084fc", bg: "rgba(192,132,252,0.15)",  label: "Example / Evidence",   abbr: "EX"   },
    { kind: "trap",        color: "#fca5a5", bg: "rgba(252,165,165,0.15)",  label: "Confusion / Trap",     abbr: "TRAP" },
  ];

  console.log("[SINGLE_LEGEND_RENDER]", {
    page: currentPage,
    hasHighlights,
    usedKinds: [...usedKinds],
    totalAnchors: effectiveHighlightTargets.length,
    source: "PureReaderView-left-sidebar (single canonical legend)",
  });

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

        {/* Mode indicator */}
        <div className="text-xs text-gray-500">
          📖 Reader Mode
        </div>
      </div>

      {/* Body: Highlight Key sidebar + PDF Viewer column */}
      <div className="flex flex-1 min-h-0">

        {/* ── Highlight Key sidebar ───────────────────────────────────────── */}
        <div className="flex flex-col w-[136px] shrink-0 bg-[#0d1117] border-r border-white/8 py-4 px-2.5 gap-2 overflow-hidden">
          <span className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-0.5 px-0.5">
            Highlight Key
          </span>
          {HIGHLIGHT_KEY_ENTRIES.map(entry => {
            const active = !hasHighlights || usedKinds.has(entry.kind);
            return (
              <div
                key={entry.kind}
                className="flex items-start gap-2 transition-opacity"
                style={{ opacity: active ? 1 : 0.22 }}
              >
                {/* Color swatch with abbreviation badge */}
                <span
                  className="shrink-0 flex items-center justify-center rounded-sm text-[7px] font-bold mt-0.5"
                  style={{
                    width: 28,
                    height: 16,
                    background: entry.bg,
                    border: `1px solid ${entry.color}55`,
                    color: entry.color,
                    letterSpacing: "0.05em",
                    fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  }}
                >
                  {entry.abbr}
                </span>
                <span className="text-[10.5px] text-white/65 leading-tight">{entry.label}</span>
              </div>
            );
          })}
        </div>

        {/* ── PDF Viewer column ───────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex-1 overflow-auto bg-gray-950 relative min-h-0">
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

          {/* ── Study Tip footer ─────────────────────────────────────────── */}
          {studyTip && (
            <div className="shrink-0 flex items-start gap-2 px-3 py-2 bg-[#0d1a12] border-t border-emerald-900/40">
              <span className="text-[11px] shrink-0 mt-0.5">💡</span>
              <p className="text-[11px] text-emerald-300/80 leading-[1.55]">
                <span className="font-semibold text-emerald-300/90">Study Tip: </span>
                {studyTip}
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
