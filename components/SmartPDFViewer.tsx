// components/SmartPDFViewer.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api"; // ✅ correct type source
import { useReaderSync } from "@/lib/readerSync";
import { usePDFLoading } from "@/lib/pdfLoadingManager";
import type { HighlightTarget } from "@/lib/readerContracts";
import PdfEvidenceOverlay, { type OverlayRect } from "@/components/pdf/PdfEvidenceOverlay";
import GuidedNeighborhoodOverlay from "@/components/pdf/GuidedNeighborhoodOverlay";
import type { HighlightNeighborhood } from "@/lib/highlights/buildHighlightNeighborhoods";
import { matchNeighborhoodMemberToText, type NeighborhoodMember, type PageTextRecord } from "@/lib/highlights/matchNeighborhoodMemberToText";
import { buildHighlightRects, type TextItemRect, type NeighborhoodMemberPlacement, type HighlightOverlayRect } from "@/lib/highlights/buildHighlightRects";
import type { RenderGuidedReadingPathResult } from "@/lib/highlights/renderGuidedReadingPath";

// Keep react-pdf CSS imports in pages/_app.tsx (do not import here).

/** Use the same-origin worker we ship in /public to avoid CDN/CORS issues */
try {
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
} catch {
  // react-pdf will surface a clearer error if this fails
}

// ---------------------------------------------------------------------------
// focusSnippet matching helpers
// ---------------------------------------------------------------------------

function normForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[­​-‍﻿]/g, '')   // zero-width / soft-hyphen
    .replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl')       // common ligatures
    .replace(/ﬀ/g, 'ff').replace(/ﬃ/g, 'ffi').replace(/ﬄ/g, 'ffl')
    .replace(/['']/g, "'").replace(/[""]/g, '"')    // smart quotes
    .replace(/[–—]/g, '-')                          // dashes
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Finds the best span element in the PDF text layer for the given snippet.
 * Strategy 1: single-span substring (fast path for short snippets / exact OCR).
 * Strategy 2: multi-span sliding window — concatenate 4 adjacent spans and check
 *             if the window contains the first 5 words of the query (handles
 *             cases where one sentence spans multiple text-run spans).
 * Strategy 3: token-overlap fallback — find the 4-span window with the highest
 *             fraction of query words (handles OCR variants / reordered text).
 */
