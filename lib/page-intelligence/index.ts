// lib/page-intelligence/index.ts
// Main orchestrator for Page Intelligence pipeline
// Exports buildPageIntelligence() which runs the full comprehension pipeline

import { get, set } from 'idb-keyval';
import type {
  PageIntelligence,
  PageSource,
  BuildPageIntelligenceOptions,
} from './types';
import { generateId } from './types';
import { extractPageText, shouldUseOCR } from './extractor';
import { segmentText } from './segmenter';
import { detectSignals } from './signals';
import { extractRelations } from './relations';
import { clusterSegments, mergeSimilarClusters } from './clusters';
import { generateInsights } from './insights';
import { generateExplain } from './explain';
import { generateCards } from './cards';
import { buildParagraphUnits, buildQuoteHash } from './paragraphIntelligence';
import { annotateTraps } from './trapDetector';
import { buildStructureMap } from './structureMap';
import { buildInsightContinuity } from './continuity';

// ============================================================================
// Export Types
// ============================================================================

export * from './types';

// ============================================================================
// Export Individual Modules
// ============================================================================

export {
  extractPageText,
  shouldUseOCR,
  ocrDataUrlToText,
  renderPdfPageToDataUrl,
  getCachedOCR,
  cacheOCR,
  terminateOCRWorker,
} from './extractor';

export {
  segmentText,
  getHeadings,
  groupSegmentsByHeading,
  mergeConsecutiveLists,
} from './segmenter';

export {
  detectSignals,
  getSignalsByType,
  getHighScoringSignals,
  countSignalTypes,
  getTotalSignalScore,
  matchPattern,
  SIGNAL_PATTERNS,
} from './signals';

export {
  extractRelations,
  getRelationsByType,
  getRelationsForConcept,
  buildConceptGraph,
  formatRelation,
  RELATION_PATTERNS,
} from './relations';

export {
  clusterSegments,
  mergeSimilarClusters,
  extractKeywords,
  jaccardSimilarity,
  getClusterSegments,
  findClusterForSegment,
} from './clusters';

export {
  generateInsights,
  calculateDATScore,
  getTopInsights,
  getInsightsByBadge,
  getInsightsByTag,
} from './insights';

export {
  generateExplain,
  generateExplainForSelection,
  PITFALL_PATTERNS,
} from './explain';

export {
  generateCards,
  generateCardsFromText,
  getCardsForDeck,
  getDueCards,
} from './cards';

export { buildParagraphUnits, buildQuoteHash } from './paragraphIntelligence';
export { detectParagraphTraps, annotateTraps } from './trapDetector';
export type { TrapHit, TrapKind } from './trapDetector';
export {
  buildPageTextIndex,
  resolveHighlight,
  getSpeechCursorY,
  getSpeechCursorBbox,
  TextLayerRegistry,
} from './textLayerIndex';
export type { TextToken, PageTextIndex, HighlightRegion } from './textLayerIndex';
export { buildStructureMap } from './structureMap';
export type { StructureMap, StructureMapNode, StructureMapStage } from './structureMap';
export { buildInsightContinuity } from './continuity';
export type { InsightContinuity } from './continuity';

// ============================================================================
// IndexedDB Cache for Page Intelligence Results
// ============================================================================

const CACHE_PREFIX = 'pageint:';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface CachedPageIntelligence {
  data: PageIntelligence;
  cachedAt: number;
}

async function getCachedPageIntelligence(
  docId: string,
  pageNumber: number
): Promise<PageIntelligence | null> {
  try {
    const key = `${CACHE_PREFIX}${docId}:${pageNumber}`;
    const cached = await get<CachedPageIntelligence>(key);

    if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
      return cached.data;
    }
    return null;
  } catch (error) {
    console.warn('[PageIntelligence] Cache read failed:', error);
    return null;
  }
}

async function cachePageIntelligence(
  docId: string,
  pageNumber: number,
  data: PageIntelligence
): Promise<void> {
  try {
    const key = `${CACHE_PREFIX}${docId}:${pageNumber}`;
    await set(key, { data, cachedAt: Date.now() });
  } catch (error) {
    console.warn('[PageIntelligence] Cache write failed:', error);
  }
}

// ============================================================================
// Main Orchestrator
// ============================================================================

export interface BuildPageIntelligenceResult {
  intelligence: PageIntelligence;
  fromCache: boolean;
  processingTimeMs: number;
}

/**
 * Build complete Page Intelligence for a single page
 *
 * Pipeline:
 * 1. Extract text (native or OCR fallback)
 * 2. Segment into paragraphs/headings/lists
 * 3. Detect signals (clinical/exam patterns)
 * 4. Extract relations (concept connections)
 * 5. Cluster segments by topic
 * 6. Generate insights with DAT scoring
 * 7. Generate explanation
 * 8. Generate study cards
 *
 * Results are cached in IndexedDB for performance
 */
