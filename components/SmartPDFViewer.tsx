// components/SmartPDFViewer.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api"; // ✅ correct type source
import { useReaderSync } from "@/lib/readerSync";
import { usePDFLoading } from "@/lib/pdfLoadingManager";
import type { HighlightTarget } from "@/lib/readerContracts";
import PdfEvidenceOverlay, { type OverlayRect } from "@/components/pdf/PdfEvidenceOverlay";
import { buildStructuredPageText } from "@/lib/pdf/structuredPageText";
import type { HighlightNeighborhood } from "@/lib/highlights/buildHighlightNeighborhoods";
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
 * Punctuation-stripped variant of normForMatch, matching the normalization
 * used for AI-highlight-anchor matching (see normForConcat/spanNorm below).
 * Used as a fallback when exact punctuation-sensitive matching fails, so
 * snippet/click/speech matching tolerates punctuation differences the same
 * way AI-anchor matching already does.
 */
function stripPunctForMatch(s: string): string {
  return normForMatch(s).replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
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
function findSpanForSnippetWithNorm(
  spans: HTMLElement[],
  snippet: string,
  norm: (s: string) => string,
): HTMLElement | null {
  const q = norm(snippet);
  if (q.length < 8) return null;

  // Strategy 1 — single span substring
  const n40 = q.slice(0, 40);
  const n20 = q.slice(0, 20);
  const hit1 = spans.find(s => norm(s.textContent || '').includes(n40))
    ?? spans.find(s => norm(s.textContent || '').includes(n20));
  if (hit1) return hit1;

  // Strategy 2 — multi-span window: first 5 words of the query.
  // Window increased from 4 → 10 spans because PDF text layers often split one
  // sentence across 10–20 individual word/character spans.
  const firstWords = q.split(/\s+/).slice(0, 5).join(' ');
  if (firstWords.length >= 10) {
    for (let i = 0; i < spans.length - 1; i++) {
      const win = spans.slice(i, i + 10).map(s => norm(s.textContent || '')).join(' ');
      if (win.includes(firstWords)) return spans[i];
    }
  }

  // Strategy 3 — token-overlap across 10-span windows
  const qWords = q.split(/\s+/).filter(w => w.length > 3);
  if (qWords.length < 3) return null;
  let bestSpan: HTMLElement | null = null;
  let bestScore = 0;
  for (let i = 0; i < spans.length; i++) {
    const win = spans.slice(i, i + 10).map(s => norm(s.textContent || '')).join(' ');
    const overlap = qWords.filter(w => win.includes(w)).length;
    const score = overlap / qWords.length;
    if (score > bestScore) { bestScore = score; bestSpan = spans[i]; }
  }
  return bestScore >= 0.45 ? bestSpan : null;
}

/**
 * Finds the best span element in the PDF text layer for the given snippet.
 * Tries punctuation-sensitive matching first (normForMatch), then falls back
 * to punctuation-stripped matching (stripPunctForMatch) so snippets that
 * differ only in punctuation/quoting still resolve — matching the tolerance
 * AI-highlight-anchor matching already gets via normForConcat/spanNorm.
 */
function findSpanForSnippet(spans: HTMLElement[], snippet: string): HTMLElement | null {
  return (
    findSpanForSnippetWithNorm(spans, snippet, normForMatch)
    ?? findSpanForSnippetWithNorm(spans, snippet, stripPunctForMatch)
  );
}

/**
 * Locates the on-page rect for a single word within an already-highlighted anchor's
 * text — drives the Speechify-style live word box. Re-measures spans fresh each call
 * (cheap — only runs on word-index changes, not full anchor re-matching) using the
 * same punctuation-stripped matching AI-highlight-anchor matching uses. When a span
 * batches multiple words, interpolates the word's box within that span's bounding
 * rect by character-width fraction. Returns null if the anchor text can't be located
 * or the word falls outside it — callers should fall back to the whole-anchor highlight.
 */
function computeActiveWordRect(
  textLayer: Element,
  anchorText: string,
  wordIndex: number,
): { top: number; left: number; width: number; height: number } | null {
  const layerRect = (textLayer as HTMLElement).getBoundingClientRect();
  const spans = Array.from(textLayer.querySelectorAll("span")) as HTMLElement[];
  if (!spans.length) return null;

  const spanNorm = spans.map((s) => stripPunctForMatch(s.textContent || ""));
  const offsets: number[] = [];
  let cursor = 0;
  for (const t of spanNorm) { offsets.push(cursor); cursor += t.length + 1; }
  const concatText = spanNorm.join(" ");

  const baseText = stripPunctForMatch(anchorText);
  if (baseText.length < 4) return null;
  let startIdx = concatText.indexOf(baseText);
  if (startIdx === -1) {
    // Fallback: pin by the anchor's first few words only — handles cases where
    // the full anchor text runs slightly past what matched on this render pass.
    const firstWords = baseText.split(" ").filter(Boolean).slice(0, 6).join(" ");
    startIdx = firstWords.length >= 8 ? concatText.indexOf(firstWords) : -1;
  }
  if (startIdx === -1) {
    console.warn("[PDF_WORD_SYNC_MISS] sentence not found in PDF text layer", {
      search: baseText.slice(0, 80),
      layerChars: concatText.length,
      spansCount: spans.length,
    });
    return null;
  }
  const endIdx = Math.min(startIdx + baseText.length, concatText.length);

  const words = concatText.slice(startIdx, endIdx).split(" ").filter(Boolean);
  if (!words.length) return null;
  const idx = Math.min(Math.max(wordIndex, 0), words.length - 1);
  let off = 0;
  for (let i = 0; i < idx; i++) off += words[i].length + 1;
  const wordStart = startIdx + off;
  const wordEnd = wordStart + words[idx].length;

  let top = Infinity, left = Infinity, bottom = -Infinity, right = -Infinity;
  for (let i = 0; i < spans.length; i++) {
    const sStart = offsets[i];
    const sEnd = sStart + spanNorm[i].length;
    if (sEnd <= wordStart || sStart >= wordEnd) continue;
    const dr = spans[i].getBoundingClientRect();
    if (dr.width < 1 || dr.height < 1) continue;
    const spanLen = Math.max(1, spanNorm[i].length);
    const fracStart = Math.max(0, (wordStart - sStart) / spanLen);
    const fracEnd = Math.min(1, (wordEnd - sStart) / spanLen);
    const wLeft = dr.left + dr.width * fracStart;
    const wRight = dr.left + dr.width * fracEnd;
    top = Math.min(top, dr.top);
    bottom = Math.max(bottom, dr.bottom);
    left = Math.min(left, wLeft);
    right = Math.max(right, wRight);
  }
  if (!isFinite(top) || !isFinite(left) || right <= left) return null;

  return {
    top: top - layerRect.top,
    left: left - layerRect.left,
    width: Math.max(3, right - left),
    height: Math.max(10, bottom - top),
  };
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
  /** When true, the focusSnippet highlight persists until replaced instead of auto-clearing after ~2s — used while Study Speech is reading a sentence aloud. */
  focusHighlightPersist?: boolean;
  /**
   * Fires when the reader clicks on body text in the PDF (not a drag-selection).
   * The argument is a ~150-char snippet of the clicked line, used to start
   * "Read From Click" playback at that sentence.
   */
  onTextClick?: (snippet: string) => void;
  highlightTargets?: HighlightTarget[];
  /** Structured neighborhood highlights — when present, uses layered matching pipeline */
  highlightNeighborhoods?: HighlightNeighborhood[];
  focusedEvidenceId?: string | null;
  onEvidenceFocus?: (evidenceId: string) => void;
  /** Live word-by-word Speech position within focusedEvidenceId's anchor — drives
   *  a secondary Speechify-style live word box on top of the anchor highlight. */
  activeSpokenWord?: { anchorId: string | null; wordIndex: number; word: string; sentenceText?: string } | null;
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
  focusHighlightPersist,
  onTextClick,
  highlightTargets,
  highlightNeighborhoods,
  focusedEvidenceId,
  onEvidenceFocus,
  activeSpokenWord,
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
  const [overlayVersion, setOverlayVersion] = useState(0);
  // Speechify-style live word box — a small rect within the currently-spoken anchor's
  // highlight, recomputed per word-index change (cheap single-anchor re-measure, not a
  // full overlayRects rebuild). Null whenever word-level mapping isn't available —
  // callers fall back to the whole-anchor highlight already rendered via overlayRects.
  const [activeWordRect, setActiveWordRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  // Increments after every successful page render (including zoom-triggered re-renders).
  // Adding it to the rebuild effect deps ensures overlay rects recompute at the new scale.
  const [pageRenderKey, setPageRenderKey] = useState(0);
  // Tracks both highlightKey and pageRenderKey for the last rebuild run.
  // Prevents redundant RAF fires when neither content nor scale has changed.
  // pageRenderKey MUST be included: after zoom the key is unchanged but rect positions move.
  const prevRebuildRef = useRef<{ key: string | undefined; renderKey: number }>({ key: undefined, renderKey: -1 });

  // Hard-clear all overlay state when highlightKey changes.
  // overlayVersion increment forces the keyed wrapper to unmount+remount, guaranteeing DOM cleanup.
  useEffect(() => {
    if (highlightKey === undefined) return;
    console.log("[OVERLAY_CLEAR] highlightKey changed", { highlightKey });
    setOverlayRects([]);
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
      console.log("[OVERLAY_RENDER]", {
        count: overlayRects.length,
        version: overlayVersion,
        ids: overlayRects.slice(0, 8).map(r => r.id),
        kinds: overlayRects.slice(0, 8).map(r => r.semanticKind ?? r.level),
      });
    } else {
      console.log("[OVERLAY_RENDER]", { count: 0, version: overlayVersion, note: "no rects — left panel empty" });
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

    console.log("[FOCUSSNIPPET_MATCH]", {
      snippet:       focusSnippet.slice(0, 60),
      matched:       !!target,
      spansSearched: spans.length,
    });
    console.log("[TRACE focusSnippet]", {
      snippet: focusSnippet.slice(0, 70),
      spansSearched: spans.length,
      matched: !!target,
      matchedText: target ? (target.textContent || '').slice(0, 50) : null,
    });

    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.add("bg-yellow-300", "text-black", "rounded", "px-0.5", "ring-2", "ring-yellow-400");

    // While speech is actively reading (focusHighlightPersist), keep this sentence
    // highlighted until the next sentence's focusSnippet replaces it — the cleanup
    // below removes it then. Otherwise (one-off "Focus" clicks), auto-clear after 2.2s.
    if (focusHighlightPersist) {
      return () => target.classList.remove("bg-yellow-300", "text-black", "rounded", "px-0.5", "ring-2", "ring-yellow-400");
    }
    const timer = window.setTimeout(() => {
      target.classList.remove("bg-yellow-300", "text-black", "rounded", "px-0.5", "ring-2", "ring-yellow-400");
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [focusSnippet, currentPage, focusHighlightPersist]);

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

    if (!container || !hasTargets) {
      setOverlayRects([]);
      return;
    }

    // Dedup: skip RAF when neither content (highlightKey) nor scale (pageRenderKey) changed.
    // highlightKey encodes all anchor texts — unchanged key = same content.
    // pageRenderKey increments after every page render including zoom, so zoom always
    // triggers a rebuild even when anchor texts haven't changed (rect positions moved).
    if (
      highlightKey !== undefined &&
      highlightKey === prevRebuildRef.current.key &&
      pageRenderKey === prevRebuildRef.current.renderKey
    ) {
      console.log("[OVERLAY_DEDUP] key+renderKey unchanged — skipping rebuild", { highlightKey: highlightKey.slice(-60) });
      return;
    }
    prevRebuildRef.current = { key: highlightKey, renderKey: pageRenderKey };

    // Clear stale rects immediately before starting async matching.
    // Without this, old highlight rectangles persist in state for the entire
    // retry window (~10 attempts × 140ms) whenever new anchors fail to match
    // on the first try (e.g. text layer not yet painted).
    setOverlayRects([]);

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

      // ── OpenAI anchor highlights (only active highlight system) ─────────────
      console.log("[AI_HIGHLIGHT:received]", {
        targetCount: highlightTargets?.length ?? 0,
        ids: highlightTargets?.map((t) => t.evidenceRefId) ?? [],
        texts: highlightTargets?.map((t) => t.text?.slice(0, 40)) ?? [],
      });
      console.log("[PDF_HIGHLIGHT_LAYER]", {
        source: "finalStudyModel.visualAnchors via aiHighlightAnchors",
        targetCount: highlightTargets?.length ?? 0,
        ids: highlightTargets?.map((t) => t.evidenceRefId) ?? [],
        page: currentPage,
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
        //    Longer prefix/suffix windows (capped higher than before) make this far
        //    less likely to lock onto the wrong occurrence of a short, generic phrase
        //    elsewhere on the page — the main failure mode for paragraph/thought-unit
        //    length anchors and for RightPanel-concept → LeftPanel highlight accuracy.
        const maxPrefix = Math.min(10, Math.ceil(words.length * 0.6));
        const maxSuffix = Math.min(8, Math.floor(words.length * 0.4));
        const suffixWords = words.slice(-maxSuffix);

        // Sweep every prefix length from maxPrefix down to 3 (instead of a fixed
        // [maxPrefix, 6, 5, 4] list) so no viable prefix length is skipped.
        for (let count = maxPrefix; count >= 3; count -= 1) {
          if (count > words.length) continue;
          const prefix = words.slice(0, count).join(" ");
          if (prefix.length < 10) continue;
          const startIdx = concatText.indexOf(prefix);
          if (startIdx === -1) continue;

          // Try to pin the end with the last few words of the anchor. Search within a
          // generous window from the prefix end — OCR text can insert extra whitespace,
          // hyphenation, or footnote/heading interruptions between the prefix and the
          // anchor's true end, especially for paragraph-length spans. A wider window
          // only ever gives the suffix-pin more chances to succeed; it can't make an
          // already-correct match worse.
          const searchFrom = startIdx + prefix.length;
          const searchWindow = concatText.substring(searchFrom, searchFrom + baseText.length * 3 + 300);
          let endIdx = startIdx + baseText.length; // estimated fallback

          for (let sCount = maxSuffix; sCount >= 2; sCount -= 1) {
            if (sCount > suffixWords.length) continue;
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
        priorityTier?: OverlayRect["priorityTier"],
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
            priorityTier,
            top: top - 1,                    // shift up 1px for marker-swipe feel
            left,
            width,
            height: Math.min(height + 3, 40), // inflate 3px for marker-swipe feel
          });
          lineIndex++;
        }
        return lineRects;
      }

      // Ensure adjacent highlights on the same line never visually merge into one block —
      // "Apple Pencil marker" feel, not a solid paint bar. When two rects' vertical ranges
      // overlap and their horizontal ranges touch or overlap, trim the facing edges so a
      // minimum gap survives between them.
      function applyMinimumGap(input: OverlayRect[]): OverlayRect[] {
        const MIN_GAP = 3;
        const out = input.map((r) => ({ ...r }));
        for (let i = 0; i < out.length; i++) {
          for (let j = i + 1; j < out.length; j++) {
            const a = out[i];
            const b = out[j];
            const verticalOverlap = a.top < b.top + b.height && b.top < a.top + a.height;
            if (!verticalOverlap) continue;
            const [left, right] = a.left <= b.left ? [a, b] : [b, a];
            const gap = right.left - (left.left + left.width);
            if (gap < MIN_GAP) {
              const shrink = (MIN_GAP - gap) / 2;
              left.width = Math.max(4, left.width - shrink);
              right.left = right.left + shrink;
              right.width = Math.max(4, right.width - shrink);
            }
          }
        }
        return out;
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
          hasSpanBounds: !!(target.spanStart && target.spanEnd),
        });

        // Full span highlighting: when spanStart + spanEnd are provided, locate the full
        // concept span rather than just the short identifier text. This highlights everything
        // from the concept's opening words to its closing words (multi-sentence spans).
        let location: { startIdx: number; endIdx: number } | null = null;
        if (target.spanStart && target.spanEnd) {
          const startLoc = locateAnchor(normForConcat(target.spanStart));
          const endLoc   = locateAnchor(normForConcat(target.spanEnd));
          if (startLoc && endLoc && endLoc.endIdx > startLoc.startIdx) {
            location = { startIdx: startLoc.startIdx, endIdx: endLoc.endIdx };
            console.log("[AI_HIGHLIGHT:span-range]", {
              id:       target.evidenceRefId,
              spanStart: target.spanStart.slice(0, 40),
              spanEnd:   target.spanEnd.slice(0, 40),
              chars:     endLoc.endIdx - startLoc.startIdx,
            });
          }
        }
        if (!location) {
          location = locateAnchor(baseText);
        }
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
          const fbRects = lineRectsFromSpans(fbSpans, target.evidenceRefId, target.level, target.kind as OverlayRect["semanticKind"], target.priorityTier);
          console.log("[AI_HIGHLIGHT:matched]", { id: target.evidenceRefId, via: "fallback", lines: fbRects.length });
          rects.push(...fbRects);
          return;
        }

        const matchedSpans = spansForRange(location.startIdx, location.endIdx);
        const lineRects = lineRectsFromSpans(matchedSpans, target.evidenceRefId, target.level, target.kind as OverlayRect["semanticKind"], target.priorityTier);
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
      setOverlayRects(applyMinimumGap(rects));
    };

    console.log("[OVERLAY_SOURCE_USED]", { page: currentPage, targets: highlightTargets?.length ?? 0, highlightKey, overlayVersion });
    window.requestAnimationFrame(renderRects);
    return () => { cancelled = true; };
  // highlightKey must be in deps so a pageTruthKey change forces a rebuild even when
  // highlightTargets reference is identical (e.g. both [] after clear + empty new page).
  // pageRenderKey fires after every successful page render (including zoom changes) so
  // overlay rects are recomputed at the correct scale. effectiveZoom is a safety net.
  }, [highlightTargets, highlightNeighborhoods, currentPage, highlightKey, effectiveZoom, pageRenderKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Speechify-style live word box — recomputes only the active anchor's word position,
  // not the full overlayRects rebuild above. Falls back to null (whole-anchor highlight
  // only) when the anchor isn't currently rendered or word-level mapping fails.
  useEffect(() => {
    if (!activeSpokenWord) { setActiveWordRect(null); return; }
    console.log("[PDF_WORD_SYNC_RECEIVED]", {
      anchorId: activeSpokenWord.anchorId,
      word: activeSpokenWord.word,
      wordIndex: activeSpokenWord.wordIndex,
      hasSentenceText: !!activeSpokenWord.sentenceText,
    });
    const container = viewerRef.current;
    const textLayer = container?.querySelector('.react-pdf__Page__textContent, .textLayer');
    if (!textLayer) {
      console.warn("[PDF_WORD_SYNC_MISS] text layer not yet in DOM — page may still be rendering", {
        anchorId: activeSpokenWord.anchorId,
        word: activeSpokenWord.word,
      });
      setActiveWordRect(null); return;
    }
    // Prefer the exact sentence text being spoken — wordIndex counts within the sentence,
    // so using the sentence text gives accurate per-word positions even mid-thought-unit.
    // Fall back to the anchor's normalizedText for legacy callers without sentenceText.
    const target = activeSpokenWord.anchorId
      ? highlightTargets?.find((t) =>
          t.evidenceRefId === activeSpokenWord.anchorId || t.id === activeSpokenWord.anchorId
        )
      : undefined;
    const searchText = activeSpokenWord.sentenceText ?? (target?.normalizedText || target?.text) ?? null;
    if (!searchText) {
      console.warn("[PDF_WORD_SYNC_MISS] no search text available", {
        anchorId: activeSpokenWord.anchorId,
        word: activeSpokenWord.word,
        hasSentenceText: !!activeSpokenWord.sentenceText,
        targetFound: !!target,
        availableTargetIds: highlightTargets?.slice(0, 5).map(t => t.id) ?? [],
      });
      setActiveWordRect(null); return;
    }
    console.log("[PDF_WORD_SYNC_TARGET_MATCH]", {
      anchorId: activeSpokenWord.anchorId,
      word: activeSpokenWord.word,
      sentencePreview: searchText.slice(0, 60),
      wordIndex: activeSpokenWord.wordIndex,
    });
    const rect = computeActiveWordRect(textLayer, searchText, activeSpokenWord.wordIndex);
    if (!rect) {
      console.warn("[PDF_WORD_SYNC_MISS] word not found in text layer", {
        anchorId: activeSpokenWord.anchorId,
        word: activeSpokenWord.word,
        sentencePreview: searchText.slice(0, 80),
        wordIndex: activeSpokenWord.wordIndex,
        availableTargetIds: highlightTargets?.slice(0, 5).map(t => t.id) ?? [],
      });
    } else {
      console.log("[PDF_WORD_SYNC_RECT_RENDERED]", {
        anchorId: activeSpokenWord.anchorId,
        word: activeSpokenWord.word,
        wordIndex: activeSpokenWord.wordIndex,
        rect,
      });
    }
    setActiveWordRect(rect);
  }, [activeSpokenWord, currentPage, overlayRects, pageRenderKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    const selection = window.getSelection()?.toString().trim();
    if (selection) {
      if (onTextSelect) onTextSelect(selection);
      return;
    }

    // No drag-selection — treat as a click on body text for "Read From Click".
    if (!onTextClick) return;
    const target = e.target as HTMLElement;
    const span = target.closest('.react-pdf__Page__textContent span, .textLayer span') as HTMLElement | null;
    if (!span) return;

    // Gather nearby spans on the same line (±6px) to form a sentence-ish snippet,
    // mirroring the paragraph-detection logic used for scroll sync.
    const spans = Array.from(
      (span.closest('.react-pdf__Page__textContent, .textLayer') ?? viewerRef.current)?.querySelectorAll('span') ?? []
    ) as HTMLElement[];
    const targetTop = span.getBoundingClientRect().top;
    let snippet = '';
    for (const s of spans) {
      const top = s.getBoundingClientRect().top;
      if (Math.abs(top - targetTop) <= 6) {
        snippet += (s.textContent || '') + ' ';
        if (snippet.length > 150) break;
      }
    }
    snippet = snippet.trim();
    if (snippet.length >= 8) onTextClick(snippet);
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
                onRenderSuccess={() => { setPageRenderKey(k => k + 1); onPageRenderComplete?.(currentPage); }}
                onRenderError={(error) => {
                  console.error(`SmartPDFViewer: Page ${currentPage} render error:`, error);
                }}
                onGetTextSuccess={(textContent: any) => {
                  if (!onPageTextExtracted) return;
                  // Reconstruct line/paragraph structure from item geometry (transform
                  // y-coordinates) rather than flattening to a single space-joined
                  // string — see lib/pdf/structuredPageText for why this matters.
                  const text = buildStructuredPageText(textContent?.items ?? []);
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

              {overlayRects.length > 0 && (
                <React.Fragment key={`overlay-${highlightKey ?? ""}-${overlayVersion}`}>
                  {/* Dim veil sits below the evidence overlay (z-[19] < z-20).
                      Non-highlighted text recedes; decoded blocks jump forward. */}
                  <div
                    className="pointer-events-none absolute inset-0 z-[19] bg-slate-900/20"
                    aria-hidden
                  />
                  <PdfEvidenceOverlay
                    rects={(() => {
                      // Hard render-time guard: suppress any rect not in the current authorized set.
                      // authorizedHighlightIds comes from effectiveHighlightTargets so it always
                      // reflects the live studyModel anchors — stale rects are invisible even if
                      // they survived in overlayRects state past a highlightKey change.
                      // The focused anchor (e.g. clicked from the Thought Unit Navigator) is always
                      // allowed even if it fell outside the paint budget's authorized set — otherwise
                      // clicking a budget-excluded thought unit would have no rect to jump to.
                      const idsToAllow = [
                        ...(authorizedHighlightIds ?? []),
                        ...(focusedEvidenceId ? [focusedEvidenceId] : []),
                      ];
                      if (idsToAllow.length === 0) {
                        if (overlayRects.length > 0) {
                          console.log("[OVERLAY_DOM_CLEANUP] no authorized IDs — suppressing", overlayRects.length, "rects");
                        }
                        return [];
                      }
                      const allowed = new Set(idsToAllow.flatMap(id => [id, ...overlayRects.map(r => r.id).filter(rid => rid.startsWith(id))]));
                      const guarded = overlayRects.filter(r => allowed.has(r.id));
                      if (guarded.length !== overlayRects.length) {
                        console.log("[OVERLAY_DOM_CLEANUP] guard filtered", overlayRects.length, "→", guarded.length, "rects");
                      }
                      return guarded;
                    })()}
                    focusedId={focusedEvidenceId}
                    onFocus={onEvidenceFocus}
                  />
                </React.Fragment>
              )}

              {/* Speechify-style live word box — solid, on top of the soft anchor highlight */}
              {activeWordRect && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute z-30 transition-all duration-100"
                  style={{
                    top: activeWordRect.top,
                    left: activeWordRect.left,
                    width: activeWordRect.width,
                    height: activeWordRect.height,
                    borderRadius: "3px",
                    background: "rgba(253,224,71,0.85)",
                    boxShadow: "0 0 6px rgba(253,224,71,0.6)",
                  }}
                />
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
