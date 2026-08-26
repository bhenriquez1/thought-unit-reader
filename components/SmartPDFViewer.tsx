// components/SmartPDFViewer.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api"; // ✅ correct type source
import { useReaderSync } from "@/lib/readerSync";
import { usePDFLoading } from "@/lib/pdfLoadingManager";
import type { HighlightTarget } from "@/lib/readerContracts";
import PdfEvidenceOverlay, { type OverlayRect } from "@/components/pdf/PdfEvidenceOverlay";
import { buildStructuredPageText } from "@/lib/pdf/structuredPageText";
import type { HighlightNeighborhood } from "@/lib/highlights/buildHighlightNeighborhoods";
import type { RenderGuidedReadingPathResult } from "@/lib/highlights/renderGuidedReadingPath";
import { useReadingFocusStore, type ReadingCursor } from "@/lib/readingFocus/readingFocusStore";
import { resolveTargetGeometry, resolveWordGeometry } from "@/lib/pdf/resolveAnchorGeometry";
import { generateSmartTOC, type SmartTOCEntry } from "@/lib/smartTocGenerator";
import { extractPageText, renderPdfPageToDataUrl, shouldUseOCR } from "@/lib/page-intelligence/extractor";
import { TextLayerRegistry, buildPageTextIndexFromOCR } from "@/lib/page-intelligence/textLayerIndex";

// Keep react-pdf CSS imports in pages/_app.tsx (do not import here).

// Fixed render scale for SurgeonAnnotationPlan's hidden page-image capture — independent
// of effectiveZoom/the visible canvas. Tuned to keep the long edge under ~1536px for
// OpenAI vision cost/quality at detail:"high".
const SURGEON_CAPTURE_SCALE = 1.5;

// Fixed render scale for the OCR fallback's page-image capture (independent of
// effectiveZoom/the visible canvas, same reasoning as SURGEON_CAPTURE_SCALE).
// Shared by the renderPdfPageToDataUrl() call AND the OCR word-bbox ->
// viewport-space conversion in attemptOcrFallback below — both MUST use the
// same value, since Tesseract's returned bboxes are pixel coordinates within
// exactly this rendered image and buildPageTextIndexFromOCR divides by this
// scale to normalize them into TextLayerRegistry's scale=1 convention.
const OCR_RENDER_SCALE = 2.0;

/** Use the same-origin worker we ship in /public to avoid CDN/CORS issues */
try {
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
} catch {
  // react-pdf will surface a clearer error if this fails
}

// ---------------------------------------------------------------------------
// focusSnippet auto-scroll helpers
// ---------------------------------------------------------------------------

/** True when `el` is already fully visible within `container`'s viewport —
 *  used to gate auto-scroll so the reading marker doesn't yank the page on
 *  every sentence tick when the active text is already on screen, only when
 *  it has actually scrolled out of view. */
function isFullyVisibleInContainer(el: HTMLElement, container: HTMLElement): boolean {
  const elRect = el.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return elRect.top >= containerRect.top && elRect.bottom <= containerRect.bottom;
}

/** Outline (TOC) shape bubbled up to the page */
export type TocItem = {
  title: string;
  pageNumber?: number; // 1-based; may be undefined when unresolved
  items?: TocItem[];
};

// ── PdfPlayChipInner ─────────────────────────────────────────────────────────
// Rendered via portal into document.body to escape overflow:hidden on the PDF
// container. Positioned with position:fixed at the click viewport coordinates,
// shifted upward so it sits just above the clicked word.

interface PdfPlayChipInnerProps {
  pos: { x: number; y: number };
  cursor: ReadingCursor;
  onDismiss: () => void;
  onPlay: (cursor: ReadingCursor) => void;
}

function PdfPlayChipInner({ pos, cursor, onDismiss, onPlay }: PdfPlayChipInnerProps) {
  // Keyboard: Enter → play, Escape → dismiss.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onDismiss(); }
      else if (e.key === 'Enter') { onPlay(cursor); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cursor, onDismiss, onPlay]);

  // Outside click — delay by one tick so the same mouseup that opened the chip
  // doesn't immediately close it again.
  useEffect(() => {
    const tid = window.setTimeout(() => {
      const handler = () => onDismiss();
      window.addEventListener('click', handler, { once: true });
    }, 0);
    return () => window.clearTimeout(tid);
  }, [onDismiss]);

  // Clamp inside viewport: chip is 160px wide, 34px tall.
  const left = Math.max(8, Math.min(pos.x - 80, window.innerWidth - 168));
  const top  = Math.max(8, pos.y - 50);

  return (
    <button
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onPlay(cursor); }}
      style={{ position: 'fixed', left, top, zIndex: 9999 }}
      className="flex items-center gap-1.5 rounded-full border border-yellow-400/60 bg-gray-900/95 px-3 py-1.5 text-xs font-medium text-yellow-300 shadow-lg backdrop-blur-sm transition-opacity hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-yellow-400"
      aria-label="Read from here"
    >
      <span>▶</span>
      <span>Read from here</span>
    </button>
  );
}

