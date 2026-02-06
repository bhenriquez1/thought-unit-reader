"use client";

import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { CoreCard } from './CoreCard';
import type { CoreItem, Trigger } from '../lib/core/types';
import { TRIGGER_LABELS } from '../lib/core/types';
import {
  runPipeline,
  createStreamController,
  type PipelineRequest,
  type PipelineResult,
  type ExtractionSource,
  PIPELINE_LIMITS,
} from '../lib/core/pipeline';

// ============================================================================
// Types
// ============================================================================

interface CoreStreamProps {
  documentId: string;
  pageNumber: number;
  pageText: string;
  chapter?: string;
  /** Text items from PDF.js (for sub-paragraph precision) */
  textItems?: Array<{ str: string; x: number; y: number; width: number; height: number }>;
  /** User text selection */
  selection?: string;
  /** Scroll position in PDF viewer */
  scrollY?: number;
  /** Viewport dimensions */
  viewportHeight?: number;
  viewportTop?: number;
  /** Callbacks */
  onItemSelect?: (item: CoreItem) => void;
  onItemHighlight?: (charRange: [number, number] | null) => void;
}

// ============================================================================
// Status Badge Component
// ============================================================================

const StatusBadge = memo(function StatusBadge({
  source,
  cached,
  inputChars,
  timeMs,
}: {
  source: ExtractionSource;
  cached: boolean;
  inputChars: number;
  timeMs: number;
}) {
  const sourceLabels: Record<ExtractionSource, string> = {
    selection: 'Selection',
    viewport: 'Viewport',
    'paragraph-window': 'Page',
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="px-2 py-0.5 bg-purple-600/30 text-purple-300 rounded">
        {sourceLabels[source]}
      </span>
      {cached && (
        <span className="px-2 py-0.5 bg-green-600/30 text-green-300 rounded">
          Cached
        </span>
      )}
      <span className="text-gray-500">
        {inputChars} chars · {Math.round(timeMs)}ms
      </span>
    </div>
  );
});

// ============================================================================
// Core Stream Component
// ============================================================================

