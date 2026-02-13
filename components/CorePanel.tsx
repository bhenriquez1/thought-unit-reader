"use client";

import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { CoreCardList, CoreStats } from './CoreCard';
import type { CoreConcept, CoreExtractResponse } from '@/lib/coreConceptSchema';
import {
  createScrollDebouncer,
  extractParagraphs,
  buildParagraphMeta,
  findParagraphAtScroll,
  getParagraphWindow,
  getCombinedText,
  type ParagraphMeta,
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
  onConceptSelect?: (concept: CoreConcept) => void;
}

type ExtractionStatus = 'idle' | 'extracting' | 'success' | 'error';

// ============================================================================
// Front Matter Detection - Filter non-study content
// ============================================================================

const FRONT_MATTER_KEYWORDS = [
  'acknowledgements', 'acknowledgments', 'contributors', 'preface',
  'copyright', 'front matter', 'table of contents', 'dedication',
  'foreword', 'about the author', 'author bio', 'about the authors',
  'publisher', 'isbn', 'edition', 'all rights reserved',
  'printed in', 'library of congress', 'cataloging'
];

function isFrontMatterPage(pageText: string, chapter?: string): boolean {
  const textLower = (pageText || '').toLowerCase();
  const chapterLower = (chapter || '').toLowerCase();

  // Check chapter title
  for (const keyword of FRONT_MATTER_KEYWORDS) {
    if (chapterLower.includes(keyword)) return true;
  }

  // Check page content (first 500 chars for efficiency)
  const contentSample = textLower.slice(0, 500);
  let matchCount = 0;
  for (const keyword of FRONT_MATTER_KEYWORDS) {
    if (contentSample.includes(keyword)) matchCount++;
  }

  // If 2+ front matter keywords found, it's likely front matter
  return matchCount >= 2;
}

// ============================================================================
// Per-Page Concept Cache
// ============================================================================

interface PageConceptCache {
  concepts: CoreConcept[];
  extractionTimeMs?: number;
  timestamp: number;
}

const conceptCache = new Map<string, PageConceptCache>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCacheKey(docId: string, page: number): string {
  return `${docId}:${page}`;
}

function getCachedConcepts(docId: string, page: number): PageConceptCache | null {
  const key = getCacheKey(docId, page);
  const cached = conceptCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    conceptCache.delete(key);
    return null;
  }
  return cached;
}

