"use client";

/**
 * UniversalConceptPanel - Integrated concept display panel
 *
 * Features:
 * - Dynamic card ordering based on page type
 * - Automatic concept extraction
 * - View mode toggle (filtered/raw)
 * - Progress indicator during extraction
 */

import React, { useEffect, useMemo, useCallback } from 'react';
import { useConceptStore, type ViewMode } from '@/lib/stores/conceptStore';
import type { ConceptOutput, PageType } from '@/lib/universalExtractor';
import ConceptCard from './ConceptCard';
import ProcedureCard, { extractProcedureFromText, type Procedure } from './ProcedureCard';
import ExampleCard, { extractExampleFromText, type WorkedExample } from './ExampleCard';
import VisualCard, { extractVisualFromText, type VisualReference } from './VisualCard';

// ============================================================================
// Types
// ============================================================================

interface UniversalConceptPanelProps {
  documentId: string;
  pageNumber: number;
  pageText: string;
  onHighlightSelect?: (text: string) => void;
  onJumpToFigure?: (pageNumber: number, figureNumber: string) => void;
}

type CardType = 'concept' | 'procedure' | 'example' | 'visual';

interface CardData {
  type: CardType;
  data: ConceptOutput | Procedure | WorkedExample | VisualReference;
  priority: number;
}

// ============================================================================
// Card Ordering by Page Type
// ============================================================================

const PAGE_TYPE_CARD_ORDER: Record<PageType, CardType[]> = {
  DEFINITION: ['concept', 'example', 'visual', 'procedure'],
  EXAMPLE: ['example', 'concept', 'procedure', 'visual'],
  PROCEDURE: ['procedure', 'concept', 'example', 'visual'],
  FIGURE: ['visual', 'concept', 'example', 'procedure'],
  EXERCISES: ['example', 'procedure', 'concept', 'visual'],
  NARRATIVE: ['concept', 'example', 'procedure', 'visual'],
  MIXED: ['concept', 'procedure', 'example', 'visual'],
};

// ============================================================================
// Sub-components
// ============================================================================

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <span className="ml-3 text-sm text-gray-400">Extracting concepts...</span>
    </div>
  );
}

function EmptyState({ pageType }: { pageType?: PageType }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="text-4xl mb-3">Brain</div>
      <h3 className="text-lg font-medium text-gray-300">No concepts extracted</h3>
      <p className="text-sm text-gray-500 mt-1">
        {pageType === 'FIGURE'
          ? 'This page appears to be primarily visual content'
          : 'Try selecting a different page or adjusting the text'}
      </p>
    </div>
  );
}

