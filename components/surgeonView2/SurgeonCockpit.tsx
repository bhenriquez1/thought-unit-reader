// components/surgeonView2/SurgeonCockpit.tsx
// Expert View 2.1 - Minimal Layout with Evidence Spine
// Page-aware extraction defaults to current page context
// Tabs: Priority | Explain | Compare | Insights (compact mode chips)
// Layout: Left rail (clusters) | Main (relations) | Right (comprehension tabs)

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useRelationshipStore } from '@/lib/relationshipSchema/store';
import { useNoteLabStore } from '@/lib/cognitiveEngine/noteLabStore';
import { useSurgeonEngineStore } from '@/lib/surgeonEngine/store';
import { useExpertViewStore } from '@/lib/cognitive/expertViewStore';
import { usePageContextStore } from '@/lib/cognitive/pageContextStore';
import type {
  ReasoningChain,
} from '@/lib/cognitive/types';
import type { PatternCluster, Relation, DecisionRule, RankedInsight, Concept } from '@/lib/relationshipSchema/types';
import {
  extractPage,
  generateInsights,
  generateExplain,
  generateCardsFromInsights,
  buildReasoningFlow,
  type PageExtractionResult,
  type InsightsResult,
  type ExplainPayload,
  type StudyCard,
  type ReasoningFlow,
} from '@/lib/engines';
// Page Intelligence module with OCR support
import {
  buildPageIntelligence,
  buildChapterIntelligence,
  type PageIntelligence,
  type PageSource,
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

<<<<<<< HEAD
  // Insights Panel Store — zoom + sync toggle + paragraph tracking
  const {
    insightScale,
    syncInsightsToPdf,
    activeParagraphId,
    activeVisibleText,
=======
  // Insights Panel Store — zoom + sync toggle
  const {
    insightScale,
    syncInsightsToPdf,
>>>>>>> a0e16f5 (feat: insights panel zoom + sync toggle)
    scaleUp,
    scaleDown,
    canScaleUp,
    canScaleDown,
    toggleSync,
  } = useInsightsPanelStore();

  // Local state
  const [activeTab, setActiveTab] = useState<ComprehensionTab>('priority');
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

  // Page-aware extraction state (new engines)
  const [pageExtraction, setPageExtraction] = useState<PageExtractionResult | null>(null);
  const [pageInsights, setPageInsights] = useState<InsightsResult | null>(null);
  const [pageExplain, setPageExplain] = useState<ExplainPayload | null>(null);
  const [pageReasoning, setPageReasoning] = useState<ReasoningFlow | null>(null);
  const [generatedStudyCards, setGeneratedStudyCards] = useState<StudyCard[]>([]);

  // Page Intelligence state (OCR-enabled pipeline)
  const [pageIntelligence, setPageIntelligence] = useState<PageIntelligence | null>(null);
  const [ocrEnabled, setOcrEnabled] = useState(true);
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [autoExtract, setAutoExtract] = useState(false);
  const [extractScope, setExtractScope] = useState<ExtractScope>('page');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync document context on mount
  useEffect(() => {
    if (documentId) {
      setDocId(documentId);
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

    pageContext.setPage(currentPage);
    expertView.setPage(currentPage);
    surgeonEngine.setPageContext(currentPage);
    courseContext.setPage(currentPage);

    // Reset per-page extraction state so the UI doesn't show stale data from previous page
    setPageIntelligence(null);
    setPageExtraction(null);
    setPageInsights(null);
    setPageExplain(null);
    setPageReasoning(null);
    setExtractionStatus('');
    setOcrStatus('idle');

    // Reset UI selection state: don't carry previous-page selection into new page
    setSelectedCardId(undefined);
    setSelectedInsightTarget(null);
    // Clear cluster/unit selection in both stores so insight cards reset cleanly
    selectCluster(undefined);
    selectRelation(undefined);
    surgeonEngine.selectCluster(undefined);
    surgeonEngine.selectUnit(undefined);

    // Load cached intelligence for this page (IndexedDB, no-op if missing)
    courseContext.getPageIntelligence(currentPage).then((cached) => {
      if (cached) {
        setPageIntelligence(cached);
      }
    }).catch(() => {});
  }, [currentPage]);

  // PDF scroll → insight card sync:
  // When the active visible paragraph text changes and Sync is ON,
  // find the ranked insight whose claim/title best overlaps the snippet and activate it.
  useEffect(() => {
    if (!syncInsightsToPdf || !activeVisibleText || !rankedInsights.length) return;

    const needle = activeVisibleText.toLowerCase();
    const needleWords = new Set(needle.split(/\s+/).filter(w => w.length > 4));
    if (needleWords.size < 2) return;

    let bestId: string | undefined;
    let bestScore = 0;

    for (const insight of rankedInsights) {
      const haystack = `${insight.title} ${insight.claim || ''} ${insight.whyItMatters || ''}`.toLowerCase();
      let score = 0;
      for (const word of needleWords) {
        if (haystack.includes(word)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestId = insight.id;
      }
    }

    // Only update if we matched at least 2 words (avoid spurious matches)
    if (bestScore >= 2 && bestId && bestId !== selectedCardId) {
      setSelectedCardId(bestId);
    }
  }, [activeVisibleText, syncInsightsToPdf]);

  // Auto-extract with debounce (800–1000 ms) when page changes and auto-extract is on
  useEffect(() => {
    if (!autoExtract || currentPage === undefined || isRelationExtracting) return;
    const timer = setTimeout(() => {
      handleExtractCurrentPage();
    }, 800);
    return () => clearTimeout(timer);
  }, [currentPage, autoExtract]);

  // Prefetch: background-load page N+1 intelligence so it's cached when user navigates forward.
  // Runs after a longer delay (3 s) to avoid contending with the current-page extraction.
  useEffect(() => {
    if (currentPage === undefined || totalPages === 0) return;
    const nextPage = currentPage + 1;
    if (nextPage > totalPages) return;

    const timer = setTimeout(async () => {
      try {
        // Check if already cached — no-op if so
        const cached = await courseContext.getPageIntelligence(nextPage).catch(() => null);
        if (cached) return; // already warm

        const nextText = pageTexts?.get(nextPage) ?? '';
        if (nextText.trim().length < 40) return; // no text to prefetch with

        if (process.env.NODE_ENV === 'development') {
          console.log(`[SurgeonCockpit] Prefetching page ${nextPage} intelligence`);
        }

        const result = await buildPageIntelligence({
          pageNumber: nextPage,
          docId: documentId,
          getNativeText: async () => nextText,
          getPageImageDataUrl: async () => '', // no OCR for prefetch
          options: { ocrEnabled: false, datScoring: false, minTextLength: 40 },
        });
        await courseContext.storePageIntelligence(nextPage, result.intelligence);
      } catch {
        // Prefetch failure is silent — user will trigger extraction on demand
      }
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

  // Page context info
  const pageCtx = pageContext.getPageContext();
  const chapterTitle = pageCtx.tocPath?.title || 'Unknown Chapter';
  const confidencePercent = Math.round(pageCtx.confidence * 100);

  // ============================================================================
  // getPageText — resolve text for current page with 3-tier fallback:
  //   1. pageTexts Map (populated by parseBookWithChapters)
  //   2. DOM text layer scraping (.react-pdf__Page__textContent)
  //   3. Empty string → will trigger OCR if enabled
  // ============================================================================
  const getPageText = useCallback((page: number): string => {
    // Tier 1: pre-extracted Map
    const mapped = pageTexts?.get(page);
    if (mapped && mapped.trim().length >= 40) return mapped.trim();

    // Tier 2: live DOM text layer (react-pdf renders this as selectable text)
    const domText = getDOMPageText();
    if (domText.length >= 40) return domText;

    return '';
  }, [pageTexts]);

  // Handle extract current page - uses new Page Intelligence pipeline with OCR fallback
  const handleExtractCurrentPage = useCallback(async () => {
    const nativeText = getPageText(currentPage);
    const hasNativeText = nativeText.length >= 40;

    if (!hasNativeText && !ocrEnabled) {
      setExtractionStatus('No text found. Enable OCR for scanned PDFs or wait for the page to fully render.');
      return;
    }

    setExtractionStatus(hasNativeText ? 'Extracting page…' : 'Running OCR on page…');
    if (!hasNativeText && ocrEnabled) setOcrStatus('running');

    try {
      const result = await buildPageIntelligence({
        pageNumber: currentPage,
        docId: documentId,
        getNativeText: async () => nativeText,
        getPageImageDataUrl: async () => {
          // Find the visible PDF canvas for OCR rendering
          const selectors = [
            '.react-pdf__Page__canvas',
            `canvas[data-page="${currentPage}"]`,
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

      setPageIntelligence(result.intelligence);
      setOcrStatus(result.intelligence.source === 'ocr' ? 'done' : 'idle');

      // Persist to CourseContext (IndexedDB) → Study + NoteLab will read from here
      await courseContext.storePageIntelligence(currentPage, result.intelligence);

      // If text is available, run the legacy engine pipeline too
      const text = result.intelligence.segments.map(s => s.text).join('\n\n');
      if (text.trim().length > 50) {
        setExtractionStatus('Generating insights…');
        const extraction = await extractPage({ docId: documentId, pageIndex: currentPage, text });
        setPageExtraction(extraction);

        const insights = await generateInsights(extraction);
        setPageInsights(insights);

        setExtractionStatus('Building reasoning flow…');
        const reasoning = await buildReasoningFlow(extraction);
        setPageReasoning(reasoning);

        // Run relationship store extraction (Relations/Compare tabs)
        await extractFromMultiplePages([{ pageIndex: currentPage, text }]);

        // Push auto-generated study cards to the Study session store
        if (result.intelligence.cards.length > 0) {
          const studyStore = useStudySessionStore.getState();
          if (studyStore.addCardsFromPageIntel) {
            studyStore.addCardsFromPageIntel(documentId, currentPage, result.intelligence.cards);
          }
        }
      }

      const statusText = result.fromCache
        ? 'Loaded from cache'
        : `Done in ${result.processingTimeMs}ms${result.intelligence.source === 'ocr' ? ' (OCR)' : ''}`;
      setExtractionStatus(statusText);
      setTimeout(() => setExtractionStatus(''), 3000);
    } catch (error) {
      setExtractionStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setOcrStatus('idle');
    }
  }, [getPageText, currentPage, documentId, extractFromMultiplePages, ocrEnabled, courseContext]);

  // Check if chapter extraction is available
  const chapterRangeAvailable = useMemo(() => {
    // Check pageContext first, then courseContext
    const pcRange = pageContext.getChapterRange(currentPage);
    const ccRange = courseContext.getChapterRangeForPage(currentPage);
    return pcRange || ccRange;
  }, [currentPage, pageContext, courseContext.syllabusTopics]);

  // Handle extract chapter — uses Page Intelligence pipeline for each page in chapter
  const handleExtractChapter = useCallback(async () => {
    const chapterRange = pageContext.getChapterRange(currentPage) ||
                         courseContext.getChapterRangeForPage(currentPage);

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
          legacyPages.push({ pageIndex: intel.pageNumber, text });
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
  }, [currentPage, documentId, pageContext, courseContext, extractFromMultiplePages, getPageText, ocrEnabled]);

  // Unified extract handler for SmartExtractControl
  const handleUnifiedExtract = useCallback(async () => {
    if (extractScope === 'chapter' && chapterRangeAvailable) {
      await handleExtractChapter();
    } else {
      await handleExtractCurrentPage();
    }
  }, [extractScope, chapterRangeAvailable, handleExtractChapter, handleExtractCurrentPage]);

  // Handle card selection
  const handleCardClick = useCallback((insight: RankedInsight) => {
    setSelectedCardId(insight.id);
    setSelectedInsightTarget({ type: insight.sourceType, id: insight.sourceId });
    setShowInsightOverlay(true);
  }, []);

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
          scope: { mode: 'PAGE' as const, pageIndex: currentPage },
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
      setGeneratedStudyCards(prev => [...prev, ...cards]);
      setToastMessage(`Created ${cards.length} study card(s)`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (error) {
      console.error('Failed to generate card:', error);
      setToastMessage('Failed to create card');
      setTimeout(() => setToastMessage(null), 3000);
    }
  }, []);

  // Handle "Explain" action from PriorityWorkspacePanel
  const handleExplainInsight = useCallback((insight: RankedInsight) => {
    setSelectedCardId(insight.id);
    setActiveTab('explain');
  }, []);

  const handleReadCard = useCallback((insight: RankedInsight) => {
    if (!isWebSpeechAvailable()) return;
    stopSpeech();
    const script = generateInsightScript(insight, 'smart_high_yield', 'normal');
    const text = scriptToPlainText(script);
    speakText(text, { rate: 1.0 });
  }, []);

  // Handle generate explain for current page
  const handleGenerateExplain = useCallback(async () => {
    if (!pageExtraction) return;

    try {
      const explain = await generateExplain({
        extraction: pageExtraction,
        insights: pageInsights || undefined,
      });
      setPageExplain(explain);
    } catch (error) {
      console.error('Failed to generate explain:', error);
    }
  }, [pageExtraction, pageInsights]);

  // Handle generate study cards from insights
  const handleGenerateStudyCards = useCallback(async () => {
    if (!pageInsights) return;

    try {
      const cards = await generateCardsFromInsights({
        insights: pageInsights,
        includeWhatMissing: false,
      });
      setGeneratedStudyCards(cards);
    } catch (error) {
      console.error('Failed to generate study cards:', error);
    }
  }, [pageInsights]);

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
        <span className="text-xs text-gray-400 truncate max-w-[180px]" title={chapterTitle}>
          {chapterTitle}
        </span>

        {/* Page Number */}
        <span className="text-xs text-gray-500">
          p.{currentPage + 1}/{totalPages}
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
                : 'bg-amber-500/20 text-amber-400'}
            `}
            title={pageIntelligence.source === 'ocr'
              ? `OCR confidence: ${pageIntelligence.confidence || 0}%`
              : 'Native PDF text'}
          >
            {pageIntelligence.source === 'native' ? 'Native' : 'OCR'}
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

        {/* Tab Bar - Priority Comprehension Mode */}
        <div className="flex items-center border-b border-gray-700 bg-gray-800/50 px-3 py-1 gap-1">
          <ModeChip
            label="Priority"
            active={activeTab === 'priority'}
            onClick={() => setActiveTab('priority')}
            badge={rankedInsights.filter(i => i.bucket === 'CRITICAL' || i.bucket === 'HIGH_YIELD').length || undefined}
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
            badge={pageInsights?.whatMatters?.length || pageIntelligence?.insights?.length || undefined}
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
        </div>

        {/* Tab Content - Unified Panel */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'priority' && (
            <PriorityWorkspacePanel
              insights={rankedInsights}
              pageIntelligence={pageIntelligence}
              pageInsights={pageInsights}
              pageReasoning={pageReasoning}
              selectedCardId={selectedCardId}
              onJumpToPage={onJumpToPage}
              onExplain={handleExplainInsight}
              onMakeCard={handleMakeCard}
              onSendToNoteLab={handleSendToNoteLab}
              isExtracting={isRelationExtracting}
              onHighlightParagraph={onHighlightParagraph}
              insightScale={insightScale}
              syncEnabled={syncInsightsToPdf}
            />
          )}
          {activeTab === 'explain' && (
            <ExplainTab
              selectedCardId={selectedCardId}
              insights={rankedInsights}
              onSelectCard={() => setActiveTab('priority')}
              pageExtraction={pageExtraction}
              pageInsights={pageInsights}
              pageExplain={pageExplain}
              onGenerateExplain={handleGenerateExplain}
              pageIntelligence={pageIntelligence}
            />
          )}
          {activeTab === 'relations' && (
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
            />
          )}
          {activeTab === 'compare' && (
            <CompareTab
              selectedCardId={selectedCardId}
              insights={rankedInsights}
              onSelectCard={() => setActiveTab('priority')}
            />
          )}
          {activeTab === 'insights' && (
            <InsightsTab
              insights={rankedInsights}
              trapInsights={trapInsights}
              selectedCardId={selectedCardId}
              onCardClick={handleCardClick}
              onJumpToPage={onJumpToPage}
              reasoningChain={expertView.getReasoningChain()}
              pageInsights={pageInsights}
              pageReasoning={pageReasoning}
              onGenerateStudyCards={handleGenerateStudyCards}
              generatedStudyCards={generatedStudyCards}
              pageIntelligence={pageIntelligence}
            />
          )}
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
}> = ({ label, active, onClick, badge }) => (
  <button
    onClick={onClick}
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

// Explain Tab - Whiteboard-ready micro-lessons (page-aware)
const ExplainTab: React.FC<{
  selectedCardId?: string;
  insights: RankedInsight[];
  onSelectCard: () => void;
  pageExtraction?: PageExtractionResult | null;
  pageInsights?: InsightsResult | null;
  pageExplain?: ExplainPayload | null;
  onGenerateExplain?: () => Promise<void>;
  pageIntelligence?: PageIntelligence | null;
}> = ({ selectedCardId, insights, onSelectCard, pageExtraction, pageInsights, pageExplain, onGenerateExplain, pageIntelligence }) => {
  const selected = insights.find(i => i.id === selectedCardId);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateExplain = useCallback(async () => {
    if (!onGenerateExplain) return;
    setIsGenerating(true);
    try {
      await onGenerateExplain();
    } finally {
      setIsGenerating(false);
    }
  }, [onGenerateExplain]);

  // Use Page Intelligence explain if available
  const piExplain = pageIntelligence?.explain;

  // Page-aware explain from Page Intelligence
  if (piExplain && piExplain.summary !== 'No text available for this page.') {
    return (
      <div className="p-3 space-y-4 overflow-y-auto">
        <div className="bg-gray-800 rounded-lg p-3 border border-teal-500/40">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-teal-400">Page Explanation</h3>
            {pageIntelligence?.source === 'ocr' && (
              <span className="px-1.5 py-0.5 text-[9px] bg-amber-500/20 text-amber-400 rounded">
                via OCR
              </span>
            )}
          </div>

          {/* Summary */}
          <div className="space-y-2 mb-4">
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase">Summary</h4>
            <p className="text-xs text-gray-300">{piExplain.summary}</p>
          </div>

          {/* Key Points */}
          {piExplain.bullets.length > 0 && (
            <div className="space-y-2 mb-4">
              <h4 className="text-[10px] font-semibold text-gray-400 uppercase">Key Points</h4>
              <div className="space-y-1.5">
                {piExplain.bullets.map((bullet, idx) => (
                  <div key={idx} className="flex gap-2 text-xs">
                    <span className="text-teal-500">•</span>
                    <span className="text-gray-300">{bullet}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pitfalls / Exam Traps */}
          {piExplain.pitfalls.length > 0 && (
            <div className="space-y-2 mb-4">
              <h4 className="text-[10px] font-semibold text-gray-400 uppercase flex items-center gap-1">
                <span>⚠️</span> Exam Pitfalls
              </h4>
              <div className="space-y-1.5">
                {piExplain.pitfalls.map((pitfall, idx) => (
                  <div key={idx} className="bg-amber-900/20 border border-amber-700/40 rounded p-2 text-xs text-amber-200">
                    {pitfall}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mnemonics */}
          {piExplain.mnemonics && piExplain.mnemonics.length > 0 && (
            <div className="space-y-2 mb-4">
              <h4 className="text-[10px] font-semibold text-gray-400 uppercase flex items-center gap-1">
                <span>💡</span> Memory Aids
              </h4>
              <div className="space-y-1.5">
                {piExplain.mnemonics.map((mnemonic, idx) => (
                  <div key={idx} className="bg-purple-900/20 border border-purple-700/40 rounded p-2 text-xs text-purple-300">
                    {mnemonic}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button className="flex-1 px-2 py-1.5 text-[10px] bg-teal-600 hover:bg-teal-500 text-white rounded">
              Copy to Clipboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Page-aware explain: show "Explain this page" when extraction exists
  if (pageExplain) {
    return (
      <div className="p-3 space-y-4 overflow-y-auto">
        <div className="bg-gray-800 rounded-lg p-3 border border-teal-500/40">
          <h3 className="text-xs font-semibold text-teal-400 mb-3">{pageExplain.title}</h3>

          {/* Steps */}
          <div className="space-y-2 mb-4">
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase">Key Steps</h4>
            <div className="space-y-1.5">
              {pageExplain.steps.map((step, idx) => (
                <div key={idx} className="flex gap-2 text-xs">
                  <span className="text-teal-500 font-semibold">{idx + 1}.</span>
                  <span className="text-gray-300">{step}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Draw Instructions */}
          <div className="space-y-2 mb-4">
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase">Whiteboard Instructions</h4>
            <div className="bg-gray-900 rounded p-2 space-y-1">
              {pageExplain.drawInstructions.map((instruction, idx) => (
                <p key={idx} className="text-xs text-gray-200">• {instruction}</p>
              ))}
            </div>
          </div>

          {/* Exam Questions */}
          {pageExplain.examQuestions.length > 0 && (
            <div className="space-y-2 mb-4">
              <h4 className="text-[10px] font-semibold text-gray-400 uppercase">Exam Questions</h4>
              <div className="space-y-2">
                {pageExplain.examQuestions.map((eq, idx) => (
                  <div key={idx} className="bg-gray-900/50 rounded p-2 border border-gray-700">
                    <p className="text-xs text-purple-300 font-medium mb-1">Q: {eq.q}</p>
                    <p className="text-[10px] text-gray-400">A: {eq.a}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mnemonic */}
          {pageExplain.mnemonic && (
            <div className="bg-amber-900/20 border border-amber-700/40 rounded p-2 mb-3">
              <p className="text-xs text-amber-300">💡 {pageExplain.mnemonic}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button className="flex-1 px-2 py-1.5 text-[10px] bg-teal-600 hover:bg-teal-500 text-white rounded">
              Copy to Clipboard
            </button>
            <button className="flex-1 px-2 py-1.5 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded">
              Explain on Whiteboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show "Explain this page" CTA when extraction exists but no explain yet
  if (pageExtraction && !pageExplain) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <span className="text-3xl mb-3">📝</span>
        <h3 className="text-sm font-medium text-gray-300 mb-1">Page Extracted</h3>
        <p className="text-xs text-gray-500 mb-4 max-w-[180px]">
          Generate a whiteboard-ready micro-lesson for this page.
        </p>
        <button
          onClick={handleGenerateExplain}
          disabled={isGenerating}
          className="px-4 py-2 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded-lg disabled:opacity-50"
        >
          {isGenerating ? 'Generating...' : 'Explain This Page'}
        </button>
      </div>
    );
  }

  // Fall back to card-based explain
  if (!selected) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <span className="text-3xl mb-3">📝</span>
        <h3 className="text-sm font-medium text-gray-300 mb-1">Explain Mode</h3>
        <p className="text-xs text-gray-500 mb-4 max-w-[180px]">
          Extract a page first, then generate whiteboard-ready micro-lessons.
        </p>
        <button
          onClick={onSelectCard}
          className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg"
        >
          Or select a card
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4">
      <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
        <h3 className="text-xs font-semibold text-teal-400 mb-2">{selected.title}</h3>
        <p className="text-xs text-gray-300 mb-3">{selected.claim}</p>

        <div className="space-y-2">
          <h4 className="text-[10px] font-semibold text-gray-400 uppercase">Whiteboard Prompt</h4>
          <div className="bg-gray-900 rounded p-2 text-xs text-gray-200 font-mono">
            Draw a diagram showing: {selected.title}
            <br />
            <br />
            Key points to include:
            <br />
            • {selected.whyItMatters}
            <br />
            • Show relationships to related concepts
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button className="flex-1 px-2 py-1.5 text-[10px] bg-teal-600 hover:bg-teal-500 text-white rounded">
            Copy Prompt
          </button>
          <button className="flex-1 px-2 py-1.5 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded">
            Generate Diagram
          </button>
        </div>
      </div>

      <div className="text-[10px] text-gray-500 italic">
        Pro tip: Use the prompt with Ninja Nerd-style whiteboard explanations
      </div>
    </div>
  );
};

// Compare Tab - Differential tables
const CompareTab: React.FC<{
  selectedCardId?: string;
  insights: RankedInsight[];
  onSelectCard: () => void;
}> = ({ selectedCardId, insights, onSelectCard }) => {
  const selected = insights.find(i => i.id === selectedCardId);

  // Find confusable pairs
  const confusables = useMemo(() => {
    return insights.filter(i =>
      i.type === 'EXAM_TRAP' ||
      (i.trap && i.trap.toLowerCase().includes('look-alike')) ||
      (i.claim || '').toLowerCase().includes(' vs ')
    ).slice(0, 3);
  }, [insights]);

  if (!selected && confusables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <span className="text-3xl mb-3">⚖️</span>
        <h3 className="text-sm font-medium text-gray-300 mb-1">Compare Mode</h3>
        <p className="text-xs text-gray-500 mb-4 max-w-[180px]">
          Shows differential tables: A vs B vs C with discriminating features.
        </p>
        <button
          onClick={onSelectCard}
          className="px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded-lg"
        >
          Select a card to compare
        </button>
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

          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="p-1.5 border-b border-gray-700">Feature</th>
                <th className="p-1.5 border-b border-gray-700">{selected.title}</th>
                <th className="p-1.5 border-b border-gray-700 text-gray-500">Similar</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              <tr>
                <td className="p-1.5 border-b border-gray-700/50 text-gray-400">Definition</td>
                <td className="p-1.5 border-b border-gray-700/50">{selected.claim?.slice(0, 40) || '-'}</td>
                <td className="p-1.5 border-b border-gray-700/50 text-gray-500">-</td>
              </tr>
              <tr>
                <td className="p-1.5 border-b border-gray-700/50 text-gray-400">Key Finding</td>
                <td className="p-1.5 border-b border-gray-700/50">-</td>
                <td className="p-1.5 border-b border-gray-700/50 text-gray-500">-</td>
              </tr>
              <tr>
                <td className="p-1.5 text-gray-400">Differentiator</td>
                <td className="p-1.5">{selected.whyItMatters?.slice(0, 40) || '-'}</td>
                <td className="p-1.5 text-gray-500">-</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {confusables.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold text-gray-400 uppercase mb-2">
            Common Confusions on This Page
          </h3>
          <div className="space-y-1.5">
            {confusables.map(c => (
              <div key={c.id} className="bg-amber-900/20 border border-amber-700/40 rounded p-2 text-xs text-amber-200">
                {c.title}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Insights Tab - What matters + What you're missing + Study card generation
const InsightsTab: React.FC<{
  insights: RankedInsight[];
  trapInsights: RankedInsight[];
  selectedCardId?: string;
  onCardClick: (insight: RankedInsight) => void;
  onJumpToPage: (page: number) => void;
  reasoningChain?: ReasoningChain;
  pageInsights?: InsightsResult | null;
  pageReasoning?: ReasoningFlow | null;
  onGenerateStudyCards?: () => Promise<void>;
  generatedStudyCards?: StudyCard[];
  pageIntelligence?: PageIntelligence | null;
}> = ({
  insights,
  trapInsights,
  selectedCardId,
  onCardClick,
  onJumpToPage,
  reasoningChain,
  pageInsights,
  pageReasoning,
  onGenerateStudyCards,
  generatedStudyCards,
  pageIntelligence,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const highYield = insights.filter(i => i.bucket === 'CRITICAL' || i.bucket === 'HIGH_YIELD');
  const traps = trapInsights.slice(0, 5);

  const handleGenerateCards = useCallback(async () => {
    if (!onGenerateStudyCards) return;
    setIsGenerating(true);
    try {
      await onGenerateStudyCards();
    } finally {
      setIsGenerating(false);
    }
  }, [onGenerateStudyCards]);

  // Use page intelligence insights if available, otherwise fall back to other sources
  const piInsights = pageIntelligence?.insights || [];
  const piRelations = pageIntelligence?.relations || [];
  const piClusters = pageIntelligence?.clusters || [];
  const piCards = pageIntelligence?.cards || [];
  const whatMattersItems = pageInsights?.whatMatters || [];
  const whatMissingItems = pageInsights?.whatMissing || [];
  const missingFromReasoning = pageReasoning?.missingNodeSuggestions || reasoningChain?.missing?.map(m => m.detail) || [];

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
                <p className="text-gray-400 line-clamp-3">{insight.body}</p>
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
        ) : whatMattersItems.length > 0 ? (
          <div className="space-y-1.5">
            {whatMattersItems.slice(0, 8).map(item => (
              <div
                key={item.id}
                className="bg-gray-800/50 border border-gray-700 rounded-lg p-2.5 text-xs hover:border-teal-500/40 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-medium text-teal-300">{item.title}</span>
                  <div className="flex gap-1 flex-shrink-0">
                    {item.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="px-1 py-0.5 text-[9px] bg-gray-700 text-gray-400 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="text-gray-400 line-clamp-2 mb-1">{item.summary}</p>
                <p className="text-[10px] text-gray-500 italic">{item.whyItMatters}</p>
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
                  <span className="line-clamp-2">{insight.title}</span>
                  {insight.evidence?.[0]?.page !== undefined && (
                    <span
                      onClick={(e) => { e.stopPropagation(); onJumpToPage(insight.evidence![0].page); }}
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
                  <p className="text-gray-400 text-[10px] line-clamp-2">{card.back}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Generate Study Cards button */}
        {(piInsights.length > 0 || whatMattersItems.length > 0 || highYield.length > 0) && onGenerateStudyCards && (
          <button
            onClick={handleGenerateCards}
            disabled={isGenerating}
            className="mt-3 w-full px-3 py-2 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span>📚</span>
            {isGenerating ? 'Generating...' : 'Generate Study Cards from What Matters'}
          </button>
        )}

        {/* Show generated cards count */}
        {generatedStudyCards && generatedStudyCards.length > 0 && (
          <div className="mt-2 px-2 py-1.5 bg-purple-900/20 border border-purple-700/40 rounded text-xs text-purple-300">
            ✓ {generatedStudyCards.length} study cards generated
          </div>
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
                <span className="line-clamp-2">{trap.title}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* What You May Be Missing - from reasoning flow */}
      <section>
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
          <span>🔍</span> What You May Be Missing
        </h3>
        {whatMissingItems.length > 0 ? (
          <div className="space-y-1.5">
            {whatMissingItems.map(item => (
              <div key={item.id} className="bg-gray-800/50 border border-gray-700 rounded p-2 text-xs">
                <span className="text-amber-400 font-medium">{item.title}:</span>
                <span className="text-gray-400 ml-1">{item.summary}</span>
              </div>
            ))}
          </div>
        ) : missingFromReasoning.length > 0 ? (
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
}> = ({
  relations,
  clusters,
  concepts,
  chains,
  selectedCluster,
  onSelectCluster,
  onRelationClick,
  onJumpToPage,
}) => {
  const hasContent = relations.length > 0 || clusters.length > 0;

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <span className="text-3xl mb-3">🔗</span>
        <h3 className="text-sm font-medium text-gray-300 mb-1">Relations View</h3>
        <p className="text-xs text-gray-500 max-w-[200px]">
          Extract a page to see concept relationships and pattern clusters.
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 overflow-y-auto h-full">
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
                  <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{cluster.summary}</p>
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
                          onJumpToPage(page);
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
