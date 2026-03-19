// components/surgeonView2/SurgeonCockpit.tsx
// Expert View 2.1 - Minimal Layout with Evidence Spine
// Page-aware extraction defaults to current page context
// Tabs: Priority | Explain | Compare | Insights (compact mode chips)
// Layout: Left rail (clusters) | Main (relations) | Right (comprehension tabs)

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { BlockMath, ImportanceBar, renderMath } from './MathDisplay';
import { useRelationshipStore } from '@/lib/relationshipSchema/store';
import { useNoteLabStore } from '@/lib/cognitiveEngine/noteLabStore';
import { useSurgeonEngineStore } from '@/lib/surgeonEngine/store';
import { useExpertViewStore } from '@/lib/cognitive/expertViewStore';
import { usePageContextStore } from '@/lib/cognitive/pageContextStore';
import { useReaderState } from '@/lib/cognitive/useReaderState';
import type {
  ReasoningChain,
} from '@/lib/cognitive/types';
import type { PatternCluster, Relation, DecisionRule, RankedInsight, Concept } from '@/lib/relationshipSchema/types';
import {
  generateCardsFromInsights,
} from '@/lib/engines';
// Page Intelligence module with OCR support
import {
  buildPageIntelligence,
  buildChapterIntelligence,
  type PageIntelligence,
  type TabResponse,
} from '@/lib/page-intelligence';
import ClusterRail from './ClusterRail';
import RelationPanel from './RelationPanel';
import PriorityFeedPanel from './PriorityFeedPanel';
import PriorityComprehensionPanel from './PriorityComprehensionPanel';
import PriorityWorkspacePanel from './PriorityWorkspacePanel';
import SmartExtractControl, { type ExtractScope } from './SmartExtractControl';
import InsightOverlay from './InsightOverlay';
import SmartSpeechControls from './SmartSpeechControls';
import DATDrillMode from '../apex/DATDrillMode';
import {
  isWebSpeechAvailable,
  generateInsightScript,
  scriptToPlainText,
  speakText,
  stopSpeech,
} from '@/lib/speechWhiteboard/smartSpeech';
import { enrichInsightsWithApex } from '@/lib/apex/patternLibrary';
import { useCourseContextStore } from '@/lib/stores/courseContextStore';
import { useStudySessionStore } from '@/lib/stores/studySessionStore';
import { useInsightsPanelStore } from '@/lib/stores/insightsPanelStore';
import { buildActivePageContext as buildReaderActivePageContext, getPageContextCacheKey, type ActivePageContext as ReaderActivePageContext } from '@/lib/reader/activePageContext';
import { buildActivePageContext, getActivePageContextKey, type ActivePageContext } from '@/lib/surgeonEngine/activePageContext';
import { resolvePanelTitle } from '@/lib/surgeonEngine/panelResolver';
import { sanitizeTitle } from '@/lib/page-intelligence/titleResolution';
import { normalizeRenderableText, sanitizeRenderList, sanitizeRenderText } from '@/lib/page-intelligence/outputSanitizer';

// Expert View 2.1 tabs - Simplified for cognitive flow
type ComprehensionTab = 'priority' | 'explain' | 'relations' | 'compare' | 'insights';

// ============================================================================
// DOM Text Layer Scraping
// Reads the visible page text from react-pdf's rendered text layer.
// Primary fallback when pageTexts Map has no entry for the current page.
// ============================================================================
function getDOMPageText(): string {
  const selectors = [
    '.react-pdf__Page__textContent',
    '[data-testid="pure-reader-view"] .react-pdf__Page__textContent',
    '.textLayer',
    '[data-testid="expert-view-container"] .textLayer',
  ];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length >= 40) return text;
    }
  }
  return '';
}

interface SurgeonCockpitProps {
  documentId: string;
  documentTitle: string;
  totalPages?: number;
  currentPage?: number;
  onJumpToPage: (page: number) => void;
  pageTexts?: Map<number, string>;
  onExtractPage?: (pageIndex: number) => Promise<void>;
  onHighlightParagraph?: (text: string) => void;
  onPreviewSource?: (text: string | null) => void;
  /** Called when user clicks "Jump to source" on any SourceAnchor — for PDF scroll+highlight */
  onJumpToSource?: (ref: import('@/lib/page-intelligence').SourceRef) => void;
  /** ElevenLabs config for Narrate tab (optional) */
  elevenLabsConfig?: { apiKey: string; voiceId: string };
  /** Azure TTS config for Narrate tab (optional) */
  azureConfig?: { subscriptionKey: string; region: string; voiceName?: string };
  /** Keep right insight panel scroll position across page turns */
  preservePanelScroll?: boolean;
}

