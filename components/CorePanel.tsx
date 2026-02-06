"use client";

import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { CoreCardList, CoreStats } from './CoreCard';
import {
  extractFromPage,
  createScrollDebouncer,
  type CoreItem,
  type CoreResponse,
  type ExtractionResult,
  CORE_LIMITS,
} from '../lib/core';

// ============================================================================
// Types
// ============================================================================

interface CorePanelProps {
  documentId: string;
  pageNumber: number;
  pageText: string;
  chapter?: string;
  scrollY?: number;
  viewportHeight?: number;
  onItemSelect?: (item: CoreItem) => void;
  onItemHighlight?: (charRange: [number, number] | null) => void;
}

type ExtractionStatus = 'idle' | 'extracting' | 'success' | 'error';

// ============================================================================
// Core Panel Component
// ============================================================================

export const CorePanel = memo(function CorePanel({
  documentId,
  pageNumber,
  pageText,
  chapter,
  scrollY = 0,
  viewportHeight = 800,
  onItemSelect,
  onItemHighlight,
}: CorePanelProps) {
  // State
  const [status, setStatus] = useState<ExtractionStatus>('idle');
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [autoExtract, setAutoExtract] = useState(true);

  // Refs
  const lastExtractionKey = useRef<string>('');

  // Debounced scroll handler
  const handleScrollChange = useCallback(
    createScrollDebouncer((newScrollY: number) => {
      if (autoExtract && pageText) {
        performExtraction(newScrollY);
      }
    }, 300),
    [documentId, pageNumber, pageText, autoExtract]
  );

  // Extraction function
  const performExtraction = useCallback(async (currentScrollY: number = scrollY) => {
    if (!pageText || pageText.trim().length === 0) {
      setStatus('idle');
      setResult(null);
      return;
    }

    // Generate key to check if we already extracted this
    const extractionKey = `${documentId}:${pageNumber}:${Math.floor(currentScrollY / 100)}`;
    if (extractionKey === lastExtractionKey.current && result?.success) {
      return; // Already extracted this view
    }

    setStatus('extracting');

    try {
      const extractionResult = await extractFromPage(
        documentId,
        pageNumber,
        pageText,
        currentScrollY,
        viewportHeight,
        chapter
      );

      setResult(extractionResult);
      setStatus(extractionResult.success ? 'success' : 'error');
      lastExtractionKey.current = extractionKey;
    } catch (error) {
      console.error('⚡ Core extraction error:', error);
      setStatus('error');
      setResult({
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        cached: false,
        extractionTimeMs: 0,
      });
    }
  }, [documentId, pageNumber, pageText, scrollY, viewportHeight, chapter, result]);

  // Handle scroll changes
  useEffect(() => {
    handleScrollChange(scrollY);
  }, [scrollY, handleScrollChange]);

  // Initial extraction on mount/page change
  useEffect(() => {
    if (autoExtract && pageText) {
      performExtraction();
    }
  }, [documentId, pageNumber, pageText, autoExtract]);

  // Handle item selection
  const handleItemSelect = useCallback((item: CoreItem) => {
    setHighlightedId(item.id);
    onItemSelect?.(item);
    onItemHighlight?.(item.source.char_range);
  }, [onItemSelect, onItemHighlight]);

  // Handle attachment request
  const handleAttachmentRequest = useCallback((item: CoreItem, type: 'procedure' | 'example' | 'visual') => {
    console.log('⚡ Attachment requested:', type, 'for item:', item.id);
    // TODO: Implement lazy attachment loading
  }, []);

  // Clear highlight
  const handleClearHighlight = useCallback(() => {
    setHighlightedId(null);
    onItemHighlight?.(null);
  }, [onItemHighlight]);

  // Get items from result
  const items = result?.data?.items ?? [];
  const stats = result?.data?.stats;

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚡</span>
          <h2 className="text-sm font-semibold text-white">Core</h2>
          {result?.cached && (
            <span className="px-1.5 py-0.5 text-xs bg-green-600/20 text-green-400 rounded">
              cached
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Auto-extract toggle */}
          <button
            onClick={() => setAutoExtract(!autoExtract)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              autoExtract
                ? 'bg-purple-600/30 text-purple-300'
                : 'bg-gray-700/50 text-gray-400'
            }`}
            title={autoExtract ? 'Auto-extract on scroll' : 'Manual extraction'}
          >
            {autoExtract ? '🔄 Auto' : '⏸️ Manual'}
          </button>

          {/* Manual extract button */}
          {!autoExtract && (
            <button
              onClick={() => performExtraction()}
              disabled={status === 'extracting'}
              className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white rounded transition-colors"
            >
              Extract
            </button>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="px-4 py-2 border-b border-gray-700/30">
          <CoreStats stats={stats} extractionTimeMs={result?.extractionTimeMs} />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {status === 'extracting' && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-pulse text-4xl mb-3">⚡</div>
            <p className="text-sm text-gray-400">Extracting core concepts...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <p className="text-sm text-red-400">Extraction failed</p>
            <p className="text-xs text-gray-500 mt-1">{result?.error}</p>
            <button
              onClick={() => performExtraction()}
              className="mt-3 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {status !== 'extracting' && status !== 'error' && (
          <CoreCardList
            items={items}
            highlightedId={highlightedId}
            onSelectItem={handleItemSelect}
            onRequestAttachment={handleAttachmentRequest}
            emptyMessage={
              pageText
                ? 'No core concepts found in current view.'
                : 'Load a document to extract concepts.'
            }
          />
        )}
      </div>

      {/* Footer - Paragraph Window Info */}
      {result?.data && (
        <div className="px-4 py-2 border-t border-gray-700/30 text-xs text-gray-500">
          <span>
            Paragraphs {result.data.scope.paragraph_range[0] + 1}-{result.data.scope.paragraph_range[1]}
          </span>
          <span className="mx-2">·</span>
          <span>
            Window: {CORE_LIMITS.DEFAULT_PARAGRAPH_WINDOW}
          </span>
          {highlightedId && (
            <>
              <span className="mx-2">·</span>
              <button
                onClick={handleClearHighlight}
                className="text-purple-400 hover:text-purple-300"
              >
                Clear highlight
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default CorePanel;
