"use client";

// components/SurgeonView.tsx
// Surgeon View - In-reader view mode with direct highlighting and PDRM tools
// Uses unified AnnotationStore (single source of truth for annotations)

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  useAnnotationStore, 
  type Annotation, 
  type ViewMode,
  type HighlightAnchor,
  type PDRMMetadata,
  getPDRMColorForType,
  getPDRMBgColorForType
} from '@/lib/stores/annotationStore';
import { useQuizStore } from '@/lib/stores/quizStore';

interface SurgeonViewProps {
  documentId: string;
  userId: string;
  chapterId?: string;
  pageIndex: number;
  pageContent: string;
  headings: string[];
  onNavigateToPage: (pageIndex: number) => void;
  onClose?: () => void;
}

export default function SurgeonView({
  documentId,
  userId,
  chapterId,
  pageIndex,
  pageContent,
  headings,
  onNavigateToPage,
  onClose
}: SurgeonViewProps) {
  // Store state
  const {
    annotations,
    viewMode,
    pendingHighlight,
    selectedAnnotationId,
    setActiveDocument,
    setActiveChapter,
    setPendingHighlight,
    confirmHighlight,
    cancelHighlight,
    selectAnnotation,
    setViewMode,
    toggleCleanMode,
    getAnnotationsForPage,
    getHighlightsOnly,
    getMistakes,
    getPDRMAnnotations,
    addPDRMTag,
    updateAnnotation,
    deleteAnnotation
  } = useAnnotationStore();

  // Local state
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [activePanel, setActivePanel] = useState<'highlights' | 'pdrm' | 'quiz'>('highlights');
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);

  // Initialize store with document
  useEffect(() => {
    setActiveDocument(documentId, userId);
  }, [documentId, userId, setActiveDocument]);

  useEffect(() => {
    setActiveChapter(chapterId || null);
  }, [chapterId, setActiveChapter]);

  // setActivePage is now driven by the annotationStore CLC subscription (Phase 3 One Brain).

  // Get annotations for current page
  const pageAnnotations = useMemo(() => {
    return getAnnotationsForPage(pageIndex);
  }, [pageIndex, getAnnotationsForPage, annotations]);

  // Get all highlights for sidebar
  const allHighlights = useMemo(() => {
    return getHighlightsOnly();
  }, [getHighlightsOnly, annotations]);

  // Get mistakes for review
  const mistakes = useMemo(() => {
    return getMistakes();
  }, [getMistakes, annotations]);

  // Handle text selection - creates pending highlight with proper anchor
  const handleTextSelect = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (text.length < 3) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Create anchor based on text selection (primary method per user spec)
    const anchor: HighlightAnchor = {
      type: 'textRange',
      start: range.startOffset,
      end: range.endOffset
    };

    setPendingHighlight({
      selectedText: text,
      pageIndex,
      anchor,
      chapterId: chapterId
    });

    setMenuPosition({
      x: rect.left + rect.width / 2,
      y: rect.bottom + window.scrollY
    });
    setShowActionMenu(true);
  }, [pageIndex, chapterId, setPendingHighlight]);

  // Handle action from menu - creates highlight with optional PDRM tags
  const handleAction = useCallback(async (actionType: string, tagType?: 'P' | 'D' | 'R' | 'M') => {
    if (!pendingHighlight) return;

    // Build PDRM metadata based on action
    const pdrm: PDRMMetadata = {};
    if (tagType) {
      switch (tagType) {
        case 'P': pdrm.pattern = pendingHighlight.selectedText; break;
        case 'D': pdrm.decisionRule = pendingHighlight.selectedText; break;
        case 'M': pdrm.mnemonic = pendingHighlight.selectedText; break;
        case 'R': pdrm.isMistake = true; break;
      }
    }

    // Determine color based on action
    let color = '#FFEB3B'; // Default yellow
    if (tagType) {
      color = getPDRMColorForType(tagType);
    } else if (actionType === 'note') {
      color = '#4CAF50'; // Green for notes
    } else if (actionType === 'flashcard') {
      color = '#9C27B0'; // Purple for flashcards
    }

    await confirmHighlight({
      userId,
      pdrm,
      color,
      modeContext: viewMode.mode === 'clean' ? 'clean' : 'context'
    });
    
    setShowActionMenu(false);
  }, [pendingHighlight, userId, viewMode.mode, confirmHighlight]);

  // Close action menu
  const handleCloseMenu = useCallback(() => {
    setShowActionMenu(false);
    cancelHighlight();
  }, [cancelHighlight]);

  // Navigate to annotation
  const handleAnnotationClick = useCallback((annotation: Annotation) => {
    selectAnnotation(annotation.id);
    onNavigateToPage(annotation.pageIndex);
  }, [selectAnnotation, onNavigateToPage]);

  // Render content based on view mode
  const renderContent = useMemo(() => {
    if (viewMode.mode === 'clean' && viewMode.showOnlyHighlights) {
      // Clean mode: show only highlights and headings
      return (
        <div className="space-y-4" data-testid="clean-mode-content">
          {/* Headings */}
          {viewMode.showHeadings && headings.map((heading, idx) => (
            <h3 key={idx} className="text-lg font-semibold text-white border-b border-gray-700 pb-2" data-testid={`clean-mode-heading-${idx}`}>
              {heading}
            </h3>
          ))}
          
          {/* Highlights only */}
          {pageAnnotations.length > 0 ? (
            pageAnnotations.map((ann) => (
              <div
                key={ann.id}
                data-testid={`highlight-card-${ann.id}`}
                className={`p-3 rounded-lg border-l-4 cursor-pointer transition-all ${
                  selectedAnnotationId === ann.id ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-750'
                }`}
                style={{ borderLeftColor: ann.color || '#FFEB3B' }}
                onClick={() => selectAnnotation(ann.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <span className="text-sm text-gray-300">{ann.selectedText}</span>
                    {/* PDRM tags as labels */}
                    {ann.pdrm?.pattern && (
                      <span className="ml-2 px-2 py-0.5 rounded text-xs font-bold bg-purple-600 text-white" data-testid={`pdrm-tag-P-${ann.id}`}>P</span>
                    )}
                    {ann.pdrm?.decisionRule && (
                      <span className="ml-2 px-2 py-0.5 rounded text-xs font-bold bg-blue-600 text-white" data-testid={`pdrm-tag-D-${ann.id}`}>D</span>
                    )}
                    {ann.pdrm?.isMistake && (
                      <span className="ml-2 px-2 py-0.5 rounded text-xs font-bold bg-red-600 text-white" data-testid={`pdrm-tag-R-${ann.id}`}>R</span>
                    )}
                    {ann.pdrm?.mnemonic && (
                      <span className="ml-2 px-2 py-0.5 rounded text-xs font-bold bg-yellow-600 text-black" data-testid={`pdrm-tag-M-${ann.id}`}>M</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">p.{ann.pageIndex + 1}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center text-gray-500 py-8" data-testid="clean-mode-empty">
              <p>No highlights on this page yet.</p>
              <p className="text-sm mt-2">Select text to create highlights.</p>
            </div>
          )}
        </div>
      );
    }

    // Full or Context mode: show full content with highlights
    return (
      <div 
        className="prose prose-invert max-w-none"
        onMouseUp={handleTextSelect}
        data-testid="surgeon-view-content"
      >
        {/* Headings */}
        {headings.map((heading, idx) => (
          <h3 key={idx} className="text-lg font-semibold text-white">
            {heading}
          </h3>
        ))}
        
        {/* Page content with highlights */}
        <div className="text-gray-300 leading-relaxed whitespace-pre-wrap">
          {renderHighlightedContent(pageContent, pageAnnotations)}
        </div>
      </div>
    );
  }, [viewMode, headings, pageContent, pageAnnotations, selectedAnnotationId, handleTextSelect, selectAnnotation]);

  // Render highlighted content - overlays highlights on text
  function renderHighlightedContent(content: string, annotationsList: Annotation[]) {
    if (annotationsList.length === 0) return content;

    // Sort annotations by anchor position
    const sortedAnnotations = [...annotationsList].sort((a, b) => {
      const aStart = a.anchor.type === 'textRange' ? a.anchor.start : 0;
      const bStart = b.anchor.type === 'textRange' ? b.anchor.start : 0;
      return aStart - bStart;
    });

    const segments: React.ReactNode[] = [];
    let lastEnd = 0;

    sortedAnnotations.forEach((ann, idx) => {
      const textToFind = ann.selectedText;
      const startIdx = content.indexOf(textToFind, lastEnd);
      
      if (startIdx === -1) {
        return; // Text not found - fallback behavior
      }

      // Add text before highlight
      if (startIdx > lastEnd) {
        segments.push(
          <span key={`text-${idx}`}>{content.slice(lastEnd, startIdx)}</span>
        );
      }

      // Determine PDRM label to show
      let pdrmLabel: string | null = null;
      if (ann.pdrm?.pattern) pdrmLabel = 'P';
      else if (ann.pdrm?.decisionRule) pdrmLabel = 'D';
      else if (ann.pdrm?.isMistake) pdrmLabel = 'R';
      else if (ann.pdrm?.mnemonic) pdrmLabel = 'M';

      // Add highlighted text
      segments.push(
        <mark
          key={`highlight-${ann.id}`}
          data-testid={`highlight-mark-${ann.id}`}
          className={`cursor-pointer rounded px-0.5 ${
            selectedAnnotationId === ann.id ? 'ring-2 ring-white' : ''
          }`}
          style={{ 
            backgroundColor: ann.color || '#FFEB3B',
            color: '#000'
          }}
          onClick={() => selectAnnotation(ann.id)}
          title={pdrmLabel ? `PDRM: ${pdrmLabel}` : 'Highlight'}
        >
          {textToFind}
          {pdrmLabel && (
            <sup className="ml-0.5 text-xs font-bold">{pdrmLabel}</sup>
          )}
        </mark>
      );

      lastEnd = startIdx + textToFind.length;
    });

    // Add remaining text
    if (lastEnd < content.length) {
      segments.push(
        <span key="text-final">{content.slice(lastEnd)}</span>
      );
    }

    return segments.length > 0 ? segments : content;
  }

  return (
    <div className="flex h-full bg-gray-900 text-white" data-testid="surgeon-view">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-yellow-400">🔬 Surgeon View</h2>
            <span className="text-sm text-gray-400" data-testid="current-page">Page {pageIndex + 1}</span>
            {chapterId && (
              <span className="text-sm text-gray-500">• Chapter: {chapterId}</span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <button
              onClick={toggleCleanMode}
              data-testid="toggle-clean-mode"
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                viewMode.mode === 'clean' 
                  ? 'bg-yellow-500 text-black' 
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {viewMode.mode === 'clean' ? '✨ Clean Mode' : '📖 Full View'}
            </button>
            
            {/* Context Mode Toggle (only in clean mode) */}
            {viewMode.mode === 'clean' && (
              <button
                onClick={() => setViewMode({ 
                  mode: viewMode.mode === 'clean' ? 'context' : 'clean' 
                })}
                className="px-3 py-1.5 rounded text-sm bg-gray-700 hover:bg-gray-600"
                data-testid="toggle-context-mode"
              >
                + Context
              </button>
            )}
            
            {onClose && (
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded text-sm bg-gray-700 hover:bg-gray-600"
                data-testid="close-surgeon-view"
              >
                ✕ Close
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6" data-testid="surgeon-view-content-area">
          {renderContent}
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col" data-testid="surgeon-view-panel">
        {/* Panel Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActivePanel('highlights')}
            data-testid="tab-highlights"
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activePanel === 'highlights' 
                ? 'bg-gray-700 text-yellow-400' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            🔆 Highlights
          </button>
          <button
            onClick={() => setActivePanel('pdrm')}
            data-testid="tab-pdrm"
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activePanel === 'pdrm' 
                ? 'bg-gray-700 text-purple-400' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            🧠 PDRM
          </button>
          <button
            onClick={() => setActivePanel('quiz')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activePanel === 'quiz' 
                ? 'bg-gray-700 text-green-400' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            📝 Quiz
          </button>
        </div>

        {/* Panel Content */}
        <div className="flex-1 overflow-auto p-4">
          {activePanel === 'highlights' && (
            <HighlightsPanel
              highlights={allHighlights}
              selectedId={selectedAnnotationId}
              onSelect={handleAnnotationClick}
              onDelete={deleteAnnotation}
            />
          )}
          
          {activePanel === 'pdrm' && (
            <PDRMPanel
              annotations={annotations}
              onSelect={handleAnnotationClick}
            />
          )}
          
          {activePanel === 'quiz' && (
            <QuizPanel
              highlights={allHighlights}
              mistakes={mistakes}
              chapterId={chapterId}
              documentId={documentId}
              userId={userId}
              headings={headings}
              isGenerating={isGeneratingQuiz}
              onGenerate={() => setIsGeneratingQuiz(true)}
            />
          )}
        </div>

        {/* Chapter Review Button */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={() => setActivePanel('quiz')}
            className="w-full px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-lg font-medium transition-all"
          >
            📚 Chapter Review
          </button>
        </div>
      </div>

      {/* Highlight Action Menu - inline implementation */}
      {showActionMenu && pendingHighlight && (
        <div
          className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl p-2 min-w-[200px]"
          style={{
            left: `${menuPosition.x}px`,
            top: `${menuPosition.y}px`,
            transform: 'translate(-50%, 8px)',
          }}
          data-testid="highlight-action-menu"
        >
          {/* Selected text preview */}
          <div className="px-2 py-1 text-xs text-gray-400 border-b border-gray-700 mb-2 max-w-[300px] truncate">
            "{pendingHighlight.selectedText.substring(0, 60)}{pendingHighlight.selectedText.length > 60 ? '...' : ''}"
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-1">
            {/* Simple Highlight */}
            <button
              onClick={() => handleAction('highlight')}
              className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 text-left text-sm transition-colors"
              data-testid="action-highlight"
            >
              <span className="text-yellow-400">🔆</span>
              <span>Highlight</span>
            </button>

            {/* Add Note */}
            <button
              onClick={() => handleAction('note')}
              className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 text-left text-sm transition-colors"
              data-testid="action-note"
            >
              <span className="text-green-400">📝</span>
              <span>Add Note</span>
            </button>

            {/* Create Flashcard */}
            <button
              onClick={() => handleAction('flashcard')}
              className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 text-left text-sm transition-colors"
              data-testid="action-flashcard"
            >
              <span className="text-purple-400">🎴</span>
              <span>Create Flashcard</span>
            </button>

            {/* PDRM Tags */}
            <div className="border-t border-gray-700 mt-1 pt-1">
              <div className="px-3 py-1 text-xs text-gray-500 uppercase">PDRM Tags</div>
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => handleAction('tag', 'P')}
                  className="flex items-center gap-1 px-2 py-1.5 rounded hover:bg-purple-900/30 text-left text-sm transition-colors"
                  data-testid="pdrm-tag-P"
                >
                  <span className="font-bold text-purple-400">P</span>
                  <span className="text-xs">Pattern</span>
                </button>
                <button
                  onClick={() => handleAction('tag', 'D')}
                  className="flex items-center gap-1 px-2 py-1.5 rounded hover:bg-blue-900/30 text-left text-sm transition-colors"
                  data-testid="pdrm-tag-D"
                >
                  <span className="font-bold text-blue-400">D</span>
                  <span className="text-xs">Decision</span>
                </button>
                <button
                  onClick={() => handleAction('tag', 'R')}
                  className="flex items-center gap-1 px-2 py-1.5 rounded hover:bg-red-900/30 text-left text-sm transition-colors"
                  data-testid="pdrm-tag-R"
                >
                  <span className="font-bold text-red-400">R</span>
                  <span className="text-xs">Risk</span>
                </button>
                <button
                  onClick={() => handleAction('tag', 'M')}
                  className="flex items-center gap-1 px-2 py-1.5 rounded hover:bg-yellow-900/30 text-left text-sm transition-colors"
                  data-testid="pdrm-tag-M"
                >
                  <span className="font-bold text-yellow-400">M</span>
                  <span className="text-xs">Mnemonic</span>
                </button>
              </div>
            </div>

            {/* Cancel */}
            <button
              onClick={handleCloseMenu}
              className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 text-left text-sm transition-colors border-t border-gray-700 mt-1 pt-2 text-gray-400"
              data-testid="action-cancel"
            >
              <span>✕</span>
              <span>Cancel</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface HighlightsPanelProps {
  highlights: Annotation[];
  selectedId: string | null;
  onSelect: (annotation: Annotation) => void;
  onDelete: (id: string) => Promise<void>;
}

function HighlightsPanel({ highlights, selectedId, onSelect, onDelete }: HighlightsPanelProps) {
  if (highlights.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8" data-testid="highlights-empty">
        <p className="text-4xl mb-4">🔆</p>
        <p>No highlights yet</p>
        <p className="text-sm mt-2">Select text in the document to create highlights</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="highlights-panel">
      <div className="text-sm text-gray-400 mb-2">
        {highlights.length} highlight{highlights.length !== 1 ? 's' : ''}
      </div>
      {highlights.map((highlight) => (
        <div
          key={highlight.id}
          data-testid={`highlight-item-${highlight.id}`}
          className={`p-3 rounded-lg border cursor-pointer transition-all ${
            selectedId === highlight.id 
              ? 'border-yellow-500 bg-yellow-500/10' 
              : 'border-gray-700 hover:border-gray-600 bg-gray-800'
          }`}
          onClick={() => onSelect(highlight)}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-gray-300 line-clamp-2">{highlight.selectedText}</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(highlight.id);
              }}
              className="text-gray-500 hover:text-red-400 text-xs"
              data-testid={`delete-highlight-${highlight.id}`}
            >
              ✕
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-500">p.{highlight.pageIndex + 1}</span>
            {/* Show PDRM tags */}
            {highlight.pdrm?.pattern && (
              <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-purple-600 text-white">P</span>
            )}
            {highlight.pdrm?.decisionRule && (
              <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-blue-600 text-white">D</span>
            )}
            {highlight.pdrm?.isMistake && (
              <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-red-600 text-white">R</span>
            )}
            {highlight.pdrm?.mnemonic && (
              <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-yellow-600 text-black">M</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

interface PDRMPanelProps {
  annotations: Record<string, Annotation>;
  onSelect: (annotation: Annotation) => void;
}

function PDRMPanel({ annotations, onSelect }: PDRMPanelProps) {
  // Group annotations by PDRM type
  const grouped = useMemo(() => {
    const groups: Record<string, Annotation[]> = { P: [], D: [], R: [], M: [] };
    Object.values(annotations).forEach(ann => {
      if (ann.pdrm?.pattern) groups.P.push(ann);
      if (ann.pdrm?.decisionRule) groups.D.push(ann);
      if (ann.pdrm?.isMistake) groups.R.push(ann);
      if (ann.pdrm?.mnemonic) groups.M.push(ann);
    });
    return groups;
  }, [annotations]);

  const pdrmLabels: Record<string, { name: string; icon: string; description: string; bgColor: string }> = {
    P: { name: 'Pattern', icon: '🎯', description: 'Core principles & patterns', bgColor: 'bg-purple-600/20' },
    D: { name: 'Decision', icon: '⚖️', description: 'Critical decision points', bgColor: 'bg-blue-600/20' },
    R: { name: 'Risk/Mistake', icon: '⚠️', description: 'Warnings & weak areas', bgColor: 'bg-red-600/20' },
    M: { name: 'Mnemonic', icon: '🧠', description: 'Memory aids', bgColor: 'bg-yellow-600/20' }
  };

  return (
    <div className="space-y-4" data-testid="pdrm-panel">
      {(['P', 'D', 'R', 'M'] as const).map(type => (
        <div key={type} className="border border-gray-700 rounded-lg overflow-hidden" data-testid={`pdrm-section-${type}`}>
          <div className={`px-3 py-2 ${pdrmLabels[type].bgColor}`}>
            <div className="flex items-center gap-2">
              <span>{pdrmLabels[type].icon}</span>
              <span className="font-medium">{pdrmLabels[type].name}</span>
              <span className="text-xs opacity-70">({grouped[type].length})</span>
            </div>
            <p className="text-xs opacity-70 mt-1">{pdrmLabels[type].description}</p>
          </div>
          
          {grouped[type].length > 0 ? (
            <div className="p-2 space-y-2 max-h-40 overflow-auto">
              {grouped[type].map(ann => (
                <div
                  key={ann.id}
                  className="p-2 bg-gray-800 rounded cursor-pointer hover:bg-gray-750"
                  onClick={() => onSelect(ann)}
                  data-testid={`pdrm-item-${ann.id}`}
                >
                  <p className="text-xs text-gray-300 line-clamp-2">{ann.selectedText}</p>
                  <span className="text-xs text-gray-500">p.{ann.pageIndex + 1}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 text-center text-xs text-gray-500">
              No {pdrmLabels[type].name.toLowerCase()}s tagged yet
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface QuizPanelProps {
  highlights: Annotation[];
  mistakes: Annotation[];
  chapterId?: string;
  documentId: string;
  userId: string;
  headings: string[];
  isGenerating: boolean;
  onGenerate: () => void;
}

function QuizPanel({ highlights, mistakes, chapterId, documentId, userId, headings, isGenerating, onGenerate }: QuizPanelProps) {
  // Quiz store
  const {
    currentQuiz,
    isGenerating: storeIsGenerating,
    isSubmitting,
    generateQuiz,
    submitAnswer,
    nextQuestion,
    prevQuestion,
    finishQuiz,
    clearCurrentQuiz,
    getLastAttempt,
    getBestScore
  } = useQuizStore();
  
  // Local state
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [showResults, setShowResults] = useState(false);
  const [lastResult, setLastResult] = useState<{ score: number; total: number } | null>(null);
  
  // Get previous attempts info
  const lastAttempt = getLastAttempt(documentId, chapterId || 'all');
  const bestScore = getBestScore(documentId, chapterId || 'all');
  
  // Current question
  const currentQuestion = currentQuiz?.questions[currentQuiz.currentIndex];
  const currentAnswer = currentQuiz?.answers.find(a => a.questionId === currentQuestion?.id);
  
  // Handle starting quiz
  const handleStartQuiz = async () => {
    setShowResults(false);
    setLastResult(null);
    await generateQuiz(documentId, chapterId || 'all', highlights, headings);
  };
  
  // Handle answer submission
  const handleSubmitAnswer = () => {
    if (!currentQuestion || !selectedOption) return;
    submitAnswer(currentQuestion.id, selectedOption);
    setSelectedOption('');
  };
  
  // Handle finish quiz
  const handleFinishQuiz = async () => {
    const attempt = await finishQuiz();
    if (attempt) {
      setLastResult({ score: attempt.score, total: attempt.totalQuestions });
      setShowResults(true);
    }
  };
  
  // Handle retake
  const handleRetake = () => {
    clearCurrentQuiz();
    setShowResults(false);
    setLastResult(null);
  };
  
  // Render quiz results
  if (showResults && lastResult) {
    const wrongCount = currentQuiz ? currentQuiz.answers.filter(a => !a.isCorrect).length : 0;
    
    return (
      <div className="space-y-4" data-testid="quiz-results">
        <div className="text-center py-6">
          <div className={`text-6xl mb-4 ${lastResult.score >= 80 ? '🎉' : lastResult.score >= 60 ? '👍' : '📚'}`}>
            {lastResult.score >= 80 ? '🎉' : lastResult.score >= 60 ? '👍' : '📚'}
          </div>
          <div className="text-3xl font-bold text-white mb-2">{lastResult.score}%</div>
          <div className="text-gray-400">
            {currentQuiz?.answers.filter(a => a.isCorrect).length} / {lastResult.total} correct
          </div>
        </div>
        
        {wrongCount > 0 && (
          <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-lg">
            <p className="text-sm text-red-400 font-medium mb-2">
              📇 {wrongCount} flashcard{wrongCount > 1 ? 's' : ''} created for missed questions
            </p>
            <p className="text-xs text-gray-400">
              Review them in NoteLab under "Missed / Weak" filter
            </p>
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleRetake}
            className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
            data-testid="quiz-retake-btn"
          >
            🔄 Retake
          </button>
          <button
            onClick={() => { clearCurrentQuiz(); setShowResults(false); }}
            className="px-4 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-medium transition-colors"
            data-testid="quiz-done-btn"
          >
            ✓ Done
          </button>
        </div>
      </div>
    );
  }
  
  // Render active quiz
  if (currentQuiz && currentQuestion) {
    const progress = ((currentQuiz.currentIndex + 1) / currentQuiz.questions.length) * 100;
    const isAnswered = !!currentAnswer;
    const isLastQuestion = currentQuiz.currentIndex === currentQuiz.questions.length - 1;
    
    return (
      <div className="space-y-4" data-testid="quiz-active">
        {/* Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Question {currentQuiz.currentIndex + 1} of {currentQuiz.questions.length}</span>
            <span className={`px-2 py-0.5 rounded ${currentQuestion.type === 'recall' ? 'bg-blue-600' : 'bg-purple-600'}`}>
              {currentQuestion.type === 'recall' ? '📝 Recall' : '🎯 Application'}
            </span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        
        {/* Question */}
        <div className="p-4 bg-gray-800 rounded-lg">
          <p className="text-sm text-white whitespace-pre-wrap">{currentQuestion.question}</p>
        </div>
        
        {/* Options (MCQ) */}
        {currentQuestion.options ? (
          <div className="space-y-2">
            {currentQuestion.options.map((option, idx) => {
              const isSelected = selectedOption === option;
              const wasSelected = currentAnswer?.userAnswer === option;
              const isCorrect = option === currentQuestion.correctAnswer;
              
              let optionStyle = 'bg-gray-700 hover:bg-gray-600 border-gray-600';
              if (isAnswered) {
                if (isCorrect) optionStyle = 'bg-green-900/50 border-green-500';
                else if (wasSelected && !currentAnswer?.isCorrect) optionStyle = 'bg-red-900/50 border-red-500';
              } else if (isSelected) {
                optionStyle = 'bg-blue-900/50 border-blue-500';
              }
              
              return (
                <button
                  key={idx}
                  onClick={() => !isAnswered && setSelectedOption(option)}
                  disabled={isAnswered}
                  className={`w-full p-3 text-left rounded-lg border transition-colors ${optionStyle}`}
                  data-testid={`quiz-option-${idx}`}
                >
                  <span className="text-sm">{String.fromCharCode(65 + idx)}. {option}</span>
                </button>
              );
            })}
          </div>
        ) : (
          /* Short answer */
          <div className="space-y-2">
            <textarea
              value={selectedOption}
              onChange={(e) => setSelectedOption(e.target.value)}
              disabled={isAnswered}
              placeholder="Type your answer..."
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-green-500 resize-none"
              rows={3}
              data-testid="quiz-answer-input"
            />
          </div>
        )}
        
        {/* Feedback after answer */}
        {isAnswered && (
          <div className={`p-3 rounded-lg ${currentAnswer?.isCorrect ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'}`}>
            <p className={`text-sm font-medium ${currentAnswer?.isCorrect ? 'text-green-400' : 'text-red-400'}`}>
              {currentAnswer?.isCorrect ? '✓ Correct!' : '✗ Incorrect'}
            </p>
            {!currentAnswer?.isCorrect && (
              <p className="text-xs text-gray-400 mt-1">
                Correct answer: {currentQuestion.correctAnswer}
              </p>
            )}
            {currentQuestion.explanation && (
              <p className="text-xs text-gray-400 mt-2">{currentQuestion.explanation}</p>
            )}
          </div>
        )}
        
        {/* Navigation */}
        <div className="flex gap-2">
          <button
            onClick={prevQuestion}
            disabled={currentQuiz.currentIndex === 0}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            data-testid="quiz-prev-btn"
          >
            ← Prev
          </button>
          
          {!isAnswered ? (
            <button
              onClick={handleSubmitAnswer}
              disabled={!selectedOption}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
              data-testid="quiz-submit-btn"
            >
              Submit
            </button>
          ) : isLastQuestion ? (
            <button
              onClick={handleFinishQuiz}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-medium transition-colors"
              data-testid="quiz-finish-btn"
            >
              {isSubmitting ? 'Saving...' : 'Finish Quiz'}
            </button>
          ) : (
            <button
              onClick={nextQuestion}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-medium transition-colors"
              data-testid="quiz-next-btn"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    );
  }
  
  // Render quiz start screen
  return (
    <div className="space-y-4" data-testid="quiz-panel">
      {/* Quiz Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-gray-700 rounded-lg text-center">
          <div className="text-2xl font-bold text-yellow-400">{highlights.length}</div>
          <div className="text-xs text-gray-400">Highlights</div>
        </div>
        <div className="p-3 bg-gray-700 rounded-lg text-center">
          <div className="text-2xl font-bold text-red-400">{mistakes.length}</div>
          <div className="text-xs text-gray-400">Mistakes</div>
        </div>
      </div>
      
      {/* Previous Scores */}
      {lastAttempt && (
        <div className="p-3 bg-gray-800 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-400">Last Score</span>
            <span className="text-lg font-bold text-white">{lastAttempt.score}%</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Best Score</span>
            <span className="text-lg font-bold text-green-400">{bestScore}%</span>
          </div>
        </div>
      )}
      
      {/* Quiz Info */}
      <div className="p-3 bg-gray-800 rounded-lg text-sm text-gray-400">
        <p className="mb-2">📝 Quiz will generate:</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>3 recall questions (MCQ/fill-blank)</li>
          <li>2 application questions (scenarios)</li>
        </ul>
        <p className="mt-2 text-xs text-gray-500">
          Wrong answers auto-create flashcards for review
        </p>
      </div>

      {/* Generate Quiz Button */}
      <button
        onClick={handleStartQuiz}
        disabled={highlights.length === 0 || storeIsGenerating}
        className="w-full px-4 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
        data-testid="quiz-start-btn"
      >
        {storeIsGenerating ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin">⏳</span>
            Generating Quiz...
          </span>
        ) : lastAttempt ? (
          '🔄 Retake Quiz'
        ) : (
          '📝 Start Chapter Quiz'
        )}
      </button>

      {/* Mistakes Review */}
      {mistakes.length > 0 && (
        <div className="border-t border-gray-700 pt-4">
          <h4 className="text-sm font-medium text-red-400 mb-2">
            🔴 Review Mistakes ({mistakes.length})
          </h4>
          <div className="space-y-2 max-h-40 overflow-auto">
            {mistakes.map(mistake => (
              <div key={mistake.id} className="p-2 bg-red-900/20 border border-red-900/50 rounded">
                <p className="text-xs text-gray-300 line-clamp-2">{mistake.selectedText}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