export const CoreStream = memo(function CoreStream({
  documentId,
  pageNumber,
  pageText,
  chapter,
  textItems,
  selection,
  scrollY = 0,
  viewportHeight = 800,
  viewportTop = 0,
  onItemSelect,
  onItemHighlight,
}: CoreStreamProps) {
  // State
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Stream controller ref
  const streamController = useRef(createStreamController());
  const lastRequestKey = useRef<string>('');

  // Debounce ref
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build request
  const buildRequest = useCallback((): PipelineRequest => {
    return {
      bookId: documentId,
      pageNumber,
      chapter,
      textItems: textItems?.map((item) => ({
        str: item.str,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
      })),
      pageText,
      selection: selection ? { text: selection } : undefined,
      viewport: {
        topY: viewportTop,
        bottomY: viewportTop + viewportHeight,
        pageHeight: viewportHeight * 2, // Estimate
      },
      scrollY,
    };
  }, [documentId, pageNumber, chapter, textItems, pageText, selection, viewportTop, viewportHeight, scrollY]);

  // Generate request key for deduplication
  const getRequestKey = useCallback((req: PipelineRequest): string => {
    const selectionPart = req.selection?.text?.slice(0, 50) || '';
    return `${req.bookId}|${req.pageNumber}|${req.scrollY}|${selectionPart}`;
  }, []);

  // Perform extraction
  const performExtraction = useCallback(async () => {
    const request = buildRequest();
    const requestKey = getRequestKey(request);

    // Skip if same request
    if (requestKey === lastRequestKey.current && result?.success) {
      return;
    }

    lastRequestKey.current = requestKey;
    setIsExtracting(true);
    setError(null);

    try {
      const extractionResult = await streamController.current.extract(request);
      setResult(extractionResult);

      if (!extractionResult.success) {
        setError(extractionResult.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setIsExtracting(false);
    }
  }, [buildRequest, getRequestKey, result]);

  // Debounced extraction on changes
  useEffect(() => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    // Immediate extraction for selection
    if (selection && selection.length > 20) {
      performExtraction();
      return;
    }

    // Debounced extraction for scroll/page changes
    debounceTimeout.current = setTimeout(() => {
      performExtraction();
    }, 150);

    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [documentId, pageNumber, scrollY, selection, performExtraction]);

  // Initial extraction
  useEffect(() => {
    if (pageText) {
      performExtraction();
    }
  }, [documentId, pageNumber]);

  // Handle item click
  const handleItemClick = useCallback((item: CoreItem) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }
      return next;
    });
    onItemSelect?.(item);
  }, [onItemSelect]);

  // Get items
  const items = result?.data?.items ?? [];

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚡</span>
            <h2 className="text-sm font-semibold text-white">Core Stream</h2>
            <span className="px-1.5 py-0.5 text-xs bg-purple-600/20 text-purple-300 rounded">
              Live
            </span>
            {isExtracting && (
              <span className="text-xs text-gray-400 animate-pulse">
                Extracting...
              </span>
            )}
          </div>
        </div>

        {/* Status */}
        {result && (
          <StatusBadge
            source={result.source}
            cached={result.cached}
            inputChars={result.inputChars}
            timeMs={result.extractionTimeMs}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Error State */}
        {error && !isExtracting && (
          <div className="p-4 m-4 bg-red-900/20 border border-red-600/30 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={performExtraction}
              className="mt-2 px-3 py-1 text-xs bg-red-600/30 hover:bg-red-600/50 text-red-300 rounded transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Extracting State */}
        {isExtracting && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-pulse text-4xl mb-3">⚡</div>
            <p className="text-sm text-gray-400">
              Extracting Core...
              <span className="text-purple-400 ml-1">
                ({selection ? 'selection' : 'page-only'})
              </span>
            </p>
          </div>
        )}

        {/* Empty State */}
        {!isExtracting && !error && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <div className="text-4xl mb-3">⚡</div>
            <p className="text-sm text-gray-400">
              {!pageText
                ? 'Load a document to see Core concepts'
                : 'No core concepts in current view'}
            </p>
            <p className="text-xs text-gray-500 mt-2 max-w-[200px]">
              Select text or scroll to extract concepts. Core follows your reading position.
            </p>
          </div>
        )}

        {/* Core Items */}
        {items.length > 0 && (
          <div className="p-4 space-y-3">
            {items.map((item) => (
              <CoreStreamCard
                key={item.id}
                item={item}
                isExpanded={expandedItems.has(item.id)}
                onClick={() => handleItemClick(item)}
                onHighlight={(range) => onItemHighlight?.(range)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      {result?.data && (
        <div className="px-4 py-2 border-t border-gray-700/30 text-xs text-gray-500">
          <span>
            {result.data.stats.items_returned} items ·{' '}
            Page {result.data.scope.page}
          </span>
          {result.data.stop_reason === 'cap_reached' && (
            <span className="ml-2 text-yellow-500">(cap reached)</span>
          )}
        </div>
      )}
    </div>
  );
});

// ============================================================================
// Core Stream Card (Collapsed by default)
// ============================================================================

interface CoreStreamCardProps {
  item: CoreItem;
  isExpanded: boolean;
  onClick: () => void;
  onHighlight?: (charRange: [number, number] | null) => void;
}

const CoreStreamCard = memo(function CoreStreamCard({
  item,
  isExpanded,
  onClick,
  onHighlight,
}: CoreStreamCardProps) {
  // Collapsed: 1 sentence max
  const displayText = isExpanded
    ? item.core_sentence
    : item.core_sentence.length > 100
    ? item.core_sentence.slice(0, 100) + '...'
    : item.core_sentence;

  return (
    <div
      className={`p-3 rounded-lg border cursor-pointer transition-all ${
        isExpanded
          ? 'bg-purple-900/30 border-purple-500/50'
          : 'bg-gray-800/50 border-gray-700/50 hover:border-gray-600'
      }`}
      onClick={onClick}
    >
      {/* Triggers */}
      <div className="flex items-center gap-1 mb-2">
        {item.triggers.map((trigger, i) => (
          <span
            key={i}
            className="px-1.5 py-0.5 text-[10px] font-mono bg-purple-600/30 text-purple-300 rounded"
            title={TRIGGER_LABELS[trigger]}
          >
            {trigger}
          </span>
        ))}
        <span className="ml-auto text-xs text-gray-500">
          {Math.round(item.confidence * 100)}%
        </span>
      </div>

      {/* Core Sentence */}
      <p className="text-sm text-gray-200 leading-relaxed">
        {displayText}
      </p>

      {/* Expanded: Show exceptions and attachments */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-gray-700/50 space-y-2">
          {/* Exceptions */}
          {item.exceptions.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Exceptions:</p>
              {item.exceptions.map((exc, i) => (
                <p key={i} className="text-xs text-orange-300 pl-2 border-l border-orange-500/50">
                  {exc.sentence}
                </p>
              ))}
            </div>
          )}

          {/* Attachments */}
          <div className="flex gap-2">
            {item.attachments_available.procedure && (
              <button className="px-2 py-1 text-[10px] bg-blue-600/20 text-blue-300 rounded hover:bg-blue-600/30">
                📋 Procedure
              </button>
            )}
            {item.attachments_available.example && (
              <button className="px-2 py-1 text-[10px] bg-green-600/20 text-green-300 rounded hover:bg-green-600/30">
                💡 Example
              </button>
            )}
            {item.attachments_available.visual && (
              <button className="px-2 py-1 text-[10px] bg-yellow-600/20 text-yellow-300 rounded hover:bg-yellow-600/30">
                🖼️ Visual
              </button>
            )}
          </div>

          {/* Source */}
          <p className="text-[10px] text-gray-500">
            Page {item.source.page}
            {item.source.paragraph_index !== null && ` · ¶${item.source.paragraph_index + 1}`}
          </p>
        </div>
      )}

      {/* Expand indicator */}
      {!isExpanded && (item.exceptions.length > 0 || Object.values(item.attachments_available).some(Boolean)) && (
        <div className="mt-2 text-[10px] text-gray-500">
          Click to expand
        </div>
      )}
    </div>
  );
});

export default CoreStream;
