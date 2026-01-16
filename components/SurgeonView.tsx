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
    setActivePage,
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

  useEffect(() => {
    setActivePage(pageIndex);
  }, [pageIndex, setActivePage]);

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
        <div className="space-y-4">
          {/* Headings */}
          {viewMode.showHeadings && headings.map((heading, idx) => (
            <h3 key={idx} className="text-lg font-semibold text-white border-b border-gray-700 pb-2">
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
                      <span className="ml-2 px-2 py-0.5 rounded text-xs font-bold bg-purple-600 text-white">P</span>
                    )}
                    {ann.pdrm?.decisionRule && (
                      <span className="ml-2 px-2 py-0.5 rounded text-xs font-bold bg-blue-600 text-white">D</span>
                    )}
                    {ann.pdrm?.isMistake && (
                      <span className="ml-2 px-2 py-0.5 rounded text-xs font-bold bg-red-600 text-white">R</span>
                    )}
                    {ann.pdrm?.mnemonic && (
                      <span className="ml-2 px-2 py-0.5 rounded text-xs font-bold bg-yellow-600 text-black">M</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">p.{ann.pageIndex + 1}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center text-gray-500 py-8">
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
    <div className="flex h-full bg-gray-900 text-white">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-yellow-400">🔬 Surgeon View</h2>
            <span className="text-sm text-gray-400">Page {pageIndex + 1}</span>
            {chapterId && (
              <span className="text-sm text-gray-500">• Chapter: {chapterId}</span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <button
              onClick={toggleCleanMode}
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
              >
                + Context
              </button>
            )}
            
            {onClose && (
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded text-sm bg-gray-700 hover:bg-gray-600"
              >
                ✕ Close
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {renderContent}
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
        {/* Panel Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActivePanel('highlights')}
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
              annotations={Array.from(annotations.values()).filter(a => a.pdrmType)}
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

      {/* Highlight Action Menu */}
      <HighlightActionMenu
        selectedText={pendingHighlight?.text || ''}
        position={menuPosition}
        onAction={handleAction}
        onClose={handleCloseMenu}
        visible={showActionMenu}
      />
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
      <div className="text-center text-gray-500 py-8">
        <p className="text-4xl mb-4">🔆</p>
        <p>No highlights yet</p>
        <p className="text-sm mt-2">Select text in the document to create highlights</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-400 mb-2">
        {highlights.length} highlight{highlights.length !== 1 ? 's' : ''}
      </div>
      {highlights.map((highlight) => (
        <div
          key={highlight.id}
          className={`p-3 rounded-lg border cursor-pointer transition-all ${
            selectedId === highlight.id 
              ? 'border-yellow-500 bg-yellow-500/10' 
              : 'border-gray-700 hover:border-gray-600 bg-gray-800'
          }`}
          onClick={() => onSelect(highlight)}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-gray-300 line-clamp-2">{highlight.text}</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(highlight.id);
              }}
              className="text-gray-500 hover:text-red-400 text-xs"
            >
              ✕
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-500">p.{highlight.pageIndex + 1}</span>
            {highlight.pdrmType && (
              <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${getPDRMColor(highlight.pdrmType)}`}>
                {highlight.pdrmType}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

interface PDRMPanelProps {
  annotations: Annotation[];
  onSelect: (annotation: Annotation) => void;
}

function PDRMPanel({ annotations, onSelect }: PDRMPanelProps) {
  const grouped = useMemo(() => {
    const groups: Record<string, Annotation[]> = { P: [], D: [], R: [], M: [] };
    annotations.forEach(ann => {
      if (ann.pdrmType && groups[ann.pdrmType]) {
        groups[ann.pdrmType].push(ann);
      }
    });
    return groups;
  }, [annotations]);

  const pdrmLabels: Record<string, { name: string; icon: string; description: string }> = {
    P: { name: 'Pattern', icon: '🎯', description: 'Core principles & patterns' },
    D: { name: 'Decision', icon: '⚖️', description: 'Critical decision points' },
    R: { name: 'Risk', icon: '⚠️', description: 'Warnings & contraindications' },
    M: { name: 'Mechanism', icon: '⚙️', description: 'How it works (MOA)' }
  };

  return (
    <div className="space-y-4">
      {(['P', 'D', 'R', 'M'] as const).map(type => (
        <div key={type} className="border border-gray-700 rounded-lg overflow-hidden">
          <div className={`px-3 py-2 ${getPDRMBgColor(type)}`}>
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
                >
                  <p className="text-xs text-gray-300 line-clamp-2">{ann.text}</p>
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
  isGenerating: boolean;
  onGenerate: () => void;
}

function QuizPanel({ highlights, mistakes, chapterId, documentId, userId, isGenerating, onGenerate }: QuizPanelProps) {
  const [quizMode, setQuizMode] = useState<'recall' | 'application' | 'teachback'>('recall');
  
  return (
    <div className="space-y-4">
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

      {/* Quiz Mode Selection */}
      <div className="space-y-2">
        <label className="text-sm text-gray-400">Quiz Type</label>
        <div className="grid grid-cols-3 gap-2">
          {(['recall', 'application', 'teachback'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setQuizMode(mode)}
              className={`px-2 py-2 rounded text-xs transition-colors ${
                quizMode === mode 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {mode === 'recall' && '📝 Recall'}
              {mode === 'application' && '🎯 Apply'}
              {mode === 'teachback' && '🗣️ Teach'}
            </button>
          ))}
        </div>
      </div>

      {/* Generate Quiz Button */}
      <button
        onClick={onGenerate}
        disabled={highlights.length === 0 || isGenerating}
        className="w-full px-4 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
      >
        {isGenerating ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin">⏳</span>
            Generating Quiz...
          </span>
        ) : (
          `Generate ${quizMode.charAt(0).toUpperCase() + quizMode.slice(1)} Quiz`
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
                <p className="text-xs text-gray-300 line-clamp-2">{mistake.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helper functions
// ============================================================================

function getPDRMColor(type: 'P' | 'D' | 'R' | 'M'): string {
  const colors = {
    P: 'bg-purple-500 text-white',
    D: 'bg-blue-500 text-white',
    R: 'bg-red-500 text-white',
    M: 'bg-yellow-500 text-black'
  };
  return colors[type];
}

function getPDRMBgColor(type: 'P' | 'D' | 'R' | 'M'): string {
  const colors = {
    P: 'bg-purple-900/50',
    D: 'bg-blue-900/50',
    R: 'bg-red-900/50',
    M: 'bg-yellow-900/50'
  };
  return colors[type];
}
