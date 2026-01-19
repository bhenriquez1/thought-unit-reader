"use client";

// components/PureSurgeonView.tsx
// PURE SURGEON VIEW MODE - V1 Final Behavior
// ✅ CLEAN MODE = PDF ONLY (full width, no absorption panel)
// ✅ FULL MODE = PDF + Absorption Panel (high-yield content)
// ✅ PDF MODE = Same as Clean (alias)
// ✅ Zoom controls work in all modes
// ✅ Highlighting works in PDF and Absorption panel

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { 
  useAnnotationStore, 
  type Annotation,
  type PDRMMetadata,
  getPDRMColorForType
} from '@/lib/stores/annotationStore';
import { useQuizStore } from '@/lib/stores/quizStore';
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

// View modes: Clean = PDF only, Full = PDF + Absorption, PDF = alias for Clean
type ViewMode = 'clean' | 'full' | 'pdf';

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

// Extract high-yield content from thought units
function extractHighYieldContent(
  thoughtUnits: Array<{ text: string; id?: string }>,
  pageNumber: number,
  headings: string[]
): {
  keyPoints: string[];
  decisions: string[];
  risks: string[];
  mnemonics: string[];
  isFrontMatter: boolean;
} {
  const result = {
    keyPoints: [] as string[],
    decisions: [] as string[],
    risks: [] as string[],
    mnemonics: [] as string[],
    isFrontMatter: false
  };

  if (!thoughtUnits.length) return result;

  // Check if this is front matter
  const combinedText = thoughtUnits.map(u => u.text).join(' ');
  if (isFrontMatter(pageNumber, combinedText)) {
    result.isFrontMatter = true;
    return result;
  }

  // Classify each thought unit
  thoughtUnits.forEach(unit => {
    if (!unit.text || unit.text.length < 20) return;
    
    const classification = classifyHighlight(unit.text, {
      headingText: headings[0],
      pageIndex: pageNumber - 1
    });

    // Extract high-yield content based on classification
    const text = unit.text.trim();
    const shortText = text.length > 200 ? text.slice(0, 200) + '...' : text;

    switch (classification.type) {
      case 'pattern':
        if (result.keyPoints.length < 5) result.keyPoints.push(shortText);
        break;
      case 'decision':
        if (result.decisions.length < 3) result.decisions.push(shortText);
        break;
      case 'risk':
        if (result.risks.length < 3) result.risks.push(shortText);
        break;
      case 'mnemonic':
        if (result.mnemonics.length < 2) result.mnemonics.push(shortText);
        break;
      default:
        // General content - add to key points if high confidence
        if (classification.confidence > 0.6 && result.keyPoints.length < 5) {
          result.keyPoints.push(shortText);
        }
    }
  });

  return result;
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
    isGenerating
  } = useQuizStore();

  // View mode state - persists within Surgeon View
  const [viewMode, setViewMode] = useState<ViewMode>('full');
  
  // Zoom state - independent for Surgeon View
  const [zoom, setZoom] = useState(1.25);
  
  // Absorption panel selection
  const [absorptionSelectedText, setAbsorptionSelectedText] = useState('');
  const [showAbsorptionHighlightMenu, setShowAbsorptionHighlightMenu] = useState(false);
  
  // PDF selection
  const [pdfSelectedText, setPdfSelectedText] = useState('');
  const [showPdfHighlightMenu, setShowPdfHighlightMenu] = useState(false);
  
  // Quiz state
  const [showQuizResult, setShowQuizResult] = useState(false);
  const [lastQuizScore, setLastQuizScore] = useState<number | null>(null);
  const [quizAnswer, setQuizAnswer] = useState('');

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

  // Extract high-yield content for current page
  const highYieldContent = useMemo(() => {
    return extractHighYieldContent(thoughtUnits, currentPage, headings);
  }, [thoughtUnits, currentPage, headings]);

  // Zoom handlers
  const handleZoomIn = useCallback(() => setZoom(z => Math.min(z + 0.25, 2.5)), []);
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(z - 0.25, 0.6)), []);
  const handleResetZoom = useCallback(() => setZoom(1.25), []);

  // Handle PDF text selection
  const handlePdfTextSelect = useCallback((text: string) => {
    if (!text || text.length < 3) return;
    setPdfSelectedText(text);
    setShowPdfHighlightMenu(true);
  }, []);

  // Handle absorption panel text selection
  const handleAbsorptionTextSelect = useCallback(() => {
    const selection = window.getSelection()?.toString().trim();
    if (selection && selection.length > 3) {
      setAbsorptionSelectedText(selection);
      setShowAbsorptionHighlightMenu(true);
    }
  }, []);

  // Create highlight with Auto-PDRM classification
  const handleCreateHighlight = useCallback(async (
    text: string,
    source: 'pdf' | 'absorption',
    overridePDRM?: 'P' | 'D' | 'R' | 'M'
  ) => {
    if (!text) return;

    const classification = classifyHighlight(text, {
      headingText: headings[0],
      chapterTitle: chapterId,
      pageIndex: currentPage - 1
    });

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

    // Add tag for absorption highlights
    const tags = classification.type !== 'general' 
      ? [`auto-${classification.type}`] 
      : [];
    if (source === 'absorption') {
      tags.push('absorption-highlight');
    }

    await addAnnotation({
      documentId,
      chapterId,
      pageIndex: currentPage - 1,
      thoughtUnitId: `tu_${currentThoughtUnit}`,
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

  // Quiz handlers
  const handleStartQuiz = useCallback(async () => {
    await generateQuiz(documentId, chapterId, allHighlights, headings);
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
            <p>• Clean Mode: PDF only (full width)</p>
            <p>• Full Mode: PDF + High-Yield Absorption Panel</p>
            <p>• Auto-PDRM classification (Pattern/Decision/Risk/Mnemonic)</p>
          </div>
        </div>
      </div>
    );
  }

  // Determine layout based on view mode
  // CLEAN/PDF = PDF full width, no absorption panel
  // FULL = PDF left + Absorption panel right
  const showAbsorptionPanel = viewMode === 'full';

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
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                viewMode === 'clean' || viewMode === 'pdf'
                  ? 'bg-purple-600 text-white shadow' 
                  : 'text-gray-400 hover:text-white'
              }`}
              data-testid="clean-mode-btn"
              title="PDF only - full width"
            >
              🧹 Clean
            </button>
            <button
              onClick={() => setViewMode('full')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                viewMode === 'full' 
                  ? 'bg-purple-600 text-white shadow' 
                  : 'text-gray-400 hover:text-white'
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
              onClick={handleZoomOut}
              className="px-2 py-1 rounded text-xs hover:bg-gray-600 transition-colors"
              data-testid="zoom-out-btn"
              title="Zoom out"
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
        </div>
        
        <div className="flex items-center gap-3 text-xs text-gray-500">
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
          )}
        </div>
      </div>

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

        {/* Absorption Panel - Only in Full mode */}
        {showAbsorptionPanel && (
          <div 
            className="w-1/2 overflow-auto border-l border-gray-700 bg-gray-900 p-4"
            onMouseUp={handleAbsorptionTextSelect}
            data-testid="absorption-panel"
          >
            {highYieldContent.isFrontMatter ? (
              <div className="h-full flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <div className="text-4xl mb-3">📄</div>
                  <p className="text-sm">No high-yield content on this page</p>
                  <p className="text-xs mt-1 opacity-60">Front matter detected</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Chapter heading */}
                {headings[0] && (
                  <div className="pb-3 border-b border-gray-700">
                    <h2 className="text-lg font-semibold text-white">{headings[0]}</h2>
                    <p className="text-xs text-gray-500 mt-1">Page {currentPage}</p>
                  </div>
                )}

                {/* Key Points */}
                {highYieldContent.keyPoints.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-purple-400 mb-2 flex items-center gap-2">
                      <span>🎯</span> Key Points
                    </h3>
                    <ul className="space-y-2">
                      {highYieldContent.keyPoints.map((point, i) => (
                        <li 
                          key={i} 
                          className="text-sm text-gray-300 pl-4 border-l-2 border-purple-600/50 hover:bg-gray-800/50 py-1 cursor-text select-text"
                        >
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Decision Rules */}
                {highYieldContent.decisions.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-blue-400 mb-2 flex items-center gap-2">
                      <span>⚖️</span> Decision Rules
                    </h3>
                    <ul className="space-y-2">
                      {highYieldContent.decisions.map((rule, i) => (
                        <li 
                          key={i} 
                          className="text-sm text-gray-300 pl-4 border-l-2 border-blue-600/50 hover:bg-gray-800/50 py-1 cursor-text select-text"
                        >
                          {rule}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Risks/Mistakes */}
                {highYieldContent.risks.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
                      <span>⚠️</span> Risks / Common Mistakes
                    </h3>
                    <ul className="space-y-2">
                      {highYieldContent.risks.map((risk, i) => (
                        <li 
                          key={i} 
                          className="text-sm text-gray-300 pl-4 border-l-2 border-red-600/50 hover:bg-gray-800/50 py-1 cursor-text select-text"
                        >
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Mnemonics */}
                {highYieldContent.mnemonics.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-orange-400 mb-2 flex items-center gap-2">
                      <span>🧠</span> Mnemonics
                    </h3>
                    <ul className="space-y-2">
                      {highYieldContent.mnemonics.map((mnem, i) => (
                        <li 
                          key={i} 
                          className="text-sm text-gray-300 pl-4 border-l-2 border-orange-600/50 hover:bg-gray-800/50 py-1 cursor-text select-text"
                        >
                          {mnem}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* No content fallback */}
                {highYieldContent.keyPoints.length === 0 && 
                 highYieldContent.decisions.length === 0 &&
                 highYieldContent.risks.length === 0 &&
                 highYieldContent.mnemonics.length === 0 && (
                  <div className="h-full flex items-center justify-center text-gray-500 py-12">
                    <div className="text-center">
                      <div className="text-4xl mb-3">📝</div>
                      <p className="text-sm">Processing content...</p>
                      <p className="text-xs mt-1 opacity-60">High-yield extraction in progress</p>
                    </div>
                  </div>
                )}

                {/* Highlights on this page */}
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
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

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
