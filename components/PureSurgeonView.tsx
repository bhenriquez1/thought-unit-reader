"use client";

// components/PureSurgeonView.tsx
// PURE SURGEON VIEW MODE - V2 with Enhanced Absorption Panel
// ✅ CLEAN MODE = PDF ONLY (full width, no absorption panel)
// ✅ FULL MODE = PDF + Absorption Panel (high-yield content)
// ✅ Absorption regenerates on EVERY page change (debounced)
// ✅ Auto-highlights high-yield phrases with colored styling
// ✅ Auto-saves high-importance items to NoteLab (deduplicated)
// ✅ Manual highlighting in absorption panel saves to NoteLab

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { 
  useAnnotationStore, 
  type Annotation,
  type PDRMMetadata,
  getPDRMColorForType
} from '@/lib/stores/annotationStore';
import { useQuizStore } from '@/lib/stores/quizStore';
import classifyHighlight, { getPDRMTypeLabel, getPDRMTypeColor } from '@/lib/autoPDRM';
import SmartPDFViewer from './SmartPDFViewer';
import {
  generateAbsorptionContent,
  getAutoSaveBullets,
  getBulletHash,
  type AbsorptionBlock,
  type AbsorptionBullet,
  type SpanKind
} from '@/lib/absorptionEngine';

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

  // Initialize store
  useEffect(() => {
    setActiveDocument(documentId, userId);
  }, [documentId, userId, setActiveDocument]);

  useEffect(() => {
    setActivePage(currentPage - 1);
  }, [currentPage, setActivePage]);

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
  const pageAnnotations = useMemo(() => {
    return getAnnotationsForPage(currentPage - 1);
  }, [currentPage, getAnnotationsForPage, annotations]);

  const allHighlights = useMemo(() => {
    return getHighlightsOnly().filter(a => a.documentId === documentId);
  }, [getHighlightsOnly, annotations, documentId]);

  const mistakes = useMemo(() => {
    return getMistakes().filter(a => a.documentId === documentId);
  }, [getMistakes, annotations, documentId]);

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

  // Handle absorption panel text selection (Requirement C)
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

    // Add tags
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
