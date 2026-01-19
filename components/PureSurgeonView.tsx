"use client";

// components/PureSurgeonView.tsx
// PURE SURGEON VIEW MODE - Highlighting tools, chapter review, quizzes ONLY
// ❌ No Reader overlay, No NoteLab, No TOC

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { 
  useAnnotationStore, 
  type Annotation,
  type PDRMMetadata,
  getPDRMColorForType
} from '@/lib/stores/annotationStore';
import { useQuizStore, type QuizQuestion } from '@/lib/stores/quizStore';
import classifyHighlight, { getPDRMTypeLabel, getPDRMTypeColor } from '@/lib/autoPDRM';
import SmartPDFViewer from './SmartPDFViewer';

interface PureSurgeonViewProps {
  fileUrl: string | null;
  documentId: string;
  userId: string;
  currentPage: number;
  pdfPageCount: number;
  thoughtUnits: Array<{ text: string }>;
  currentThoughtUnit: number;
  chapterId?: string;
  headings: string[];
  onPageChange: (page: number) => void;
  onPageCount: (count: number) => void;
  onRecommendedAction?: (action: 'study' | 'next_chapter') => void;
}

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
  onRecommendedAction
}: PureSurgeonViewProps) {
  // Stores
  const {
    annotations,
    viewMode,
    setActiveDocument,
    setActivePage,
    addAnnotation,
    getAnnotationsForPage,
    getHighlightsOnly,
    getMistakes,
    toggleCleanMode
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
    getLastAttempt,
    getBestScore
  } = useQuizStore();

  // Local state
  const [activeTab, setActiveTab] = useState<'highlights' | 'quiz' | 'review'>('highlights');
  const [showHighlightMenu, setShowHighlightMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState('');
  const [quizAnswer, setQuizAnswer] = useState('');
  const [showQuizResult, setShowQuizResult] = useState(false);
  const [lastQuizScore, setLastQuizScore] = useState<number | null>(null);

  // Initialize store
  useEffect(() => {
    setActiveDocument(documentId, userId);
  }, [documentId, userId, setActiveDocument]);

  useEffect(() => {
    setActivePage(currentPage - 1); // 0-indexed
  }, [currentPage, setActivePage]);

  // Get annotations for display
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
    
    // Position menu (simplified for now)
    setMenuPosition({ x: window.innerWidth / 2, y: 200 });
    setShowHighlightMenu(true);
  }, []);

  // Create highlight with Auto-PDRM classification
  const handleCreateHighlight = useCallback(async (overridePDRM?: 'P' | 'D' | 'R' | 'M') => {
    if (!selectedText) return;

    // Auto-classify if no override
    const classification = classifyHighlight(selectedText, {
      headingText: headings[0],
      chapterTitle: chapterId,
      pageIndex: currentPage - 1
    });

    // Build PDRM metadata
    let pdrm: PDRMMetadata = {};
    let color = '#FFEB3B'; // Default yellow

    if (overridePDRM) {
      // User explicitly chose a type
      switch (overridePDRM) {
        case 'P': pdrm.pattern = selectedText; break;
        case 'D': pdrm.decisionRule = selectedText; break;
        case 'M': pdrm.mnemonic = selectedText; break;
        case 'R': pdrm.isMistake = true; break;
      }
      color = getPDRMColorForType(overridePDRM);
    } else {
      // Use auto-classification
      pdrm = classification.pdrm;
      color = getPDRMTypeColor(classification.type);
    }

    // Create annotation
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

    setShowHighlightMenu(false);
    setSelectedText('');
    console.log(`✅ Highlight created with ${overridePDRM || 'auto'} classification: ${classification.type}`);
  }, [selectedText, documentId, chapterId, currentPage, currentThoughtUnit, headings, userId, addAnnotation]);

  // Start chapter quiz
  const handleStartQuiz = useCallback(async () => {
    await generateQuiz(documentId, chapterId, allHighlights, headings);
    setActiveTab('quiz');
  }, [documentId, chapterId, allHighlights, headings, generateQuiz]);

  // Submit quiz answer
  const handleSubmitAnswer = useCallback((answer: string) => {
    if (!currentQuiz) return;
    const question = currentQuiz.questions[currentQuiz.currentIndex];
    submitAnswer(question.id, answer);
    setQuizAnswer('');
    
    // Move to next or finish
    if (currentQuiz.currentIndex < currentQuiz.questions.length - 1) {
      nextQuestion();
    }
  }, [currentQuiz, submitAnswer, nextQuestion]);

  // Finish quiz
  const handleFinishQuiz = useCallback(async () => {
    const attempt = await finishQuiz();
    if (attempt) {
      setLastQuizScore(attempt.score);
      setShowQuizResult(true);
      
      // Recommend next action based on score
      if (attempt.score < 60 && mistakes.length > 0) {
        // Recommend study session
        onRecommendedAction?.('study');
      } else if (attempt.score >= 80) {
        // Recommend next chapter
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
          <p className="text-gray-400">Upload a PDF to start highlighting and learning</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-gray-900" data-testid="pure-surgeon-view">
      {/* PDF Panel */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">Page {currentPage} / {pdfPageCount}</span>
            <button
              onClick={toggleCleanMode}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                viewMode.mode === 'clean' 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
              data-testid="clean-mode-toggle"
            >
              {viewMode.mode === 'clean' ? '🧹 Clean Mode' : '📖 Full View'}
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {pageAnnotations.length} highlight{pageAnnotations.length !== 1 ? 's' : ''} on page
            </span>
          </div>
        </div>

        {/* PDF Viewer */}
        <div className="flex-1 overflow-auto">
          <SmartPDFViewer
            fileUrl={fileUrl}
            currentPage={currentPage}
            onPageChange={onPageChange}
            onPageCount={onPageCount}
            onTextSelect={handleTextSelect}
          />
        </div>
      </div>

      {/* Sidebar Panel */}
      <div className="w-96 border-l border-gray-700 flex flex-col bg-gray-900">
        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          {(['highlights', 'quiz', 'review'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-purple-400 border-b-2 border-purple-400 bg-gray-800'
                  : 'text-gray-400 hover:text-white'
              }`}
              data-testid={`tab-${tab}`}
            >
              {tab === 'highlights' && '✨ Highlights'}
              {tab === 'quiz' && '📝 Quiz'}
              {tab === 'review' && '⚠️ Review'}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto">
          {/* Highlights Tab */}
          {activeTab === 'highlights' && (
            <div className="p-4 space-y-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-white">Chapter Highlights</h3>
                <span className="text-xs bg-gray-700 px-2 py-1 rounded text-gray-400">
                  {allHighlights.length} total
                </span>
              </div>

              {allHighlights.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No highlights yet</p>
                  <p className="text-sm mt-2">Select text in the PDF to create highlights</p>
                </div>
              ) : (
                allHighlights.slice().reverse().map(ann => {
                  const label = ann.pdrm?.pattern ? getPDRMTypeLabel('pattern') :
                               ann.pdrm?.decisionRule ? getPDRMTypeLabel('decision') :
                               ann.pdrm?.mnemonic ? getPDRMTypeLabel('mnemonic') :
                               ann.pdrm?.isMistake ? getPDRMTypeLabel('risk') :
                               getPDRMTypeLabel('general');
                  
                  return (
                    <div
                      key={ann.id}
                      className="p-3 rounded-lg border border-gray-700 hover:border-gray-600 cursor-pointer transition-colors"
                      style={{ borderLeftColor: ann.color, borderLeftWidth: 4 }}
                      onClick={() => onPageChange(ann.pageIndex + 1)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-800" style={{ color: ann.color }}>
                          {label.icon} {label.short}
                        </span>
                        <span className="text-xs text-gray-500">p.{ann.pageIndex + 1}</span>
                      </div>
                      <p className="text-sm text-gray-300 line-clamp-3">{ann.selectedText}</p>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Quiz Tab */}
          {activeTab === 'quiz' && (
            <div className="p-4">
              {!currentQuiz && !showQuizResult ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">📝</div>
                  <h3 className="text-lg font-semibold text-white mb-2">Chapter Quiz</h3>
                  <p className="text-gray-400 text-sm mb-6">
                    Test your understanding with questions from your highlights
                  </p>
                  
                  {allHighlights.length < 3 ? (
                    <p className="text-yellow-500 text-sm">
                      Create at least 3 highlights to generate a quiz
                    </p>
                  ) : (
                    <button
                      onClick={handleStartQuiz}
                      disabled={isGenerating}
                      className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 rounded-lg font-medium transition-colors"
                      data-testid="start-quiz-btn"
                    >
                      {isGenerating ? 'Generating...' : 'Start Quiz'}
                    </button>
                  )}

                  {/* Previous attempt info */}
                  {getBestScore(documentId, chapterId) > 0 && (
                    <p className="mt-4 text-sm text-gray-500">
                      Best score: {getBestScore(documentId, chapterId)}%
                    </p>
                  )}
                </div>
              ) : showQuizResult ? (
                <div className="text-center py-8">
                  <div className="text-5xl mb-4">
                    {lastQuizScore !== null && lastQuizScore >= 80 ? '🎉' : lastQuizScore !== null && lastQuizScore >= 60 ? '👍' : '📚'}
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">
                    {lastQuizScore}%
                  </h3>
                  <p className="text-gray-400 mb-6">
                    {lastQuizScore !== null && lastQuizScore >= 80 
                      ? 'Excellent! Ready for the next chapter?' 
                      : lastQuizScore !== null && lastQuizScore >= 60 
                        ? 'Good job! Review weak areas to improve.'
                        : 'Keep studying! Flashcards created for missed items.'}
                  </p>

                  {/* Recommended Actions */}
                  <div className="space-y-2">
                    {lastQuizScore !== null && lastQuizScore < 80 && mistakes.length > 0 && (
                      <button
                        onClick={() => onRecommendedAction?.('study')}
                        className="w-full px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg font-medium transition-colors"
                        data-testid="recommend-study-btn"
                      >
                        🧠 Start Study Session ({mistakes.length} weak items)
                      </button>
                    )}
                    {lastQuizScore !== null && lastQuizScore >= 60 && (
                      <button
                        onClick={() => onRecommendedAction?.('next_chapter')}
                        className="w-full px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-medium transition-colors"
                        data-testid="recommend-next-btn"
                      >
                        ➡️ Proceed to Next Chapter
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowQuizResult(false);
                        clearCurrentQuiz();
                      }}
                      className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              ) : currentQuiz && (
                <div>
                  {/* Quiz Progress */}
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm text-gray-400">
                      Question {currentQuiz.currentIndex + 1} of {currentQuiz.questions.length}
                    </span>
                    <span className="text-sm text-gray-400">
                      {currentQuiz.answers.filter(a => a.isCorrect).length} / {currentQuiz.answers.length} correct
                    </span>
                  </div>
                  
                  <div className="h-1 bg-gray-700 rounded-full mb-6">
                    <div 
                      className="h-full bg-purple-500 rounded-full transition-all"
                      style={{ width: `${((currentQuiz.currentIndex + 1) / currentQuiz.questions.length) * 100}%` }}
                    />
                  </div>

                  {/* Current Question */}
                  {(() => {
                    const question = currentQuiz.questions[currentQuiz.currentIndex];
                    const existingAnswer = currentQuiz.answers.find(a => a.questionId === question.id);
                    
                    return (
                      <div className="space-y-4">
                        <p className="text-white font-medium">{question.question}</p>
                        
                        {question.options ? (
                          <div className="space-y-2">
                            {question.options.map((opt, idx) => (
                              <button
                                key={idx}
                                onClick={() => handleSubmitAnswer(opt)}
                                disabled={!!existingAnswer}
                                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                                  existingAnswer?.userAnswer === opt
                                    ? existingAnswer.isCorrect
                                      ? 'border-green-500 bg-green-900/30'
                                      : 'border-red-500 bg-red-900/30'
                                    : 'border-gray-700 hover:border-gray-600 bg-gray-800'
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
                              placeholder="Type your answer..."
                              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-purple-500"
                              rows={3}
                              disabled={!!existingAnswer}
                            />
                            {!existingAnswer && (
                              <button
                                onClick={() => handleSubmitAnswer(quizAnswer)}
                                disabled={!quizAnswer.trim()}
                                className="mt-2 w-full px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 rounded-lg font-medium transition-colors"
                              >
                                Submit
                              </button>
                            )}
                          </div>
                        )}

                        {/* Show correct answer after answering */}
                        {existingAnswer && !existingAnswer.isCorrect && (
                          <div className="p-3 bg-gray-800 rounded-lg border border-gray-700">
                            <p className="text-sm text-gray-400">Correct answer:</p>
                            <p className="text-green-400">{question.correctAnswer}</p>
                          </div>
                        )}

                        {/* Navigation */}
                        <div className="flex justify-between pt-4">
                          <button
                            onClick={prevQuestion}
                            disabled={currentQuiz.currentIndex === 0}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg transition-colors"
                          >
                            ← Previous
                          </button>
                          
                          {currentQuiz.currentIndex < currentQuiz.questions.length - 1 ? (
                            <button
                              onClick={nextQuestion}
                              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors"
                            >
                              Next →
                            </button>
                          ) : (
                            <button
                              onClick={handleFinishQuiz}
                              className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-medium transition-colors"
                              data-testid="finish-quiz-btn"
                            >
                              Finish Quiz
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Review Tab (Weak Items) */}
          {activeTab === 'review' && (
            <div className="p-4 space-y-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-white">Items to Review</h3>
                <span className="text-xs bg-red-900/30 text-red-400 px-2 py-1 rounded">
                  {mistakes.length} weak
                </span>
              </div>

              {mistakes.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-4">✨</div>
                  <p>No weak items!</p>
                  <p className="text-sm mt-2">Complete a quiz to identify areas for review</p>
                </div>
              ) : (
                mistakes.map(ann => (
                  <div
                    key={ann.id}
                    className="p-3 rounded-lg border border-red-900/50 bg-red-900/10 cursor-pointer hover:bg-red-900/20 transition-colors"
                    onClick={() => onPageChange(ann.pageIndex + 1)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-red-400">⚠️ Needs Review</span>
                      <span className="text-xs text-gray-500">p.{ann.pageIndex + 1}</span>
                    </div>
                    <p className="text-sm text-gray-300">{ann.selectedText}</p>
                    {ann.flashcardFront && (
                      <div className="mt-2 p-2 bg-gray-800 rounded text-xs">
                        <p className="text-purple-400">{ann.flashcardFront}</p>
                      </div>
                    )}
                  </div>
                ))
              )}

              {mistakes.length > 0 && (
                <button
                  onClick={() => onRecommendedAction?.('study')}
                  className="w-full mt-4 px-4 py-3 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 rounded-lg font-medium transition-colors"
                  data-testid="start-review-study-btn"
                >
                  🧠 Study Weak Items ({mistakes.length})
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Highlight Menu Modal */}
      {showHighlightMenu && selectedText && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-gray-800 rounded-xl p-4 shadow-xl border border-gray-700 max-w-md w-full mx-4">
            <div className="mb-4">
              <p className="text-sm text-gray-400 mb-2">Selected text:</p>
              <p className="text-white line-clamp-3">{selectedText}</p>
            </div>

            {/* Auto-classification preview */}
            {(() => {
              const classification = classifyHighlight(selectedText);
              const label = getPDRMTypeLabel(classification.type);
              
              return (
                <div className="mb-4 p-3 rounded-lg bg-gray-900 border border-gray-700">
                  <p className="text-xs text-gray-500 mb-1">Auto-detected:</p>
                  <div className="flex items-center gap-2">
                    <span style={{ color: getPDRMTypeColor(classification.type) }}>
                      {label.icon} {label.full}
                    </span>
                    <span className="text-xs text-gray-500">
                      ({Math.round(classification.confidence * 100)}% confident)
                    </span>
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                onClick={() => handleCreateHighlight()}
                className="px-4 py-3 bg-yellow-600 hover:bg-yellow-500 rounded-lg font-medium transition-colors"
                data-testid="highlight-auto-btn"
              >
                ✨ Auto Classify
              </button>
              <button
                onClick={() => handleCreateHighlight('P')}
                className="px-4 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium transition-colors"
              >
                🎯 Pattern
              </button>
              <button
                onClick={() => handleCreateHighlight('D')}
                className="px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors"
              >
                ⚖️ Decision
              </button>
              <button
                onClick={() => handleCreateHighlight('M')}
                className="px-4 py-3 bg-orange-600 hover:bg-orange-500 rounded-lg font-medium transition-colors"
              >
                🧠 Mnemonic
              </button>
              <button
                onClick={() => handleCreateHighlight('R')}
                className="px-4 py-3 bg-red-600 hover:bg-red-500 rounded-lg font-medium transition-colors col-span-2"
              >
                ⚠️ Mark as Weak/Risk
              </button>
            </div>

            <button
              onClick={() => {
                setShowHighlightMenu(false);
                setSelectedText('');
              }}
              className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