export async function buildPageIntelligence(
  args: BuildPageIntelligenceOptions
): Promise<BuildPageIntelligenceResult> {
  const {
    pageNumber,
    getNativeText,
    getPageImageDataUrl,
    docId = 'default',
    options = {},
  } = args;

  const {
    ocrEnabled = true,
    datScoring = true,
    minTextLength = 40,
  } = options;

  const startTime = Date.now();

  // Check cache first
  const cached = await getCachedPageIntelligence(docId, pageNumber);
  if (cached) {
    return {
      intelligence: cached,
      fromCache: true,
      processingTimeMs: Date.now() - startTime,
    };
  }

  // Step 1: Extract page text (native or OCR)
  const pageText = await extractPageText({
    pageNumber,
    docId,
    getNativeText,
    getPageImageDataUrl,
    ocrEnabled,
    minTextLength,
  });

  const text = pageText.text;
  const source: PageSource = pageText.source;
  const confidence = pageText.confidence;

  // Handle empty text — return stub with always-populated continuity
  if (!text || text.trim().length < minTextLength) {
    const emptyContinuity = buildInsightContinuity([], [], [], []);
    const emptyResult: PageIntelligence = {
      pageNumber,
      source,
      confidence,
      segments: [],
      signals: [],
      relations: [],
      clusters: [],
      insights: [],
      explain: {
        summary: 'No text available for this page.',
        bullets: [],
        pitfalls: [],
      },
      cards: [],
      paragraphUnits: [],
      structureMap: { pageNumber, topic: `Page ${pageNumber}`, nodes: [], completeness: 0 },
      continuity: emptyContinuity,
      extractedAt: Date.now(),
    };

    return {
      intelligence: emptyResult,
      fromCache: false,
      processingTimeMs: Date.now() - startTime,
    };
  }

  // Step 2: Segment text
  const segments = segmentText(text, { pageNumber });

  // Step 2b: Build ranked paragraph units (role-classified with char offsets)
  //          then annotate each unit with trap detection results.
  // NOTE: buildParagraphUnits expects a 0-based pageIndex. pageNumber is 1-based,
  //       so we pass (pageNumber - 1) to keep pageIndex consistent with SourceRef.pageIndex
  //       which handleJumpToSource interprets as 0-based (targetPage = pageIndex + 1).
  const paragraphUnits = annotateTraps(buildParagraphUnits(text, pageNumber - 1, docId));

  // Step 3: Detect signals
  const signals = detectSignals({ segments });

  // Step 4: Extract relations
  const relations = extractRelations({ segments });

  // Step 5: Cluster segments
  let clusters = clusterSegments(segments);
  clusters = mergeSimilarClusters(clusters);

  // Step 6: Generate insights with DAT scoring
  const insights = generateInsights({
    segments,
    signals,
    relations,
    clusters,
    ocrConfidence: confidence,
  });

  // Step 7: Generate explanation
  const explain = generateExplain({
    segments,
    signals,
    insights,
  });

  // Step 8: Generate study cards
  const cards = generateCards({
    insights,
    segments,
    pageNumber,
    docId,
  });

  // Step 9: Build structure map (Definition → Mechanism → Application → Clinical)
  const structureMap = buildStructureMap(segments, signals, paragraphUnits, pageNumber);

  // Step 10: Build insight continuity (always-populated — never empty)
  const continuity = buildInsightContinuity(insights, segments, signals, paragraphUnits);

  // Build result
  const intelligence: PageIntelligence = {
    pageNumber,
    source,
    confidence,
    segments,
    signals,
    relations,
    clusters,
    insights,
    explain,
    cards,
    paragraphUnits,
    structureMap,
    continuity,
    extractedAt: Date.now(),
  };

  // Cache result
  await cachePageIntelligence(docId, pageNumber, intelligence);

  return {
    intelligence,
    fromCache: false,
    processingTimeMs: Date.now() - startTime,
  };
}

// ============================================================================
// Batch Processing
// ============================================================================

export interface BuildChapterIntelligenceOptions {
  docId: string;
  startPage: number;
  endPage: number;
  getPageText: (pageNumber: number) => Promise<string>;
  getPageImageDataUrl: (pageNumber: number) => Promise<string>;
  onProgress?: (current: number, total: number, pageNumber: number) => void;
  options?: {
    ocrEnabled?: boolean;
    datScoring?: boolean;
    minTextLength?: number;
  };
}

/**
 * Build Page Intelligence for multiple pages (chapter extraction)
 */
export async function buildChapterIntelligence(
  args: BuildChapterIntelligenceOptions
): Promise<PageIntelligence[]> {
  const {
    docId,
    startPage,
    endPage,
    getPageText,
    getPageImageDataUrl,
    onProgress,
    options = {},
  } = args;

  const results: PageIntelligence[] = [];
  const total = endPage - startPage + 1;

  for (let pageNumber = startPage; pageNumber <= endPage; pageNumber++) {
    const current = pageNumber - startPage + 1;
    onProgress?.(current, total, pageNumber);

    const result = await buildPageIntelligence({
      pageNumber,
      docId,
      getNativeText: () => getPageText(pageNumber),
      getPageImageDataUrl: () => getPageImageDataUrl(pageNumber),
      options,
    });

    results.push(result.intelligence);
  }

  return results;
}

// ============================================================================
// Utility: Clear cache for document
// ============================================================================

export async function clearPageIntelligenceCache(docId: string): Promise<void> {
  // Note: idb-keyval doesn't support prefix deletion
  // Individual entries will expire via TTL
  console.log(`[PageIntelligence] Cache for ${docId} will expire after TTL`);
}

// ============================================================================
// Utility: Force refresh page intelligence
// ============================================================================

export async function refreshPageIntelligence(
  args: BuildPageIntelligenceOptions
): Promise<BuildPageIntelligenceResult> {
  // Clear cache for this page first
  const { pageNumber, docId = 'default' } = args;
  const key = `${CACHE_PREFIX}${docId}:${pageNumber}`;
  await set(key, undefined);

  // Rebuild
  return buildPageIntelligence(args);
}