export const SurgeonCockpit: React.FC<SurgeonCockpitProps> = ({
  documentId,
  documentTitle,
  totalPages = 0,
  currentPage = 0,
  onJumpToPage,
  pageTexts,
  onExtractPage,
  onHighlightParagraph,
  onPreviewSource,
  onJumpToSource,
  elevenLabsConfig,
  azureConfig,
  preservePanelScroll = false,
}) => {
  // Relationship store
  const {
    concepts,
    relations,
    clusters,
    rules,
    selectedClusterId,
    selectedRelationId,
    expertModeEnabled,
    filterByKind,
    filterByConfidence,
    isExtracting: isRelationExtracting,
    extractionProgress,
    extractionError,
    extractFromMultiplePages,
    selectCluster,
    selectRelation,
    toggleExpertMode,
    setFilterByKind,
    setFilterByConfidence,
    getCockpitViewData,
    getRelationsForCluster,
    getChainsFromCluster,
    getRankedInsights,
    setDocId,
  } = useRelationshipStore();

  // Expert View 2.1 store for page tracking
  const expertView = useExpertViewStore();
  const pageContext = usePageContextStore();

  // Course Context Store - central hub for syllabus, page intel, study
  const courseContext = useCourseContextStore();

  // Surgeon Engine Store
  const surgeonEngine = useSurgeonEngineStore();

  // Insights Panel Store — zoom + sync toggle + paragraph tracking
  const {
    insightScale,
    syncInsightsToPdf,
    activeParagraphId,
    activeVisibleText,
    scaleUp,
    scaleDown,
    canScaleUp,
    canScaleDown,
    toggleSync,
    focusOnSource,
    setActiveParagraphId,
    depth,
    setDepth,
    mode,
    setMode,
    setAudience,
    setView,
    setEssentialStudentMode,
    followScroll,
    audience,
    view,
    essentialStudentMode,
    resetInsightLayout,
    setSelectedInsightId,
    setActiveVisibleText,
    setExpandedCardIds,
  } = useInsightsPanelStore();

  // Canonical ReaderState (single source of truth for page + panel state)
  const {
    pageIndex,
    sectionId,
    paragraphId,
    activeTab,
    insightDepth,
    sectionMode,
    setDocument: setReaderDocument,
    setActivePageContext: setReaderActivePageContext,
    setActiveTab,
    setInsightDepth,
    setSectionMode,
    setSectionId,
    setParagraphId,
    onPageChange,
    getCachedInsight,
    setCachedInsight,
  } = useReaderState();

  // Local state
  const [selectedCardId, setSelectedCardId] = useState<string | undefined>();
  const [showInsightOverlay, setShowInsightOverlay] = useState(false);
  const [showDrillMode, setShowDrillMode] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedInsightTarget, setSelectedInsightTarget] = useState<{
    type: 'relation' | 'cluster' | 'rule';
    id: string;
  } | null>(null);
  const [extractionStatus, setExtractionStatus] = useState<string>('');
  const hasAutoExtracted = useRef(false);
  const hasRunSurgeonEngines = useRef(false);
  const extractionRequestIdRef = useRef(0);
  const extractionAbortRef = useRef<AbortController | null>(null);
  const rightPanelScrollRef = useRef<HTMLDivElement | null>(null);
  const currentPageRef = useRef<number>(currentPage);
  const activeRequestKeyRef = useRef<string>('');

  // Page Intelligence state (OCR-enabled pipeline)
  const [pageIntelligence, setPageIntelligence] = useState<PageIntelligence | null>(null);
  const [readerPageContext, setReaderPageContext] = useState<ReaderActivePageContext | null>(null);
  const [ocrEnabled, setOcrEnabled] = useState(true);
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [autoExtract, setAutoExtract] = useState(true); // auto-fire on page load
  const [extractScope, setExtractScope] = useState<ExtractScope>('page');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const tabTitle = useMemo(() => {
    switch (activeTab) {
      case 'priority': return 'Page Priorities';
      case 'explain': return 'Professional Explanation';
      case 'relations': return 'Concept Relationships';
      case 'compare': return 'Concept Comparison';
      case 'insights': return 'Insight Extraction';
      default: return 'Page Priorities';
    }
  }, [activeTab, currentPage]);

  const activePageNumber = useMemo(() => Math.max(1, currentPage || 1), [currentPage]);
  const activePageIndex = useMemo(() => activePageNumber - 1, [activePageNumber]);

  const activeParagraphIndex = useMemo(() => {
    const units = pageIntelligence?.paragraphUnits;
    if (!units?.length || !activeParagraphId) return undefined;
    const idx = units.findIndex((unit) => unit.id === activeParagraphId);
    return idx >= 0 ? idx + 1 : undefined;
  }, [pageIntelligence?.paragraphUnits, activeParagraphId]);

  const panelContext = useMemo(() => buildActivePageContext({
    documentId: documentId || null,
    pageNumber: activePageNumber,
    sectionId,
    tab: activeTab as ActivePageContext['tab'],
    audienceMode: audience,
    depthMode: depth,
    densityMode: view,
    essentialMode: essentialStudentMode,
    deeperReasoning: mode === 'deep',
  }), [documentId, activePageNumber, sectionId, activeTab, audience, depth, view, essentialStudentMode, mode]);

  useEffect(() => {
    setReaderActivePageContext(panelContext);
  }, [panelContext, setReaderActivePageContext]);


  const contextTopic = useMemo(() => {
    return resolvePanelTitle(pageIntelligence, pageContext.context?.tocPath?.title || null);
  }, [pageIntelligence, pageContext.context?.tocPath?.title]);

  useEffect(() => {
    if (activeTab === 'narrate') setActiveTab('priority');
  }, [activeTab, setActiveTab]);

  // Sync document context on mount
  useEffect(() => {
    if (documentId) {
      setDocId(documentId);
      setReaderDocument(documentId);
      surgeonEngine.setBook(documentId, surgeonEngine.domain);
      expertView.setDocument(documentId, documentTitle, totalPages);
      pageContext.setDocument(documentId, totalPages);
      // Initialize CourseContext with document info
      courseContext.setDocument(documentId, totalPages);
    }
  }, [documentId, documentTitle, totalPages]);

  // Update page context when page changes — also reset stale state and load cache
  useEffect(() => {
    if (currentPage === undefined) return;

    const pageChanged = currentPageRef.current !== currentPage;
    currentPageRef.current = currentPage;

    if (pageChanged && !preservePanelScroll && rightPanelScrollRef.current) {
      rightPanelScrollRef.current.scrollTop = 0;
    }

    pageContext.setPage(activePageNumber);
    expertView.setPage(activePageNumber);
    surgeonEngine.setPageContext(activePageNumber);
    courseContext.setPage(activePageNumber);
    onPageChange(activePageNumber);

    extractionRequestIdRef.current += 1;
    extractionAbortRef.current?.abort();
    extractionAbortRef.current = null;

    // Reset per-page extraction state so the UI doesn't show stale data from previous page
    setPageIntelligence(null);
    setReaderPageContext(null);
    setExtractionStatus('');
    setOcrStatus('idle');

    // Reset UI selection state: don't carry previous-page selection into new page
    setSelectedCardId(undefined);
    setSelectedInsightTarget(null);
    setActiveParagraphId(null);  // prevent stale ID from lighting up a card on the new page
    setSelectedInsightId(null);
    setActiveVisibleText(null);
    setExpandedCardIds([]);
    setSectionId(null);
    setParagraphId(null);
    // Clear cluster/unit selection in both stores so insight cards reset cleanly
    selectCluster(undefined);
    selectRelation(undefined);
    surgeonEngine.selectCluster(undefined);
    surgeonEngine.selectUnit(undefined);

    // Load cached intelligence for this page (IndexedDB, no-op if missing)
    courseContext.getPageIntelligence(activePageNumber).then((cached) => {
      if (cached) {
        if (currentPageRef.current !== activePageNumber) return;
        setPageIntelligence(cached);
        setReaderPageContext(buildReaderActivePageContext(documentId, cached));
      }
    }).catch(() => {});
  }, [activePageNumber, currentPage, preservePanelScroll, documentId, setSelectedInsightId, setActiveVisibleText, setExpandedCardIds]);

  useEffect(() => {
    if (rightPanelScrollRef.current) {
      rightPanelScrollRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  useEffect(() => {
    setInsightDepth(depth);
  }, [depth, setInsightDepth]);

  useEffect(() => {
    setSectionMode(mode);
  }, [mode, setSectionMode]);

  useEffect(() => {
    const activeParagraph = activeParagraphId || null;
    if (activeParagraph !== paragraphId) {
      setParagraphId(activeParagraph);
    }
  }, [activeParagraphId, paragraphId, setParagraphId]);

  // PDF scroll → insight card sync:
  // When the active visible paragraph text changes and Sync is ON,
  // 1) find the ranked insight whose claim/title best overlaps the snippet and activate it
  // 2) find the ParagraphUnit matching the snippet and set activeParagraphId in store
  useEffect(() => {
    if (!activeVisibleText) return;

    const timer = setTimeout(() => {
      const needle = activeVisibleText.toLowerCase();
      const needleWords = new Set(needle.split(/\s+/).filter(w => w.length > 4));
      if (needleWords.size < 2) return;

      // 1) Match ranked insight for right-panel card sync
      if (syncInsightsToPdf && rankedInsights.length) {
        let bestId: string | undefined;
        let bestScore = 0;
        for (const insight of rankedInsights) {
          const haystack = `${insight.title} ${insight.claim || ''} ${insight.whyItMatters || ''}`.toLowerCase();
          let score = 0;
          for (const word of needleWords) {
            if (haystack.includes(word)) score++;
          }
          if (score > bestScore) { bestScore = score; bestId = insight.id; }
        }
        if (bestScore >= 2 && bestId && bestId !== selectedCardId) {
          setSelectedCardId(bestId);
        }
      }

      // 2) Match ParagraphUnit for active-paragraph tracking (condensed panel focus).
      // Only update when follow-scroll or insight sync is enabled, so the condensed
      // panel doesn't jump while the user is manually scrolling with both off.
      if (followScroll || syncInsightsToPdf) {
        const units = pageIntelligence?.paragraphUnits ?? [];
        if (units.length) {
          let bestUnit: typeof units[0] | null = null;
          let bestUnitScore = 0;
          for (const u of units) {
            const hay = u.text.toLowerCase();
            let score = 0;
            for (const word of needleWords) {
              if (hay.includes(word)) score++;
            }
            if (score > bestUnitScore) { bestUnitScore = score; bestUnit = u; }
          }
          if (bestUnit && bestUnitScore >= 2) {
            setActiveParagraphId(bestUnit.id);
          }
        }
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [activeVisibleText, syncInsightsToPdf, followScroll, selectedCardId, pageIntelligence]);

  // Auto-extract with debounce (800–1000 ms) when page changes and auto-extract is on
  useEffect(() => {
    if (!autoExtract || currentPage === undefined || isRelationExtracting) return;
    const timer = setTimeout(() => {
      handleExtractCurrentPage();
    }, 800);
    return () => clearTimeout(timer);
  }, [currentPage, autoExtract]);

  // Prefetch: background-load page N+1 and N-1 intelligence so navigation is snappy.
  // Runs after a longer delay (3 s) to avoid contending with the current-page extraction.
  useEffect(() => {
    if (currentPage === undefined || totalPages === 0) return;

    const pagesToPrefetch = [activePageNumber + 1, activePageNumber - 1].filter(
      (p) => p >= 1 && p <= totalPages,
    );

    const prefetchPage = async (pageNum: number) => {
      try {
        const cached = await courseContext.getPageIntelligence(pageNum).catch(() => null);
        if (cached) return; // already warm

        const text = pageTexts?.get(pageNum) ?? '';
        if (text.trim().length < 40) return;

        if (process.env.NODE_ENV === 'development') {
          console.log(`[SurgeonCockpit] Prefetching page ${pageNum} intelligence`);
        }

        const result = await buildPageIntelligence({
          pageNumber: pageNum,
          docId: documentId,
          getNativeText: async () => text,
          getPageImageDataUrl: async () => '',
          options: { ocrEnabled: false, datScoring: false, minTextLength: 40 },
        });
        await courseContext.storePageIntelligence(pageNum, result.intelligence);
      } catch {
        // Prefetch failure is silent
      }
    };

    const timer = setTimeout(() => {
      for (const p of pagesToPrefetch) prefetchPage(p);
    }, 3000);

    return () => clearTimeout(timer);
  }, [currentPage, totalPages, documentId, pageTexts, courseContext]);

  // Run surgeon engines after extraction completes
  useEffect(() => {
    const relationCount = Object.keys(relations).length;
    if (relationCount > 0 && !isRelationExtracting && !hasRunSurgeonEngines.current && pageTexts && pageTexts.size > 0) {
      hasRunSurgeonEngines.current = true;
      const units = Array.from(pageTexts.entries()).flatMap(([page, text]) => {
        const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 20);
        return paragraphs.map((para, idx) => ({
          unitId: `u_${page}_${idx}`,
          bookId: documentId,
          page,
          text: para.trim(),
          cleanText: para.trim().toLowerCase(),
          source: 'viewport' as const,
          createdAt: new Date().toISOString(),
        }));
      });

      if (units.length > 0) {
        surgeonEngine.addUnits(units);
        surgeonEngine.runAllEngines();
      }
    }
  }, [relations, isRelationExtracting, pageTexts, documentId]);

  // Computed data
  const cockpitData = getCockpitViewData();
  const selectedCluster = selectedClusterId ? clusters[selectedClusterId] : null;

  // Get ranked insights
  const rankedInsights = useMemo(() => {
    const insights = getRankedInsights();
    return enrichInsightsWithApex(insights);
  }, [relations, clusters, rules, concepts, getRankedInsights]);

  // Get trap insights
  const trapInsights = useMemo(() => {
    return rankedInsights.filter(i => i.type === 'EXAM_TRAP' || i.trap);
  }, [rankedInsights]);

  const pageScopedInsights = useMemo(() => {
    const pageContextKey = readerPageContext
      ? getPageContextCacheKey(readerPageContext.docId, readerPageContext.pageNumber, readerPageContext.extractionVersion)
      : `${documentId}:${activePageNumber}:pending`;
    const cacheKey = `${pageContextKey}:${getActivePageContextKey(panelContext)}`;
    const cached = getCachedInsight<RankedInsight[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const filtered = rankedInsights.filter((insight) =>
      insight.evidence.some((span) => span.page === activePageIndex),
    );
    setCachedInsight(cacheKey, filtered);
    return filtered;
  }, [panelContext, readerPageContext, activePageIndex, activePageNumber, documentId, getCachedInsight, rankedInsights, setCachedInsight]);

  // Page context info
  const pageCtx = pageContext.getPageContext();
  const chapterTitle = pageCtx.tocPath?.title
    || readerPageContext?.detectedSectionTitle
    || pageIntelligence?.structureMap?.topic
    || `Page ${activePageNumber}`;
  const cleanedChapterTitle = sanitizeTitle(chapterTitle, 'Current Page');
  const confidencePercent = Math.round(pageCtx.confidence * 100);

  // ============================================================================
  // getPageText — resolve text for current page with 3-tier fallback:
  //   1. pageTexts Map (populated by parseBookWithChapters)
  //   2. DOM text layer scraping (.react-pdf__Page__textContent)
  //   3. Empty string → will trigger OCR if enabled
  // ============================================================================
  const getPageText = useCallback((pageNumber: number): string => {
    // Tier 1: pre-extracted Map
    const mapped = pageTexts?.get(pageNumber);
    if (mapped && mapped.trim().length >= 40) return mapped.trim();

    // Tier 2: live DOM text layer (react-pdf renders this as selectable text)
    const domText = getDOMPageText();
    if (domText.length >= 40) return domText;

    return '';
  }, [pageTexts]);

  // Handle extract current page - uses new Page Intelligence pipeline with OCR fallback
  const handleExtractCurrentPage = useCallback(async () => {
    const requestId = ++extractionRequestIdRef.current;
    extractionAbortRef.current?.abort();
    const controller = new AbortController();
    extractionAbortRef.current = controller;

    const nativeText = getPageText(activePageNumber);
    const hasNativeText = nativeText.length >= 40;
    const requestKey = `${documentId}:${activePageNumber}:${readerPageContext?.extractionVersion || 'v2'}:${mode}:${audience}:${view}`;
    activeRequestKeyRef.current = requestKey;

    if (!hasNativeText && !ocrEnabled) {
      setExtractionStatus('No text found. Enable OCR for scanned PDFs or wait for the page to fully render.');
      return;
    }

    setExtractionStatus(hasNativeText ? 'Extracting page…' : 'Running OCR on page…');
    if (!hasNativeText && ocrEnabled) setOcrStatus('running');

    try {
      const result = await buildPageIntelligence({
        pageNumber: activePageNumber,
        docId: documentId,
        getNativeText: async () => nativeText,
        getPageImageDataUrl: async () => {
          // Find the visible PDF canvas for OCR rendering
          const selectors = [
            '.react-pdf__Page__canvas',
            `canvas[data-page="${activePageNumber}"]`,
            '.pdfViewer canvas',
            '[data-testid="pure-reader-view"] canvas',
            '[data-testid="expert-view-container"] canvas',
            'canvas',
          ];
          for (const selector of selectors) {
            const canvas = document.querySelector(selector) as HTMLCanvasElement;
            if (canvas && canvas.width > 0 && canvas.height > 0) {
              try { return canvas.toDataURL('image/png'); } catch {}
            }
          }
          return '';
        },
        options: { ocrEnabled, datScoring: true, minTextLength: 40 },
      });

      if (controller.signal.aborted || requestId !== extractionRequestIdRef.current) return;
      if (activeRequestKeyRef.current !== requestKey) return;
      setPageIntelligence(result.intelligence);
      setReaderPageContext(buildReaderActivePageContext(documentId, result.intelligence));
      setOcrStatus(result.intelligence.source === 'native' ? 'idle' : 'done');

      // Persist to CourseContext (IndexedDB) → Study + NoteLab will read from here
      await courseContext.storePageIntelligence(activePageNumber, result.intelligence);

      // Run relationship store extraction (feeds Relations/Compare tabs)
      const text = result.intelligence.segments.map(s => s.text).join('\n\n');
      if (text.trim().length > 50) {
        await extractFromMultiplePages([{ pageIndex: activePageIndex, text }]);
      }

      // Push auto-generated study cards to the Study session store
      if (result.intelligence.cards.length > 0) {
        const studyStore = useStudySessionStore.getState();
        if (studyStore.addCardsFromPageIntel) {
          studyStore.addCardsFromPageIntel(documentId, activePageNumber, result.intelligence.cards);
        }
      }

      const statusText = result.fromCache
        ? 'Loaded from cache'
        : `Done in ${result.processingTimeMs}ms${result.intelligence.source !== 'native' ? ` (${result.intelligence.source.toUpperCase()})` : ''}`;
      setExtractionStatus(statusText);
      setTimeout(() => setExtractionStatus(''), 3000);
    } catch (error) {
      if (controller.signal.aborted) return;
      setExtractionStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setOcrStatus('idle');
    }
  }, [activePageIndex, activePageNumber, getPageText, currentPage, documentId, extractFromMultiplePages, ocrEnabled, courseContext, mode, audience, view, readerPageContext?.extractionVersion]);

  // Check if chapter extraction is available
  const chapterRangeAvailable = useMemo(() => {
    // Check pageContext first, then courseContext
    const pcRange = pageContext.getChapterRange(activePageNumber);
    const ccRange = courseContext.getChapterRangeForPage(activePageNumber);
    return pcRange || ccRange;
  }, [activePageNumber, currentPage, pageContext, courseContext.syllabusTopics]);

  // Handle extract chapter — uses Page Intelligence pipeline for each page in chapter
  const handleExtractChapter = useCallback(async () => {
    const chapterRange = pageContext.getChapterRange(activePageNumber) ||
                         courseContext.getChapterRangeForPage(activePageNumber);

    if (!chapterRange) {
      setExtractionStatus('No chapter range available. Upload a syllabus with page ranges first.');
      return;
    }

    const total = chapterRange.end - chapterRange.start + 1;
    setExtractionStatus(`Extracting chapter (${total} pages)…`);

    try {
      const results = await buildChapterIntelligence({
        docId: documentId,
        startPage: chapterRange.start,
        endPage: chapterRange.end,
        getPageText: async (pageNumber: number) => getPageText(pageNumber),
        getPageImageDataUrl: async (_pageNumber: number) => '',
        options: { ocrEnabled, datScoring: true, minTextLength: 40 },
        onProgress: (current, total, pageNumber) => {
          setExtractionStatus(`Processing page ${pageNumber} (${current}/${total})…`);
        },
      });

      // Store each page in CourseContext (IndexedDB) → Study + NoteLab will read from here
      const legacyPages: Array<{ pageIndex: number; text: string }> = [];
      let totalCards = 0;
      for (const intel of results) {
        await courseContext.storePageIntelligence(intel.pageNumber, intel);
        totalCards += intel.cards.length;
        const text = intel.segments.map(s => s.text).join('\n\n');
        if (text.trim().length > 50) {
          legacyPages.push({ pageIndex: intel.pageNumber - 1, text });
        }
      }

      // Run legacy relationship extraction so Relations/Compare tabs populate
      if (legacyPages.length > 0) {
        await extractFromMultiplePages(legacyPages);
      }

      setExtractionStatus(`Chapter done: ${results.length} pages, ${totalCards} cards generated`);
      setTimeout(() => setExtractionStatus(''), 4000);
    } catch (error) {
      setExtractionStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [activePageNumber, currentPage, documentId, pageContext, courseContext, extractFromMultiplePages, getPageText, ocrEnabled]);

  // Unified extract handler for SmartExtractControl
  const handleUnifiedExtract = useCallback(async () => {
    if (extractScope === 'chapter' && chapterRangeAvailable) {
      await handleExtractChapter();
    } else {
      await handleExtractCurrentPage();
    }
  }, [extractScope, chapterRangeAvailable, handleExtractChapter, handleExtractCurrentPage]);

  // Handle card selection — also updates the store so sync-scroll + PDF focus fire
  const handleCardClick = useCallback((insight: RankedInsight) => {
    setSelectedCardId(insight.id);
    focusOnSource(insight.id);
    setSelectedInsightTarget({ type: insight.sourceType, id: insight.sourceId });
    setShowInsightOverlay(true);
  }, [focusOnSource]);

  // NoteLab actions
  const { importFromInsight, markConfusing: noteLabMarkConfusing } = useNoteLabStore();

  const handleSaveToNoteLab = useCallback((insight: RankedInsight) => {
    importFromInsight({
      id: insight.id,
      title: insight.title,
      claim: insight.claim,
      whyItMatters: insight.whyItMatters,
      bucket: insight.bucket,
      sourceId: insight.sourceId,
      sourceType: insight.sourceType,
      evidence: insight.evidence,
      tags: insight.tags,
    });
  }, [importFromInsight]);

  const handleMarkConfusing = useCallback((insight: RankedInsight) => {
    const noteId = importFromInsight({
      id: insight.id,
      title: insight.title,
      claim: insight.claim,
      whyItMatters: insight.whyItMatters,
      bucket: insight.bucket,
      sourceId: insight.sourceId,
      sourceType: insight.sourceType,
      evidence: insight.evidence,
      tags: insight.tags,
    });
    noteLabMarkConfusing(noteId);
  }, [importFromInsight, noteLabMarkConfusing]);

  // Handle "Send to NoteLab" action from PriorityWorkspacePanel (with toast)
  const handleSendToNoteLab = useCallback((insight: RankedInsight) => {
    importFromInsight({
      id: insight.id,
      title: insight.title,
      claim: insight.claim,
      whyItMatters: insight.whyItMatters,
      bucket: insight.bucket,
      sourceId: insight.sourceId,
      sourceType: insight.sourceType,
      evidence: insight.evidence,
      tags: insight.tags,
    });
    setToastMessage('Added to NoteLab');
    setTimeout(() => setToastMessage(null), 3000);
  }, [importFromInsight]);

  // Handle "Make Card" action from PriorityWorkspacePanel
  const handleMakeCard = useCallback(async (insight: RankedInsight) => {
    try {
      const cards = await generateCardsFromInsights({
        insights: {
          docId: documentId,
          scope: { mode: 'PAGE' as const, pageIndex: activePageIndex },
          generatedAt: Date.now(),
          whatMatters: [{
            id: insight.id,
            title: insight.title,
            summary: insight.claim || '',
            tags: insight.tags as import('@/lib/engines').Tag[],
            whyItMatters: insight.whyItMatters || '',
            confidence: insight.confidence,
            evidence: insight.evidence.map(e => ({
              docId: documentId,
              pageIndex: e.page,
              snippet: e.sectionHint || '',
            })),
          }],
          whatMissing: [],
        },
        includeWhatMissing: false,
      });
      setToastMessage(`Created ${cards.length} study card(s)`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (error) {
      console.error('Failed to generate card:', error);
      setToastMessage('Failed to create card');
      setTimeout(() => setToastMessage(null), 3000);
    }
  }, [activePageIndex, documentId, currentPage]);

  // Handle "Explain" action — also updates store so PDF sync fires on tab switch
  const handleExplainInsight = useCallback((insight: RankedInsight) => {
    setSelectedCardId(insight.id);
    focusOnSource(insight.id);
    setActiveTab('explain');
  }, [focusOnSource]);

  const handleReadCard = useCallback((insight: RankedInsight) => {
    if (!isWebSpeechAvailable()) return;
    stopSpeech();
    const script = generateInsightScript(insight, 'smart_high_yield', 'normal');
    const text = scriptToPlainText(script);
    speakText(text, { rate: 1.0 });
  }, []);

  // Get active relations
  const activeRelations = selectedClusterId
    ? getRelationsForCluster(selectedClusterId)
    : Object.values(relations).filter(r => r.confidence >= filterByConfidence);

  const chains = selectedClusterId ? getChainsFromCluster(selectedClusterId) : [];

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Expert View 2.1 Header - Minimal */}
      <header className="flex items-center gap-3 px-4 py-2 bg-gray-800 border-b border-gray-700">
        {/* Document Title */}
        <h1 className="text-sm font-medium text-gray-200 truncate max-w-[200px]" title={documentTitle}>
          {documentTitle}
        </h1>

        {/* Separator */}
        <span className="text-gray-600">|</span>

        {/* Current Chapter */}
        <span className="text-xs text-gray-400 truncate max-w-[180px]" title={cleanedChapterTitle}>
          {cleanedChapterTitle}
        </span>

        {/* Page Number */}
        <span className="text-xs text-gray-500">
          p.{activePageNumber}/{totalPages}
        </span>

        {/* Confidence Pill */}
        <span
          className={`
            px-2 py-0.5 text-[10px] font-medium rounded-full
            ${confidencePercent >= 80 ? 'bg-green-500/20 text-green-400' :
              confidencePercent >= 50 ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-gray-500/20 text-gray-400'}
          `}
        >
          {confidencePercent}%
        </span>

        {/* Page Intelligence Source Badge */}
        {pageIntelligence && (
          <span
            className={`
              px-2 py-0.5 text-[10px] font-medium rounded-full
              ${pageIntelligence.source === 'native'
                ? 'bg-green-500/20 text-green-400'
                : pageIntelligence.source === 'mixed'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-amber-500/20 text-amber-400'}
            `}
            title={pageIntelligence.source === 'native'
              ? 'Native PDF text'
              : pageIntelligence.source === 'mixed'
                ? `Mixed extraction (native + OCR), OCR confidence: ${pageIntelligence.confidence || 0}%`
                : `OCR confidence: ${pageIntelligence.confidence || 0}%`}
          >
            {pageIntelligence.source === 'native' ? 'Native' : pageIntelligence.source === 'mixed' ? 'Mixed' : 'OCR'}
          </span>
        )}

        {/* OCR Status */}
        {ocrStatus === 'running' && (
          <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/20 text-blue-400 animate-pulse">
            OCR running...
          </span>
        )}

        {/* Build Indicator */}
        {process.env.NEXT_PUBLIC_BUILD_SHA && (
          <span
            className="px-1.5 py-0.5 text-[9px] font-mono text-gray-500 bg-gray-800 rounded"
            title={`Build: ${process.env.NEXT_PUBLIC_BUILD_SHA} at ${process.env.NEXT_PUBLIC_BUILD_TIME || 'unknown'}`}
          >
            {process.env.NEXT_PUBLIC_BUILD_SHA}
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* DAT Apex Toggle */}
        <button
          onClick={() => expertView.toggleDatApex()}
          className={`
            px-2 py-1 text-[10px] font-medium rounded
            ${expertView.datApexEnabled
              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40'
              : 'bg-gray-700 text-gray-400 border border-gray-600'}
          `}
        >
          DAT Apex
        </button>

        {/* Advanced Filters Toggle */}
        <button
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          className={`
            px-2 py-1 text-[10px] rounded
            ${showAdvancedFilters ? 'bg-gray-700 text-gray-300' : 'text-gray-500 hover:text-gray-400'}
          `}
        >
          Filters {showAdvancedFilters ? '▲' : '▼'}
        </button>
      </header>

      {/* Status Banner */}
      {(extractionStatus || extractionError) && (
        <div className={`px-4 py-1.5 text-xs ${extractionError ? 'bg-red-900/50 text-red-300' : 'bg-blue-900/50 text-blue-300'}`}>
          {extractionError || extractionStatus}
        </div>
      )}

      {/* Advanced Filters (collapsed by default) */}
      {showAdvancedFilters && (
        <div className="px-4 py-2 bg-gray-800/50 border-b border-gray-700 flex items-center gap-4">
          <label className="text-[10px] text-gray-400 flex items-center gap-2">
            Kind:
            <select
              value={filterByKind || 'all'}
              onChange={(e) => setFilterByKind(e.target.value as typeof filterByKind)}
              className="bg-gray-700 text-gray-300 text-[10px] px-2 py-0.5 rounded border border-gray-600"
            >
              <option value="all">All</option>
              <option value="process">Process</option>
              <option value="causal">Causal</option>
              <option value="diagnostic">Diagnostic</option>
              <option value="risk">Risk</option>
              <option value="exception">Exception</option>
            </select>
          </label>
          <label className="text-[10px] text-gray-400 flex items-center gap-2">
            Min Confidence:
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={filterByConfidence}
              onChange={(e) => setFilterByConfidence(parseFloat(e.target.value))}
              className="w-20"
            />
            <span className="text-gray-500">{Math.round(filterByConfidence * 100)}%</span>
          </label>
          <button
            onClick={toggleExpertMode}
            className={`text-[10px] px-2 py-0.5 rounded ${expertModeEnabled ? 'bg-teal-500/20 text-teal-400' : 'bg-gray-700 text-gray-400'}`}
          >
            Expert Mode
          </button>
        </div>
      )}

      {/* Smart Extract Control - Unified extraction UI */}
      <SmartExtractControl
        scope={extractScope}
        onScopeChange={setExtractScope}
        onExtract={handleUnifiedExtract}
        autoExtract={autoExtract}
        onAutoExtractChange={setAutoExtract}
        isExtracting={isRelationExtracting}
        chapterAvailable={!!chapterRangeAvailable}
        currentPage={currentPage}
        ocrEnabled={ocrEnabled}
        onOcrToggle={() => setOcrEnabled(!ocrEnabled)}
        extractionStatus={extractionStatus}
      />

      {/* Main Content - Unified Panel Layout */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Smart Speech Controls */}
        {rankedInsights.length > 0 && (
          <SmartSpeechControls
            insights={rankedInsights}
            onInsightStart={(insight) => setSelectedCardId(insight.id)}
            className="mx-3 mt-2"
          />
        )}

        {/* Page Context Header */}
        <div className="px-3 pt-2">
          <div className="rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2">
            <p className="text-xs text-gray-300">{cleanedChapterTitle}</p>
            <p className="text-sm font-semibold text-gray-100 truncate">{contextTopic}</p>
            <p className="text-[11px] text-gray-400">Page {activePageNumber} of {totalPages}</p>
          </div>
        </div>

        {/* Insight Card */}
        <div className="mx-3 mt-2 mb-3 flex-1 min-h-0 rounded-xl border border-white/5 bg-[rgba(18,22,34,0.85)] p-3 flex flex-col overflow-hidden">
          <div className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 mb-2 sticky top-0 z-20">
            <p className="text-sm text-gray-100 font-semibold tracking-wide">
              Page {activePageNumber} — {tabTitle}
            </p>
            <p className="mt-1 text-[11px] text-gray-300">
              {activeParagraphIndex ? `Paragraph ${activeParagraphIndex} • ` : ''}
              Insight Depth: <span className="text-violet-300 capitalize">{insightDepth}</span>
            </p>
          </div>

          {/* Tabs */}
          <div className="flex items-center border border-white/5 rounded-lg bg-gray-900/70 backdrop-blur-sm px-2 py-1 gap-1 mb-2 sticky top-[62px] z-20">
            <ModeChip
            label="Priority"
            active={activeTab === 'priority'}
            onClick={() => setActiveTab('priority')}
            badge={pageScopedInsights.filter(i => i.bucket === 'CRITICAL' || i.bucket === 'HIGH_YIELD').length || undefined}
            />
            <ModeChip
            label="Explain"
            active={activeTab === 'explain'}
            onClick={() => setActiveTab('explain')}
            />
            <ModeChip
            label="Relations"
            active={activeTab === 'relations'}
            onClick={() => setActiveTab('relations')}
            badge={Object.keys(relations).length || undefined}
            />
            <ModeChip
            label="Compare"
            active={activeTab === 'compare'}
            onClick={() => setActiveTab('compare')}
            />
            <ModeChip
            label="Insights"
            active={activeTab === 'insights'}
            onClick={() => setActiveTab('insights')}
            />

          {/* Spacer */}
            <div className="flex-1" />

          {/* Insight panel zoom controls — font-size based, no transform */}
            <div className="flex items-center gap-0.5" title="Insight text size">
              <button
              onClick={scaleDown}
              disabled={!canScaleDown()}
              className="px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-white disabled:opacity-30 rounded hover:bg-gray-700"
              aria-label="Decrease insight font size"
            >
              A−
              </button>
              <button
              onClick={scaleUp}
              disabled={!canScaleUp()}
              className="px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-white disabled:opacity-30 rounded hover:bg-gray-700"
              aria-label="Increase insight font size"
            >
              A+
              </button>
            </div>

          {/* Sync toggle — prevents right panel fighting PDF scroll */}
            <button
            onClick={toggleSync}
            className={`ml-1 px-1.5 py-0.5 text-[10px] rounded transition-colors ${
              syncInsightsToPdf
                ? 'bg-teal-600/80 text-white'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700'
            }`}
            title={syncInsightsToPdf ? 'Sync ON: panel scrolls to active insight' : 'Sync OFF: scroll freely'}
            aria-label="Toggle insight sync"
          >
            {syncInsightsToPdf ? '⇄ Sync' : '⇄ Free'}
            </button>

          <div className="ml-2 hidden md:flex items-center gap-1">
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as typeof audience)}
              className="bg-gray-800 text-[10px] text-gray-200 rounded px-1 py-0.5 border border-gray-600 min-h-[40px]"
              title="Audience mode"
            >
              <option value="polish">Polish</option>
              <option value="student">Student</option>
              <option value="clinical">Clinical</option>
              <option value="expert">Expert</option>
            </select>
            <select
              value={depth}
              onChange={(e) => setDepth(e.target.value as typeof depth)}
              className="bg-gray-800 text-[10px] text-gray-200 rounded px-1 py-0.5 border border-gray-600 min-h-[40px]"
              title="Depth mode"
            >
              <option value="minimal">Minimal</option>
              <option value="standard">Standard</option>
              <option value="deep">Deep</option>
            </select>
            <select
              value={view}
              onChange={(e) => setView(e.target.value as typeof view)}
              className="bg-gray-800 text-[10px] text-gray-200 rounded px-1 py-0.5 border border-gray-600 min-h-[40px]"
              title="Density mode"
            >
              <option value="condensed">Condensed</option>
              <option value="expanded">Expanded</option>
            </select>
            <button
              onClick={() => setEssentialStudentMode(!essentialStudentMode)}
              className={`px-1.5 py-0.5 text-[10px] rounded min-h-[40px] ${essentialStudentMode ? 'bg-teal-700/70 text-teal-100' : 'bg-gray-700 text-gray-300'}`}
            >
              Essential
            </button>
            <button
              onClick={() => setMode(mode === 'deep' ? 'quick' : 'deep')}
              className={`px-1.5 py-0.5 text-[10px] rounded min-h-[40px] ${mode === 'deep' ? 'bg-purple-600/80 text-white border border-purple-500/60' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700'}`}
              title="Toggle deeper reasoning"
            >
              Reasoning
            </button>
          </div>

            <button
              onClick={() => {
                resetInsightLayout();
                setActiveTab('priority');
                setAudience('student');
                setDepth('standard');
                setView('condensed');
                setEssentialStudentMode(true);
                setMode('quick');
                setSelectedCardId(undefined);
                setSelectedInsightTarget(null);
                selectRelation(undefined);
                selectCluster(undefined);
                setExpandedCardIds([]);
                if (rightPanelScrollRef.current) rightPanelScrollRef.current.scrollTop = 0;
              }}
              className="ml-1 px-1.5 py-0.5 text-[10px] rounded text-gray-400 hover:text-gray-200 hover:bg-gray-700"
              title="Reset insight layout and panel-local state"
            >
              Reset
            </button>
          </div>

          {/* Tab Content - Unified Panel */}
          <div ref={rightPanelScrollRef} className="flex-1 min-h-0 overflow-y-auto pr-1">

          {readerPageContext?.fallbackState ? (
            <div className="mx-2 my-3 rounded-lg border border-amber-600/40 bg-amber-950/20 p-3 text-xs text-amber-100 space-y-2">
              <p>{readerPageContext.fallbackState.message}</p>
              <div className="flex flex-wrap gap-2">
                {readerPageContext.fallbackState.actions.map((action) => (
                  <button key={action} className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-200">{action}</button>
                ))}
              </div>
            </div>
          ) : activeTab === 'priority' && (
            essentialStudentMode ? (
              <PriorityComprehensionPanel
                rankedInsights={pageScopedInsights}
                pageIntelligence={pageIntelligence}
                onHighlightParagraph={onHighlightParagraph}
                onPreviewSource={onPreviewSource}
                onJumpToSource={onJumpToSource}
                insightScale={insightScale}
                syncEnabled={syncInsightsToPdf}
                deepAnalysisMode={mode === 'deep'}
                isExtracting={isRelationExtracting}
              />
            ) : (
              <PriorityWorkspacePanel
                insights={pageScopedInsights}
                pageIntelligence={pageIntelligence}
                selectedCardId={selectedCardId}
                onJumpToPage={onJumpToPage}
                onExplain={handleExplainInsight}
                onMakeCard={handleMakeCard}
                onSendToNoteLab={handleSendToNoteLab}
                isExtracting={isRelationExtracting}
                onHighlightParagraph={onHighlightParagraph}
                onPreviewSource={onPreviewSource}
                onJumpToSource={onJumpToSource}
                insightScale={insightScale}
                syncEnabled={syncInsightsToPdf}
                deepAnalysisMode={mode === 'deep'}
              />
            )
          )}
          {!readerPageContext?.fallbackState && activeTab === 'explain' && (
            <ExplainTab
              selectedCardId={selectedCardId}
              insights={pageScopedInsights}
              onSelectCard={() => setActiveTab('priority')}
              pageIntelligence={pageIntelligence}
              tabResponse={pageIntelligence?.tabPayloads?.explainPayload ?? pageIntelligence?.tabResponses?.explain}
              tone={audience}
              depth={panelContext.deeperReasoning ? 'deep' : depth}
              density={view}
              essential={essentialStudentMode}
            />
          )}
          {!readerPageContext?.fallbackState && activeTab === 'relations' && (
            <RelationsTab
              relations={activeRelations}
              clusters={Object.values(clusters)}
              concepts={concepts}
              chains={chains}
              selectedCluster={selectedCluster}
              onSelectCluster={selectCluster}
              onRelationClick={(relation) => {
                selectRelation(relation.id);
                setSelectedInsightTarget({ type: 'relation', id: relation.id });
                setShowInsightOverlay(true);
              }}
              onJumpToPage={onJumpToPage}
              pageIntelligence={pageIntelligence}
              tabResponse={pageIntelligence?.tabPayloads?.relationsPayload ?? pageIntelligence?.tabResponses?.relations}
            />
          )}
          {!readerPageContext?.fallbackState && activeTab === 'compare' && (
            <CompareTab
              selectedCardId={selectedCardId}
              insights={pageScopedInsights}
              onSelectCard={() => setActiveTab('priority')}
              pageIntelligence={pageIntelligence}
              tabResponse={pageIntelligence?.tabPayloads?.comparePayload ?? pageIntelligence?.tabResponses?.compare}
            />
          )}
          {!readerPageContext?.fallbackState && activeTab === 'insights' && (
            <InsightsTab
              insights={pageScopedInsights}
              trapInsights={trapInsights}
              selectedCardId={selectedCardId}
              onCardClick={(insight) => {
                setSelectedCardId(insight.id);
                const anchor = pageIntelligence?.paragraphUnits?.find((unit) => unit.text.toLowerCase().includes((insight.claim || insight.title).slice(0, 32).toLowerCase()));
                if (anchor?.text && onHighlightParagraph) {
                  onHighlightParagraph(anchor.text.slice(0, 120));
                }
              }}
              onJumpToPage={onJumpToPage}
              reasoningChain={undefined}
              pageIntelligence={pageIntelligence}
              tabResponse={pageIntelligence?.tabPayloads?.insightsPayload ?? pageIntelligence?.tabResponses?.insights}
            />
          )}
          </div>
        </div>
      </div>

      {/* Toast Message */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-teal-600 text-white text-sm rounded-lg shadow-lg z-50">
          {toastMessage}
        </div>
      )}

      {/* Insight Overlay */}
      {showInsightOverlay && selectedInsightTarget && (
        <InsightOverlay
          targetType={selectedInsightTarget.type}
          targetId={selectedInsightTarget.id}
          relation={selectedInsightTarget.type === 'relation' ? relations[selectedInsightTarget.id] : undefined}
          cluster={selectedInsightTarget.type === 'cluster' ? clusters[selectedInsightTarget.id] : undefined}
          rule={selectedInsightTarget.type === 'rule' ? rules[selectedInsightTarget.id] : undefined}
          concepts={concepts}
          relations={relations}
          clusters={clusters}
          onClose={() => {
            setShowInsightOverlay(false);
            setSelectedInsightTarget(null);
          }}
          onJumpToPage={onJumpToPage}
        />
      )}

      {/* DAT Drill Mode */}
      {showDrillMode && (
        <DATDrillMode
          insights={rankedInsights}
          onClose={() => setShowDrillMode(false)}
          onComplete={() => {}}
        />
      )}

      {/* Floating DAT Drill Button */}
      {rankedInsights.filter(i => i.bucket === 'CRITICAL' || i.bucket === 'HIGH_YIELD').length >= 3 && (
        <button
          onClick={() => setShowDrillMode(true)}
          className="fixed bottom-6 right-6 px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-full shadow-lg flex items-center gap-2 z-40"
        >
          <span className="text-xl">🎯</span>
          <span className="font-medium text-sm">DAT Drill</span>
        </button>
      )}
    </div>
  );
};

// Mode Chip Component - Expert View 2.1 compact mode selector
const ModeChip: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
  title?: string;
}> = ({ label, active, onClick, badge, title }) => (
  <button
    onClick={onClick}
    title={title}
    className={`
      flex-1 px-2 py-1.5 text-[11px] font-medium rounded transition-all relative
      ${active
        ? 'bg-teal-500/20 text-teal-400 border border-teal-500/40'
        : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/50 border border-transparent'
      }
    `}
  >
    {label}
    {badge !== undefined && badge > 0 && (
      <span className="absolute -top-1 -right-1 px-1 py-0 text-[9px] font-bold bg-red-500 text-white rounded-full min-w-[14px] text-center">
        {badge}
      </span>
    )}
  </button>
);

// ============================================================================
// Ninja Nerd Section — one styled teaching block
// ============================================================================
const NinjaNerdSection: React.FC<{
  icon: string;
  label: string;
  accent: string;       // Tailwind text-* colour class
  border: string;       // Tailwind border-* colour class
  bg: string;           // Tailwind bg-* colour class
  children: React.ReactNode;
}> = ({ icon, label, accent, border, bg, children }) => (
  <div className={`rounded-xl border ${border} ${bg} overflow-hidden`}>
    <div className={`px-3 py-1.5 border-b ${border} flex items-center gap-1.5`}>
      <span className="text-sm">{icon}</span>
      <span className={`text-[10px] font-bold uppercase tracking-widest ${accent}`}>{label}</span>
    </div>
    <div className="px-3 py-2.5 text-[12px] text-gray-200 leading-relaxed">
      {children}
    </div>
  </div>
);

// ============================================================================
// Explain Tab — Ninja Nerd conceptual teaching driven by Page Intelligence
// ============================================================================
const ExplainTab: React.FC<{
  selectedCardId?: string;
  insights: RankedInsight[];
  onSelectCard: () => void;
  pageIntelligence?: PageIntelligence | null;
  tabResponse?: TabResponse;
  tone?: 'polish' | 'student' | 'clinical' | 'expert';
  depth?: 'minimal' | 'standard' | 'deep';
  density?: 'condensed' | 'expanded';
  essential?: boolean;
}> = ({ selectedCardId, insights, onSelectCard, pageIntelligence, tabResponse, tone = 'student', depth = 'standard', density = 'condensed', essential = false }) => {
  const selected = insights.find(i => i.id === selectedCardId);
  const piExplain = pageIntelligence?.explain;
  const continuity = pageIntelligence?.continuity;

  // --- Empty state ---
  const hasContent =
    (piExplain && piExplain.summary !== 'No text available for this page.') ||
    selected ||
    continuity;

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <span className="text-3xl mb-3">🧠</span>
        <h3 className="text-sm font-medium text-gray-300 mb-1">Explain Mode</h3>
        <p className="text-xs text-gray-500 mb-4 max-w-[200px]">
          Extract a page to generate Ninja Nerd–style conceptual teaching cards.
        </p>
        <button
          onClick={onSelectCard}
          className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg"
        >
          Or select an insight card
        </button>
      </div>
    );
  }

  // --- Derive teaching content ---
  // Priority: selected card → page intelligence → continuity scaffold
  const topicTitle = sanitizeTitle(
    selected?.title ??
    piExplain?.summary?.slice(0, 60) ??
    continuity?.corePattern.slice(0, 60) ??
    'Current Page',
    'Current Page',
  );

  const sectionExplanation = tabResponse?.sections.find((s) => s.label === 'Section explanation')?.content;
  const whatThisMeans = sanitizeRenderText(
    normalizeRenderableText(
      selected?.claim ??
      sectionExplanation ??
      piExplain?.summary ??
      continuity?.corePattern ??
      'See page for core definition.',
    ),
  );

  const mechanism = sanitizeRenderText(
    continuity?.conceptualBridge ??
    (piExplain?.bullets?.[0] ? `First, ${piExplain.bullets[0]}` : null),
  );

  // Key steps from explain bullets
  const explainFlow = tabResponse?.sections.find(s => s.label === 'Subsection flow')?.content;
  const keySteps = sanitizeRenderList(Array.isArray(explainFlow) ? explainFlow : (explainFlow ? [explainFlow] : (piExplain?.bullets ?? [])));

  const whyItMatters = sanitizeRenderText(
    continuity?.clinicalConnection ??
    selected?.whyItMatters ??
    'Foundational for board exam mastery.',
  );

  // How to think: use the corePattern + conceptualBridge as a mental model
  const toneLead =
    tone === 'expert' ? 'Mechanistically, ' :
    tone === 'clinical' ? 'Clinically, ' :
    tone === 'polish' ? 'In practical terms, ' :
    '';

  const howToThink = sanitizeRenderText(
    continuity
      ? `${toneLead}think of "${continuity.corePattern}" as the core idea. ${continuity.conceptualBridge}`
      : selected
        ? `${toneLead}connect "${selected.title}" to the broader system — ask why, not just what.`
        : null,
  );

  // Exam trap: pitfalls + continuity warning
  const examTraps: string[] = sanitizeRenderList([
    ...(piExplain?.pitfalls ?? []),
    ...(continuity?.commonMisunderstanding ? [continuity.commonMisunderstanding] : []),
  ]).filter((v, i, a) => a.indexOf(v) === i).slice(0, depth === 'deep' ? 4 : 2); // deduplicate

  // Mnemonics
  const mnemonics = sanitizeRenderList(piExplain?.mnemonics ?? []);
  const compact = density === 'condensed';

  // Math formulas on this page
  const mathSegments = pageIntelligence?.segments.filter(
    s => s.kind === 'math' || (s.mathDensity ?? 0) > 0.15
  ) ?? [];

  return (
    <div className={`p-3 ${compact ? 'space-y-2' : 'space-y-3'} overflow-y-auto insightPanelScroll`}>
      {/* Topic header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-teal-300 leading-tight max-w-[80%] whitespace-normal">
          {topicTitle}
        </h3>
        {pageIntelligence?.source !== 'native' && (
          <span className="px-1.5 py-0.5 text-[9px] bg-amber-500/20 text-amber-400 rounded flex-shrink-0">
            {pageIntelligence?.source === 'mixed' ? 'Mixed' : 'OCR'}
          </span>
        )}
      </div>

      {/* 1. WHAT THIS MEANS */}
      <NinjaNerdSection
        icon="🧠"
        label="What This Means"
        accent="text-teal-300"
        border="border-teal-700/50"
        bg="bg-teal-900/10"
      >
        {whatThisMeans}
      </NinjaNerdSection>

      {/* 2. MECHANISM — with structure flow connector if available */}
      {mechanism && depth !== 'minimal' && (
        <NinjaNerdSection
          icon="⚙️"
          label="Mechanism"
          accent="text-purple-300"
          border="border-purple-700/50"
          bg="bg-purple-900/10"
        >
          <div className="space-y-1.5">
            <p>{mechanism}</p>
            {keySteps.length > 0 && !essential && (
              <div className="mt-2 space-y-1">
                {keySteps.slice(0, 6).map((step, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <span className="text-purple-400 font-mono text-[10px] flex-shrink-0 mt-0.5">
                      {i + 1}.
                    </span>
                    <span className="text-gray-300 text-[11px]">{step}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </NinjaNerdSection>
      )}

      {depth !== 'minimal' && (
      <NinjaNerdSection
        icon="🪜"
        label="Stepwise Breakdown"
        accent="text-cyan-300"
        border="border-cyan-700/50"
        bg="bg-cyan-900/10"
      >
        <ol className="space-y-1.5 list-decimal ml-4">
          <li>Start by defining the core claim in one sentence: {whatThisMeans}</li>
          {mechanism && <li>Then ask what drives it biologically or conceptually: {mechanism}</li>}
          <li>Next connect it to adjacent ideas so it is not memorized in isolation.</li>
          <li>Finally test your understanding by predicting what changes if one step fails.</li>
        </ol>
      </NinjaNerdSection>
      )}

      {/* 3. WHY IT MATTERS */}

      <NinjaNerdSection
        icon="🧬"
        label="Why It Matters"
        accent="text-green-300"
        border="border-green-700/50"
        bg="bg-green-900/10"
      >
        {whyItMatters}
      </NinjaNerdSection>

      {/* 5. HOW TO THINK ABOUT IT */}
      {howToThink && (depth !== 'minimal' || tone !== 'student') && (
        <NinjaNerdSection
          icon="💭"
          label="How to Think About It"
          accent="text-blue-300"
          border="border-blue-700/50"
          bg="bg-blue-900/10"
        >
          {howToThink}
        </NinjaNerdSection>
      )}

      {/* 6. MATH FORMULAS — inline block math for any formula segments */}
      {mathSegments.length > 0 && (
        <div className="rounded-xl border border-teal-700/40 bg-gray-900/50 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-teal-800/30 flex items-center gap-1.5">
            <span className="text-sm">📐</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-teal-500">
              Formulas
            </span>
          </div>
          <div className="px-3 py-2 space-y-1.5">
            {mathSegments.slice(0, 3).map((seg, i) => (
              <div key={i}>
                <BlockMath expr={seg.mathRaw ?? seg.text} />
                {seg.mathRaw && seg.mathRaw !== seg.text && (
                  <p className="text-[10px] text-gray-500 text-center mt-0.5">{seg.text.slice(0, 60)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. EXAM TRAPS */}
      {examTraps.length > 0 && depth !== 'minimal' && (
        <NinjaNerdSection
          icon="⚠️"
          label="Exam Traps"
          accent="text-amber-300"
          border="border-amber-700/50"
          bg="bg-amber-900/10"
        >
          <div className="space-y-2">
            {examTraps.map((trap, i) => (
              <div
                key={i}
                className="flex gap-2 items-start bg-amber-900/20 rounded-lg p-2 border border-amber-700/30"
              >
                <span className="text-amber-400 flex-shrink-0 mt-0.5">▲</span>
                <span className="text-amber-200 text-[11px]">{trap}</span>
              </div>
            ))}
          </div>
        </NinjaNerdSection>
      )}

      {/* 8. MEMORY AIDS — mnemonics */}
      {mnemonics.length > 0 && depth === 'deep' && !essential && (
        <NinjaNerdSection
          icon="💡"
          label="Memory Aids"
          accent="text-violet-300"
          border="border-violet-700/50"
          bg="bg-violet-900/10"
        >
          <div className="space-y-1.5">
            {mnemonics.map((m, i) => (
              <div
                key={i}
                className="flex gap-2 items-start bg-violet-900/20 rounded-lg p-2 border border-violet-700/30"
              >
                <span className="text-violet-400 flex-shrink-0">🔑</span>
                <span className="text-violet-200 text-[11px]">{m}</span>
              </div>
            ))}
          </div>
        </NinjaNerdSection>
      )}

      {/* Copy button */}
      <button
        onClick={() => {
          const text = [
            `TOPIC: ${topicTitle}`,
            `WHAT: ${whatThisMeans}`,
            mechanism ? `MECHANISM: ${mechanism}` : '',
            `WHY: ${whyItMatters}`,
            howToThink ? `MENTAL MODEL: ${howToThink}` : '',
            examTraps.length ? `EXAM TRAPS:\n${examTraps.map(t => `• ${t}`).join('\n')}` : '',
          ].filter(Boolean).join('\n\n');
          navigator.clipboard?.writeText(text).catch(() => {});
        }}
        className="w-full px-2 py-1.5 text-[10px] bg-teal-700/40 hover:bg-teal-700/70 text-teal-300 rounded-lg border border-teal-700/40 transition-colors"
      >
        Copy Explanation
      </button>
    </div>
  );
};

// Compare Tab - Differential tables
const CompareTab: React.FC<{
  selectedCardId?: string;
  insights: RankedInsight[];
  onSelectCard: () => void;
  pageIntelligence?: PageIntelligence | null;
  tabResponse?: TabResponse;
}> = ({ selectedCardId, insights, onSelectCard, pageIntelligence, tabResponse }) => {
  const selected = insights.find(i => i.id === selectedCardId);

  // Find confusable pairs
  const confusables = useMemo(() => {
    return insights.filter(i =>
      i.type === 'EXAM_TRAP' ||
      (i.trap && i.trap.toLowerCase().includes('look-alike')) ||
      sanitizeRenderText(i.claim).toLowerCase().includes(' vs ')
    ).slice(0, 3);
  }, [insights]);

  const schemaVs = tabResponse?.sections.find(s => s.label === 'A vs B candidates')?.content;
  const schemaConfusions = tabResponse?.sections.find(s => s.label === 'Commonly confused concepts')?.content;
  const autoCompareCandidates = useMemo(() => {
    const segments = pageIntelligence?.segments ?? [];
    const fromContrast = segments
      .filter((segment) => /\b(unlike|whereas|in contrast|versus|vs\.?)\b/i.test(segment.text))
      .map((segment) => sanitizeRenderText(segment.text))
      .filter(Boolean)
      .slice(0, 4);
    if (fromContrast.length) return fromContrast;

    const rels = pageIntelligence?.relations ?? [];
    return rels.slice(0, 4).map((rel) => `${sanitizeRenderText(rel.from)} vs ${sanitizeRenderText(rel.to)}`).filter(Boolean);
  }, [pageIntelligence]);
  const hasGroundedCompare = Array.isArray(schemaVs)
    ? schemaVs.some((row) => typeof row === 'string' && !row.toLowerCase().includes('no compare pair available'))
    : autoCompareCandidates.length > 0;

  if (!selected && confusables.length === 0 && !hasGroundedCompare) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <span className="text-3xl mb-3">⚖️</span>
        <h3 className="text-sm font-medium text-gray-300 mb-1">Compare Mode</h3>
        <p className="text-xs text-gray-500 mb-2 max-w-[220px]">
          No compare pair available from the current page cluster yet.
        </p>
        <p className="text-[11px] text-gray-600 max-w-[220px]">Extract more grounded page evidence, then reopen Compare.</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4">
      {selected && (
        <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
          <h3 className="text-xs font-semibold text-gray-300 mb-2">
            Comparing: {selected.title}
          </h3>

          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="p-1.5 border-b border-gray-700">Feature</th>
                <th className="p-1.5 border-b border-gray-700">{selected.title}</th>
                <th className="p-1.5 border-b border-gray-700 text-gray-300">Analog / Contrast</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              <tr>
                <td className="p-1.5 border-b border-gray-700/50 text-gray-400">Definition</td>
                <td className="p-1.5 border-b border-gray-700/50">{sanitizeRenderText(selected.claim) || '-'}</td>
                <td className="p-1.5 border-b border-gray-700/50 text-gray-300">Like a neighboring concept that serves a similar role but with different trigger conditions.</td>
              </tr>
              <tr>
                <td className="p-1.5 border-b border-gray-700/50 text-gray-400">Key Finding</td>
                <td className="p-1.5 border-b border-gray-700/50">{selected.whyItMatters || 'Key downstream effect in context.'}</td>
                <td className="p-1.5 border-b border-gray-700/50 text-gray-300">Do not confuse with terms that look similar but point to a different mechanism.</td>
              </tr>
              <tr>
                <td className="p-1.5 text-gray-400">Differentiator</td>
                <td className="p-1.5">{selected.whyItMatters || '-'}</td>
                <td className="p-1.5 text-gray-300">Think: this is like a checkpoint, not a final endpoint.</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {(Array.isArray(schemaVs) && schemaVs.length > 0) || autoCompareCandidates.length > 0 ? (
        <div>
          <h3 className="text-[10px] font-semibold text-gray-400 uppercase mb-2">A vs B (Graph Query)</h3>
          <div className="space-y-1.5">
            {(Array.isArray(schemaVs) && schemaVs.length > 0 ? sanitizeRenderList(schemaVs) : autoCompareCandidates).map((line, idx) => (
              <div key={idx} className="bg-blue-900/20 border border-blue-700/40 rounded p-2 text-xs text-blue-200">{sanitizeRenderText(line)}</div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-500">No compare pair available on this page yet.</p>
      )}

      {(confusables.length > 0 || (Array.isArray(schemaConfusions) && schemaConfusions.length > 0)) && (
        <div>
          <h3 className="text-[10px] font-semibold text-gray-400 uppercase mb-2">
            Common Confusions on This Page
          </h3>
          <div className="space-y-1.5">
            {(Array.isArray(schemaConfusions) && schemaConfusions.length > 0
              ? sanitizeRenderList(schemaConfusions).map((c, idx) => ({ id: `schema-${idx}`, title: c }))
              : confusables
            ).map(c => (
              <div key={c.id} className="bg-amber-900/20 border border-amber-700/40 rounded p-2 text-xs text-amber-200">
                {sanitizeRenderText(c.title)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Insights Tab - What matters + What you're missing
// Data flows from pageIntelligence (primary) or rankedInsights (fallback).
// Legacy pageInsights / pageReasoning removed — pageIntelligence covers everything.
const InsightsTab: React.FC<{
  insights: RankedInsight[];
  trapInsights: RankedInsight[];
  selectedCardId?: string;
  onCardClick: (insight: RankedInsight) => void;
  onJumpToPage: (page: number) => void;
  reasoningChain?: ReasoningChain;
  pageIntelligence?: PageIntelligence | null;
  tabResponse?: TabResponse;
}> = ({
  insights,
  trapInsights,
  selectedCardId,
  onCardClick,
  onJumpToPage,
  reasoningChain,
  pageIntelligence,
  tabResponse,
}) => {
  const highYield = insights.filter(i => i.bucket === 'CRITICAL' || i.bucket === 'HIGH_YIELD');
  const traps = trapInsights.slice(0, 5);

  // Page Intelligence is the primary source; rankedInsights is the fallback
  const piInsights = pageIntelligence?.insights || [];
  const piRelations = pageIntelligence?.relations || [];
  const piCards = pageIntelligence?.cards   || [];
  const missingFromReasoning = reasoningChain?.missing?.map(m => m.detail) || [];
  const schemaHidden = tabResponse?.sections.find(s => s.label === 'Hidden implications')?.content;
  const schemaTraps = tabResponse?.sections.find(s => s.label === 'Exam traps')?.content;

  const deepSignals = [
    sanitizeRenderText(schemaHidden) || (pageIntelligence?.continuity?.corePattern ? `Deeper pattern: ${pageIntelligence.continuity.corePattern}` : null),
    pageIntelligence?.continuity?.conceptualBridge ? `Hidden bridge: ${pageIntelligence.continuity.conceptualBridge}` : null,
    pageIntelligence?.continuity?.clinicalConnection ? `Why this section matters now: ${pageIntelligence.continuity.clinicalConnection}` : null,
    pageIntelligence?.continuity?.commonMisunderstanding ? `Easy-to-miss pitfall: ${pageIntelligence.continuity.commonMisunderstanding}` : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="p-3 space-y-4 overflow-y-auto">
      {/* What Matters - from Page Intelligence with DAT scoring */}
      <section>
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
          <span>💎</span> What Matters
          {piInsights.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[9px] bg-teal-500/20 text-teal-400 rounded">
              {piInsights.length}
            </span>
          )}
        </h3>
        {piInsights.length > 0 ? (
          <div className="space-y-1.5">
            {piInsights.slice(0, 10).map(insight => (
              <div
                key={insight.id}
                className="bg-gray-800/50 border border-gray-700 rounded-lg p-2.5 text-xs hover:border-teal-500/40 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-medium text-teal-300">{insight.title}</span>
                  <div className="flex gap-1 flex-shrink-0">
                    {/* DAT Scoring Badge */}
                    <span
                      className={`
                        px-1.5 py-0.5 text-[9px] font-semibold rounded
                        ${insight.badge === 'DAT MUST KNOW'
                          ? 'bg-red-500/20 text-red-400'
                          : insight.badge === 'High yield'
                            ? 'bg-amber-500/20 text-amber-400'
                            : insight.badge === 'Worth learning'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-gray-500/20 text-gray-400'
                        }
                      `}
                      title={`Score: ${insight.score}/100`}
                    >
                      {insight.badge === 'DAT MUST KNOW' ? '🔥 MUST KNOW' : insight.badge}
                    </span>
                  </div>
                </div>
                <ImportanceBar score={insight.score} className="my-1.5" />
                <p className="text-gray-400">{insight.body}</p>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {insight.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="px-1 py-0.5 text-[9px] bg-gray-700 text-gray-400 rounded">
                      {tag}
                    </span>
                  ))}
                  <span className="px-1 py-0.5 text-[9px] text-gray-500">
                    Score: {insight.score}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : highYield.length > 0 ? (
          <div className="space-y-1.5">
            {highYield.slice(0, 6).map(insight => (
              <button
                key={insight.id}
                onClick={() => onCardClick(insight)}
                className={`
                  w-full text-left px-2.5 py-2 rounded-lg border transition-colors text-xs
                  ${selectedCardId === insight.id
                    ? 'bg-teal-500/20 border-teal-500/40 text-teal-300'
                    : 'bg-gray-800/50 border-gray-700 text-gray-300 hover:border-gray-600'
                  }
                `}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="whitespace-normal">{insight.title}</span>
                  {insight.evidence?.[0]?.page !== undefined && (
                    <span
                      onClick={(e) => { e.stopPropagation(); onJumpToPage(insight.evidence![0].page + 1); }}
                      className="text-[10px] text-teal-400 hover:text-teal-300 flex-shrink-0"
                    >
                      p.{insight.evidence[0].page + 1}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 italic">Extract content to see high-yield items</p>
        )}

        {/* Page Intelligence Relations */}
        {piRelations.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-700">
            <h4 className="text-[9px] font-semibold text-gray-500 uppercase mb-2">Relations ({piRelations.length})</h4>
            <div className="space-y-1">
              {piRelations.slice(0, 5).map(rel => (
                <div key={rel.id} className="text-[10px] text-gray-400">
                  <span className="text-teal-300">{rel.from}</span>
                  <span className="text-gray-500 mx-1">→</span>
                  <span className="text-purple-300">{rel.to}</span>
                  <span className="text-gray-600 ml-1">({rel.type})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Page Intelligence Study Cards */}
        {piCards.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-700">
            <h4 className="text-[9px] font-semibold text-gray-500 uppercase mb-2">
              Auto-generated Study Cards ({piCards.length})
            </h4>
            <div className="space-y-1.5">
              {piCards.slice(0, 5).map(card => (
                <div key={card.id} className="bg-purple-900/20 border border-purple-700/40 rounded p-2 text-xs">
                  <p className="text-purple-300 font-medium mb-1">{card.front}</p>
                  <p className="text-gray-400 text-[10px]">{card.back}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </section>

      <section>
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
          <span>🧭</span> Deeper Insight
        </h3>
        {deepSignals.length > 0 ? (
          <div className="space-y-1.5">
            {deepSignals.map((signal, idx) => (
              <div key={idx} className="bg-slate-900/60 border border-slate-700 rounded p-2 text-xs text-slate-200">
                {signal}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 italic">Extract content to reveal deeper logic and hidden structure.</p>
        )}
      </section>

      {/* Traps / Watch Out */}
      {traps.length > 0 && (
        <section>
          <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
            <span>⚠️</span> Watch Out
          </h3>
          <div className="space-y-1.5">
            {traps.map(trap => (
              <button
                key={trap.id}
                onClick={() => onCardClick(trap)}
                className="w-full text-left px-2.5 py-2 rounded-lg border border-amber-700/40 bg-amber-900/20 text-amber-200 text-xs hover:border-amber-600/40"
              >
                <span>{trap.title}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* What You May Be Missing - from reasoning chain */}
      <section>
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
          <span>🔍</span> What You May Be Missing
        </h3>
        {missingFromReasoning.length > 0 ? (
          <div className="space-y-1.5">
            {missingFromReasoning.slice(0, 5).map((suggestion, idx) => (
              <div key={idx} className="bg-gray-800/50 border border-gray-700 rounded p-2 text-xs">
                <span className="text-gray-400">{suggestion}</span>
              </div>
            ))}
          </div>
        ) : reasoningChain?.missing && reasoningChain.missing.length > 0 ? (
          <div className="space-y-1.5">
            {reasoningChain.missing.map((missing, idx) => (
              <div key={idx} className="bg-gray-800/50 border border-gray-700 rounded p-2 text-xs">
                <span className="text-amber-400 font-medium">{missing.expectedType}:</span>
                <span className="text-gray-400 ml-1">{missing.detail}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 italic">
            Extract content to see what concepts may be missing.
          </p>
        )}
      </section>
    </div>
  );
};

// ============================================================================
// Clinical Reasoning Flow — causal chain from page intelligence relations
// ============================================================================
function buildClinicalFlow(
  piRelations: import('@/lib/page-intelligence').Relation[],
  piSegments: import('@/lib/page-intelligence').Segment[]
): Array<{ from: string; to: string; predicate: string }> {
  // Only use causal / sequential relations
  const causal = piRelations.filter(r =>
    r.type === 'causes' || r.type === 'leads_to' || r.type === 'indicates'
  );
  if (causal.length === 0) return [];

  // Build an adjacency set: from → to
  const edgeMap = new Map<string, { to: string; predicate: string }>();
  for (const r of causal) {
    if (!edgeMap.has(r.from)) {
      edgeMap.set(r.from, { to: r.to, predicate: r.type.replace('_', ' ') });
    }
  }

  // Find a root node (appears as 'from' but not as 'to' in any edge)
  const allTos = new Set(causal.map(r => r.to));
  const roots = causal.map(r => r.from).filter(f => !allTos.has(f));
  const root = roots[0] ?? causal[0].from;

  // Walk the chain up to 6 hops
  const chain: Array<{ from: string; to: string; predicate: string }> = [];
  let current = root;
  const seen = new Set<string>();
  while (chain.length < 6) {
    const edge = edgeMap.get(current);
    if (!edge || seen.has(current)) break;
    seen.add(current);
    chain.push({ from: current, to: edge.to, predicate: edge.predicate });
    current = edge.to;
  }

  return chain;
}

// Relations Tab - Shows clusters and relations in a compact view
const RelationsTab: React.FC<{
  relations: Relation[];
  clusters: PatternCluster[];
  concepts: Record<string, any>;
  chains: Array<{ id: string; title: string; relations: Relation[]; concepts?: Concept[] }>;
  selectedCluster?: PatternCluster | null;
  onSelectCluster: (clusterId: string) => void;
  onRelationClick: (relation: Relation) => void;
  onJumpToPage?: (page: number) => void;
  pageIntelligence?: PageIntelligence | null;
  tabResponse?: TabResponse;
}> = ({
  relations,
  clusters,
  concepts,
  chains,
  selectedCluster,
  onSelectCluster,
  onRelationClick,
  onJumpToPage,
  pageIntelligence,
  tabResponse,
}) => {
  const autoRelations = useMemo(() => {
    const rels = pageIntelligence?.relations ?? [];
    if (rels.length > 0) return rels.slice(0, 6).map((r) => `${sanitizeRenderText(r.from)} → ${sanitizeRenderText(r.to)}`);
    const segments = pageIntelligence?.segments ?? [];
    return segments
      .filter((segment) => /\b(leads to|causes|results in|because|therefore|thus)\b/i.test(segment.text))
      .map((segment) => sanitizeRenderText(segment.text))
      .slice(0, 4);
  }, [pageIntelligence]);
  const hasContent = relations.length > 0 || clusters.length > 0 || autoRelations.length > 0;

  // Build clinical reasoning flow from page intelligence relations
  const clinicalFlow = useMemo(() => {
    if (!pageIntelligence?.relations?.length) return [];
    return buildClinicalFlow(pageIntelligence.relations, pageIntelligence.segments);
  }, [pageIntelligence]);

  const schemaRelations = tabResponse?.sections.find(s => s.label === 'Concept relationships on this page')?.content;

  const conceptualLinks = useMemo(() => {
    const rels = pageIntelligence?.relations ?? [];
    const prerequisites = rels.filter(r => ['requires', 'precedes', 'is_part_of', 'is_type_of'].includes(r.type)).slice(0, 5);
    const downstream = rels.filter(r => ['leads_to', 'causes', 'indicates', 'results_in'].includes(r.type)).slice(0, 5);
    const neighbors = rels.filter(r => !prerequisites.includes(r) && !downstream.includes(r)).slice(0, 5);
    return { prerequisites, downstream, neighbors };
  }, [pageIntelligence]);

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <span className="text-3xl mb-3">🔗</span>
        <h3 className="text-sm font-medium text-gray-300 mb-1">Relations View</h3>
        <p className="text-xs text-gray-500 max-w-[200px]">
          No grounded relations found for this page yet.
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 overflow-y-auto h-full space-y-4">
      {(Array.isArray(schemaRelations) && schemaRelations.length > 0) || autoRelations.length > 0 ? (
        <section className="rounded-xl border border-indigo-700/60 bg-indigo-900/20 p-3">
          <h3 className="text-[10px] font-semibold text-indigo-200 uppercase tracking-wide mb-2">Page-grounded Relationships</h3>
          <div className="space-y-1 text-[11px] text-indigo-100">
            {(Array.isArray(schemaRelations) && schemaRelations.length > 0 ? sanitizeRenderList(schemaRelations) : autoRelations)
              .map((line, idx) => <p key={idx}>{sanitizeRenderText(line)}</p>)}
          </div>
        </section>
      ) : (
        <p className="text-xs text-gray-500">No grounded relations found on this page yet.</p>
      )}

      {(conceptualLinks.prerequisites.length > 0 || conceptualLinks.downstream.length > 0 || conceptualLinks.neighbors.length > 0) && (
        <section className="rounded-xl border border-gray-700/60 bg-gray-900/40 p-3">
          <h3 className="text-[10px] font-semibold text-gray-300 uppercase tracking-wide mb-2">Conceptual Links</h3>
          <div className="space-y-2 text-[11px]">
            {conceptualLinks.prerequisites.length > 0 && (
              <div>
                <p className="text-blue-300 mb-1">Builds on</p>
                {conceptualLinks.prerequisites.map(rel => <p key={rel.id} className="text-gray-300">• {rel.from} → {rel.to}</p>)}
              </div>
            )}
            {conceptualLinks.downstream.length > 0 && (
              <div>
                <p className="text-emerald-300 mb-1">Leads to</p>
                {conceptualLinks.downstream.map(rel => <p key={rel.id} className="text-gray-300">• {rel.from} → {rel.to}</p>)}
              </div>
            )}
            {conceptualLinks.neighbors.length > 0 && (
              <div>
                <p className="text-purple-300 mb-1">Conceptual neighbors</p>
                {conceptualLinks.neighbors.map(rel => <p key={rel.id} className="text-gray-300">• {rel.from} ↔ {rel.to}</p>)}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Clinical Reasoning Flow — only when page intelligence relations detected */}
      {clinicalFlow.length >= 2 && (
        <section className="mb-4">
          <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
            <span>⛓️</span> Clinical Reasoning Flow
          </h3>
          <div className="rounded-xl border border-teal-700/40 bg-gray-900/50 overflow-hidden">
            <div className="px-3 py-2.5 space-y-0">
              {clinicalFlow.map((edge, idx) => (
                <div key={idx}>
                  {/* From node (only on first) */}
                  {idx === 0 && (
                    <div className="px-2.5 py-1.5 rounded-lg bg-teal-900/30 border border-teal-700/40 text-[11px] text-teal-200 font-medium">
                      {edge.from}
                    </div>
                  )}
                  {/* Arrow + predicate */}
                  <div className="flex items-center gap-1.5 my-0.5 pl-4">
                    <div className="h-3 w-px bg-gray-600" />
                    <span className="text-[9px] text-purple-400 italic">{edge.predicate}</span>
                  </div>
                  {/* To node */}
                  <div className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border ${
                    idx === clinicalFlow.length - 1
                      ? 'bg-red-900/20 border-red-700/40 text-red-200'
                      : 'bg-gray-800/50 border-gray-700/50 text-gray-200'
                  }`}>
                    {edge.to}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Clusters Section */}
      {clusters.length > 0 && (
        <section className="mb-4">
          <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
            <span>📊</span> Pattern Clusters
            <span className="text-gray-500">({clusters.length})</span>
          </h3>
          <div className="space-y-1.5">
            {clusters.slice(0, 8).map(cluster => (
              <button
                key={cluster.id}
                onClick={() => onSelectCluster(cluster.id)}
                className={`
                  w-full text-left px-2.5 py-2 rounded-lg border text-xs transition-all
                  ${selectedCluster?.id === cluster.id
                    ? 'bg-teal-500/20 border-teal-500/40 text-teal-300'
                    : 'bg-gray-800/50 border-gray-700 text-gray-300 hover:border-gray-600'
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate">{cluster.title}</span>
                  <span className="text-[10px] text-gray-500">{cluster.relationIds.length} rel</span>
                </div>
                {cluster.summary && (
                  <p className="text-[10px] text-gray-500 mt-0.5">{sanitizeRenderText(cluster.summary)}</p>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Relations Section */}
      {relations.length > 0 && (
        <section className="mb-4">
          <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
            <span>🔗</span> Relations
            <span className="text-gray-500">({relations.length})</span>
          </h3>
          <div className="space-y-1.5">
            {relations.slice(0, 12).map(relation => {
              const subject = concepts[relation.subjId];
              const object = concepts[relation.objId];
              const page = relation.evidence?.[0]?.page;

              return (
                <div
                  key={relation.id}
                  onClick={() => onRelationClick(relation)}
                  className="px-2.5 py-2 rounded-lg bg-gray-800/50 border border-gray-700 hover:border-gray-600 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-1 text-[11px]">
                    <span className="text-teal-300 font-medium truncate max-w-[80px]">
                      {subject?.label || relation.subjId}
                    </span>
                    <span className="text-gray-500">→</span>
                    <span className="text-purple-300 text-[10px]">
                      {relation.predicate.replace(/_/g, ' ')}
                    </span>
                    <span className="text-gray-500">→</span>
                    <span className="text-amber-300 font-medium truncate max-w-[80px]">
                      {object?.label || relation.objId}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    <ConfidenceDot confidence={relation.confidence} />
                    {page !== undefined && onJumpToPage && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onJumpToPage(page + 1);
                        }}
                        className="text-[9px] text-teal-400 hover:text-teal-300"
                      >
                        p.{page + 1}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Chains Section */}
      {chains.length > 0 && (
        <section>
          <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
            <span>⛓️</span> Reasoning Chains
            <span className="text-gray-500">({chains.length})</span>
          </h3>
          <div className="space-y-1.5">
            {chains.slice(0, 5).map(chain => {
              // Chain is complete if it has 3+ relations or concepts
              const isComplete = chain.relations.length >= 3 || (chain.concepts?.length || 0) >= 3;
              return (
                <div
                  key={chain.id}
                  className="px-2.5 py-2 rounded-lg bg-gray-800/50 border border-gray-700"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-300 font-medium">{chain.title}</span>
                    {isComplete ? (
                      <span className="text-[9px] text-green-400">Complete</span>
                    ) : (
                      <span className="text-[9px] text-amber-400">Partial</span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {chain.relations.length} steps
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

// Confidence Dot Component
const ConfidenceDot: React.FC<{ confidence: number }> = ({ confidence }) => {
  const percent = Math.round(confidence * 100);
  const color = percent >= 80 ? 'bg-green-500' : percent >= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1">
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
      <span className="text-[9px] text-gray-500">{percent}%</span>
    </div>
  );
};

export default SurgeonCockpit;
