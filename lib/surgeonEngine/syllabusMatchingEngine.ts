// lib/surgeonEngine/syllabusMatchingEngine.ts
// 3-Pass Syllabus Matching Engine
// Pass A: Exact/Structural TOC match
// Pass B: Semantic match (topic <-> TOC headings + section summaries)
// Pass C: Evidence/page-level rescue via keyword hit density

import type {
  SyllabusItem,
  MappingCandidate,
  SyllabusMappingResult,
  UserTrainingSignal,
  TocNode,
  ExtractedUnit,
  ConfidenceBand,
  ReasonCode,
  ID,
} from './types';

// ============================================================================
// Text Normalization
// ============================================================================

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'chapter', 'section', 'part', 'unit', 'page', 'pages', 'pp', 'lecture',
  'week', 'module', 'reading', 'assignment', 'homework', 'lab', 'review',
  'exam', 'quiz', 'test', 'study', 'introduction', 'overview',
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

// ============================================================================
// Pass A: Exact/Structural Match
// ============================================================================

interface PassAResult {
  tocId: ID;
  headingScore: number;
  reasonCodes: ReasonCode[];
  matchedHeading?: string;
}

function passAExactMatch(
  syllabusItem: SyllabusItem,
  tocNodes: TocNode[],
  trainingSignals: UserTrainingSignal[]
): PassAResult[] {
  const results: PassAResult[] = [];
  const normalizedTitle = normalize(syllabusItem.title);
  const titleTokens = tokenize(syllabusItem.title);

  // Check training signals (aliases) first
  for (const signal of trainingSignals) {
    if (signal.syllabusId === syllabusItem.syllabusId && signal.acceptedCandidate.tocId) {
      results.push({
        tocId: signal.acceptedCandidate.tocId,
        headingScore: 1.0,
        reasonCodes: ['USER_TRAINED'],
        matchedHeading: 'User-trained mapping',
      });
    }
  }

  for (const node of flattenToc(tocNodes)) {
    const normalizedHeading = normalize(node.title);
    let headingScore = 0;
    const reasonCodes: ReasonCode[] = [];

    // Exact match
    if (normalizedTitle === normalizedHeading || normalizedTitle.includes(normalizedHeading) || normalizedHeading.includes(normalizedTitle)) {
      headingScore = 1.0;
      reasonCodes.push('TOC_EXACT');
    }

    // Chapter/Unit number match
    const chapterMatch = syllabusItem.title.match(/chapter\s*(\d+)/i) || syllabusItem.title.match(/ch\.?\s*(\d+)/i);
    const tocChapterMatch = node.title.match(/chapter\s*(\d+)/i) || node.title.match(/ch\.?\s*(\d+)/i);
    if (chapterMatch && tocChapterMatch && chapterMatch[1] === tocChapterMatch[1]) {
      headingScore = Math.max(headingScore, 0.9);
      reasonCodes.push('TOC_EXACT');
    }

    // Unit number match
    const unitMatch = syllabusItem.title.match(/unit\s*(\d+)/i);
    const tocUnitMatch = node.title.match(/unit\s*(\d+)/i);
    if (unitMatch && tocUnitMatch && unitMatch[1] === tocUnitMatch[1]) {
      headingScore = Math.max(headingScore, 0.85);
      reasonCodes.push('TOC_EXACT');
    }

    // Token overlap (partial structural match)
    if (headingScore === 0) {
      const headingTokens = tokenize(node.title);
      if (headingTokens.length > 0 && titleTokens.length > 0) {
        const overlap = titleTokens.filter(t => headingTokens.includes(t)).length;
        const overlapRatio = overlap / Math.min(titleTokens.length, headingTokens.length);
        if (overlapRatio >= 0.7) {
          headingScore = 0.7 + overlapRatio * 0.2;
          reasonCodes.push('TOC_ALIAS');
        }
      }
    }

    if (headingScore > 0.3) {
      results.push({
        tocId: node.tocId,
        headingScore,
        reasonCodes,
        matchedHeading: node.title,
      });
    }
  }

  return results.sort((a, b) => b.headingScore - a.headingScore);
}

// ============================================================================
// Pass B: Semantic Match
// ============================================================================

/**
 * Compute TF-IDF-like similarity between two token sets
 */
