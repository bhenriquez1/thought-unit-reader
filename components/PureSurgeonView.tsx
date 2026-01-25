"use client";

// components/PureSurgeonView.tsx
<<<<<<< HEAD
// PURE SURGEON VIEW MODE - Highlighting + PDRM Workflow + Quiz
// 
// PDRM WORKFLOW (V2):
// - Surgeon View + PDRM are ONE workflow
// - Auto mode: highlight → instant PDRM card; page change → incremental page PDRM
// - Manual mode: highlight → Draft PDRM (empty fields); page change → NO auto-fill
// - Toggle visibly changes behavior on next action
// - PDRM entries shown inline for current page
=======
// PURE SURGEON VIEW MODE - V2 with Enhanced Absorption Panel
// ✅ CLEAN MODE = PDF ONLY (full width, no absorption panel)
// ✅ FULL MODE = PDF + Absorption Panel (high-yield content)
// ✅ Absorption regenerates on EVERY page change (debounced)
// ✅ Auto-highlights high-yield phrases with colored styling
// ✅ Auto-saves high-importance items to NoteLab (deduplicated)
// ✅ Manual highlighting in absorption panel saves to NoteLab
>>>>>>> origin/main

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { 
  useAnnotationStore, 
  type Annotation,
  type PDRMMetadata,
  getPDRMColorForType
} from '@/lib/stores/annotationStore';
import { useQuizStore } from '@/lib/stores/quizStore';
import { useZoomStore } from '@/lib/stores/zoomStore';
import { 
  usePdrmStore, 
  type PDRMEntry,
  type PDRMFields,
  type PDRMType,
  getPdrmTypeColor,
  getPdrmTypeIcon,
  getPdrmTypeLabel,
  determinePrimaryType
} from '@/lib/stores/pdrmStore';
import {
  createAutoHighlightPDRM,
  createManualHighlightPDRM,
  processPageForAutoPDRM,
  cancelPendingExtraction
} from '@/lib/pdrmAIExtractor';
import classifyHighlight, { getPDRMTypeColor as getLegacyColor } from '@/lib/autoPDRM';
import SmartPDFViewer from './SmartPDFViewer';
import {
  generateAbsorptionContent,
  getAutoSaveBullets,
  getBulletHash,
  type AbsorptionBlock,
  type AbsorptionBullet,
  type SpanKind
} from '@/lib/absorptionEngine';

// ============================================================================
// Types
// ============================================================================

interface PureSurgeonViewProps {
  fileUrl: string | null;
  documentId: string;
  userId: string;
  currentPage: number;
  pdfPageCount: number;
  thoughtUnits: Array<{ text: string; id?: string }>;
  currentThoughtUnit: number;
  chapterId?: string;
  headings: string[];
  pageText?: string;  // Current page text for PDRM extraction
  onPageChange: (page: number) => void;
  onPageCount: (count: number) => void;
  onThoughtUnitChange?: (index: number) => void;
  onRecommendedAction?: (action: 'study' | 'next_chapter') => void;
}

<<<<<<< HEAD
type ViewMode = 'full' | 'clean' | 'pdf-only';
type SidebarTab = 'pdrm' | 'highlights' | 'quiz' | 'review';

// ============================================================================
// Component
// ============================================================================
=======
// View modes
type ViewMode = 'clean' | 'full' | 'pdf';

// Track which bullets have been auto-saved (for deduplication)
const autoSavedBullets = new Set<string>();

// Helper to detect front matter pages
function isFrontMatter(pageNumber: number, text: string): boolean {
  if (pageNumber > 10) return false;
  const lowerText = text.toLowerCase();
  const frontMatterKeywords = [
    'copyright', 'isbn', 'publisher', 'all rights reserved',
    'printed in', 'library of congress', 'cataloging-in-publication',
    'first edition', 'second edition', 'table of contents',
    'dedication', 'acknowledgments', 'preface', 'foreword'
  ];
  return frontMatterKeywords.some(kw => lowerText.includes(kw));
}

// Get color for span kind
function getSpanColor(kind: SpanKind): string {
  switch (kind) {
    case 'high-yield': return '#FFD700'; // Gold
    case 'warning': return '#FF6B6B';    // Red
    case 'pattern': return '#A78BFA';    // Purple
    case 'decision': return '#60A5FA';   // Blue
    case 'mnemonic': return '#FB923C';   // Orange
    case 'term': return '#34D399';       // Green
    default: return '#FFD700';
  }
}

// Get border color for importance
function getImportanceBorderColor(importance: 'high' | 'med' | 'low'): string {
  switch (importance) {
    case 'high': return 'border-yellow-500';
    case 'med': return 'border-blue-500';
    case 'low': return 'border-gray-600';
  }
}

// Get background color for importance
function getImportanceBgColor(importance: 'high' | 'med' | 'low'): string {
  switch (importance) {
    case 'high': return 'bg-yellow-900/20';
    case 'med': return 'bg-blue-900/10';
    case 'low': return 'bg-gray-800/30';
  }
}

// Render text with highlighted spans
function renderHighlightedText(text: string, spans: { start: number; end: number; kind: SpanKind }[]): React.ReactNode {
  if (!spans || spans.length === 0) {
    return text;
  }

  const result: React.ReactNode[] = [];
  let lastIndex = 0;

  // Sort spans by start position
  const sortedSpans = [...spans].sort((a, b) => a.start - b.start);

  sortedSpans.forEach((span, idx) => {
    // Add text before this span
    if (span.start > lastIndex) {
      result.push(text.slice(lastIndex, span.start));
    }

    // Add the highlighted span
    const highlightedText = text.slice(span.start, span.end);
    result.push(
      <mark
        key={`span-${idx}`}
        className="px-0.5 rounded font-medium"
        style={{
          backgroundColor: `${getSpanColor(span.kind)}30`,
          color: getSpanColor(span.kind),
          borderBottom: `2px solid ${getSpanColor(span.kind)}`
        }}
      >
        {highlightedText}
      </mark>
    );

    lastIndex = span.end;
  });

  // Add remaining text
  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result;
}
>>>>>>> origin/main

