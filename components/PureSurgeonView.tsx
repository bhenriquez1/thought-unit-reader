"use client";

// components/PureSurgeonView.tsx
// PURE SURGEON VIEW MODE - Thought-Unit View + Highlighting + Clean/Full Mode + Quiz
// ❌ No TOC UI inside
// ❌ No NoteLab panel
// ✅ Thought Units live HERE (not in Reader)
// ✅ Clean Mode / Full Mode toggle
// ✅ Auto/Manual PDRM classification toggle
// ✅ Uses global zoom store for shared zoom across views

import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
  isHighlightImportant, 
  generateCompactSummary, 
  extractKeyPoints,
  type PDRMClassification 
} from '@/lib/stores/pdrmStore';
import classifyHighlight, { getPDRMTypeLabel, getPDRMTypeColor } from '@/lib/autoPDRM';
import SmartPDFViewer from './SmartPDFViewer';

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
  onPageChange: (page: number) => void;
  onPageCount: (count: number) => void;
  onThoughtUnitChange?: (index: number) => void;
  onRecommendedAction?: (action: 'study' | 'next_chapter') => void;
}

type ViewMode = 'full' | 'clean' | 'pdf-only';

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
  onPageChange,
  onPageCount,
  onThoughtUnitChange,
  onRecommendedAction
}: PureSurgeonViewProps) {
  // Stores
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
    prevQuestion,
    finishQuiz,
    clearCurrentQuiz,
    isGenerating,
    getBestScore
  } = useQuizStore();

  // Global zoom store
  const { zoom } = useZoomStore();

  // PDRM store for auto-generation
  const { autoMode, setAutoMode, addEntry: addPdrmEntry } = usePdrmStore();

  // View mode state - Clean/Full/PDF-only
  const [viewMode, setViewMode] = useState<ViewMode>('full');
  const [activeTab, setActiveTab] = useState<'highlights' | 'quiz' | 'review'>('highlights');
  const [showHighlightMenu, setShowHighlightMenu] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [quizAnswer, setQuizAnswer] = useState('');
  const [showQuizResult, setShowQuizResult] = useState(false);
  const [lastQuizScore, setLastQuizScore] = useState<number | null>(null);
  const [showManualClassify, setShowManualClassify] = useState(false);
  const [pendingHighlightText, setPendingHighlightText] = useState('');

  // Initialize store
  useEffect(() => {
    setActiveDocument(documentId, userId);
  }, [documentId, userId, setActiveDocument]);

  useEffect(() => {
    setActivePage(currentPage - 1);
  }, [currentPage, setActivePage]);

  // Get annotations
  const pageAnnotations = useMemo(() => {
    return getAnnotationsForPage(currentPage - 1);
  }, [currentPage, getAnnotationsForPage, annotations]);

  const allHighlights = useMemo(() => {
    return getHighlightsOnly().filter(a => a.documentId === documentId);
  }, [getHighlightsOnly, annotations, documentId]);

  const mistakes = useMemo(() => {
    return getMistakes().filter(a => a.documentId === documentId);
  }, [getMistakes, annotations, documentId]);

  // Handle text selection with Auto-PDRM
  const handleTextSelect = useCallback((text: string) => {
    if (!text || text.length < 3) return;
    setSelectedText(text);
    
    // In manual mode, show classification dialog
    if (!autoMode) {
      setPendingHighlightText(text);
      setShowManualClassify(true);
    } else {
      setShowHighlightMenu(true);
    }
  }, [autoMode]);

  // Map PDRM letter to classification
  const mapPdrmType = (type: 'P' | 'D' | 'R' | 'M' | 'general'): PDRMClassification => {
    switch (type) {
      case 'P': return 'pattern';
      case 'D': return 'decision';
      case 'R': return 'risk';
      case 'M': return 'mnemonic';
      default: return 'general';
    }
  };

  // Create highlight with Auto-PDRM classification and PDRM entry generation
  const handleCreateHighlight = useCallback(async (overridePDRM?: 'P' | 'D' | 'R' | 'M') => {
    if (!selectedText) return;

    const classification = classifyHighlight(selectedText, {
      headingText: headings[0],
      chapterTitle: chapterId,
      pageIndex: currentPage - 1
    });

    let pdrm: PDRMMetadata = {};
    let color = '#FFEB3B';
    let pdrmType: 'P' | 'D' | 'R' | 'M' | 'general' = 'general';

    if (overridePDRM) {
      switch (overridePDRM) {
        case 'P': pdrm.pattern = selectedText; break;
        case 'D': pdrm.decisionRule = selectedText; break;
        case 'M': pdrm.mnemonic = selectedText; break;
        case 'R': pdrm.isMistake = true; break;
      }
      color = getPDRMColorForType(overridePDRM);
      pdrmType = overridePDRM;
    } else {
      pdrm = classification.pdrm;
      color = getPDRMTypeColor(classification.type);
      pdrmType = classification.type as any;
    }

    // Create the annotation/highlight
    const highlightId = `highlight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await addAnnotation({
      documentId,
      chapterId,
      pageIndex: currentPage - 1,
      thoughtUnitId: `tu_${currentThoughtUnit}`,
      selectedText,
      anchor: { type: 'textRange', start: 0, end: selectedText.length },
      pdrm,
      color,
      tags: classification.type !== 'general' ? [`auto-${classification.type}`] : [],
      userId
    });

    // Create PDRM entry (important-only filtering)
    const isImportant = isHighlightImportant(selectedText);
    const summary = generateCompactSummary(selectedText, 200);
    const keyPoints = extractKeyPoints(selectedText, 3);

    addPdrmEntry({
      classification: mapPdrmType(pdrmType),
      source: {
        documentId,
        documentName: undefined, // Will be filled from context
        pageNumber: currentPage,
        chapterTitle: chapterId !== 'default' ? chapterId : undefined,
        highlightId,
        quote: selectedText
      },
      summary,
      keyPoints,
      confidence: classification.confidence || 0.5,
      isAutoGenerated: !overridePDRM,
      isImportant
    });

    setShowHighlightMenu(false);
    setSelectedText('');
    setShowManualClassify(false);
    setPendingHighlightText('');
    console.log(`✅ Highlight + PDRM created: ${overridePDRM || classification.type} (important: ${isImportant})`);
  }, [selectedText, documentId, chapterId, currentPage, currentThoughtUnit, headings, userId, addAnnotation, addPdrmEntry]);

  // Quiz handlers
  const handleStartQuiz = useCallback(async () => {
    await generateQuiz(documentId, chapterId, allHighlights, headings);
    setActiveTab('quiz');
  }, [documentId, chapterId, allHighlights, headings, generateQuiz]);

  const handleSubmitAnswer = useCallback((answer: string) => {
    if (!currentQuiz) return;
    const question = currentQuiz.questions[currentQuiz.currentIndex];
    submitAnswer(question.id, answer);
    setQuizAnswer('');
    if (currentQuiz.currentIndex < currentQuiz.questions.length - 1) {
      nextQuestion();
    }
  }, [currentQuiz, submitAnswer, nextQuestion]);

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

  // No file uploaded
  if (!fileUrl) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-white" data-testid="surgeon-view-empty">
        <div className="text-center">
          <div className="text-6xl mb-4">🔬</div>
          <h2 className="text-2xl font-bold mb-2">Surgeon View</h2>
          <p className="text-gray-400 mb-4">Upload a PDF to start highlighting and learning</p>
          <div className="text-sm text-gray-500 space-y-1">
            <p>• Thought-Unit reading mode</p>
            <p>• Auto-PDRM classification (Pattern/Decision/Risk/Mnemonic)</p>
            <p>• Chapter quizzes and review</p>
          </div>
        </div>
      </div>
    );
  }

  // Get layout classes based on view mode
  const getLayoutClasses = () => {
    switch (viewMode) {
      case 'clean':
        // Clean mode: Only thought units, no PDF
        return { showPdf: false, showThoughts: true, showSidebar: false };
      case 'pdf-only':
        // PDF only mode
        return { showPdf: true, showThoughts: false, showSidebar: false };
      case 'full':
      default:
        // Full mode: PDF + Thoughts + Sidebar
        return { showPdf: true, showThoughts: true, showSidebar: true };
    }
  };

  const layout = getLayoutClasses();

  return (
    <div className="h-full flex flex-col bg-gray-900" data-testid="pure-surgeon-view" data-view-mode={viewMode}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">Page {currentPage} / {pdfPageCount}</span>
          
          {/* View Mode Toggle - Clean/Full/PDF */}
          <div className="flex items-center bg-gray-700 rounded-lg p-0.5" data-testid="view-mode-toggle">
            <button
              onClick={() => setViewMode('clean')}
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                viewMode === 'clean' 
                  ? 'bg-purple-600 text-white shadow' 
                  : 'text-gray-400 hover:text-white'
              }`}
              data-testid="clean-mode-btn"
            >
              🧹 Clean
            </button>
            <button
              onClick={() => setViewMode('full')}
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                viewMode === 'full' 
                  ? 'bg-purple-600 text-white shadow' 
                  : 'text-gray-400 hover:text-white'
              }`}
              data-testid="full-mode-btn"
            >
              📖 Full
            </button>
            <button
              onClick={() => setViewMode('pdf-only')}
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                viewMode === 'pdf-only' 
                  ? 'bg-purple-600 text-white shadow' 
                  : 'text-gray-400 hover:text-white'
              }`}
              data-testid="pdf-only-btn"
            >
              📄 PDF
            </button>
          </div>

          {/* Auto/Manual PDRM Toggle */}
          <div className="flex items-center gap-2 bg-gray-700 rounded-lg px-2 py-1" data-testid="pdrm-mode-toggle">
            <span className="text-xs text-gray-400">PDRM:</span>
            <button
              onClick={() => setAutoMode(!autoMode)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                autoMode 
                  ? 'bg-green-600 text-white' 
                  : 'bg-yellow-600 text-white'
              }`}
              data-testid="pdrm-auto-toggle"
              title={autoMode ? 'Auto-classify highlights' : 'Manual classification'}
            >
              {autoMode ? '⚡ Auto' : '✋ Manual'}
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{pageAnnotations.length} highlights on page</span>
          <span>•</span>
          <span>{allHighlights.length} total</span>
        </div>
      </div>

      {/* Manual Classification Dialog */}
      {showManualClassify && pendingHighlightText && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="manual-classify-dialog">
          <div className="bg-gray-800 rounded-lg p-4 max-w-md w-full mx-4 shadow-xl border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-3">Classify Highlight</h3>
            <p className="text-sm text-gray-400 mb-4 line-clamp-3">
              "{pendingHighlightText.length > 100 ? pendingHighlightText.substring(0, 100) + '...' : pendingHighlightText}"
            </p>
            
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                onClick={() => {
                  setSelectedText(pendingHighlightText);
                  handleCreateHighlight('P');
                }}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded text-sm font-medium"
              >
                🔷 Pattern
              </button>
              <button
                onClick={() => {
                  setSelectedText(pendingHighlightText);
                  handleCreateHighlight('D');
                }}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium"
              >
                ⚖️ Decision
              </button>
              <button
                onClick={() => {
                  setSelectedText(pendingHighlightText);
                  handleCreateHighlight('R');
                }}
                className="px-3 py-2 bg-red-600 hover:bg-red-500 rounded text-sm font-medium"
              >
                ⚠️ Risk
              </button>
              <button
                onClick={() => {
                  setSelectedText(pendingHighlightText);
                  handleCreateHighlight('M');
                }}
                className="px-3 py-2 bg-yellow-600 hover:bg-yellow-500 rounded text-sm font-medium"
              >
                💡 Mnemonic
              </button>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSelectedText(pendingHighlightText);
                  handleCreateHighlight();
                }}
                className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                📝 General
              </button>
              <button
                onClick={() => {
                  setShowManualClassify(false);
                  setPendingHighlightText('');
                }}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                Cancel
              </button>
            </div>
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

        {/* Thought Units Panel */}
        {layout.showThoughts && (
          <div className={`${layout.showPdf ? 'w-1/2' : 'flex-1'} ${layout.showSidebar ? 'flex' : ''} overflow-hidden`}>
            {/* Thought Units */}
            <div className={`${layout.showSidebar ? 'flex-1' : 'w-full'} overflow-auto p-4 bg-gray-900`}>
              <div className="space-y-4">
                {thoughtUnits.length > 0 ? (
                  thoughtUnits.map((unit, idx) => {
                    const isCurrent = idx === currentThoughtUnit - 1;
                    const unitAnnotations = pageAnnotations.filter(a => 
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
                            {unitAnnotations.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {unitAnnotations.map(ann => {
                                  const label = ann.pdrm?.pattern ? 'P' :
                                               ann.pdrm?.decisionRule ? 'D' :
                                               ann.pdrm?.mnemonic ? 'M' :
                                               ann.pdrm?.isMistake ? 'R' : '✓';
                                  return (
                                    <span
                                      key={ann.id}
                                      className="text-xs px-1.5 py-0.5 rounded"
                                      style={{ backgroundColor: ann.color + '40', color: ann.color }}
                                    >
                                      {label}
                                    </span>
                                  );
                                })}
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
                    <p className="text-sm mt-2">Processing document...</p>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar Panel - Highlights/Quiz/Review */}
            {layout.showSidebar && (
              <div className="w-80 border-l border-gray-700 flex flex-col bg-gray-850">
                {/* Tabs */}
                <div className="flex border-b border-gray-700">
                  {(['highlights', 'quiz', 'review'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                        activeTab === tab
                          ? 'text-purple-400 border-b-2 border-purple-400 bg-gray-800'
                          : 'text-gray-400 hover:text-white'
                      }`}
                      data-testid={`tab-${tab}`}
                    >
                      {tab === 'highlights' && '✨ Highlights'}
                      {tab === 'quiz' && '📝 Quiz'}
                      {tab === 'review' && `⚠️ Review (${mistakes.length})`}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-auto p-3">
                  {activeTab === 'highlights' && (
                    <div className="space-y-2">
                      {allHighlights.length === 0 ? (
                        <div className="text-center py-6 text-gray-500 text-sm">
                          <p>No highlights yet</p>
                          <p className="mt-1 text-xs">Select text to create highlights</p>
                        </div>
                      ) : (
                        allHighlights.slice().reverse().slice(0, 20).map(ann => {
                          const label = getPDRMTypeLabel(
                            ann.pdrm?.pattern ? 'pattern' :
                            ann.pdrm?.decisionRule ? 'decision' :
                            ann.pdrm?.mnemonic ? 'mnemonic' :
                            ann.pdrm?.isMistake ? 'risk' : 'general'
                          );
                          return (
                            <div
                              key={ann.id}
                              className="p-2 rounded border border-gray-700 hover:border-gray-600 cursor-pointer text-xs"
                              style={{ borderLeftColor: ann.color, borderLeftWidth: 3 }}
                              onClick={() => onPageChange(ann.pageIndex + 1)}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span style={{ color: ann.color }}>{label.icon} {label.short}</span>
                                <span className="text-gray-500">p.{ann.pageIndex + 1}</span>
                              </div>
                              <p className="text-gray-300 line-clamp-2">{ann.selectedText}</p>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {activeTab === 'quiz' && (
                    <div>
                      {!currentQuiz && !showQuizResult ? (
                        <div className="text-center py-6">
                          <div className="text-3xl mb-3">📝</div>
                          <h4 className="font-medium text-white mb-2">Chapter Quiz</h4>
                          <p className="text-gray-400 text-xs mb-4">
                            Test yourself with questions from your highlights
                          </p>
                          {allHighlights.length < 3 ? (
                            <p className="text-yellow-500 text-xs">Need 3+ highlights</p>
                          ) : (
                            <button
                              onClick={handleStartQuiz}
                              disabled={isGenerating}
                              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 rounded text-sm font-medium"
                              data-testid="start-quiz-btn"
                            >
                              {isGenerating ? 'Generating...' : 'Start Quiz'}
                            </button>
                          )}
                        </div>
                      ) : showQuizResult ? (
                        <div className="text-center py-6">
                          <div className="text-4xl mb-2">
                            {lastQuizScore !== null && lastQuizScore >= 80 ? '🎉' : '📚'}
                          </div>
                          <h4 className="text-2xl font-bold text-white mb-2">{lastQuizScore}%</h4>
                          <p className="text-gray-400 text-sm mb-4">
                            {lastQuizScore !== null && lastQuizScore >= 80 
                              ? 'Ready for next chapter!' 
                              : 'Review weak items'}
                          </p>
                          <div className="space-y-2">
                            {lastQuizScore !== null && lastQuizScore < 80 && (
                              <button
                                onClick={() => onRecommendedAction?.('study')}
                                className="w-full px-3 py-2 bg-yellow-600 hover:bg-yellow-500 rounded text-sm font-medium"
                                data-testid="recommend-study-btn"
                              >
                                🧠 Study Weak Items
                              </button>
                            )}
                            <button
                              onClick={() => { setShowQuizResult(false); clearCurrentQuiz(); }}
                              className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                            >
                              Try Again
                            </button>
                          </div>
                        </div>
                      ) : currentQuiz && (
                        <div className="space-y-3">
                          <div className="flex justify-between text-xs text-gray-400">
                            <span>Q{currentQuiz.currentIndex + 1}/{currentQuiz.questions.length}</span>
                            <span>{currentQuiz.answers.filter(a => a.isCorrect).length} correct</span>
                          </div>
                          <div className="h-1 bg-gray-700 rounded">
                            <div 
                              className="h-full bg-purple-500 rounded"
                              style={{ width: `${((currentQuiz.currentIndex + 1) / currentQuiz.questions.length) * 100}%` }}
                            />
                          </div>
                          {(() => {
                            const q = currentQuiz.questions[currentQuiz.currentIndex];
                            const answered = currentQuiz.answers.find(a => a.questionId === q.id);
                            return (
                              <div>
                                <p className="text-white text-sm mb-3">{q.question}</p>
                                {q.options ? (
                                  <div className="space-y-2">
                                    {q.options.map((opt, i) => (
                                      <button
                                        key={i}
                                        onClick={() => handleSubmitAnswer(opt)}
                                        disabled={!!answered}
                                        className={`w-full text-left px-3 py-2 rounded text-sm border ${
                                          answered?.userAnswer === opt
                                            ? answered.isCorrect ? 'border-green-500 bg-green-900/30' : 'border-red-500 bg-red-900/30'
                                            : 'border-gray-700 hover:border-gray-600'
                                        }`}
                                      >
                                        {opt}
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <div>
                                    <textarea
                                      value={quizAnswer}
                                      onChange={(e) => setQuizAnswer(e.target.value)}
                                      placeholder="Your answer..."
                                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                                      rows={2}
                                      disabled={!!answered}
                                    />
                                    {!answered && (
                                      <button
                                        onClick={() => handleSubmitAnswer(quizAnswer)}
                                        className="mt-2 w-full px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded text-sm"
                                      >
                                        Submit
                                      </button>
                                    )}
                                  </div>
                                )}
                                <div className="flex justify-between mt-3">
                                  <button onClick={prevQuestion} disabled={currentQuiz.currentIndex === 0} className="px-3 py-1 bg-gray-700 rounded text-xs disabled:opacity-50">←</button>
                                  {currentQuiz.currentIndex < currentQuiz.questions.length - 1 ? (
                                    <button onClick={nextQuestion} className="px-3 py-1 bg-purple-600 rounded text-xs">→</button>
                                  ) : (
                                    <button onClick={handleFinishQuiz} className="px-3 py-1 bg-green-600 rounded text-xs" data-testid="finish-quiz-btn">Finish</button>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'review' && (
                    <div className="space-y-2">
                      {mistakes.length === 0 ? (
                        <div className="text-center py-6 text-gray-500 text-sm">
                          <div className="text-3xl mb-2">✨</div>
                          <p>No weak items!</p>
                        </div>
                      ) : (
                        <>
                          {mistakes.map(ann => (
                            <div
                              key={ann.id}
                              className="p-2 rounded border border-red-900/50 bg-red-900/10 cursor-pointer text-xs"
                              onClick={() => onPageChange(ann.pageIndex + 1)}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-red-400">⚠️ Needs Review</span>
                                <span className="text-gray-500">p.{ann.pageIndex + 1}</span>
                              </div>
                              <p className="text-gray-300 line-clamp-2">{ann.selectedText}</p>
                            </div>
                          ))}
                          <button
                            onClick={() => onRecommendedAction?.('study')}
                            className="w-full mt-3 px-3 py-2 bg-yellow-600 hover:bg-yellow-500 rounded text-sm font-medium"
                          >
                            🧠 Study All ({mistakes.length})
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Highlight Menu Modal */}
      {showHighlightMenu && selectedText && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-gray-800 rounded-xl p-4 shadow-xl border border-gray-700 max-w-md w-full mx-4">
            <div className="mb-3">
              <p className="text-xs text-gray-400 mb-1">Selected:</p>
              <p className="text-white text-sm line-clamp-3">"{selectedText}"</p>
            </div>
            
            {/* Auto-classification preview */}
            {(() => {
              const c = classifyHighlight(selectedText);
              const l = getPDRMTypeLabel(c.type);
              return (
                <div className="mb-3 p-2 rounded bg-gray-900 border border-gray-700">
                  <p className="text-xs text-gray-500">Auto-detected:</p>
                  <span style={{ color: getPDRMTypeColor(c.type) }}>
                    {l.icon} {l.full} ({Math.round(c.confidence * 100)}%)
                  </span>
                </div>
              );
            })()}

            <div className="grid grid-cols-2 gap-2 mb-3">
              <button onClick={() => handleCreateHighlight()} className="px-3 py-2 bg-yellow-600 hover:bg-yellow-500 rounded text-sm font-medium" data-testid="highlight-auto-btn">✨ Auto</button>
              <button onClick={() => handleCreateHighlight('P')} className="px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded text-sm font-medium">🎯 Pattern</button>
              <button onClick={() => handleCreateHighlight('D')} className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium">⚖️ Decision</button>
              <button onClick={() => handleCreateHighlight('M')} className="px-3 py-2 bg-orange-600 hover:bg-orange-500 rounded text-sm font-medium">🧠 Mnemonic</button>
              <button onClick={() => handleCreateHighlight('R')} className="px-3 py-2 bg-red-600 hover:bg-red-500 rounded text-sm font-medium col-span-2">⚠️ Risk/Weak</button>
            </div>
            
            <button onClick={() => { setShowHighlightMenu(false); setSelectedText(''); }} className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