function computeTokenSimilarity(tokens1: string[], tokens2: string[]): number {
  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  let intersection = 0;
  for (const t of set1) {
    if (set2.has(t)) intersection++;
  }

  const union = set1.size + set2.size - intersection;
  if (union === 0) return 0;

  // Jaccard similarity
  const jaccard = intersection / union;

  // Boost for longer overlap
  const overlapBoost = Math.min(1, intersection / 3);

  return jaccard * 0.6 + overlapBoost * 0.4;
}

/**
 * Build section summaries from first few units in each TOC section
 */
function buildSectionSummary(
  tocNode: TocNode,
  units: ExtractedUnit[]
): string {
  const pageRange = {
    start: tocNode.pageStart || 0,
    end: tocNode.pageEnd || (tocNode.pageStart ? tocNode.pageStart + 10 : 10),
  };

  const sectionUnits = units.filter(
    u => u.page >= pageRange.start && u.page <= pageRange.end
  ).slice(0, 3);

  return sectionUnits.map(u => u.cleanText || u.text).join(' ');
}

interface PassBResult {
  tocId: ID;
  semanticScore: number;
  keywordScore: number;
  reasonCodes: ReasonCode[];
  matchedHeading?: string;
}

function passBSemanticMatch(
  syllabusItem: SyllabusItem,
  tocNodes: TocNode[],
  units: ExtractedUnit[]
): PassBResult[] {
  const results: PassBResult[] = [];
  const topicTokens = tokenize(
    [syllabusItem.title, syllabusItem.description || '', ...(syllabusItem.keywords || [])].join(' ')
  );

  for (const node of flattenToc(tocNodes)) {
    const headingTokens = tokenize(node.title);

    // 1) Similarity between topic and heading (high weight)
    const headingSim = computeTokenSimilarity(topicTokens, headingTokens);

    // 2) Similarity between topic and section summary (medium weight)
    const summary = buildSectionSummary(node, units);
    const summaryTokens = tokenize(summary);
    const summarySim = computeTokenSimilarity(topicTokens, summaryTokens);

    // 3) Keyword overlap (medium weight)
    const keywords = syllabusItem.keywords || [];
    const keywordTokens = keywords.flatMap(k => tokenize(k));
    const keywordSim = computeTokenSimilarity(keywordTokens, [...headingTokens, ...summaryTokens]);

    // Weighted semantic score
    const semanticScore = headingSim * 0.5 + summarySim * 0.3 + keywordSim * 0.2;
    const keywordScore = keywordSim;

    const reasonCodes: ReasonCode[] = [];
    if (semanticScore > 0.3) reasonCodes.push('SEMANTIC_HIGH');
    if (keywordSim > 0.3) reasonCodes.push('KEYWORD_OVERLAP');

    if (semanticScore > 0.1) {
      results.push({
        tocId: node.tocId,
        semanticScore,
        keywordScore,
        reasonCodes,
        matchedHeading: node.title,
      });
    }
  }

  return results.sort((a, b) => b.semanticScore - a.semanticScore);
}

// ============================================================================
// Pass C: Evidence/Page-Level Rescue
// ============================================================================

interface PassCResult {
  pageRange: { start: number; end: number };
  unitIds: ID[];
  pageDensity: number;
  reasonCodes: ReasonCode[];
}