export default function PureSurgeonView({
  fileUrl,
  documentId,
  userId,
  currentPage,
  pdfPageCount,
  thoughtUnits,
  currentThoughtUnit,
  chapterId = 'default',
  headings,
  pageText = '',
  onPageChange,
  onPageCount,
  onThoughtUnitChange,
  onRecommendedAction
}: PureSurgeonViewProps) {
  
  // ---- Stores ----
  const {
    annotations,
    setActiveDocument,
    setActivePage,
    addAnnotation,
    getAnnotationsForPage,
    getHighlightsOnly,
    getMistakes
  } = useAnnotationStore();

  const {
    currentQuiz,
    generateQuiz,
    submitAnswer,
    nextQuestion,
    finishQuiz,
    clearCurrentQuiz,
<<<<<<< HEAD
    isGenerating: isQuizGenerating,
    getBestScore
  } = useQuizStore();

  const { zoom } = useZoomStore();

  const {
    autoMode,
    setAutoMode,
    toggleAutoMode,
    generatingFor,
    getEntriesByPage,
    getEntriesByHighlight,
    getDraftEntries,
    updateEntry,
    deleteEntry,
    completeDraft,
    isPageProcessed
  } = usePdrmStore();

  // ---- Local State ----
  const [viewMode, setViewMode] = useState<ViewMode>('full');
  const [activeTab, setActiveTab] = useState<SidebarTab>('pdrm');
  const [selectedText, setSelectedText] = useState('');
  const [showHighlightMenu, setShowHighlightMenu] = useState(false);
  const [quizAnswer, setQuizAnswer] = useState('');
  const [showQuizResult, setShowQuizResult] = useState(false);
  const [lastQuizScore, setLastQuizScore] = useState<number | null>(null);
  
  // Manual mode: editing draft PDRM
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [draftFields, setDraftFields] = useState<PDRMFields>({
    pattern: '', decisionRule: '', risk: '', mnemonic: ''
  });
  
  // Page PDRM generation status
  const [pagePdrmStatus, setPagePdrmStatus] = useState<'idle' | 'generating' | 'done'>('idle');
  const [pagePdrmCount, setPagePdrmCount] = useState(0);
  
  // Ref for tracking page changes
  const lastProcessedPage = useRef<number>(0);
=======
    isGenerating
  } = useQuizStore();

  // View mode state - persists within Surgeon View
  const [viewMode, setViewMode] = useState<ViewMode>('full');
  
  // Zoom state - independent for Surgeon View
  const [zoom, setZoom] = useState(1.25);
  
  // Absorption panel state
  const [absorptionBlock, setAbsorptionBlock] = useState<AbsorptionBlock | null>(null);
  const [isAbsorptionLoading, setIsAbsorptionLoading] = useState(false);
  const absorptionDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastPageRef = useRef<number>(currentPage);
  
  // Selection states
  const [absorptionSelectedText, setAbsorptionSelectedText] = useState('');
  const [showAbsorptionHighlightMenu, setShowAbsorptionHighlightMenu] = useState(false);
  const [pdfSelectedText, setPdfSelectedText] = useState('');
  const [showPdfHighlightMenu, setShowPdfHighlightMenu] = useState(false);
  
  // Quiz state
  const [showQuizResult, setShowQuizResult] = useState(false);
  const [lastQuizScore, setLastQuizScore] = useState<number | null>(null);
  const [quizAnswer, setQuizAnswer] = useState('');
>>>>>>> origin/main

  // ---- Initialize Stores ----
  useEffect(() => {
    setActiveDocument(documentId, userId);
  }, [documentId, userId, setActiveDocument]);

  useEffect(() => {
    setActivePage(currentPage - 1);
  }, [currentPage, setActivePage]);

<<<<<<< HEAD
  // ---- Page Change: Auto PDRM Generation (incremental) ----
  useEffect(() => {
    // Only process if:
    // 1. Auto mode is ON
    // 2. Page actually changed
    // 3. We have page text
    // 4. File is loaded
    if (!autoMode || !fileUrl || !pageText || pageText.length < 50) {
      return;
    }
    
    if (currentPage === lastProcessedPage.current) {
      return; // Same page, don't re-process
    }
    
    lastProcessedPage.current = currentPage;
    
    // Check if already processed (cached)
    if (isPageProcessed(documentId, currentPage)) {
      const existing = getEntriesByPage(documentId, currentPage);
      setPagePdrmCount(existing.length);
      setPagePdrmStatus('done');
      console.log(`📄 Page ${currentPage} already cached (${existing.length} entries)`);
      return;
    }
    
    // Process page (async, debounced internally)
    setPagePdrmStatus('generating');
    
    processPageForAutoPDRM(
      documentId,
      currentPage,
      pageText,
      (status, count) => {
        if (status === 'complete') {
          setPagePdrmCount(count || 0);
          setPagePdrmStatus('done');
        }
      }
    ).catch(err => {
      console.error('Page PDRM extraction failed:', err);
      setPagePdrmStatus('idle');
    });
    
    // Cleanup: cancel pending if page changes quickly
    return () => {
      cancelPendingExtraction(`page_${documentId}_${currentPage}`);
    };
  }, [autoMode, fileUrl, documentId, currentPage, pageText, isPageProcessed, getEntriesByPage]);

  // ---- Derived Data ----