export interface SmartPDFViewerProps {
  fileUrl: string;
  /** Stable document ID used to key the <Page> for reliable re-mounts. Falls back to fileUrl. */
  docId?: string;
  /** Canonical page identity ("<documentId>::<pageNumber>::t") — surfaced only
   *  in the [SURGEON_PIPELINE_DIAGNOSTIC] log below, never used for logic here
   *  (highlightKey, built by the caller, is still what drives rebuilds/clears). */
  pageTruthKey?: string;
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
  /**
   * Called once per page render with a base64 JPEG data URL of the CURRENT page,
   * captured from a hidden, fixed-scale render decoupled from the visible/zoomed
   * canvas (effectiveZoom). Used as the SurgeonAnnotationPlan vision input — never
   * fires from zoom/scroll, only from an actual page render.
   */
  onPageImageCaptured?: (page: number, dataUrl: string) => void;
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
  /**
   * Fires on every resolved PDF word click (single-click on body text or a highlight).
   * Carries a ReadingCursor with the canonical anchor ID and source word position.
   * Caller should call seekToCursor on StudySpeechPanel and setThoughtUnit on the store.
   * Does NOT start playback — the user must click the Play chip for that.
   */
  onPdfWordClick?: (cursor: ReadingCursor) => void;
  /**
   * Fires when the user presses the Play chip that appears after a PDF word click.
   * By this point seekToCursor has already been called (at click time); this callback
   * should call triggerPlay() on the speech panel to start playback from the primed cursor.
   */
  onPdfChipPlay?: (cursor: ReadingCursor) => void;
  /** Fired once when PDF loading fails — used to surface an honest error state upstream. */
  onLoadError?: (message: string) => void;
  /** Overrides the default URL-retry with an IDB-aware re-resolve (provided by index.tsx). */
  onRetry?: () => void;
  /** Domain-adaptive tier label overrides from the active SemanticPack.
   *  Passed through to PdfEvidenceOverlay to relabel highlight margin badges per domain
   *  (e.g. CONCEPT/FORMULA/APPLY/ERROR/EXAMPLE for chemistry instead of CORE/STEP/APPLY/TRAP/PEARL). */
  packTierLabels?: Partial<Record<string, string>>;
  /** Current page's raw extracted text length — [HIGHLIGHT_PIPELINE_TRACE]'s
   *  pageTextLength boundary count only, never used for logic here. */
  pageTextLength?: number;
  /** Total annotations SurgeonAnnotationPlan proposed for this page BEFORE quote
   *  grounding/density-limiting — [HIGHLIGHT_PIPELINE_TRACE]'s annotationCount. */
  surgeonAnnotationCount?: number;
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

/** Convert SmartTOCEntry[] (heading-detected) to TocItem[] for onOutline consumers.
 *  Uses `items` (not `children`) to match the local TocItem shape expected by
 *  handleOutlineExtraction in pages/index.tsx. */
function smartEntriesToTocItems(entries: SmartTOCEntry[]): TocItem[] {
  return entries.map((e) => ({
    title: e.title,
    pageNumber: e.pageNumber,
    items: e.children?.length ? smartEntriesToTocItems(e.children) : undefined,
  }));
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


// ---------------------------------------------------------------------------
// WordRectOverlay — isolated Zustand subscriber for word-level karaoke box.
// Moves the 4-30 Hz selectActiveSpokenWord subscription out of SmartPDFViewer
// so the PDF canvas and overlays don't re-render per word tick.
// ---------------------------------------------------------------------------

type WordRectState = { top: number; left: number; width: number; height: number } | null;

function WordRectOverlay({
  highlightTargets,
  currentPage,
  pageTruthKey,
  viewportScale,
  pageRenderKey,
}: {
  highlightTargets?: HighlightTarget[];
  currentPage: number;
  /** Reader stabilization fix #4 — the same page-identity key every other
   *  page-scoped effect in this app keys on. Included in this effect's own
   *  dependency array so a page change (i.e. a pageTruthKey change) tears
   *  down any in-flight resolution via React's own cleanup-before-next-run
   *  guarantee: the closure's `cancelled` flag flips true before a NEWER
   *  effect instance (for the new page) can start, so a rect resolved
   *  against the OLD page's geometry can never be applied after navigation —
   *  "stale pageTruthKey rejects movement," without a separate ref check. */
  pageTruthKey?: string;
  viewportScale: number;
  pageRenderKey: number;
}) {
  const activeAnchorId  = useReadingFocusStore(s => s.thoughtUnitId);
  const activeWordIndex = useReadingFocusStore(s => s.wordIndex);
  const activeWord      = useReadingFocusStore(s => s.word);
  const activeSentText  = useReadingFocusStore(s => s.sentenceText);
  const activeSpokenWord = React.useMemo(
    () => (activeWord || activeSentText)
      ? { anchorId: activeAnchorId, wordIndex: activeWordIndex, word: activeWord ?? "", sentenceText: activeSentText ?? undefined }
      : null,
    [activeAnchorId, activeWordIndex, activeWord, activeSentText],
  );
  const [wordRect, setWordRect] = useState<WordRectState>(null);

  useEffect(() => {
    if (!activeSpokenWord) { setWordRect(null); return; }
    // Canonical-ID-first: resolve the HighlightTarget by canonicalAnchorId so the PDF
    // rect is always grounded in the same Thought Unit identity that drives LeftPanel and
    // Expert Brain. sentenceText (= verbatim rawText from the speech segment) is preferred
    // over target.normalizedText — it is the exact PDF text, never a paraphrase or prefix.
    // Text-only path (sentenceText without a target) applies only to unanchored segments
    // such as some Current Page sentences that legitimately have no canonical anchor.
    const target = activeSpokenWord.anchorId
      ? highlightTargets?.find((t) =>
          t.evidenceRefId === activeSpokenWord.anchorId || t.id === activeSpokenWord.anchorId
        )
      : undefined;
    const searchText = activeSpokenWord.sentenceText ?? (target?.normalizedText || target?.text) ?? null;
    if (!searchText) {
      console.warn("[PDF_WORD_SYNC_MISS] no search text", { anchorId: activeSpokenWord.anchorId });
      setWordRect(null); return;
    }
    const word = activeSpokenWord;
    const text = searchText as string;
    const pageIndex = currentPage - 1;
    let cancelled = false;
    let retryTid: ReturnType<typeof setTimeout> | null = null;
    // Grounded via resolveWordGeometry — the SAME TextLayerRegistry token
    // index Surgeon highlighting resolves geometry from (lib/pdf/
    // resolveAnchorGeometry.ts), not an independent DOM text-layer search.
    // The registry is populated once per document load (lib/pdfjs-handler.ts),
    // independent of react-pdf's own per-page text-layer DOM mount timing —
    // this single short retry only covers the rare case the registry itself
    // hasn't finished building yet, not a DOM-mount race.
    function runCompute(retryCount: number) {
      if (cancelled) return;
      const r = resolveWordGeometry(pageIndex, text, word.wordIndex, viewportScale);
      if (!r && retryCount < 2) { retryTid = setTimeout(() => runCompute(retryCount + 1), 150); return; }
      if (cancelled) return;
      if (!r) console.warn("[PDF_WORD_SYNC_MISS] word not found in TextLayerRegistry", { anchorId: word.anchorId, word: word.word });
      setWordRect(r ? { top: r.y, left: r.x, width: r.w, height: r.h } : null);
      // Publish the rendered word anchor to the focus store so [CANONICAL_SYNC]
      // can report pdfWordRendered from observed state, not assumption.
      useReadingFocusStore.getState().setPdfRenderedWordAnchor(r ? (word.anchorId ?? null) : null);
    }
    // Clear stale pre-zoom coordinates immediately so the word highlight doesn't
    // flicker at the wrong position for the duration of the recompute.
    setWordRect(null);
    useReadingFocusStore.getState().setPdfRenderedWordAnchor(null);
    runCompute(0);
    return () => { cancelled = true; if (retryTid) clearTimeout(retryTid); };
  }, [activeSpokenWord, currentPage, pageTruthKey, viewportScale, pageRenderKey, highlightTargets]);

  if (!wordRect) return null;
  // Underline-style marker, not a solid fill — it sits beside/under the
  // active word instead of covering the glyphs.
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-30 transition-all duration-100"
      style={{ top: wordRect.top, left: wordRect.left, width: wordRect.width, height: wordRect.height }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: -3,
          height: 3,
          borderRadius: 2,
          background: "rgba(253,224,71,0.9)",
          boxShadow: "0 0 5px rgba(253,224,71,0.7)",
        }}
      />
    </div>
  );
}

