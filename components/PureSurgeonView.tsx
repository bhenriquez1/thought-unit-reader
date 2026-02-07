"use client";

// components/PureSurgeonView.tsx
// PURE SURGEON VIEW MODE - Highlighting + PDRM Workflow + Quiz
// 
// PDRM WORKFLOW (V2):
// - Surgeon View + PDRM are ONE workflow
// - Auto mode: highlight → instant PDRM card; page change → incremental page PDRM
// - Manual mode: highlight → Draft PDRM (empty fields); page change → NO auto-fill
// - Toggle visibly changes behavior on next action
// - PDRM entries shown inline for current page

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
import CorePanel from './CorePanel';

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

type ViewMode = 'full' | 'clean' | 'pdf-only';
type SidebarTab = 'highlights' | 'quiz' | 'review';

// ============================================================================
// Component
// ============================================================================

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
  const [activeTab, setActiveTab] = useState<SidebarTab>('highlights');
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

  // ---- Initialize Stores ----
  useEffect(() => {
    setActiveDocument(documentId, userId);
  }, [documentId, userId, setActiveDocument]);

  useEffect(() => {
    setActivePage(currentPage - 1);
  }, [currentPage, setActivePage]);

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

  // ---- Handlers ----
  
  // Handle text selection
  const handleTextSelect = useCallback((text: string) => {
    if (!text || text.length < 3) return;
    setSelectedText(text);
    setShowHighlightMenu(true);
  }, []);

  // Create highlight - MAIN ENTRY POINT for PDRM creation
  const handleCreateHighlight = useCallback(async () => {
    if (!selectedText) return;

    // Generate highlight ID
    const highlightId = `highlight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Legacy classification for annotation color
    const classification = classifyHighlight(selectedText, {
      headingText: headings[0],
      chapterTitle: chapterId,
      pageIndex: currentPage - 1
    });

    // Create annotation (highlight)
    await addAnnotation({
      documentId,
      chapterId,
      pageIndex: currentPage - 1,
      thoughtUnitId: `tu_${currentThoughtUnit}`,
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
      setActiveTab('highlights');
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

  // Quiz handlers
  const handleStartQuiz = useCallback(async () => {
    await generateQuiz(documentId, chapterId, allHighlights, headings);
    setActiveTab('quiz');
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

  // ---- Empty State ----
  if (!fileUrl) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-white" data-testid="surgeon-view-empty">
        <div className="text-center">
          <div className="text-6xl mb-4">🔬</div>
          <h2 className="text-2xl font-bold mb-2">Surgeon View</h2>
          <p className="text-gray-400 mb-4">Upload a PDF to start highlighting and learning</p>
          <div className="text-sm text-gray-500 space-y-1">
            <p>• Highlight text to create PDRM entries</p>
            <p>• Auto mode: instant Pattern/Decision/Risk/Mnemonic extraction</p>
            <p>• Manual mode: draft entries for you to complete</p>
          </div>
        </div>
      </div>
    );
  }

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

  // ---- Render ----
  return (
    <div className="h-full flex flex-col bg-gray-900" data-testid="pure-surgeon-view" data-view-mode={viewMode}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">Page {currentPage} / {pdfPageCount}</span>
          
          {/* View Mode Toggle */}
          <div className="flex items-center bg-gray-700 rounded-lg p-0.5" data-testid="view-mode-toggle">
            <button
              onClick={() => setViewMode('clean')}
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                viewMode === 'clean' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
              data-testid="clean-mode-btn"
            >
              🧹 Clean
            </button>
            <button
              onClick={() => setViewMode('full')}
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                viewMode === 'full' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
              data-testid="full-mode-btn"
            >
              📖 Full
            </button>
            <button
              onClick={() => setViewMode('pdf-only')}
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                viewMode === 'pdf-only' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
              data-testid="pdf-only-btn"
            >
              📄 PDF
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
          <span>{currentPagePDRM.length} PDRM on page</span>
          <span>•</span>
          <span>{pageAnnotations.length} highlights</span>
          {draftPDRMs.length > 0 && (
            <>
              <span>•</span>
              <span className="text-yellow-500">{draftPDRMs.length} drafts</span>
            </>
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
        {/* PDF Panel */}
        {layout.showPdf && (
          <div className={`${layout.showThoughts ? 'w-1/2' : 'flex-1'} overflow-auto border-r border-gray-700`}>
            <SmartPDFViewer
              fileUrl={fileUrl}
              currentPage={currentPage}
              onPageChange={onPageChange}
              onPageCount={onPageCount}
              onTextSelect={handleTextSelect}
            />
          </div>
        )}

        {/* Core Stream Panel (replaces raw thought units) */}
        {layout.showThoughts && (
          <div className={`${layout.showPdf ? 'w-1/2' : 'flex-1'} ${layout.showSidebar ? 'flex' : ''} overflow-hidden`}>
            {/* Core Stream - main content area */}
            <div className={`${layout.showSidebar ? 'flex-1' : 'w-full'} overflow-auto bg-gray-900`}>
              <CorePanel
                documentId={documentId}
                pageNumber={currentPage}
                pageText={pageText || ''}
                chapter={chapterId}
                onItemSelect={(item) => {
                  setSelectedText(item.core_sentence);
                  setShowHighlightMenu(true);
                }}
                onItemHighlight={(charRange) => {
                  console.log('Highlight range:', charRange);
                }}
              />
            </div>

            {/* Sidebar - PDRM/Highlights/Quiz/Review */}
            {layout.showSidebar && (
              <div className="w-96 border-l border-gray-700 flex flex-col bg-gray-850">
                {/* Tabs */}
                <div className="flex border-b border-gray-700">
                  {(['highlights', 'quiz', 'review'] as const).map(tab => (
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
                      {tab === 'highlights' && `Highlights (${pageAnnotations.length})`}
                      {tab === 'quiz' && 'Quiz'}
                      {tab === 'review' && `Review (${mistakes.length})`}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-auto">
                  {/* Highlights Tab */}
                  {activeTab === 'highlights' && (
                    <div className="space-y-2 p-3">
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
                    <div className="space-y-3 p-3">
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
                    <div className="space-y-2 p-3">
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
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