function passCEvidenceRescue(
  syllabusItem: SyllabusItem,
  units: ExtractedUnit[]
): PassCResult[] {
  const topicTokens = tokenize(
    [syllabusItem.title, syllabusItem.description || '', ...(syllabusItem.keywords || [])].join(' ')
  );

  if (topicTokens.length === 0) return [];

  // BM25-like keyword search across all units
  const unitScores: { unit: ExtractedUnit; score: number }[] = [];
  for (const unit of units) {
    const unitTokens = tokenize(unit.cleanText || unit.text);
    let hits = 0;
    for (const token of topicTokens) {
      if (unitTokens.includes(token)) hits++;
    }
    const score = hits / Math.max(topicTokens.length, 1);
    if (score > 0.15) {
      unitScores.push({ unit, score });
    }
  }

  if (unitScores.length === 0) return [];

  // Sort by score descending
  unitScores.sort((a, b) => b.score - a.score);

  // Build page clusters from top hits
  const pageHits: Record<number, { count: number; unitIds: ID[] }> = {};
  for (const { unit } of unitScores.slice(0, 20)) {
    if (!pageHits[unit.page]) {
      pageHits[unit.page] = { count: 0, unitIds: [] };
    }
    pageHits[unit.page].count++;
    pageHits[unit.page].unitIds.push(unit.unitId);
  }

  // Find dense page ranges
  const pages = Object.keys(pageHits).map(Number).sort((a, b) => a - b);
  if (pages.length === 0) return [];

  // Group contiguous pages
  const clusters: PassCResult[] = [];
  let clusterStart = pages[0];
  let clusterEnd = pages[0];
  let clusterUnitIds: ID[] = [...pageHits[pages[0]].unitIds];
  let clusterDensity = pageHits[pages[0]].count;

  for (let i = 1; i < pages.length; i++) {
    if (pages[i] - clusterEnd <= 2) {
      // Extend cluster
      clusterEnd = pages[i];
      clusterUnitIds.push(...pageHits[pages[i]].unitIds);
      clusterDensity += pageHits[pages[i]].count;
    } else {
      // Save current cluster and start new
      clusters.push({
        pageRange: { start: clusterStart, end: clusterEnd },
        unitIds: clusterUnitIds,
        pageDensity: clusterDensity / (clusterEnd - clusterStart + 1),
        reasonCodes: ['PAGE_DENSITY', 'FALLBACK_EVIDENCE'],
      });
      clusterStart = pages[i];
      clusterEnd = pages[i];
      clusterUnitIds = [...pageHits[pages[i]].unitIds];
      clusterDensity = pageHits[pages[i]].count;
    }
  }

  // Don't forget last cluster
  clusters.push({
    pageRange: { start: clusterStart, end: clusterEnd },
    unitIds: clusterUnitIds,
    pageDensity: clusterDensity / (clusterEnd - clusterStart + 1),
    reasonCodes: ['PAGE_DENSITY', 'FALLBACK_EVIDENCE'],
  });

  return clusters.sort((a, b) => b.pageDensity - a.pageDensity);
}

// ============================================================================
// Confidence Score Computation
// ============================================================================

/**
 * C = 0.45*Semantic + 0.25*HeadingMatch + 0.20*KeywordOverlap + 0.10*PageDensity
 */
function computeConfidence(
  semanticScore: number,
  headingScore: number,
  keywordScore: number,
  pageDensity: number
): number {
  return (
    0.45 * semanticScore +
    0.25 * headingScore +
    0.20 * keywordScore +
    0.10 * Math.min(1, pageDensity)
  );
}

function assignBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.78) return 'AUTO';
  if (confidence >= 0.60) return 'REVIEW';
  return 'SUGGEST';
}

// ============================================================================
// Main 3-Pass Pipeline
// ============================================================================

/**
 * Run 3-pass matching pipeline for a single syllabus item
 */