export default function SmartPDFViewer({
  fileUrl,
  pageTruthKey,
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
  isPageChanging = false,
  onPageRenderComplete,
  onPageTextExtracted,
  onPageImageCaptured,
  onReadingPath,
  roleLabelByConceptId,
  highlightKey,
  authorizedHighlightIds,
  onPdfWordClick,
  onPdfChipPlay,
  onLoadError,
  onRetry: onRetryProp,
  packTierLabels,
  pageTextLength,
  surgeonAnnotationCount,
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

  // ── PDF Play Chip ──────────────────────────────────────────────────────────
  // Tooltip-style chip that appears near a clicked word and lets the user start
  // speech from that exact position. Dismissed on scroll, zoom, page change, Escape.
  const [chipCursor, setChipCursor] = useState<ReadingCursor | null>(null);
  const [chipPos, setChipPos]       = useState<{ x: number; y: number } | null>(null);
  const dismissChip = useCallback(() => { setChipCursor(null); setChipPos(null); }, []);

  // Increments after every successful page render (including zoom-triggered re-renders).
  // Adding it to the rebuild effect deps ensures overlay rects recompute at the new scale.
  const [pageRenderKey, setPageRenderKey] = useState(0);
  // Tracks both highlightKey and pageRenderKey for the last rebuild run.
  // Prevents redundant RAF fires when neither content nor scale has changed.
  // pageRenderKey MUST be included: after zoom the key is unchanged but rect positions move.
  const prevRebuildRef = useRef<{ key: string | undefined; renderKey: number }>({ key: undefined, renderKey: -1 });
  // Monotonically-increasing generation counter for overlay rebuilds.
  // Each effect invocation claims a new generation; stale rAF/timeout completions
  // compare against the current value and drop their results if superseded.
  const rebuildGenerationRef = useRef(0);

  // Clear overlay rects when zoom changes — rects computed against pre-zoom DOM are wrong.
  // Correct rects reappear once pageRenderKey increments (page re-renders at new scale).
  // Also dismiss the Play chip — its fixed position is meaningless at the new scale.
  useEffect(() => {
    setOverlayRects([]);
    useReadingFocusStore.getState().setPdfRenderedAnchors([]);
    useReadingFocusStore.getState().setAnnotationRenderStage(null, null);
    dismissChip();
  }, [effectiveZoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dismiss chip on document change (fileUrl or docId).
  useEffect(() => { dismissChip(); }, [fileUrl, docId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dismiss chip on any scroll anywhere in the document (capture phase catches child scrolls).
  useEffect(() => {
    if (!chipCursor) return;
    const onScroll = () => dismissChip();
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, [chipCursor, dismissChip]);

  // Dismiss chip when TTS playback starts (so a stale chip never sits over an active reading session).
  useEffect(() => {
    if (!chipCursor) return;
    return useReadingFocusStore.subscribe((state) => {
      if (state.playbackState === 'playing' || state.playbackState === 'loading') {
        dismissChip();
      }
    });
  }, [chipCursor, dismissChip]);

  // Hard-clear all overlay state when highlightKey changes.
  // overlayVersion increment forces the keyed wrapper to unmount+remount, guaranteeing DOM cleanup.
  useEffect(() => {
    if (highlightKey === undefined) return;
    console.log("[OVERLAY_CLEAR] highlightKey changed", { highlightKey });
    setOverlayRects([]);
    useReadingFocusStore.getState().setPdfRenderedAnchors([]);
    useReadingFocusStore.getState().setAnnotationRenderStage(null, null);
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
  // Hidden fixed-scale render used only for SurgeonAnnotationPlan image capture —
  // separate from the visible/zoomed canvas so effectiveZoom never affects it.
  const captureContainerRef = useRef<HTMLDivElement>(null);
  // Sentence-focus marker (stabilization fix) — the resolved rect backing
  // focusSnippet's auto-scroll/highlight, via resolveTargetGeometry (the
  // SAME canonical TextLayerRegistry-backed resolver highlights and the
  // word marker use), never an independent DOM text-layer search.
  const sentenceFocusMarkerRef = useRef<HTMLDivElement>(null);
  const [sentenceFocusRect, setSentenceFocusRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
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

  // Stabilization fix: resolve focusSnippet through the SAME canonical
  // TextLayerRegistry-backed resolver (resolveTargetGeometry) that
  // highlights and the word marker already use — not an independent
  // 0.45-score fuzzy DOM-span matcher. resolveTargetGeometry only returns
  // rects once the FULL quote is verified word-by-word at the found
  // position (see resolveAnchorGeometry.ts's verifyFullQuoteMatch); when it
  // can't prove an exact/normalized location, rects is empty and this
  // effect does nothing — no fallback guess, no jump to a wrong sentence.
  useEffect(() => {
    if (!focusSnippet || focusSnippet.trim().length < 8) { setSentenceFocusRect(null); return; }
    const resolved = resolveTargetGeometry(currentPage - 1, focusSnippet, effectiveZoom);
    const rects = resolved.rects;
    console.log("[FOCUSSNIPPET_MATCH]", {
      snippet:          focusSnippet.slice(0, 60),
      matched:          rects.length > 0,
      source:           resolved.source,
      boundaryComplete: resolved.boundaryComplete,
    });

    if (rects.length === 0) { setSentenceFocusRect(null); return; }
    const r = rects[0];
    setSentenceFocusRect({ top: r.y, left: r.x, width: r.w, height: r.h });

    // While speech is actively reading (focusHighlightPersist), keep this sentence
    // highlighted until the next sentence's focusSnippet replaces it. Otherwise
    // (one-off "Focus" clicks), auto-clear after 2.2s.
    if (focusHighlightPersist) return;
    const timer = window.setTimeout(() => setSentenceFocusRect(null), 2200);
    return () => window.clearTimeout(timer);
  }, [focusSnippet, currentPage, effectiveZoom, focusHighlightPersist]);

  // Auto-scroll the resolved sentence marker into view — only when it has
  // actually left the viewport, not on every sentence tick. Drives off the
  // real marker element's own getBoundingClientRect() via scrollIntoView,
  // same mechanism the prior DOM-span implementation used, just anchored to
  // a canonically-resolved position instead of a fuzzy-matched span.
  useEffect(() => {
    if (!sentenceFocusRect) return;
    const marker = sentenceFocusMarkerRef.current;
    const container = viewerRef.current;
    if (!marker || !container) return;
    if (!isFullyVisibleInContainer(marker, container)) {
      marker.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [sentenceFocusRect]);

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
    const myGen = ++rebuildGenerationRef.current;

    // Do NOT clear overlayRects here — old rects stay visible as a placeholder
    // during the async retry loop (up to 5 s while the text layer paints).
    // The highlightKey-change effect above already clears them synchronously when
    // the content truly changes; clearing again here would blank the overlay for
    // the entire retry window (RC-5). pdfRenderedAnchors IS cleared immediately
    // so the focus system doesn't report stale anchors as rendered.
    useReadingFocusStore.getState().setPdfRenderedAnchors([]);

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
          let endIdx: number | null = null;

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

          // P0 fix — this prefix match used to fall back to a blind
          // startIdx + baseText.length estimate whenever no suffix word run
          // could be pinned in the page text, and returned that guess
          // immediately without ever trying a different prefix length. An
          // unverified end offset can overshoot into the next sentence or
          // undershoot mid-word — geometry built from it renders as a wrong
          // or fragmented highlight rather than a coarser-but-correct one.
          // Only accept a match whose END was actually found in the page
          // text; if this prefix length can't pin an end, try a shorter one
          // instead of accepting the guess.
          if (endIdx === null) continue;

          // P0 follow-up — trying shorter prefixes (above) opened a second
          // failure mode: a shorter prefix consumes less of the anchor
          // before the suffix search starts, exposing more of the anchor's
          // OWN middle text to that search. If the true suffix phrase also
          // occurs earlier — inside the anchor itself (e.g. a repeated key
          // term) or, for very short/generic prefixes, at an unrelated spot
          // on the page — the suffix can pin to that coincidental earlier
          // occurrence instead of the anchor's real end, producing a
          // "verified" but truncated or wrong span. A genuine match should
          // still cover most of the anchor's own length; reject anything
          // suspiciously short and try the next prefix instead.
          if (endIdx - startIdx < baseText.length * 0.5) continue;

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
        reason?: OverlayRect["reason"],
        treatment?: OverlayRect["treatment"],
        canonicalType?: OverlayRect["canonicalType"],
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
            treatment,
            canonicalType,
            priorityTier,
            reason,
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
      // Per-target resolution outcome, for the [SURGEON_PIPELINE_DIAGNOSTIC]
      // summary below — the ONLY place that previously existed to infer this
      // was diffing canonicalTargetCount vs rectCountAfterDedup in
      // [PDF_OVERLAY_REBUILD], which conflates "resolved via geometry",
      // "resolved via legacy DOM fallback", and "dropped entirely" into one
      // number. Never logs target.text — only the count and (for failures)
      // the non-identifying evidenceRefId.
      let geometryResolvedCount = 0;
      highlightTargets!.forEach((target) => {
        // ── Anchor-driven fast path (Phase 2.5) ──────────────────────────────
        // Attempt geometry resolution via TextLayerRegistry before falling back
        // to DOM span matching. Synthetic anchors are suppressed entirely.
        if (target.groundingState === "synthetic") {
          console.log("[GEOMETRY_RESOLUTION]", { id: target.evidenceRefId, source: "none", reason: "synthetic" });
          return;
        }
        const anchorGeo = resolveTargetGeometry(
          target.page - 1,
          target.text,
          effectiveZoom,
          target.pdfTextItemIndexes,
          target.groundingState,
        );
        if (anchorGeo.rects.length > 0) {
          geometryResolvedCount++;
          // Development diagnostics for per-highlight fidelity — see
          // lib/pdf/resolveAnchorGeometry.ts's GeometryResolutionDiagnostics.
          // Never persisted, never surfaced in UI.
          console.log("[GEOMETRY_RESOLUTION]", {
            id: target.evidenceRefId,
            source: anchorGeo.source,
            resolutionStrategy: anchorGeo.source,
            rects: anchorGeo.rects.length,
            geometryRectCount: anchorGeo.geometryRectCount,
            expectedWordCount: anchorGeo.expectedWordCount,
            matchedWordCount: anchorGeo.matchedWordCount,
            boundaryComplete: anchorGeo.boundaryComplete,
            sourceSentenceId: target.sourceSentenceId ?? null,
            sourceCharStart: target.sourceCharStart ?? null,
            sourceCharEnd: target.sourceCharEnd ?? null,
          });
          anchorGeo.rects.forEach((b, bIdx) => {
            rects.push({
              id: bIdx === 0 ? target.evidenceRefId : `${target.evidenceRefId}-${bIdx}`,
              top:    b.y - 1,
              left:   b.x,
              width:  b.w,
              height: Math.min(Math.max(13, b.h + 3), 40),
              level:  target.level,
              semanticKind: target.kind as OverlayRect["semanticKind"],
              treatment: target.treatment,
              canonicalType: target.canonicalType,
              priorityTier: target.priorityTier,
              reason: target.reason,
            });
          });
          return;
        }
        // Anchor-driven resolution did not produce a COMPLETE, verified match —
        // most commonly unresolvedReason "incomplete-match" (a candidate quote
        // was found via the bounded-prefix search but didn't verify word-for-word
        // at that position — see resolveAnchorGeometry.ts). Logged before the
        // DOM fallback below so a partial-match rejection is visible even when
        // the fallback later succeeds and would otherwise mask it.
        console.log("[GEOMETRY_RESOLUTION_UNRESOLVED]", {
          id: target.evidenceRefId,
          resolutionStrategy: anchorGeo.source,
          unresolvedReason: anchorGeo.unresolvedReason,
          expectedWordCount: anchorGeo.expectedWordCount,
          matchedWordCount: anchorGeo.matchedWordCount,
          boundaryComplete: anchorGeo.boundaryComplete,
        });
        // Fall through to DOM-based matching (logged as "legacy-dom" below).
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
          const fbRects = lineRectsFromSpans(fbSpans, target.evidenceRefId, target.level, target.kind as OverlayRect["semanticKind"], target.priorityTier, target.reason, target.treatment, target.canonicalType);
          if (fbRects.length > 0) geometryResolvedCount++;
          console.log("[AI_HIGHLIGHT:matched]", { id: target.evidenceRefId, via: "fallback", lines: fbRects.length });
          rects.push(...fbRects);
          return;
        }

        const matchedSpans = spansForRange(location.startIdx, location.endIdx);
        const lineRects = lineRectsFromSpans(matchedSpans, target.evidenceRefId, target.level, target.kind as OverlayRect["semanticKind"], target.priorityTier, target.reason, target.treatment, target.canonicalType);
        if (lineRects.length > 0) geometryResolvedCount++;
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
      const staleBuildCancelled = rebuildGenerationRef.current !== myGen;
      const afterDedup = applyMinimumGap(rects);
      console.log("[PDF_OVERLAY_REBUILD]", {
        page: currentPage,
        zoom: effectiveZoom,
        generation: myGen,
        canonicalTargetCount: highlightTargets?.length ?? 0,
        rectCountBeforeDedup: rects.length,
        rectCountAfterDedup: afterDedup.length,
        staleBuildCancelled,
      });
      // Production-safe pipeline trace — counts only, never annotation text,
      // so this is safe to leave enabled in production for diagnosing "the
      // right panel shows a grounded concept but the PDF isn't highlighted"
      // reports. groundedCount === canonicalTargetCount by
      // construction (groundedAnnotationsToHighlightTargets in
      // useSurgeonAnnotations.ts is a 1:1 map — see that file's own log for
      // returnedAnnotationCount, the stage before grounding).
      //   planner annotation → grounded quote → resolved sentence →
      //   PDF text-layer match → geometry rectangles → PdfEvidenceOverlay render
      const canonicalTargetCount = highlightTargets?.length ?? 0;
      // Two pipeline stages AFTER quote grounding that previously had no
      // signal outside this console.log: a grounded quote can still fail to
      // locate in the live PDF text layer at all (geometry_resolution — the
      // most likely explanation for "the AI proposed several annotations
      // but only one/none actually appear on the page"), or resolve to
      // geometry that the final dedup pass then drops entirely (render).
      // null means either nothing to resolve, every target located, or only
      // a MINORITY (<half) failed to locate — a single occasional miss from
      // minor PDF-text-extraction whitespace differences isn't itself an
      // error state; a majority silently vanishing is. Same "at least half"
      // threshold pages/api/page-annotation-plan.ts's own quotesPlausible()
      // already uses, for consistency.
      const geometryDropRatio = canonicalTargetCount > 0
        ? (canonicalTargetCount - geometryResolvedCount) / canonicalTargetCount
        : 0;
      const renderStage: "geometry_resolution" | "overlay_render" | null =
        canonicalTargetCount === 0     ? null
        : geometryDropRatio >= 0.5     ? "geometry_resolution"
        : afterDedup.length === 0      ? "overlay_render"
        : null;
      console.log("[SURGEON_PIPELINE_DIAGNOSTIC]", {
        pageTruthKey:            pageTruthKey ?? null,
        documentId:              docId ?? null,
        pageNumber:              currentPage,
        groundedCount: canonicalTargetCount,
        geometryResolvedCount,
        geometryFailedCount:     canonicalTargetCount - geometryResolvedCount,
        renderedAnnotationCount: afterDedup.length,
        renderStage,
      });
      // Unified end-to-end trace, one boundary count per pipeline stage:
      //   currentPageText -> page-annotation-plan -> annotations -> exactQuote
      //   -> sentence expansion -> resolveAnchorGeometry -> PdfEvidenceOverlay.
      // annotationCount is the AI's raw proposal count (pre-grounding); the gap
      // between it and groundedQuoteCount is quotes that failed verbatim/
      // normalized verification against the live page text. The gap between
      // groundedQuoteCount and geometryRectCount is grounded quotes that
      // resolveAnchorGeometry/DOM-fallback still couldn't locate in the
      // rendered PDF text layer. The gap between geometryRectCount and
      // renderedOverlayCount is rects the final dedup/orphan-filter pass
      // dropped. Never logs annotation text — counts only.
      console.log("[HIGHLIGHT_PIPELINE_TRACE]", {
        pageTruthKey:       pageTruthKey ?? null,
        pageTextLength:     pageTextLength ?? null,
        annotationCount:    surgeonAnnotationCount ?? null,
        groundedQuoteCount: canonicalTargetCount,
        geometryRectCount:  geometryResolvedCount,
        renderedOverlayCount: afterDedup.length,
      });
      if (staleBuildCancelled) return;
      setOverlayRects(afterDedup);
      // Write the set of actually-rendered evidenceRefIds to the focus store so
      // [CANONICAL_SYNC] can report pdfAnchorRendered from observed state, not assumption.
      useReadingFocusStore.getState().setPdfRenderedAnchors(
        [...new Set(afterDedup.map(r => r.id).filter(Boolean))]
      );
      useReadingFocusStore.getState().setAnnotationRenderStage(
        renderStage,
        canonicalTargetCount === 0 ? null : {
          grounded:         canonicalTargetCount,
          geometryResolved: geometryResolvedCount,
          rendered:         afterDedup.length,
        },
      );
    };

    console.log("[OVERLAY_SOURCE_USED]", { page: currentPage, targets: highlightTargets?.length ?? 0, highlightKey, overlayVersion });
    window.requestAnimationFrame(renderRects);
    return () => { cancelled = true; };
  // highlightKey must be in deps so a pageTruthKey change forces a rebuild even when
  // highlightTargets reference is identical (e.g. both [] after clear + empty new page).
  // pageRenderKey fires after every successful page render (including zoom changes) — rects
  // are computed against the live DOM at that point, so positions are always correct.
  // effectiveZoom is intentionally NOT in deps: the zoom-clear effect above wipes rects
  // immediately on zoom, and they recompute here only after the page re-renders.
  }, [highlightTargets, highlightNeighborhoods, currentPage, highlightKey, pageRenderKey]); // eslint-disable-line react-hooks/exhaustive-deps


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

  useEffect(() => {
    if (hasError && onLoadError) {
      onLoadError(loadingError ?? 'PDF failed to load');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasError]);

  // ── OCR fallback (stabilization fix) ────────────────────────────────────
  // onGetTextSuccess below only ever sees the PDF.js NATIVE text layer — a
  // scanned/image-only page returns near-empty items and there is no OCR
  // call anywhere on that path, so such a page silently never gets a
  // pageText at all (the root cause traced in the verification audit).
  // Reuses the EXISTING OCR engine (lib/page-intelligence/extractor.ts,
  // tesseract.js + IDB cache) rather than a new one, and writes its result
  // through the exact same onPageTextExtracted(pageNumber, text) callback
  // the native path already uses — so OCR output enters the same canonical
  // pageText -> annotation planning -> grounding -> highlights pipeline,
  // never a parallel one.
  //
  // Always current page identity — read inside the OCR completion handler
  // (which resolves well after this render) so a result for a page the
  // student has since navigated away from is provably stale, not inferred
  // from a possibly-stale closed-over value.
  const livePageIdentityRef = useRef({ page: currentPage, pageTruthKey });
  useEffect(() => {
    livePageIdentityRef.current = { page: currentPage, pageTruthKey };
  }, [currentPage, pageTruthKey]);

  // Single in-flight OCR run at a time — aborted whenever the page/document
  // identity moves on, so a slow OCR/Tesseract pass for a page the student
  // already left never lands. Native-text extraction is unaffected; this
  // only cancels the OCR fallback's own async work.
  const ocrAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      ocrAbortRef.current?.abort();
      ocrAbortRef.current = null;
    };
  }, [currentPage, docId, pageTruthKey]);

  // Keys already attempted this session (docId:pageNumber) — extractPageText
  // itself checks the IDB cache before running Tesseract, so a repeat call
  // is cheap, but this still prevents rapid duplicate onGetTextSuccess fires
  // (react-pdf can refire on the same page) from starting concurrent
  // Tesseract runs for the same page.
  const ocrAttemptedKeysRef = useRef<Set<string>>(new Set());

  const attemptOcrFallback = useCallback(async (nativeText: string) => {
    if (!docId || !pdfDocument) return; // OCR cache is keyed by docId — never OCR without one
    if (!shouldUseOCR(nativeText)) return; // native text layer already usable — never OCR a normal text PDF

    const requestPage = currentPage;
    const requestPageTruthKey = pageTruthKey;
    const requestKey = `${docId}:${requestPage}`;
    if (ocrAttemptedKeysRef.current.has(requestKey)) return;
    ocrAttemptedKeysRef.current.add(requestKey);

    // Captured before the async Tesseract pass — see the TextLayerRegistry.set()
    // call below for why this matters (guards against a document switch that
    // clears the registry while OCR is still running).
    const requestTextEpoch = TextLayerRegistry.currentEpoch();

    ocrAbortRef.current?.abort();
    const controller = new AbortController();
    ocrAbortRef.current = controller;

    try {
      const result = await extractPageText({
        pageNumber: requestPage,
        docId,
        getNativeText: async () => nativeText,
        getPageImageDataUrl: () => renderPdfPageToDataUrl(pdfDocument, requestPage, OCR_RENDER_SCALE),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const live = livePageIdentityRef.current;
      if (live.page !== requestPage || live.pageTruthKey !== requestPageTruthKey) {
        console.log("[OCR_STALE_RESULT_REJECTED]", { requestPage, currentPage: live.page });
        return;
      }
      const ocrText = result.mergedText ?? "";
      if (ocrText.length > 20) {
        console.log("[OCR_FALLBACK_APPLIED]", { page: requestPage, source: result.source, confidence: result.confidence, chars: ocrText.length });
        onPageTextExtracted?.(requestPage, ocrText);

        // R5 — an OCR'd page has no PDF.js text-layer items (a scanned page's
        // textContent.items is empty), so without this, every highlight/eye-
        // guide geometry lookup on this page would silently resolve to
        // nothing even though the text above is now correct. Registers the
        // SAME viewport-space-at-scale-1 convention native pages use — see
        // buildPageTextIndexFromOCR's header comment — so every downstream
        // consumer (Surgeon highlights, word-level eye guide, Professor's
        // SOURCE_VERBATIM tracking) works unmodified.
        if (result.ocrWords?.length) {
          TextLayerRegistry.set(
            buildPageTextIndexFromOCR(requestPage - 1, result.ocrWords, OCR_RENDER_SCALE, ocrText),
            requestTextEpoch,
          );
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      console.error("[SmartPDFViewer] OCR fallback failed:", err);
      ocrAttemptedKeysRef.current.delete(requestKey); // allow a later retry (e.g. user returns to this page)
    }
  }, [docId, pdfDocument, currentPage, pageTruthKey, onPageTextExtracted]);

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
      console.log("[PARENT_WRITE:SmartPDFViewer] onPageCount", pageCount);
      onPageCount?.(pageCount);
    }
  }, [pageCount, onPageCount]);

  // Handle outline extraction when document is loaded.
  // Primary: PDF bookmarks via getOutline() with resolved page numbers.
  // Fallback: generateSmartTOC heading detection when bookmarks are absent.
  useEffect(() => {
    if (!pdfDocument || !onOutline) return;

    const extractOutline = async () => {
      try {
        const raw = await (pdfDocument as any).getOutline?.();
        if (raw?.length) {
          const items = await resolveOutline(pdfDocument, raw);
          onOutline(items);
          console.log(`[TOC_OUTLINE_BOOKMARKS]`, { items: items.length });
          return;
        }
      } catch (error) {
        console.warn(`[TOC_OUTLINE_EXTRACT_FAIL]`, error);
      }

      // No bookmarks — run smart heading detection so syllabusToc is populated
      // from real page text rather than the thoughtUnits proxy.
      try {
        const result = await generateSmartTOC(pdfDocument);
        if (result.entries.length > 0) {
          const tocItems = smartEntriesToTocItems(result.entries);
          onOutline(tocItems);
          console.log(`[TOC_SMART_HEADING]`, { source: result.source, items: tocItems.length, ms: Math.round(result.processingTimeMs) });
        } else {
          onOutline([]);
          console.log(`[TOC_NO_STRUCTURE]`);
        }
      } catch (error) {
        console.warn(`[TOC_SMART_TOC_FAIL]`, error);
        onOutline([]);
      }
    };

    extractOutline();
  }, [pdfDocument, onOutline]);

  useEffect(() => {
    setPageInput(String(currentPage));
    dismissChip(); // stale chip position is meaningless on page change
  }, [currentPage]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // No drag-selection — resolve the clicked word to a ReadingCursor.
    const target = e.target as HTMLElement;
    const span = target.closest('.react-pdf__Page__textContent span, .textLayer span') as HTMLElement | null;
    if (!span) return;

    // Estimate character offset within the span using caretRangeFromPoint.
    const range = (document as any).caretRangeFromPoint?.(e.clientX, e.clientY) as Range | null;
    const charOffset = (range?.startContainer?.parentElement?.closest('.react-pdf__Page__textContent span, .textLayer span') === span)
      ? (range?.startOffset ?? 0)
      : 0;

    // Derive the word index from charOffset within the span text.
    const spanText = span.textContent ?? '';
    const wordsBeforeOffset = spanText.slice(0, charOffset).trim().split(/\s+/).filter(Boolean);
    const sourceWordIndex = wordsBeforeOffset.length;

    // Build the line-level snippet (mirrors existing onTextClick logic).
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

    // ── Cursor resolution — 5-level cascade ─────────────────────────────────
    // A. Direct overlay-rect hit (click lands inside a painted anchor rect).
    const viewerRect = viewerRef.current?.getBoundingClientRect();
    const relX = e.clientX - (viewerRect?.left ?? 0);
    const relY = e.clientY - (viewerRect?.top ?? 0);
    let resolvedAnchorId: string | null = null;
    let resolutionStrategy: 'overlay-hit' | 'text-range-match' | 'nearest-anchor' | 'unanchored-page' = 'unanchored-page';

    for (const rect of overlayRects) {
      if (relX >= rect.left && relX <= rect.left + rect.width &&
          relY >= rect.top && relY <= rect.top + rect.height) {
        resolvedAnchorId = rect.id;
        resolutionStrategy = 'overlay-hit';
        break;
      }
    }

    // B+C. Text-range match against highlightTargets.
    if (!resolvedAnchorId && snippet.length >= 8 && highlightTargets?.length) {
      const needle = snippet.slice(0, 60).toLowerCase();
      const hit = highlightTargets.find(t => {
        const hay = t.normalizedText.slice(0, 80).toLowerCase();
        return hay.includes(needle.slice(0, 40)) || needle.includes(hay.slice(0, 40));
      });
      if (hit) {
        resolvedAnchorId = hit.evidenceRefId;
        resolutionStrategy = 'text-range-match';
      }
    }

    // D. Nearest painted anchor rect — column-aware to avoid cross-column false matches.
    // Pass 1: same visual line (click Y within rect's vertical span ±4px).
    // Pass 2: same column (|Δx| ≤ 150px) and close vertically (|Δy| ≤ 200px).
    // If neither pass finds a candidate, remain unanchored (null).
    if (!resolvedAnchorId && overlayRects.length > 0) {
      const sameLine = overlayRects.filter(
        r => relY >= r.top - 4 && relY <= r.top + r.height + 4
      );
      if (sameLine.length > 0) {
        let minDx = Infinity, nearest: string | null = null;
        for (const r of sameLine) {
          const dx = Math.abs(r.left + r.width / 2 - relX);
          if (dx < minDx) { minDx = dx; nearest = r.id; }
        }
        if (minDx <= 300 && nearest) {
          resolvedAnchorId = nearest;
          resolutionStrategy = 'nearest-anchor';
        }
      } else {
        // Column-aware: only consider rects whose horizontal center is within 150px
        // (same column) and vertically within 200px — avoids crossing into adjacent columns.
        let minDist = Infinity, nearest: string | null = null;
        for (const r of overlayRects) {
          const dx = Math.abs(r.left + r.width / 2 - relX);
          const dy = Math.abs(r.top + r.height / 2 - relY);
          if (dx <= 150 && dy <= 200) {
            const dist = Math.hypot(dx, dy);
            if (dist < minDist) { minDist = dist; nearest = r.id; }
          }
        }
        if (nearest) {
          resolvedAnchorId = nearest;
          resolutionStrategy = 'nearest-anchor';
        }
      }
    }

    // E. Unanchored page cursor — canonicalAnchorId stays null.

    const confidence = resolutionStrategy === 'overlay-hit'    ? 1.0
                     : resolutionStrategy === 'text-range-match' ? 0.8
                     : resolutionStrategy === 'nearest-anchor'  ? 0.4
                     : 0.1;

    console.log("[PDF_SEMANTIC_CLICK]", {
      page: currentPage,
      clickedText: spanText.slice(0, 60),
      sourceWordIndex,
      sourceCharOffset: charOffset,
      resolvedAnchorId,
      resolutionStrategy,
      confidence,
    });

    const cursor: ReadingCursor = {
      canonicalAnchorId: resolvedAnchorId,
      sourcePage: currentPage,
      sourceText: snippet.length >= 8 ? snippet : spanText,
      sourceWordIndex,
      sourceCharOffset: charOffset,
    };

    // Show the Play chip at click position (fixed viewport coords for portal rendering).
    setChipCursor(cursor);
    setChipPos({ x: e.clientX, y: e.clientY });

    // Sync LeftPanel + Expert Brain without starting speech.
    if (resolvedAnchorId) {
      useReadingFocusStore.getState().setThoughtUnit(resolvedAnchorId);
    }
    useReadingFocusStore.getState().setPdfClickCursor(cursor);
    onPdfWordClick?.(cursor);

    // Legacy onTextClick still fires so existing playFromSnippet flow works.
    if (onTextClick && snippet.length >= 8) onTextClick(snippet);
  };

  // ── PdfPlayChip — portaled tooltip near the clicked word ──────────────────
  // Rendered via createPortal so it escapes the PDF container's overflow:hidden.
  // Position: fixed at the click viewport coords, shifted above the word.
  // Dismisses on: outside click, scroll, zoom, page change, Escape, or playback start.
  const PdfPlayChip = chipCursor && chipPos && typeof document !== 'undefined'
    ? createPortal(
        <PdfPlayChipInner
          pos={chipPos}
          cursor={chipCursor}
          onDismiss={dismissChip}
          onPlay={(c) => {
            dismissChip();
            // seekToCursor was already called at click time via onPdfWordClick.
            // This callback must start the actual playback.
            onPdfChipPlay?.(c);
          }}
        />,
        document.body
      )
    : null;

  // Memoize the authorized-rect filter so PdfEvidenceOverlay receives a stable
  // array reference. Without this, the inline IIFE in JSX creates a new array
  // on every render (including karaoke word-ticks at 4–30 Hz), causing
  // useLayoutEffect inside PdfEvidenceOverlay to fire at the same rate and
  // spam scrollIntoView — visible as highlight flicker during TTS playback.
  const guardedRects = useMemo(() => {
    const idsToAllow = [
      ...(authorizedHighlightIds ?? []),
      ...(focusedEvidenceId ? [focusedEvidenceId] : []),
    ];
    if (idsToAllow.length === 0) return [];
    const allowed = new Set(
      idsToAllow.flatMap(id => [
        id,
        ...overlayRects.map(r => r.id).filter(rid => rid.startsWith(id)),
      ])
    );
    return overlayRects.filter(r => allowed.has(r.id));
  }, [overlayRects, authorizedHighlightIds, focusedEvidenceId]);

  return (
    <div
      className="relative h-full w-full bg-gray-900"
      ref={viewerRef}
      onMouseUp={handleMouseUp}
    >
      {PdfPlayChip}
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
                  if (text.length > 20) {
                    console.log("[PARENT_WRITE:SmartPDFViewer] onPageTextExtracted page=" + currentPage + " chars=" + text.length);
                    onPageTextExtracted(currentPage, text);
                  } else {
                    // Native PDF.js text layer produced (near-)nothing — a scanned/
                    // image-only page. Fall back to OCR rather than leaving this
                    // page's text permanently empty.
                    void attemptOcrFallback(text);
                  }
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
                  {/* Dim veil removed — lighter opacity on highlights means veil no longer needed */}
                  <PdfEvidenceOverlay
                    packTierLabels={packTierLabels}
                    rects={guardedRects}
                    focusedId={focusedEvidenceId}
                    onFocus={onEvidenceFocus}
                  />
                </React.Fragment>
              )}

              {/* Speechify-style live word box — isolated leaf subscriber keeps PDF canvas cold */}
              <WordRectOverlay
                highlightTargets={highlightTargets}
                currentPage={currentPage}
                pageTruthKey={pageTruthKey}
                viewportScale={effectiveZoom}
                pageRenderKey={pageRenderKey}
              />

              {/* Eye Guide dim layer (P0 stabilization) — reinstates the dim
                  veil an earlier pass removed ("lighter opacity on highlights
                  means veil no longer needed", above) as a playback-driven
                  feature rather than the highlight-vs-highlight dimming
                  PdfEvidenceOverlay already does. Only active during actual
                  SOURCE_VERBATIM playback (focusHighlightPersist — true only
                  while speech is actively reading, same flag that keeps
                  sentenceFocusRect pinned instead of auto-clearing above), so
                  it never dims the page while the student is just reading or
                  navigating manually. Reuses sentenceFocusRect verbatim — the
                  same canonical TextLayerRegistry-backed rect the sentence
                  marker below renders from — as the "paragraph" clear zone
                  (padded a bit for breathing room); no separate paragraph-
                  level geometry resolver was built, per instruction. The
                  classic CSS spotlight technique (a huge box-shadow on a
                  small transparent box) dims everything outside that rect;
                  it's naturally clipped to the scrollable page container
                  above (overflow-auto), so it never darkens outside the
                  visible page. Kept subtle (0.38 alpha) so surrounding
                  context stays legible, not "excessively dark."
                  P0 fix — z-10 rendered this BELOW PdfEvidenceOverlay's
                  z-20 evidence annotation layer, so the veil's darkening
                  never actually muted the non-focused green highlight
                  rectangles it exists to mute — they painted on top of it
                  unchanged. z-25 puts the veil above that layer. The veil's
                  own box is transparent (only its box-shadow paints), and
                  its cutout window is padded 14px larger than
                  sentenceFocusRect on every side, so the sentence marker
                  (z-20, unpadded rect below) and the live word marker
                  (z-30, WordRectOverlay above) both still sit inside the
                  transparent hole and read through undimmed. */}
              {focusHighlightPersist && sentenceFocusRect && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute z-[25] rounded-lg transition-all duration-150"
                  style={{
                    top: sentenceFocusRect.top - 14,
                    left: sentenceFocusRect.left - 14,
                    width: sentenceFocusRect.width + 28,
                    height: sentenceFocusRect.height + 28,
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.38)",
                  }}
                />
              )}

              {/* Sentence-focus marker — canonical-geometry replacement for the
                  old fuzzy DOM-span match. Positioned exactly like WordRectOverlay's
                  own marker (same coordinate space), used both as the visual
                  highlight and as the real element scrollIntoView targets. */}
              {sentenceFocusRect && (
                <div
                  ref={sentenceFocusMarkerRef}
                  aria-hidden
                  className="pointer-events-none absolute z-20 rounded transition-all duration-150"
                  style={{
                    top: sentenceFocusRect.top,
                    left: sentenceFocusRect.left,
                    width: sentenceFocusRect.width,
                    height: sentenceFocusRect.height,
                    background: "rgba(253,224,71,0.35)",
                    boxShadow: "0 0 0 2px rgba(253,224,71,0.9)",
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

              {/* Hidden capture: fixed-scale render of the CURRENT page for SurgeonAnnotationPlan's
                  OpenAI vision input. Deliberately NOT effectiveZoom — a separate, independent
                  render so zooming the visible canvas never re-triggers a capture or re-analysis. */}
              {onPageImageCaptured && (
                <div
                  ref={captureContainerRef}
                  aria-hidden="true"
                  style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', top: 0, left: 0, width: 1, height: 1, overflow: 'hidden' }}
                >
                  <Page
                    key={`${pageKeyRoot}:${currentPage}:capture`}
                    pdf={pdfDocument}
                    pageNumber={currentPage}
                    scale={SURGEON_CAPTURE_SCALE}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    loading={null}
                    error={null}
                    onRenderSuccess={() => {
                      const canvas = captureContainerRef.current?.querySelector('canvas');
                      if (!canvas) return;
                      try {
                        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
                        onPageImageCaptured(currentPage, dataUrl);
                      } catch (e) {
                        console.warn('[SURGEON_PLAN_CAPTURE_FAILED]', e);
                      }
                    }}
                    onRenderError={() => {/* silently ignore capture errors */}}
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
                onClick={onRetryProp ?? retry}
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