function PageTypeIndicator({ pageType }: { pageType: PageType }) {
  const colors: Record<PageType, string> = {
    DEFINITION: 'bg-purple-600',
    EXAMPLE: 'bg-green-600',
    PROCEDURE: 'bg-blue-600',
    FIGURE: 'bg-orange-600',
    EXERCISES: 'bg-yellow-600',
    NARRATIVE: 'bg-gray-600',
    MIXED: 'bg-pink-600',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium text-white ${colors[pageType]}`}>
      {pageType}
    </span>
  );
}

function ViewModeToggle({
  viewMode,
  onToggle,
}: {
  viewMode: ViewMode;
  onToggle: (mode: ViewMode) => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-gray-700 rounded-lg p-0.5">
      <button
        onClick={() => onToggle('filtered')}
        className={`px-3 py-1 text-xs rounded transition-colors ${
          viewMode === 'filtered'
            ? 'bg-blue-600 text-white'
            : 'text-gray-400 hover:text-white'
        }`}
      >
        Filtered
      </button>
      <button
        onClick={() => onToggle('raw')}
        className={`px-3 py-1 text-xs rounded transition-colors ${
          viewMode === 'raw'
            ? 'bg-blue-600 text-white'
            : 'text-gray-400 hover:text-white'
        }`}
      >
        Raw
      </button>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function UniversalConceptPanel({
  documentId,
  pageNumber,
  pageText,
  onHighlightSelect,
  onJumpToFigure,
}: UniversalConceptPanelProps) {
  const {
    extractForPage,
    getConceptsForPage,
    isExtracting,
    viewMode,
    setViewMode,
  } = useConceptStore();

  // Extract concepts when page changes
  useEffect(() => {
    if (documentId && pageText && pageText.length > 50) {
      extractForPage(documentId, pageNumber, pageText);
    }
  }, [documentId, pageNumber, pageText, extractForPage]);

  // Get current page data
  const pageData = useMemo(() => {
    return getConceptsForPage(documentId, pageNumber);
  }, [getConceptsForPage, documentId, pageNumber]);

  // Extract additional content types from text
  const additionalCards = useMemo(() => {
    const cards: CardData[] = [];

    // Try to extract procedure
    const procedure = extractProcedureFromText(pageText);
    if (procedure) {
      cards.push({ type: 'procedure', data: procedure, priority: 0 });
    }

    // Try to extract example
    const example = extractExampleFromText(pageText);
    if (example) {
      cards.push({ type: 'example', data: example, priority: 0 });
    }

    // Try to extract visual reference
    const visual = extractVisualFromText(pageText);
    if (visual) {
      cards.push({ type: 'visual', data: visual, priority: 0 });
    }

    return cards;
  }, [pageText]);

  // Combine and sort all cards by page type order
  const sortedCards = useMemo(() => {
    if (!pageData) return [];

    const pageType = pageData.pageType;
    const order = PAGE_TYPE_CARD_ORDER[pageType];

    // Create cards from concepts
    const conceptCards: CardData[] = pageData.concepts.map((c) => ({
      type: 'concept' as CardType,
      data: c,
      priority: order.indexOf('concept'),
    }));

    // Combine with additional cards
    const allCards = [
      ...conceptCards,
      ...additionalCards.map((c) => ({
        ...c,
        priority: order.indexOf(c.type),
      })),
    ];

    // Sort by priority (lower = earlier)
    return allCards.sort((a, b) => a.priority - b.priority);
  }, [pageData, additionalCards]);

  // Render individual card
  const renderCard = useCallback(
    (card: CardData, index: number) => {
      switch (card.type) {
        case 'concept':
          return (
            <ConceptCard
              key={`concept-${index}`}
              concept={card.data as ConceptOutput}
              onHighlightSelect={onHighlightSelect}
            />
          );
        case 'procedure':
          return (
            <ProcedureCard
              key={`procedure-${index}`}
              procedure={card.data as Procedure}
            />
          );
        case 'example':
          return (
            <ExampleCard
              key={`example-${index}`}
              example={card.data as WorkedExample}
              onHighlightSelect={onHighlightSelect}
            />
          );
        case 'visual':
          return (
            <VisualCard
              key={`visual-${index}`}
              visual={card.data as VisualReference}
              onJumpToFigure={onJumpToFigure}
              onHighlightSelect={onHighlightSelect}
            />
          );
        default:
          return null;
      }
    },
    [onHighlightSelect, onJumpToFigure]
  );

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-white">Concepts</h2>
          {pageData && <PageTypeIndicator pageType={pageData.pageType} />}
        </div>
        <div className="flex items-center gap-3">
          <ViewModeToggle viewMode={viewMode} onToggle={setViewMode} />
          {pageData && (
            <span className="text-xs text-gray-500">
              {pageData.concepts.length} concept{pageData.concepts.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isExtracting ? (
          <LoadingSpinner />
        ) : sortedCards.length > 0 ? (
          sortedCards.map((card, index) => renderCard(card, index))
        ) : (
          <EmptyState pageType={pageData?.pageType} />
        )}
      </div>

      {/* Footer Stats */}
      {pageData && (
        <div className="px-4 py-2 bg-gray-850 border-t border-gray-700 flex items-center justify-between text-xs text-gray-500">
          <span>Page {pageNumber}</span>
          <span>
            Extracted at {new Date(pageData.extractedAt).toLocaleTimeString()}
          </span>
        </div>
      )}
    </div>
  );
}