export function matchSyllabusItem(
  syllabusItem: SyllabusItem,
  tocNodes: TocNode[],
  units: ExtractedUnit[],
  bookId: ID,
  trainingSignals: UserTrainingSignal[] = []
): SyllabusMappingResult {
  // Pass A: Exact/structural
  const passAResults = passAExactMatch(syllabusItem, tocNodes, trainingSignals);

  // Pass B: Semantic
  const passBResults = passBSemanticMatch(syllabusItem, tocNodes, units);

  // Pass C: Evidence rescue
  const passCResults = passCEvidenceRescue(syllabusItem, units);

  // Merge candidates from all passes
  const candidateMap = new Map<string, MappingCandidate>();

  // Add Pass A results
  for (const a of passAResults) {
    const key = a.tocId;
    const existing = candidateMap.get(key);
    const headingScore = a.headingScore;
    const confidence = computeConfidence(0, headingScore, 0, 0);

    if (!existing || confidence > existing.confidence) {
      candidateMap.set(key, {
        tocId: a.tocId,
        confidence,
        band: assignBand(confidence),
        reasonCodes: a.reasonCodes,
        debug: {
          headingScore,
          semanticScore: 0,
          keywordScore: 0,
          pageDensity: 0,
          matchedHeading: a.matchedHeading,
        },
      });
    }
  }

  // Merge Pass B results
  for (const b of passBResults) {
    const key = b.tocId;
    const existing = candidateMap.get(key);

    const headingScore = existing?.debug?.headingScore || 0;
    const confidence = computeConfidence(b.semanticScore, headingScore, b.keywordScore, 0);

    if (!existing || confidence > existing.confidence) {
      candidateMap.set(key, {
        tocId: b.tocId,
        confidence,
        band: assignBand(confidence),
        reasonCodes: [...(existing?.reasonCodes || []), ...b.reasonCodes],
        debug: {
          semanticScore: b.semanticScore,
          headingScore,
          keywordScore: b.keywordScore,
          pageDensity: 0,
          matchedHeading: b.matchedHeading || existing?.debug?.matchedHeading,
        },
      });
    } else if (existing) {
      // Update semantic score if better
      if (b.semanticScore > (existing.debug?.semanticScore || 0)) {
        existing.debug = {
          ...existing.debug,
          semanticScore: b.semanticScore,
          keywordScore: Math.max(existing.debug?.keywordScore || 0, b.keywordScore),
        };
        existing.confidence = computeConfidence(
          b.semanticScore,
          existing.debug.headingScore || 0,
          existing.debug.keywordScore || 0,
          existing.debug.pageDensity || 0
        );
        existing.band = assignBand(existing.confidence);
        existing.reasonCodes = [...new Set([...existing.reasonCodes, ...b.reasonCodes])];
      }
    }
  }

  // Merge Pass C (page-level rescue for low-confidence or missing candidates)
  for (const c of passCResults.slice(0, 3)) {
    // Find which TOC node owns this page range
    const ownerNode = findTocNodeForPageRange(tocNodes, c.pageRange);
    const key = ownerNode?.tocId || `page_${c.pageRange.start}_${c.pageRange.end}`;
    const existing = candidateMap.get(key);

    const headingScore = existing?.debug?.headingScore || 0;
    const semanticScore = existing?.debug?.semanticScore || 0;
    const keywordScore = existing?.debug?.keywordScore || 0;
    const confidence = computeConfidence(semanticScore, headingScore, keywordScore, c.pageDensity);

    if (!existing || confidence > existing.confidence) {
      candidateMap.set(key, {
        tocId: ownerNode?.tocId,
        pageRange: c.pageRange,
        unitIds: c.unitIds,
        confidence,
        band: assignBand(confidence),
        reasonCodes: [...(existing?.reasonCodes || []), ...c.reasonCodes],
        debug: {
          semanticScore,
          headingScore,
          keywordScore,
          pageDensity: c.pageDensity,
          matchedHeading: existing?.debug?.matchedHeading || ownerNode?.title,
        },
      });
    }
  }

  // Sort candidates by confidence
  const candidates = [...candidateMap.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3); // Top 3

  const chosen = candidates[0]?.band === 'AUTO' ? candidates[0] : undefined;
  const needsReview = !chosen || candidates.some(c => c.band === 'REVIEW');

  return {
    syllabusId: syllabusItem.syllabusId,
    bookId,
    chosen,
    candidates,
    needsReview,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Run pipeline for all syllabus items
 */
export function runSyllabusMatchingPipeline(
  syllabusItems: SyllabusItem[],
  tocNodes: TocNode[],
  units: ExtractedUnit[],
  bookId: ID,
  trainingSignals: UserTrainingSignal[] = []
): Record<ID, SyllabusMappingResult> {
  const results: Record<ID, SyllabusMappingResult> = {};

  for (const item of syllabusItems) {
    results[item.syllabusId] = matchSyllabusItem(
      item,
      tocNodes,
      units,
      bookId,
      trainingSignals
    );
  }

  return results;
}

/**
 * Apply user training (Accept/Adjust/Teach)
 */
export function applyTrainingSignal(
  signal: UserTrainingSignal,
  existingSignals: UserTrainingSignal[]
): UserTrainingSignal[] {
  // Remove any existing signal for same syllabusId + bookId
  const filtered = existingSignals.filter(
    s => !(s.syllabusId === signal.syllabusId && s.bookId === signal.bookId)
  );
  return [...filtered, signal];
}

// ============================================================================
// Utilities
// ============================================================================

function flattenToc(nodes: TocNode[], result: TocNode[] = []): TocNode[] {
  for (const node of nodes) {
    result.push(node);
    if (node.children) {
      flattenToc(node.children, result);
    }
  }
  return result;
}

function findTocNodeForPageRange(
  nodes: TocNode[],
  pageRange: { start: number; end: number }
): TocNode | undefined {
  const flat = flattenToc(nodes);
  return flat.find(
    n => n.pageStart !== undefined && n.pageEnd !== undefined &&
      n.pageStart <= pageRange.start && n.pageEnd >= pageRange.end
  ) || flat.find(
    n => n.pageStart !== undefined &&
      n.pageStart <= pageRange.start && (n.pageEnd || Infinity) >= pageRange.start
  );
}

export default {
  matchSyllabusItem,
  runSyllabusMatchingPipeline,
  applyTrainingSignal,
};