function setCachedConcepts(docId: string, page: number, concepts: CoreConcept[], extractionTimeMs?: number): void {
  const key = getCacheKey(docId, page);
  conceptCache.set(key, { concepts, extractionTimeMs, timestamp: Date.now() });

  // LRU cleanup - keep max 50 pages cached
  if (conceptCache.size > 50) {
    const oldest = Array.from(conceptCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) conceptCache.delete(oldest[0]);
  }
}

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
  onConceptSelect,
}: CorePanelProps) {
  // State
  const [status, setStatus] = useState<ExtractionStatus>('idle');
  const [concepts, setConcepts] = useState<CoreConcept[]>([]);
  const [extractionTimeMs, setExtractionTimeMs] = useState<number | undefined>(undefined);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [autoExtract, setAutoExtract] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [windowText, setWindowText] = useState('');
  const [isFrontMatter, setIsFrontMatter] = useState(false);

  // Refs
  const lastExtractionKey = useRef<string>('');
  const lastScrollY = useRef<number>(0);
  const lastPageNumber = useRef<number>(pageNumber);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Clear concepts and cancel in-flight requests when page changes
  useEffect(() => {
    if (pageNumber !== lastPageNumber.current) {
      // Cancel any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // Check cache first
      const cached = getCachedConcepts(documentId, pageNumber);
      if (cached) {
        setConcepts(cached.concepts);
        setExtractionTimeMs(cached.extractionTimeMs);
        setStatus('success');
        console.log(`📦 Page ${pageNumber} loaded from cache (${cached.concepts.length} concepts)`);
      } else {
        // Clear state for new page
        setConcepts([]);
        setExtractionTimeMs(undefined);
        setStatus('idle');
      }

      // Check if front matter
      setIsFrontMatter(isFrontMatterPage(pageText, chapter));

      lastExtractionKey.current = '';
      lastScrollY.current = 0;
      lastPageNumber.current = pageNumber;
    }
  }, [pageNumber, documentId, pageText, chapter]);

  // Parse paragraphs from page text
  const paragraphMeta = useMemo(() => {
    if (!pageText) return [];
    const rawParagraphs = extractParagraphs(pageText);
    return buildParagraphMeta(rawParagraphs, viewportHeight);
  }, [pageText, viewportHeight]);

  // Current paragraph window based on scroll
  const currentWindow = useMemo(() => {
    if (paragraphMeta.length === 0) return { start: 0, end: 0, center: 0 };
    const centerIndex = findParagraphAtScroll(scrollY, viewportHeight, paragraphMeta);
    const [start, end] = getParagraphWindow(centerIndex, paragraphMeta.length);
    return { start, end, center: centerIndex };
  }, [scrollY, viewportHeight, paragraphMeta]);

  // Check if scroll has changed significantly (new paragraph window)
  const hasSignificantScrollChange = useCallback((newScrollY: number) => {
    const oldCenter = findParagraphAtScroll(lastScrollY.current, viewportHeight, paragraphMeta);
    const newCenter = findParagraphAtScroll(newScrollY, viewportHeight, paragraphMeta);
    return oldCenter !== newCenter;
  }, [viewportHeight, paragraphMeta]);

  // Debounced scroll handler
  const handleScrollChange = useCallback(
    createScrollDebouncer((newScrollY: number) => {
      if (autoExtract && pageText && hasSignificantScrollChange(newScrollY)) {
        lastScrollY.current = newScrollY;
        performExtraction(newScrollY);
      }
    }, 200),
    [documentId, pageNumber, pageText, autoExtract, hasSignificantScrollChange]
  );

  // Extraction function — calls /api/core/extract
  const performExtraction = useCallback(async (currentScrollY: number = scrollY) => {
    if (!pageText || pageText.trim().length === 0) {
      setStatus('idle');
      setConcepts([]);
      return;
    }

    // Skip extraction for front matter pages
    if (isFrontMatterPage(pageText, chapter)) {
      setIsFrontMatter(true);
      setStatus('idle');
      setConcepts([]);
      console.log(`⏭️ Skipping front matter page ${pageNumber}`);
      return;
    }

    // Check cache first
    const cached = getCachedConcepts(documentId, pageNumber);
    if (cached && cached.concepts.length > 0) {
      setConcepts(cached.concepts);
      setExtractionTimeMs(cached.extractionTimeMs);
      setStatus('success');
      console.log(`📦 Page ${pageNumber} served from cache`);
      return;
    }

    // Generate key based on paragraph window
    const centerParagraph = findParagraphAtScroll(currentScrollY, viewportHeight, paragraphMeta);
    const [windowStart, windowEnd] = getParagraphWindow(centerParagraph, paragraphMeta.length);
    const extractionKey = `${documentId}:${pageNumber}:p${windowStart}-${windowEnd}`;

    if (extractionKey === lastExtractionKey.current && concepts.length > 0) {
      return; // Already extracted this paragraph window
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setStatus('extracting');
    setErrorMessage(null);

    try {
      // Build window text from paragraphs
      const windowParagraphs = paragraphMeta.slice(windowStart, windowEnd);
      const combinedText = getCombinedText(windowParagraphs);
      setWindowText(combinedText);

      const res = await fetch('/api/core/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docId: documentId,
          chapterId: chapter,
          page: pageNumber,
          windowIndex: windowStart,
          windowText: combinedText,
          context: { sectionHint: chapter },
          mode: 'page_window' as const,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: CoreExtractResponse = await res.json();

      // Cache the results
      setCachedConcepts(documentId, pageNumber, data.concepts, data.meta.ms);

      setConcepts(data.concepts);
      setExtractionTimeMs(data.meta.ms);
      setStatus('success');
      lastExtractionKey.current = extractionKey;
      console.log(`✅ Page ${pageNumber} extracted (${data.concepts.length} concepts in ${data.meta.ms}ms)`);
    } catch (error) {
      // Ignore abort errors
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`🚫 Extraction cancelled for page ${pageNumber}`);
        return;
      }
      console.error('Core extraction error:', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
    }
  }, [documentId, pageNumber, pageText, scrollY, viewportHeight, chapter, concepts.length, paragraphMeta]);

  // Handle scroll changes
  useEffect(() => {
    handleScrollChange(scrollY);
  }, [scrollY, handleScrollChange]);

  // Initial extraction on mount/page change
  useEffect(() => {
    if (autoExtract && pageText && !isFrontMatter) {
      performExtraction();
    }
  }, [documentId, pageNumber, pageText, autoExtract, isFrontMatter]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Handle concept selection
  const handleConceptSelect = useCallback((concept: CoreConcept) => {
    setHighlightedId(concept.id);
    onConceptSelect?.(concept);
  }, [onConceptSelect]);

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚡</span>
          <h2 className="text-sm font-semibold text-white">Core Concepts</h2>
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
            {autoExtract ? 'Auto' : 'Manual'}
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
      {concepts.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-700/30">
          <CoreStats
            conceptCount={concepts.length}
            maxConcepts={8}
            extractionTimeMs={extractionTimeMs}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Front Matter Detection */}
        {isFrontMatter && concepts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-4xl mb-3">📄</div>
            <p className="text-sm text-gray-400">Front matter detected</p>
            <p className="text-xs text-gray-500 mt-1">
              This page appears to be acknowledgements, preface, or copyright info.
            </p>
            <button
              onClick={() => {
                setIsFrontMatter(false);
                performExtraction();
              }}
              className="mt-3 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            >
              Extract anyway
            </button>
          </div>
        )}

        {status === 'extracting' && concepts.length === 0 && !isFrontMatter && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-pulse text-4xl mb-3">⚡</div>
            <p className="text-sm text-gray-400">Extracting core concepts...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <p className="text-sm text-red-400">Extraction failed</p>
            <p className="text-xs text-gray-500 mt-1">{errorMessage}</p>
            <button
              onClick={() => performExtraction()}
              className="mt-3 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {status !== 'extracting' && status !== 'error' && (
          <>
            {/* Paragraph Window Indicator */}
            {paragraphMeta.length > 0 && concepts.length === 0 && (
              <div className="mb-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                  <span>Reading paragraphs {currentWindow.start + 1}-{currentWindow.end}</span>
                  <span>{paragraphMeta.length} total</span>
                </div>
                <div className="flex gap-0.5">
                  {paragraphMeta.slice(0, 20).map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full ${
                        i >= currentWindow.start && i < currentWindow.end
                          ? 'bg-purple-500'
                          : 'bg-gray-700'
                      }`}
                    />
                  ))}
                  {paragraphMeta.length > 20 && (
                    <span className="text-[10px] text-gray-500 ml-1">+{paragraphMeta.length - 20}</span>
                  )}
                </div>
              </div>
            )}
            <CoreCardList
              concepts={concepts}
              docId={documentId}
              windowText={windowText}
              highlightedId={highlightedId}
              onSelectConcept={handleConceptSelect}
              emptyMessage={
                !pageText
                  ? 'Select text or change page to extract concepts.'
                  : paragraphMeta.length === 0
                  ? 'No text layer detected. Try OCR mode or another PDF.'
                  : 'Select text or change page to extract concepts.'
              }
            />
          </>
        )}
      </div>

      {/* Footer */}
      {concepts.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-700/30 text-xs text-gray-500">
          <span>
            Paragraphs {currentWindow.start + 1}-{currentWindow.end}
          </span>
          <span className="mx-2">·</span>
          <span>
            Window: {CORE_LIMITS.DEFAULT_PARAGRAPH_WINDOW}
          </span>
          {highlightedId && (
            <>
              <span className="mx-2">·</span>
              <button
                onClick={() => setHighlightedId(null)}
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