function findSpanForSnippet(spans: HTMLElement[], snippet: string): HTMLElement | null {
  const q = normForMatch(snippet);
  if (q.length < 8) return null;

  // Strategy 1 — single span substring
  const n40 = q.slice(0, 40);
  const n20 = q.slice(0, 20);
  const hit1 = spans.find(s => normForMatch(s.textContent || '').includes(n40))
    ?? spans.find(s => normForMatch(s.textContent || '').includes(n20));
  if (hit1) return hit1;

  // Strategy 2 — multi-span window: first 5 words of the query
  const firstWords = q.split(/\s+/).slice(0, 5).join(' ');
  if (firstWords.length >= 10) {
    for (let i = 0; i < spans.length - 1; i++) {
      const window = spans.slice(i, i + 4).map(s => normForMatch(s.textContent || '')).join(' ');
      if (window.includes(firstWords)) return spans[i];
    }
  }

  // Strategy 3 — token-overlap across 4-span windows
  const qWords = q.split(/\s+/).filter(w => w.length > 3);
  if (qWords.length < 3) return null;
  let bestSpan: HTMLElement | null = null;
  let bestScore = 0;
  for (let i = 0; i < spans.length; i++) {
    const window = spans.slice(i, i + 4).map(s => normForMatch(s.textContent || '')).join(' ');
    const overlap = qWords.filter(w => window.includes(w)).length;
    const score = overlap / qWords.length;
    if (score > bestScore) { bestScore = score; bestSpan = spans[i]; }
  }
  return bestScore >= 0.45 ? bestSpan : null;
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
  /** Structured neighborhood highlights — when present, uses layered matching pipeline */
  highlightNeighborhoods?: HighlightNeighborhood[];
  focusedEvidenceId?: string | null;
  onEvidenceFocus?: (evidenceId: string) => void;
  /** External page change lock to prevent observer feedback loops while rendering */
  isPageChanging?: boolean;
  /** Fires when the currently requested page render completes */
  onPageRenderComplete?: (page: number) => void;
  /**
   * Called once per page render with the raw text extracted from the PDF text
   * layer. Use this to feed live per-page text into the extraction pipeline
   * instead of relying on pre-parsed thought-unit approximations.
   */
  onPageTextExtracted?: (page: number, text: string) => void;
  /** Fires whenever the guided reading path changes — null when no neighborhoods are active. */
  onReadingPath?: (path: RenderGuidedReadingPathResult | null) => void;
  /** Maps conceptId → role label ("Core", "Why", "How", "More") for badge role pills. */
  roleLabelByConceptId?: Map<string, string>;
  /**
   * Opaque key that changes whenever the highlight source changes (e.g. anchor texts).
   * SmartPDFViewer immediately clears all overlay rects when this key changes,
   * preventing stale rectangles from surviving the async locate+retry window.
   */
  highlightKey?: string;
  /**
   * Hard render-time guard: only overlay rects whose id starts with one of these
   * strings are shown. Any rect whose source anchor is no longer in the current
   * authorized set is suppressed — even if it survived in overlayRects state.
   * Pass the evidenceRefIds from the current effectiveHighlightTargets.
   */
  authorizedHighlightIds?: string[];
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
  highlightNeighborhoods,
  focusedEvidenceId,
  onEvidenceFocus,
  isPageChanging = false,
  onPageRenderComplete,
  onPageTextExtracted,
  onReadingPath,
  roleLabelByConceptId,
  highlightKey,
  authorizedHighlightIds,
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
  const [guidedOverlayData, setGuidedOverlayData] = useState<{
    neighborhoods: HighlightNeighborhood[];
    overlays: HighlightOverlayRect[];
  } | null>(null);
  const [overlayVersion, setOverlayVersion] = useState(0);
  // Tracks the highlightKey for which the rebuild effect last ran.
  // Prevents redundant RAF fires when highlightTargets reference changes
  // but content (encoded in highlightKey) is identical — harmless dedup.
  const prevRebuildKeyRef = useRef<string | undefined>(undefined);
  // Clear reading path immediately when guided data goes away (e.g. page turn).
  useEffect(() => {
    if (guidedOverlayData === null) onReadingPath?.(null);
  }, [guidedOverlayData, onReadingPath]);

  // Hard-clear all overlay state when highlightKey changes.
  // overlayVersion increment forces the keyed wrapper to unmount+remount, guaranteeing DOM cleanup.
  useEffect(() => {
    if (highlightKey === undefined) return;
    console.log("[OVERLAY_CLEAR] highlightKey changed", { highlightKey });
    setOverlayRects([]);
    setGuidedOverlayData(null);
    setOverlayVersion(v => v + 1);

    // [TEXT_LAYER_CLEANUP] — verify no lingering CSS highlight marks on text layer spans.
    // Our highlights are DOM overlay divs, NOT in-span CSS. This log proves it.
    const textLayer = document.querySelector('.react-pdf__Page__textContent, .textLayer');
    const markedSpans = textLayer
      ? Array.from(textLayer.querySelectorAll('span')).filter(s =>
          s.classList.contains('bg-yellow-300') || s.classList.contains('ring-2')
        )
      : [];
    console.log("[TEXT_LAYER_CLEANUP]", {
      highlightKey,
      textLayerFound: !!textLayer,
      markedSpansFound: markedSpans.length,
      // If markedSpans > 0, a focusSnippet highlight didn't clear — not related to overlay persistence.
    });
  }, [highlightKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Log overlay renders for debugging.
  useEffect(() => {
    if (overlayRects.length > 0) {
      console.log("[OVERLAY_RENDER]", { count: overlayRects.length, version: overlayVersion, ids: overlayRects.slice(0, 5).map(r => r.id) });
    }
  }, [overlayRects, overlayVersion]);
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
    if (focusSnippet.trim().length < 8) return;
    const spans = Array.from(container.querySelectorAll(
      '.react-pdf__Page__textContent span, .textLayer span'
    )) as HTMLElement[];
    if (!spans.length) return;

    const target = findSpanForSnippet(spans, focusSnippet);

    console.log("[TRACE focusSnippet]", {
      snippet: focusSnippet.slice(0, 70),
      spansSearched: spans.length,
      matched: !!target,
      matchedText: target ? (target.textContent || '').slice(0, 50) : null,
    });

    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.add("bg-yellow-300", "text-black", "rounded", "px-0.5", "ring-2", "ring-yellow-400");
    const timer = window.setTimeout(() => {
      target.classList.remove("bg-yellow-300", "text-black", "rounded", "px-0.5", "ring-2", "ring-yellow-400");
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [focusSnippet, currentPage]);

  useEffect(() => {
    const container = viewerRef.current;
    const hasNeighborhoods = (highlightNeighborhoods?.length ?? 0) > 0;
    const hasTargets = (highlightTargets?.length ?? 0) > 0;

    // TRACE: log every prop entering SmartPDFViewer overlay rebuild
    console.log("[SMART_PDF_PROPS]", {
      page: currentPage,
      highlightTargetCount: highlightTargets?.length ?? 0,
      highlightTargetTexts: highlightTargets?.map(t => t.text?.slice(0, 60)) ?? [],
      highlightKey: highlightKey ?? null,
      hasNeighborhoods,
      hasTargets,
      overlayRectsNow: overlayRects.length,
    });

    console.log("[TRACE overlayNeighborhoods]", {
      pageNumber: currentPage,
      neighborhoodCount: highlightNeighborhoods?.length ?? 0,
      depthLevels: (highlightNeighborhoods ?? []).map(n => n.depthLevel),
      titles: (highlightNeighborhoods ?? []).map(n => n.title?.slice(0, 40)),
      hasTargets,
    });

    if (!container || (!hasNeighborhoods && !hasTargets)) {
      setOverlayRects([]);
      setGuidedOverlayData(null);
      return;
    }

    // Dedup: skip RAF when highlightKey hasn't changed. This prevents redundant
    // rebuilds when only the highlightTargets reference changes (new array, same
    // content) — which happens on every PureReaderView render. The highlightKey
    // already encodes all anchor texts, so an unchanged key means unchanged content.
    if (highlightKey !== undefined && highlightKey === prevRebuildKeyRef.current) {
      console.log("[OVERLAY_DEDUP] highlightKey unchanged — skipping rebuild", { highlightKey: highlightKey.slice(-60) });
      return;
    }
    prevRebuildKeyRef.current = highlightKey;

    // Clear stale rects immediately before starting async matching.
    // Without this, old highlight rectangles persist in state for the entire
    // retry window (~10 attempts × 140ms) whenever new anchors fail to match
    // on the first try (e.g. text layer not yet painted).
    setOverlayRects([]);
    setGuidedOverlayData(null);

    let attempts = 0;
    let cancelled = false;

    const renderRects = () => {
      if (cancelled) return;

      const textLayer = container.querySelector('.react-pdf__Page__textContent, .textLayer');
      if (!textLayer) {
        if (attempts < 10) { attempts += 1; window.setTimeout(renderRects, 120 + attempts * 40); }
        else { setOverlayRects([]); }
        return;
      }

      const layerRect = (textLayer as HTMLElement).getBoundingClientRect();
      const spans = Array.from(textLayer.querySelectorAll("span")) as HTMLElement[];

      if (!spans.length) {
        if (attempts < 10) { attempts += 1; window.setTimeout(renderRects, 120 + attempts * 40); }
        else { setOverlayRects([]); }
        return;
      }

      // Build span index — shared by both paths.
      // Apply the same ligature + normalization as normForMatch() so that
      // concatText indexOf() always finds what normForMatch() produces on the anchor side.
      const spanNorm = spans.map((s) =>
        (s.textContent || "")
          .toLowerCase()
          .replace(/\u00ad/g, "")                                   // soft hyphen
          .replace(/\ufb01/g, "fi").replace(/\ufb02/g, "fl")       // fi/fl ligatures
          .replace(/\ufb00/g, "ff").replace(/\ufb03/g, "ffi").replace(/\ufb04/g, "ffl")
          .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"') // smart quotes
          .replace(/[\u2013\u2014]/g, "-")                         // en/em dash
          .replace(/[^\w\s]/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      );
      const offsets: number[] = [];
      let cursor = 0;
      for (const t of spanNorm) { offsets.push(cursor); cursor += t.length + 1; }
      const concatText = spanNorm.join(" ");

      // ── NEIGHBORHOOD PATH ──────────────────────────────────────────────────
      if (hasNeighborhoods) {
        // Build TextItemRect[] — each span gets DOM coords + text offsets
        const textItems: TextItemRect[] = spans.map((span, i) => {
          const dr = span.getBoundingClientRect();
          return {
            id: `span-${i}`,
            pageNumber: currentPage,
            text: span.textContent || "",
            normalizedText: spanNorm[i],
            startOffset: offsets[i],
            endOffset: offsets[i] + spanNorm[i].length,
            x: dr.left - layerRect.left,
            y: dr.top - layerRect.top,
            width: dr.width,
            height: Math.max(12, dr.height),
          };
        });

        // Build sentence records from DOM spans so strategies 1-5 in the matcher
        // can anchor to exact PDF text rather than falling back to token-window only.
        // Group consecutive spans into sentences by detecting terminal punctuation
        // followed by a capital letter in the next span.
        const sentenceRecords: import("@/lib/highlights/matchNeighborhoodMemberToText").PageSentenceRecord[] = [];
        let sBuf = "";
        let sNormBuf = "";
        let sStart = 0;
        for (let si = 0; si < spans.length; si++) {
          const rawSpan = spans[si].textContent || "";
          sBuf += (sBuf ? " " : "") + rawSpan;
          sNormBuf += (sNormBuf ? " " : "") + spanNorm[si];
          const nextRaw = si + 1 < spans.length ? (spans[si + 1].textContent || "").trimStart() : "";
          const flushHere = /[.!?]\s*$/.test(rawSpan) && /^[A-Z"'(]/.test(nextRaw);
          const isLast = si === spans.length - 1;
          if (flushHere || isLast) {
            const sentText = sBuf.trim();
            if (sentText.length >= 8) {
              sentenceRecords.push({
                id: `sent-${sentenceRecords.length}`,
                text: sentText,
                normalizedText: sNormBuf.trim(),
                startOffset: sStart,
                endOffset: offsets[si] + spanNorm[si].length,
              });
            }
            sStart = si + 1 < spans.length ? offsets[si + 1] : offsets[si] + spanNorm[si].length + 1;
            sBuf = "";
            sNormBuf = "";
          }
        }

        const pageTextRecord: PageTextRecord = {
          rawText: concatText,
          normalizedText: concatText,
          sentences: sentenceRecords.length > 0 ? sentenceRecords : undefined,
        };

        const placements: NeighborhoodMemberPlacement[] = [];

        for (const n of highlightNeighborhoods!) {
          const members: Array<{ line: typeof n.anchor; kind: NeighborhoodMember["kind"] }> = [
            { line: n.anchor,    kind: "anchor"     },
            ...n.support.map((l) => ({ line: l, kind: "support"    as const })),
            ...n.additional.map((l) => ({ line: l, kind: "additional" as const })),
            ...(n.trap ? [{ line: n.trap, kind: "trap" as const }] : []),
          ];

          for (const { line, kind } of members) {
            const member: NeighborhoodMember = { id: line.id, text: line.text, kind, sentenceId: line.sentenceId };
            const result = matchNeighborhoodMemberToText(member, pageTextRecord);
            placements.push({ memberId: line.id, kind, text: line.text, candidate: result.best });
          }
        }

        const { overlays } = buildHighlightRects({ pageNumber: currentPage, placements, textItemRects: textItems });

        const hasVisible = overlays.some((o) => o.rects.length > 0 && o.displayMode !== "hidden");
        if (!hasVisible && attempts < 10) {
          attempts += 1;
          window.setTimeout(renderRects, 140 + attempts * 40);
          return;
        }

        setGuidedOverlayData({ neighborhoods: highlightNeighborhoods!, overlays });
        if (!hasTargets) {
          setOverlayRects([]);
          return;
        }
        // hasTargets: fall through to also render AI anchor highlights
      }

      // ── flat highlightTargets path ─────────────────────────────────────────
      if (!hasNeighborhoods) setGuidedOverlayData(null);
      console.log("[AI_HIGHLIGHT:received]", {
        targetCount: highlightTargets?.length ?? 0,
        ids: highlightTargets?.map((t) => t.evidenceRefId) ?? [],
        texts: highlightTargets?.map((t) => t.text?.slice(0, 40)) ?? [],
      });

      // Normalize anchor text to match concatText format exactly.
      // concatText is built from spanNorm which applies [^\w\s] -> " " (strips all punctuation).
      // normForMatch does NOT strip punctuation, so "substance." would fail to match "substance".
      // normForConcat applies the same pipeline as spanNorm.
      function normForConcat(s: string): string {
        return s
          .toLowerCase()
          .replace(/­/g, "")
          .replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl")
          .replace(/ﬀ/g, "ff").replace(/ﬃ/g, "ffi").replace(/ﬄ/g, "ffl")
          .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
          .replace(/[–—]/g, "-")
          .replace(/[^\w\s]/g, " ")   // KEY: strip all punctuation — matches spanNorm
          .replace(/\s+/g, " ")
          .trim();
      }

      // Locate anchor in concatText. Primary: full text. Fallback: prefix to find START,
      // then suffix to pin the END — avoids the "estimated endIdx overshoot" problem.
      function locateAnchor(baseText: string): { startIdx: number; endIdx: number } | null {
        if (baseText.length < 4) return null;

        // 1. Full text match (highest confidence — no estimation needed)
        const fullIdx = concatText.indexOf(baseText);
        if (fullIdx !== -1) return { startIdx: fullIdx, endIdx: fullIdx + baseText.length };

        const words = baseText.split(" ").filter(Boolean);
        if (words.length < 3) return null;

        // 2. Prefix + suffix pinning: find start, verify/pin end independently.
        //    This prevents endIdx from overshooting into adjacent sentences.
        const maxPrefix = Math.min(8, Math.ceil(words.length * 0.6));
        const maxSuffix = Math.min(6, Math.floor(words.length * 0.4));
        const suffixWords = words.slice(-maxSuffix);

        for (const count of [maxPrefix, 6, 5, 4]) {
          if (count > words.length || count < 3) continue;
          const prefix = words.slice(0, count).join(" ");
          if (prefix.length < 10) continue;
          const startIdx = concatText.indexOf(prefix);
          if (startIdx === -1) continue;

          // Try to pin the end with the last few words of the anchor.
          // Search within a 2x window from the prefix end.
          const searchFrom = startIdx + prefix.length;
          const searchWindow = concatText.substring(searchFrom, searchFrom + baseText.length * 2);
          let endIdx = startIdx + baseText.length; // estimated fallback

          for (const sCount of [maxSuffix, 4, 3]) {
            if (sCount < 2 || sCount > suffixWords.length) continue;
            const suffix = suffixWords.slice(-sCount).join(" ");
            if (suffix.length < 6) continue;
            const suffixOff = searchWindow.indexOf(suffix);
            if (suffixOff !== -1) {
              endIdx = searchFrom + suffixOff + suffix.length;
              break;
            }
          }

          return { startIdx, endIdx: Math.min(endIdx, concatText.length) };
        }
        return null;
      }

      // Return all spans whose text overlaps [startIdx, endIdx) in concatText.
      function spansForRange(startIdx: number, endIdx: number): HTMLElement[] {
        return spans.filter((_, i) =>
          offsets[i] + spanNorm[i].length > startIdx && offsets[i] < endIdx
        );
      }

      // Build per-line OverlayRects from matched spans.
      // Groups spans by approximate Y (3px grid) -> one rect per text line.
      // Suppresses tiny orphan artifacts (width < 12 or height > 72).
      function lineRectsFromSpans(
        matched: HTMLElement[],
        targetId: string,
        level: OverlayRect["level"],
        semanticKind: OverlayRect["semanticKind"],
      ): OverlayRect[] {
        if (!matched.length) return [];
        const byLine = new Map<number, DOMRect[]>();
        for (const span of matched) {
          const dr = span.getBoundingClientRect();
          if (dr.width < 1 || dr.height < 1) continue;
          const lineKey = Math.round(dr.top / 3) * 3;
          if (!byLine.has(lineKey)) byLine.set(lineKey, []);
          byLine.get(lineKey)!.push(dr);
        }

        const lineRects: OverlayRect[] = [];
        let lineIndex = 0;
        const sortedKeys = [...byLine.keys()].sort((a, b) => a - b);
        for (const key of sortedKeys) {
          const drs = byLine.get(key)!;
          const top    = Math.min(...drs.map((r) => r.top))    - layerRect.top;
          const left   = Math.min(...drs.map((r) => r.left))   - layerRect.left;
          const bottom = Math.max(...drs.map((r) => r.bottom)) - layerRect.top;
          const right  = Math.max(...drs.map((r) => r.right))  - layerRect.left;
          const width  = right - left;
          const height = Math.max(13, bottom - top);

          if (width < 12 || height > 72) {
            console.log("[AI_HIGHLIGHT:orphan-filtered]", { targetId, lineIndex, width: Math.round(width), height: Math.round(height) });
            lineIndex++;
            continue;
          }
          lineRects.push({
            id: lineIndex === 0 ? targetId : `${targetId}-L${lineIndex}`,
            level,
            semanticKind,
            top,
            left,
            width,
            height: Math.min(height, 36),
          });
          lineIndex++;
        }
        return lineRects;
      }

      const rects: OverlayRect[] = [];
      highlightTargets!.forEach((target) => {
        // Use normForConcat (not normForMatch) so the anchor matches concatText format:
        // both strip punctuation with [^\w\s]->" ", ensuring "substance." matches "substance".
        const baseText = normForConcat(target.normalizedText);
        console.log("[AI_HIGHLIGHT:matching]", {
          id: target.evidenceRefId,
          kind: target.kind,
          text: target.text?.slice(0, 60),
          baseText: baseText.slice(0, 60),
          baseLen: baseText.length,
        });

        const location = locateAnchor(baseText);
        if (!location) {
          // Try support/evidence fallback — omit if still no match
          let fallbackLoc: { startIdx: number; endIdx: number } | null = null;
          for (const fb of [...(target.support ?? []), ...(target.evidence ?? [])]) {
            if (!fb || fb.length < 12) continue;
            fallbackLoc = locateAnchor(normForConcat(fb));
            if (fallbackLoc) break;
          }
          if (!fallbackLoc) {
            console.log("[AI_HIGHLIGHT:failed]", { id: target.evidenceRefId, text: target.text?.slice(0, 60) });
            return; // Skip — no partial misleading highlights
          }
          const fbSpans = spansForRange(fallbackLoc.startIdx, fallbackLoc.endIdx);
          const fbRects = lineRectsFromSpans(fbSpans, target.evidenceRefId, target.level, target.kind as OverlayRect["semanticKind"]);
          console.log("[AI_HIGHLIGHT:matched]", { id: target.evidenceRefId, via: "fallback", lines: fbRects.length });
          rects.push(...fbRects);
          return;
        }

        const matchedSpans = spansForRange(location.startIdx, location.endIdx);
        const lineRects = lineRectsFromSpans(matchedSpans, target.evidenceRefId, target.level, target.kind as OverlayRect["semanticKind"]);
        console.log("[AI_HIGHLIGHT:matched]", {
          id: target.evidenceRefId, kind: target.kind,
          text: target.text?.slice(0, 50),
          spanCount: matchedSpans.length, lines: lineRects.length,
        });
        console.log("[AI_HIGHLIGHT:rects]", {
          id: target.evidenceRefId,
          rects: lineRects.map((r) => ({ top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) })),
        });
        lineRects.forEach((r, rIdx) => {
          console.log("[OVERLAY_RECT_SOURCE]", {
            anchorId: target.evidenceRefId,
            text: target.text?.slice(0, 50),
            rectIndex: rIdx,
            page: currentPage,
            highlightKey: (highlightKey ?? "").slice(-40),
          });
        });
        rects.push(...lineRects);
      });

      if (!rects.length && (highlightTargets?.length ?? 0) > 0 && attempts < 10) {
        attempts += 1;
        window.setTimeout(renderRects, 140 + attempts * 40);
        return;
      }
      console.log("[PDF] rendered rect count", rects.length, "from", highlightTargets?.length ?? 0, "anchors");
      setOverlayRects(rects);
    };

    console.log("[OVERLAY_SOURCE_USED]", { page: currentPage, targets: highlightTargets?.length ?? 0, highlightKey, overlayVersion });
    window.requestAnimationFrame(renderRects);
    return () => { cancelled = true; };
  // highlightKey must be in deps so a pageTruthKey change forces a rebuild even when
  // highlightTargets reference is identical (e.g. both [] after clear + empty new page).
  }, [highlightTargets, highlightNeighborhoods, currentPage, highlightKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
                onGetTextSuccess={(textContent: any) => {
                  if (!onPageTextExtracted) return;
                  const text = (textContent?.items ?? [])
                    .map((item: any) => item.str ?? "")
                    .join(" ")
                    .replace(/\s+/g, " ")
                    .trim();
                  if (text.length > 20) onPageTextExtracted(currentPage, text);
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

              {(overlayRects.length > 0 || guidedOverlayData !== null) && (
                <React.Fragment key={`overlay-${highlightKey ?? ""}-${overlayVersion}`}>
                  {/* Dim veil sits below the evidence overlay (z-[19] < z-20).
                      Non-highlighted text recedes; decoded blocks jump forward. */}
                  <div
                    className="pointer-events-none absolute inset-0 z-[19] bg-slate-900/20"
                    aria-hidden
                  />
                  {guidedOverlayData ? (
                    <GuidedNeighborhoodOverlay
                      neighborhoods={guidedOverlayData.neighborhoods}
                      overlayRects={guidedOverlayData.overlays}
                      onReadingPath={onReadingPath}
                      roleLabelByConceptId={roleLabelByConceptId}
                    />
                  ) : (
                    <PdfEvidenceOverlay
                      rects={(() => {
                        // Hard render-time guard: suppress any rect not in the current authorized set.
                        // authorizedHighlightIds comes from effectiveHighlightTargets so it always
                        // reflects the live studyModel anchors — stale rects are invisible even if
                        // they survived in overlayRects state past a highlightKey change.
                        if (!authorizedHighlightIds || authorizedHighlightIds.length === 0) {
                          if (overlayRects.length > 0) {
                            console.log("[OVERLAY_DOM_CLEANUP] no authorized IDs — suppressing", overlayRects.length, "rects");
                          }
                          return [];
                        }
                        const allowed = new Set(authorizedHighlightIds.flatMap(id => [id, ...overlayRects.map(r => r.id).filter(rid => rid.startsWith(id))]));
                        const guarded = overlayRects.filter(r => allowed.has(r.id));
                        if (guarded.length !== overlayRects.length) {
                          console.log("[OVERLAY_DOM_CLEANUP] guard filtered", overlayRects.length, "→", guarded.length, "rects");
                        }
                        return guarded;
                      })()}
                      focusedId={focusedEvidenceId}
                      onFocus={onEvidenceFocus}
                    />
                  )}
                </React.Fragment>
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