=======
  // =========================================================================
  // ABSORPTION PANEL REGENERATION ON PAGE CHANGE (Requirement A)
  // =========================================================================
  useEffect(() => {
    // Skip if no file or in clean mode
    if (!fileUrl || viewMode === 'clean' || viewMode === 'pdf') {
      return;
    }

    // Debounce absorption generation (400ms)
    if (absorptionDebounceRef.current) {
      clearTimeout(absorptionDebounceRef.current);
    }

    setIsAbsorptionLoading(true);

    absorptionDebounceRef.current = setTimeout(() => {
      console.log(`📋 Regenerating absorption for page ${currentPage}`);
      
      const block = generateAbsorptionContent(
        documentId,
        currentPage,
        thoughtUnits,
        chapterId,
        headings[0],
        pdfPageCount
      );
      
      setAbsorptionBlock(block);
      setIsAbsorptionLoading(false);
      lastPageRef.current = currentPage;

      // Auto-save high-importance bullets to NoteLab (Requirement B)
      const highYieldBullets = getAutoSaveBullets(block);
      autoSaveHighYieldToNoteLab(highYieldBullets, block);
      
    }, 400); // 400ms debounce

    return () => {
      if (absorptionDebounceRef.current) {
        clearTimeout(absorptionDebounceRef.current);
      }
    };
  }, [currentPage, documentId, chapterId, headings, thoughtUnits, pdfPageCount, fileUrl, viewMode]);

  // Auto-save high-yield bullets to NoteLab (deduplicated)
  const autoSaveHighYieldToNoteLab = useCallback(async (bullets: AbsorptionBullet[], block: AbsorptionBlock) => {
    for (const bullet of bullets) {
      const hash = getBulletHash(documentId, block.page, bullet.text);
      
      // Skip if already saved
      if (autoSavedBullets.has(hash)) {
        continue;
      }

      // Create annotation for NoteLab
      const pdrm: PDRMMetadata = {};
      if (bullet.tags.includes('pattern')) pdrm.pattern = bullet.text;
      if (bullet.tags.includes('decision')) pdrm.decisionRule = bullet.text;
      if (bullet.tags.includes('mnemonic')) pdrm.mnemonic = bullet.text;
      if (bullet.tags.includes('risk')) pdrm.isMistake = true;

      await addAnnotation({
        documentId,
        chapterId: block.chapterId || chapterId,
        pageIndex: block.page - 1,
        thoughtUnitId: bullet.id,
        selectedText: bullet.text,
        anchor: { type: 'textRange', start: 0, end: bullet.text.length },
        pdrm,
        color: bullet.tags.includes('risk') ? '#FF6B6B' : '#FFD700',
        tags: ['absorption_highlight', 'high-yield', 'auto', ...bullet.tags],
        userId
      });

      // Mark as saved
      autoSavedBullets.add(hash);
      console.log(`✅ Auto-saved high-yield bullet to NoteLab: ${bullet.text.slice(0, 50)}...`);
    }
  }, [documentId, chapterId, userId, addAnnotation]);

  // Get annotations
>>>>>>> origin/main
  const pageAnnotations = useMemo(() => {
    return getAnnotationsForPage(currentPage - 1);
  }, [currentPage, getAnnotationsForPage, annotations]);

  const allHighlights = useMemo(() => getHighlightsOnly(), [getHighlightsOnly, annotations]);
  const mistakes = useMemo(() => getMistakes(), [getMistakes, annotations]);
  
  const currentPagePDRM = useMemo(() => {
    return getEntriesByPage(documentId, currentPage);
  }, [documentId, currentPage, getEntriesByPage]);
  
  const draftPDRMs = useMemo(() => {
    return getDraftEntries(documentId);
  }, [documentId, getDraftEntries]);

<<<<<<< HEAD
  // ---- Handlers ----
  
  // Handle text selection
  const handleTextSelect = useCallback((text: string) => {
=======
  const mistakes = useMemo(() => {
    return getMistakes().filter(a => a.documentId === documentId);
  }, [getMistakes, annotations, documentId]);

  // Zoom handlers
  const handleZoomIn = useCallback(() => setZoom(z => Math.min(z + 0.25, 2.5)), []);
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(z - 0.25, 0.6)), []);
  const handleResetZoom = useCallback(() => setZoom(1.25), []);

  // Handle PDF text selection
  const handlePdfTextSelect = useCallback((text: string) => {
>>>>>>> origin/main
    if (!text || text.length < 3) return;
    setPdfSelectedText(text);
    setShowPdfHighlightMenu(true);
  }, []);

  // Handle absorption panel text selection (Requirement C)
  const handleAbsorptionTextSelect = useCallback(() => {
    const selection = window.getSelection()?.toString().trim();
    if (selection && selection.length > 3) {
      setAbsorptionSelectedText(selection);
      setShowAbsorptionHighlightMenu(true);
    }
  }, []);

<<<<<<< HEAD
  // Create highlight - MAIN ENTRY POINT for PDRM creation
  const handleCreateHighlight = useCallback(async () => {
    if (!selectedText) return;

    // Generate highlight ID
    const highlightId = `highlight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Legacy classification for annotation color
    const classification = classifyHighlight(selectedText, {
=======
  // Create highlight with Auto-PDRM classification
  const handleCreateHighlight = useCallback(async (
    text: string,
    source: 'pdf' | 'absorption',
    overridePDRM?: 'P' | 'D' | 'R' | 'M'
  ) => {
    if (!text) return;

    const classification = classifyHighlight(text, {
>>>>>>> origin/main
      headingText: headings[0],
      chapterTitle: chapterId,
      pageIndex: currentPage - 1
    });

<<<<<<< HEAD
    // Create annotation (highlight)
=======
    let pdrm: PDRMMetadata = {};
    let color = '#FFEB3B';

    if (overridePDRM) {
      switch (overridePDRM) {
        case 'P': pdrm.pattern = text; break;
        case 'D': pdrm.decisionRule = text; break;
        case 'M': pdrm.mnemonic = text; break;
        case 'R': pdrm.isMistake = true; break;
      }
      color = getPDRMColorForType(overridePDRM);
    } else {
      pdrm = classification.pdrm;
      color = getPDRMTypeColor(classification.type);
    }

    // Add tags
    const tags = classification.type !== 'general' 
      ? [`auto-${classification.type}`] 
      : [];
    if (source === 'absorption') {
      tags.push('absorption-highlight');
    }

>>>>>>> origin/main
    await addAnnotation({
      documentId,
      chapterId,
      pageIndex: currentPage - 1,
      thoughtUnitId: `tu_${currentThoughtUnit}`,
<<<<<<< HEAD
      selectedText,
      anchor: { type: 'textRange', start: 0, end: selectedText.length },
      pdrm: classification.pdrm,
      color: getLegacyColor(classification.type),
      tags: [`highlight`, `pdrm-${autoMode ? 'auto' : 'manual'}`],
      userId
    });

    // === PDRM CREATION (based on mode) ===
    const evidence = {
      quote: selectedText.length > 100 ? selectedText.substring(0, 97) + '...' : selectedText,
      pageNumber: currentPage,
      documentId,
      highlightId
    };

    if (autoMode) {
      // AUTO MODE: Immediate PDRM extraction and creation
      await createAutoHighlightPDRM(evidence, selectedText);
    } else {
      // MANUAL MODE: Create draft with empty fields
      const draftId = createManualHighlightPDRM(evidence);
      // Open edit panel for the draft
      setEditingDraftId(draftId);
      setDraftFields({ pattern: '', decisionRule: '', risk: '', mnemonic: '' });
      setActiveTab('pdrm');
    }

    setShowHighlightMenu(false);
    setSelectedText('');
    console.log(`✅ Highlight created (${autoMode ? 'Auto' : 'Manual'} mode)`);
  }, [selectedText, documentId, chapterId, currentPage, currentThoughtUnit, headings, userId, autoMode, addAnnotation]);

  // Save draft PDRM (Manual mode)
  const handleSaveDraft = useCallback(() => {
    if (!editingDraftId) return;
    
    const primaryType = determinePrimaryType(draftFields);
    completeDraft(editingDraftId, draftFields, primaryType as PDRMType);
    
    setEditingDraftId(null);
    setDraftFields({ pattern: '', decisionRule: '', risk: '', mnemonic: '' });
    console.log(`✅ Draft PDRM completed as: ${primaryType}`);
  }, [editingDraftId, draftFields, completeDraft]);

  // Cancel draft editing
  const handleCancelDraft = useCallback(() => {
    setEditingDraftId(null);
    setDraftFields({ pattern: '', decisionRule: '', risk: '', mnemonic: '' });
  }, []);

  // Jump to highlight (from PDRM entry)
  const handleJumpToHighlight = useCallback((entry: PDRMEntry) => {
    if (entry.evidence.pageNumber !== currentPage) {
      onPageChange(entry.evidence.pageNumber);
    }
    // TODO: Flash/outline the highlight
  }, [currentPage, onPageChange]);
=======
      selectedText: text,
      anchor: { type: 'textRange', start: 0, end: text.length },
      pdrm,
      color,
      tags,
      userId
    });

    // Clear selection state
    if (source === 'pdf') {
      setShowPdfHighlightMenu(false);
      setPdfSelectedText('');
    } else {
      setShowAbsorptionHighlightMenu(false);
      setAbsorptionSelectedText('');
    }

    console.log(`✅ Highlight created from ${source}: ${overridePDRM || classification.type}`);
  }, [documentId, chapterId, currentPage, currentThoughtUnit, headings, userId, addAnnotation]);
>>>>>>> origin/main

  // Quiz handlers
  const handleStartQuiz = useCallback(async () => {
    await generateQuiz(documentId, chapterId, allHighlights, headings);
  }, [documentId, chapterId, allHighlights, headings, generateQuiz]);

  const handleFinishQuiz = useCallback(async () => {
    const attempt = await finishQuiz();
    if (attempt) {
      setLastQuizScore(attempt.score);
      setShowQuizResult(true);
      if (attempt.score < 60 && mistakes.length > 0) {
        onRecommendedAction?.('study');
      } else if (attempt.score >= 80) {
        onRecommendedAction?.('next_chapter');
      }
    }
  }, [finishQuiz, mistakes.length, onRecommendedAction]);

<<<<<<< HEAD
  // ---- Empty State ----
=======
  // Group bullets by tag for display
  const groupedBullets = useMemo(() => {
    if (!absorptionBlock) return { patterns: [], decisions: [], risks: [], mnemonics: [], general: [] };
    
    const groups = {
      patterns: [] as AbsorptionBullet[],
      decisions: [] as AbsorptionBullet[],
      risks: [] as AbsorptionBullet[],
      mnemonics: [] as AbsorptionBullet[],
      general: [] as AbsorptionBullet[]
    };

    for (const bullet of absorptionBlock.bullets) {
      if (bullet.tags.includes('pattern')) groups.patterns.push(bullet);
      else if (bullet.tags.includes('decision')) groups.decisions.push(bullet);
      else if (bullet.tags.includes('risk')) groups.risks.push(bullet);
      else if (bullet.tags.includes('mnemonic')) groups.mnemonics.push(bullet);
      else groups.general.push(bullet);
    }

    return groups;
  }, [absorptionBlock]);

  // No file uploaded
>>>>>>> origin/main
  if (!fileUrl) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-white" data-testid="surgeon-view-empty">
        <div className="text-center">
          <div className="text-6xl mb-4">🔬</div>
          <h2 className="text-2xl font-bold mb-2">Surgeon View</h2>
          <p className="text-gray-400 mb-4">Upload a PDF to start highlighting and learning</p>
          <div className="text-sm text-gray-500 space-y-1">
<<<<<<< HEAD
            <p>• Highlight text to create PDRM entries</p>
            <p>• Auto mode: instant Pattern/Decision/Risk/Mnemonic extraction</p>
            <p>• Manual mode: draft entries for you to complete</p>
=======
            <p>• Clean Mode: PDF only (full width)</p>
            <p>• Full Mode: PDF + High-Yield Absorption Panel</p>
            <p>• Auto-PDRM classification (Pattern/Decision/Risk/Mnemonic)</p>
>>>>>>> origin/main
          </div>
        </div>
      </div>
    );
  }

<<<<<<< HEAD
  // ---- Layout Config ----
  const getLayoutClasses = () => {
    switch (viewMode) {
      case 'clean':
        return { showPdf: false, showThoughts: true, showSidebar: true };
      case 'pdf-only':
        return { showPdf: true, showThoughts: false, showSidebar: false };
      case 'full':
      default:
        return { showPdf: true, showThoughts: true, showSidebar: true };
    }
  };

  const layout = getLayoutClasses();
=======
  // Determine layout based on view mode
  const showAbsorptionPanel = viewMode === 'full';
>>>>>>> origin/main

  // ---- Render ----
  return (
    <div className="h-full flex flex-col bg-gray-900" data-testid="pure-surgeon-view" data-view-mode={viewMode}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-4">
          {/* Page info */}
          <span className="text-sm text-gray-400">Page {currentPage} / {pdfPageCount}</span>
          
          {/* View Mode Toggle */}
          <div className="flex items-center bg-gray-700 rounded-lg p-0.5" data-testid="view-mode-toggle">
            <button
              onClick={() => setViewMode('clean')}
<<<<<<< HEAD
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                viewMode === 'clean' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'
=======
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                viewMode === 'clean' || viewMode === 'pdf'
                  ? 'bg-purple-600 text-white shadow' 
                  : 'text-gray-400 hover:text-white'
>>>>>>> origin/main
              }`}
              data-testid="clean-mode-btn"
              title="PDF only - full width"
            >
              🧹 Clean
            </button>
            <button
              onClick={() => setViewMode('full')}
<<<<<<< HEAD
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                viewMode === 'full' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'
=======
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                viewMode === 'full' 
                  ? 'bg-purple-600 text-white shadow' 
                  : 'text-gray-400 hover:text-white'
>>>>>>> origin/main
              }`}
              data-testid="full-mode-btn"
              title="PDF + Absorption Panel"
            >
              📖 Full
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-gray-700 rounded-lg p-0.5">
            <button
<<<<<<< HEAD
              onClick={() => setViewMode('pdf-only')}
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                viewMode === 'pdf-only' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
              data-testid="pdf-only-btn"
=======
              onClick={handleZoomOut}
              className="px-2 py-1 rounded text-xs hover:bg-gray-600 transition-colors"
              data-testid="zoom-out-btn"
              title="Zoom out"
>>>>>>> origin/main
            >
              −
            </button>
            <button
              onClick={handleResetZoom}
              className="px-2 py-1 rounded text-xs hover:bg-gray-600 min-w-[50px] transition-colors"
              data-testid="zoom-reset-btn"
              title="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={handleZoomIn}
              className="px-2 py-1 rounded text-xs hover:bg-gray-600 transition-colors"
              data-testid="zoom-in-btn"
              title="Zoom in"
            >
              +
            </button>
          </div>

          {/* AUTO/MANUAL TOGGLE - Key behavior changer */}
          <div className="flex items-center gap-2 bg-gray-700 rounded-lg px-3 py-1" data-testid="pdrm-mode-toggle">
            <span className="text-xs text-gray-400">PDRM:</span>
            <button
              onClick={toggleAutoMode}
              className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                autoMode 
                  ? 'bg-green-600 text-white hover:bg-green-500' 
                  : 'bg-yellow-600 text-black hover:bg-yellow-500'
              }`}
              data-testid="pdrm-auto-toggle"
              title={autoMode 
                ? 'Auto: Highlights create PDRM instantly. Page change extracts key facts.' 
                : 'Manual: Highlights create Draft PDRMs. You fill in the fields.'
              }
            >
              {autoMode ? '⚡ AUTO' : '✋ MANUAL'}
            </button>
          </div>
          
          {/* Generation Indicator */}
          {(generatingFor || pagePdrmStatus === 'generating') && (
            <div className="flex items-center gap-2 text-xs text-blue-400 animate-pulse">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
              Generating PDRM...
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3 text-xs text-gray-500">
<<<<<<< HEAD
          <span>{currentPagePDRM.length} PDRM on page</span>
          <span>•</span>
          <span>{pageAnnotations.length} highlights</span>
          {draftPDRMs.length > 0 && (
            <>
              <span>•</span>
              <span className="text-yellow-500">{draftPDRMs.length} drafts</span>
            </>
=======
          <span>{pageAnnotations.length} highlights on page</span>
          <span>•</span>
          <span>{allHighlights.length} total</span>
          {allHighlights.length >= 3 && (
            <button
              onClick={handleStartQuiz}
              disabled={isGenerating}
              className="px-2 py-1 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 rounded text-white font-medium"
              data-testid="quick-quiz-btn"
            >
              {isGenerating ? '...' : '📝 Quiz'}
            </button>
>>>>>>> origin/main
          )}
        </div>
      </div>

      {/* Highlight Menu Popup */}
      {showHighlightMenu && selectedText && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-50 bg-gray-800 rounded-lg shadow-xl border border-gray-700 p-3" data-testid="highlight-menu">
          <p className="text-xs text-gray-400 mb-2 max-w-xs truncate">
            "{selectedText.substring(0, 60)}..."
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleCreateHighlight}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                autoMode 
                  ? 'bg-green-600 hover:bg-green-500 text-white' 
                  : 'bg-yellow-600 hover:bg-yellow-500 text-black'
              }`}
            >
              {autoMode ? '⚡ Create PDRM' : '📝 Create Draft'}
            </button>
            <button
              onClick={() => {
                setShowHighlightMenu(false);
                setSelectedText('');
              }}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* PDF Panel - Always visible, full width in Clean/PDF mode */}
        <div className={`${showAbsorptionPanel ? 'w-1/2' : 'flex-1'} overflow-auto bg-gray-950`}>
          <SmartPDFViewer
            fileUrl={fileUrl}
            currentPage={currentPage}
            scale={zoom}
            onPageChange={onPageChange}
            onPageCount={onPageCount}
            onTextSelect={handlePdfTextSelect}
          />
        </div>

<<<<<<< HEAD
        {/* Thought Units Panel */}
        {layout.showThoughts && (
          <div className={`${layout.showPdf ? 'w-1/2' : 'flex-1'} ${layout.showSidebar ? 'flex' : ''} overflow-hidden`}>
            {/* Thought Units */}
            <div className={`${layout.showSidebar ? 'flex-1' : 'w-full'} overflow-auto p-4 bg-gray-900`}>
              <div className="space-y-4">
                {thoughtUnits.length > 0 ? (
                  thoughtUnits.map((unit, idx) => {
                    const isCurrent = idx === currentThoughtUnit - 1;
                    const unitHighlights = pageAnnotations.filter(a => 
                      a.thoughtUnitId === `tu_${idx + 1}` || a.thoughtUnitId === unit.id
                    );
                    
                    return (
                      <div
                        key={unit.id || idx}
                        onClick={() => onThoughtUnitChange?.(idx + 1)}
                        className={`p-4 rounded-lg cursor-pointer transition-all border-l-4 ${
                          isCurrent
                            ? 'bg-purple-900/30 border-purple-500'
                            : 'bg-gray-800 border-gray-700 hover:bg-gray-750'
                        }`}
                        data-testid={`thought-unit-${idx}`}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                            isCurrent ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400'
                          }`}>
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm leading-relaxed ${isCurrent ? 'text-white' : 'text-gray-300'}`}>
                              {unit.text}
                            </p>
                            {unitHighlights.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {unitHighlights.map(ann => (
                                  <span
                                    key={ann.id}
                                    className="text-xs px-1.5 py-0.5 rounded"
                                    style={{ backgroundColor: ann.color + '40', color: ann.color }}
                                  >
                                    ✓
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <div className="text-4xl mb-4">📝</div>
                    <p>No thought units extracted yet</p>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar - PDRM/Highlights/Quiz/Review */}
            {layout.showSidebar && (
              <div className="w-96 border-l border-gray-700 flex flex-col bg-gray-850">
                {/* Tabs */}
                <div className="flex border-b border-gray-700">
                  {(['pdrm', 'highlights', 'quiz', 'review'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
                        activeTab === tab
                          ? 'text-purple-400 border-b-2 border-purple-400 bg-gray-800'
                          : 'text-gray-400 hover:text-white'
                      }`}
                      data-testid={`tab-${tab}`}
                    >
                      {tab === 'pdrm' && `📊 PDRM (${currentPagePDRM.length})`}
                      {tab === 'highlights' && `✨ (${pageAnnotations.length})`}
                      {tab === 'quiz' && '📝 Quiz'}
                      {tab === 'review' && `⚠️ (${mistakes.length})`}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-auto p-3">
                  {/* PDRM Tab - Primary workflow */}
                  {activeTab === 'pdrm' && (
                    <div className="space-y-3">
                      {/* Draft Editor (Manual Mode) */}
                      {editingDraftId && (
                        <div className="p-3 bg-yellow-900/30 border border-yellow-600/50 rounded-lg" data-testid="draft-editor">
                          <h4 className="text-sm font-semibold text-yellow-400 mb-2">
                            ✏️ Complete Draft PDRM
                          </h4>
                          
                          <div className="space-y-2">
                            <div>
                              <label className="text-xs text-gray-400">Pattern (recurring concept)</label>
                              <input
                                type="text"
                                value={draftFields.pattern}
                                onChange={(e) => setDraftFields(f => ({ ...f, pattern: e.target.value }))}
                                className="w-full mt-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white"
                                placeholder="What category/concept is this?"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400">Decision Rule (if-then)</label>
                              <input
                                type="text"
                                value={draftFields.decisionRule}
                                onChange={(e) => setDraftFields(f => ({ ...f, decisionRule: e.target.value }))}
                                className="w-full mt-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white"
                                placeholder="What rule or criteria applies?"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400">Risk/Trap (what to avoid)</label>
                              <input
                                type="text"
                                value={draftFields.risk}
                                onChange={(e) => setDraftFields(f => ({ ...f, risk: e.target.value }))}
                                className="w-full mt-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white"
                                placeholder="Common mistake or trap?"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400">Mnemonic (memory anchor)</label>
                              <input
                                type="text"
                                value={draftFields.mnemonic}
                                onChange={(e) => setDraftFields(f => ({ ...f, mnemonic: e.target.value }))}
                                className="w-full mt-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white"
                                placeholder="2-5 word memory hook"
                              />
                            </div>
                          </div>
                          
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={handleSaveDraft}
                              className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded text-sm font-medium"
                            >
                              ✓ Save PDRM
                            </button>
                            <button
                              onClick={handleCancelDraft}
                              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {/* Current Page PDRM Entries */}
                      {currentPagePDRM.length === 0 && !editingDraftId ? (
                        <div className="text-center py-6 text-gray-500 text-sm">
                          <p>No PDRM entries on this page</p>
                          <p className="mt-1 text-xs">
                            {autoMode 
                              ? 'Highlight text to auto-extract PDRM' 
                              : 'Highlight text to create draft PDRM'
                            }
                          </p>
                        </div>
                      ) : (
                        currentPagePDRM.map(entry => (
                          <div
                            key={entry.id}
                            className={`p-3 rounded-lg border transition-all ${
                              entry.status === 'draft'
                                ? 'bg-yellow-900/20 border-yellow-600/50'
                                : 'bg-gray-800 border-gray-700'
                            }`}
                            style={{ borderLeftWidth: '3px', borderLeftColor: getPdrmTypeColor(entry.primaryType) }}
                          >
                            {/* Header */}
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span>{getPdrmTypeIcon(entry.primaryType)}</span>
                                <span 
                                  className="text-xs font-medium px-1.5 py-0.5 rounded"
                                  style={{ 
                                    backgroundColor: getPdrmTypeColor(entry.primaryType) + '30', 
                                    color: getPdrmTypeColor(entry.primaryType) 
                                  }}
                                >
                                  {getPdrmTypeLabel(entry.primaryType)}
                                </span>
                                {entry.status === 'draft' && (
                                  <span className="text-xs text-yellow-500">DRAFT</span>
                                )}
                                {entry.sourceType === 'page' && (
                                  <span className="text-xs text-blue-400">page-gen</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                {entry.status === 'draft' && (
                                  <button
                                    onClick={() => {
                                      setEditingDraftId(entry.id);
                                      setDraftFields(entry.fields);
                                    }}
                                    className="p-1 text-yellow-500 hover:text-yellow-400"
                                    title="Edit draft"
                                  >
                                    ✏️
                                  </button>
                                )}
                                <button
                                  onClick={() => handleJumpToHighlight(entry)}
                                  className="p-1 text-gray-500 hover:text-white"
                                  title="Jump to source"
                                >
                                  ↗
                                </button>
                                <button
                                  onClick={() => deleteEntry(entry.id)}
                                  className="p-1 text-gray-500 hover:text-red-400"
                                  title="Delete"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                            
                            {/* PDRM Fields (structured, not summary) */}
                            <div className="space-y-1.5 text-xs">
                              {entry.fields.pattern && (
                                <div className="flex gap-2">
                                  <span className="text-purple-400 font-medium shrink-0">P:</span>
                                  <span className="text-gray-300">{entry.fields.pattern}</span>
                                </div>
                              )}
                              {entry.fields.decisionRule && (
                                <div className="flex gap-2">
                                  <span className="text-blue-400 font-medium shrink-0">D:</span>
                                  <span className="text-gray-300">{entry.fields.decisionRule}</span>
                                </div>
                              )}
                              {entry.fields.risk && (
                                <div className="flex gap-2">
                                  <span className="text-red-400 font-medium shrink-0">R:</span>
                                  <span className="text-gray-300">{entry.fields.risk}</span>
                                </div>
                              )}
                              {entry.fields.mnemonic && (
                                <div className="flex gap-2">
                                  <span className="text-yellow-400 font-medium shrink-0">M:</span>
                                  <span className="text-gray-300 font-medium">{entry.fields.mnemonic}</span>
                                </div>
                              )}
                            </div>
                            
                            {/* Evidence */}
                            <div className="mt-2 text-xs text-gray-500 italic truncate">
                              "{entry.evidence.quote}"
                            </div>
                          </div>
                        ))
                      )}
                      
                      {/* Page PDRM Generation Status */}
                      {pagePdrmStatus === 'generating' && (
                        <div className="text-center py-3 text-blue-400 text-xs animate-pulse">
                          Extracting key facts from page {currentPage}...
                        </div>
                      )}
                    </div>
                  )}

                  {/* Highlights Tab */}
                  {activeTab === 'highlights' && (
                    <div className="space-y-2">
                      {pageAnnotations.length === 0 ? (
                        <div className="text-center py-6 text-gray-500 text-sm">
                          <p>No highlights on this page</p>
                        </div>
                      ) : (
                        pageAnnotations.map(ann => (
                          <div
                            key={ann.id}
                            className="p-2 bg-gray-800 rounded border-l-2"
                            style={{ borderLeftColor: ann.color }}
                          >
                            <p className="text-xs text-gray-300 line-clamp-2">{ann.selectedText}</p>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Quiz Tab */}
                  {activeTab === 'quiz' && (
                    <div className="space-y-3">
                      {!currentQuiz ? (
                        <div className="text-center py-6">
                          <button
                            onClick={handleStartQuiz}
                            disabled={allHighlights.length < 3 || isQuizGenerating}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium"
                          >
                            {isQuizGenerating ? 'Generating...' : `Start Quiz (${allHighlights.length} highlights)`}
                          </button>
                          {allHighlights.length < 3 && (
                            <p className="text-xs text-gray-500 mt-2">Need at least 3 highlights</p>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="text-xs text-gray-400">
                            Question {currentQuiz.currentIndex + 1} of {currentQuiz.questions.length}
                          </div>
                          <div className="p-3 bg-gray-800 rounded-lg">
                            <p className="text-sm text-white">
                              {currentQuiz.questions[currentQuiz.currentIndex]?.question}
                            </p>
                          </div>
                          <input
                            type="text"
                            value={quizAnswer}
                            onChange={(e) => setQuizAnswer(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white"
                            placeholder="Your answer..."
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                submitAnswer(currentQuiz.questions[currentQuiz.currentIndex].id, quizAnswer);
                                setQuizAnswer('');
                                if (currentQuiz.currentIndex < currentQuiz.questions.length - 1) {
                                  nextQuestion();
                                }
                              }}
                              className="flex-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded text-sm"
                            >
                              Submit
                            </button>
                            {currentQuiz.currentIndex === currentQuiz.questions.length - 1 && (
                              <button
                                onClick={handleFinishQuiz}
                                className="px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded text-sm"
                              >
                                Finish
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Review Tab */}
                  {activeTab === 'review' && (
                    <div className="space-y-2">
                      {mistakes.length === 0 ? (
                        <div className="text-center py-6 text-gray-500 text-sm">
                          <p>No items to review</p>
                        </div>
                      ) : (
                        mistakes.map(m => (
                          <div key={m.id} className="p-2 bg-red-900/30 rounded border-l-2 border-red-500">
                            <p className="text-xs text-gray-300 line-clamp-2">{m.selectedText}</p>
                          </div>
                        ))
                      )}
=======
        {/* Absorption Panel - Only in Full mode */}
        {showAbsorptionPanel && (
          <div 
            className="w-1/2 overflow-auto border-l border-gray-700 bg-gray-900 p-4"
            onMouseUp={handleAbsorptionTextSelect}
            data-testid="absorption-panel"
          >
            {isAbsorptionLoading ? (
              <div className="h-full flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <div className="text-4xl mb-3 animate-pulse">📋</div>
                  <p className="text-sm">Generating high-yield content...</p>
                  <p className="text-xs mt-1 opacity-60">Page {currentPage}</p>
                </div>
              </div>
            ) : absorptionBlock && absorptionBlock.bullets.length > 0 ? (
              <div className="space-y-6">
                {/* Header */}
                <div className="pb-3 border-b border-gray-700">
                  <h2 className="text-lg font-semibold text-white">
                    {absorptionBlock.chapterTitle || headings[0] || 'High-Yield Notes'}
                  </h2>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-xs text-gray-500">Page {currentPage}</p>
                    <span className="text-xs text-yellow-500">
                      {absorptionBlock.bullets.filter(b => b.importance === 'high').length} high-yield items
                    </span>
                  </div>
                </div>

                {/* Key Points / Patterns */}
                {(groupedBullets.patterns.length > 0 || groupedBullets.general.length > 0) && (
                  <div>
                    <h3 className="text-sm font-semibold text-purple-400 mb-2 flex items-center gap-2">
                      <span>🎯</span> Key Points
                    </h3>
                    <ul className="space-y-2">
                      {[...groupedBullets.patterns, ...groupedBullets.general].slice(0, 8).map((bullet) => (
                        <li 
                          key={bullet.id}
                          className={`text-sm text-gray-300 pl-4 border-l-2 ${getImportanceBorderColor(bullet.importance)} ${getImportanceBgColor(bullet.importance)} py-2 px-2 rounded-r cursor-text select-text transition-all hover:bg-gray-800/70`}
                          data-importance={bullet.importance}
                        >
                          {renderHighlightedText(bullet.text, bullet.spans)}
                          {bullet.importance === 'high' && (
                            <span className="ml-2 text-xs text-yellow-500">★</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Decision Rules */}
                {groupedBullets.decisions.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-blue-400 mb-2 flex items-center gap-2">
                      <span>⚖️</span> Decision Rules
                    </h3>
                    <ul className="space-y-2">
                      {groupedBullets.decisions.map((bullet) => (
                        <li 
                          key={bullet.id}
                          className={`text-sm text-gray-300 pl-4 border-l-2 ${getImportanceBorderColor(bullet.importance)} ${getImportanceBgColor(bullet.importance)} py-2 px-2 rounded-r cursor-text select-text transition-all hover:bg-gray-800/70`}
                          data-importance={bullet.importance}
                        >
                          {renderHighlightedText(bullet.text, bullet.spans)}
                          {bullet.importance === 'high' && (
                            <span className="ml-2 text-xs text-yellow-500">★</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Risks / Warnings */}
                {groupedBullets.risks.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
                      <span>⚠️</span> Risks / Common Mistakes
                    </h3>
                    <ul className="space-y-2">
                      {groupedBullets.risks.map((bullet) => (
                        <li 
                          key={bullet.id}
                          className={`text-sm text-gray-300 pl-4 border-l-2 border-red-500 bg-red-900/20 py-2 px-2 rounded-r cursor-text select-text transition-all hover:bg-red-900/30`}
                          data-importance={bullet.importance}
                        >
                          {renderHighlightedText(bullet.text, bullet.spans)}
                          {bullet.importance === 'high' && (
                            <span className="ml-2 text-xs text-yellow-500">★</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Mnemonics */}
                {groupedBullets.mnemonics.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-orange-400 mb-2 flex items-center gap-2">
                      <span>🧠</span> Mnemonics
                    </h3>
                    <ul className="space-y-2">
                      {groupedBullets.mnemonics.map((bullet) => (
                        <li 
                          key={bullet.id}
                          className={`text-sm text-gray-300 pl-4 border-l-2 border-orange-500 bg-orange-900/20 py-2 px-2 rounded-r cursor-text select-text transition-all hover:bg-orange-900/30`}
                          data-importance={bullet.importance}
                        >
                          {renderHighlightedText(bullet.text, bullet.spans)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Your Highlights on this page */}
                {pageAnnotations.length > 0 && (
                  <div className="pt-4 border-t border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-400 mb-2">
                      ✨ Your Highlights ({pageAnnotations.length})
                    </h3>
                    <div className="space-y-2">
                      {pageAnnotations.slice(0, 5).map(ann => {
                        const label = getPDRMTypeLabel(
                          ann.pdrm?.pattern ? 'pattern' :
                          ann.pdrm?.decisionRule ? 'decision' :
                          ann.pdrm?.mnemonic ? 'mnemonic' :
                          ann.pdrm?.isMistake ? 'risk' : 'general'
                        );
                        return (
                          <div
                            key={ann.id}
                            className="text-xs p-2 rounded bg-gray-800/50"
                            style={{ borderLeft: `3px solid ${ann.color}` }}
                          >
                            <span style={{ color: ann.color }}>{label.icon}</span>
                            <span className="ml-1 text-gray-300">{ann.selectedText?.slice(0, 100)}...</span>
                          </div>
                        );
                      })}
>>>>>>> origin/main
                    </div>
                  </div>
                )}

                {/* Tip for manual highlighting */}
                <div className="text-xs text-gray-600 pt-2">
                  💡 Select any text above to highlight and save to NoteLab
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <div className="text-4xl mb-3">📝</div>
                  <p className="text-sm">No high-yield content detected</p>
                  <p className="text-xs mt-1 opacity-60">Try navigating to content pages</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
<<<<<<< HEAD
=======

      {/* PDF Highlight Menu Modal */}
      {showPdfHighlightMenu && pdfSelectedText && (
        <HighlightMenu
          selectedText={pdfSelectedText}
          onHighlight={(type) => handleCreateHighlight(pdfSelectedText, 'pdf', type)}
          onCancel={() => { setShowPdfHighlightMenu(false); setPdfSelectedText(''); }}
          source="PDF"
        />
      )}

      {/* Absorption Highlight Menu Modal */}
      {showAbsorptionHighlightMenu && absorptionSelectedText && (
        <HighlightMenu
          selectedText={absorptionSelectedText}
          onHighlight={(type) => handleCreateHighlight(absorptionSelectedText, 'absorption', type)}
          onCancel={() => { setShowAbsorptionHighlightMenu(false); setAbsorptionSelectedText(''); }}
          source="Absorption Panel"
        />
      )}

      {/* Quiz Result Modal */}
      {showQuizResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-gray-800 rounded-xl p-6 shadow-xl border border-gray-700 max-w-sm w-full mx-4 text-center">
            <div className="text-5xl mb-3">
              {lastQuizScore !== null && lastQuizScore >= 80 ? '🎉' : '📚'}
            </div>
            <h3 className="text-3xl font-bold text-white mb-2">{lastQuizScore}%</h3>
            <p className="text-gray-400 mb-4">
              {lastQuizScore !== null && lastQuizScore >= 80 
                ? 'Excellent! Ready for next chapter!' 
                : 'Review weak items to improve'}
            </p>
            <div className="space-y-2">
              {lastQuizScore !== null && lastQuizScore < 80 && (
                <button
                  onClick={() => { setShowQuizResult(false); onRecommendedAction?.('study'); }}
                  className="w-full px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded text-sm font-medium"
                >
                  🧠 Study Weak Items
                </button>
              )}
              <button
                onClick={() => { setShowQuizResult(false); clearCurrentQuiz(); }}
                className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
>>>>>>> origin/main
    </div>
  );
}

// Highlight Menu Component
function HighlightMenu({
  selectedText,
  onHighlight,
  onCancel,
  source
}: {
  selectedText: string;
  onHighlight: (type?: 'P' | 'D' | 'R' | 'M') => void;
  onCancel: () => void;
  source: string;
}) {
  const classification = classifyHighlight(selectedText);
  const label = getPDRMTypeLabel(classification.type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-800 rounded-xl p-4 shadow-xl border border-gray-700 max-w-md w-full mx-4">
        <div className="mb-3">
          <p className="text-xs text-gray-400 mb-1">Selected from {source}:</p>
          <p className="text-white text-sm line-clamp-3">"{selectedText}"</p>
        </div>
        
        {/* Auto-classification preview */}
        <div className="mb-3 p-2 rounded bg-gray-900 border border-gray-700">
          <p className="text-xs text-gray-500">Auto-detected:</p>
          <span style={{ color: getPDRMTypeColor(classification.type) }}>
            {label.icon} {label.full} ({Math.round(classification.confidence * 100)}%)
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <button 
            onClick={() => onHighlight()} 
            className="px-3 py-2 bg-yellow-600 hover:bg-yellow-500 rounded text-sm font-medium"
            data-testid="highlight-auto-btn"
          >
            ✨ Auto
          </button>
          <button 
            onClick={() => onHighlight('P')} 
            className="px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded text-sm font-medium"
          >
            🎯 Pattern
          </button>
          <button 
            onClick={() => onHighlight('D')} 
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium"
          >
            ⚖️ Decision
          </button>
          <button 
            onClick={() => onHighlight('M')} 
            className="px-3 py-2 bg-orange-600 hover:bg-orange-500 rounded text-sm font-medium"
          >
            🧠 Mnemonic
          </button>
          <button 
            onClick={() => onHighlight('R')} 
            className="px-3 py-2 bg-red-600 hover:bg-red-500 rounded text-sm font-medium col-span-2"
          >
            ⚠️ Risk/Weak
          </button>
        </div>
        
        <button 
          onClick={onCancel} 
          className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
