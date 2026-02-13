// lib/courseIntelligence/matcher.ts
// Syllabus → TOC → Cluster Matching Algorithm
// Confidence-scored matching with manual correction support

import type {
  SyllabusBlock,
  ObjectiveMapping,
  ClusterMapping,
  MappingStatus,
  MatchingConfig,
} from './types';
import { DEFAULT_MATCHING_CONFIG } from './types';
import type { TocItem } from '../stores/tocStore';

// ============================================================================
// Text Processing Utilities
// ============================================================================

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'chapter', 'section', 'part', 'unit', 'page', 'pages', 'pp', 'lecture',
  'week', 'module', 'reading', 'assignment', 'homework', 'lab',
]);

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function extractKeywords(text: string): string[] {
  return tokenize(text);
}

// ============================================================================
// TF-IDF Scoring
// ============================================================================

interface TermFrequency {
  [term: string]: number;
}

function computeTermFrequency(tokens: string[]): TermFrequency {
  const tf: TermFrequency = {};
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1;
  }
  // Normalize by total tokens
  const total = tokens.length || 1;
  for (const term in tf) {
    tf[term] = tf[term] / total;
  }
  return tf;
}

function computeIDF(documents: string[][]): { [term: string]: number } {
  const docCount = documents.length;
  const termDocCount: { [term: string]: number } = {};

  for (const doc of documents) {
    const uniqueTerms = new Set(doc);
    for (const term of uniqueTerms) {
      termDocCount[term] = (termDocCount[term] || 0) + 1;
    }
  }

  const idf: { [term: string]: number } = {};
  for (const term in termDocCount) {
    idf[term] = Math.log((docCount + 1) / (termDocCount[term] + 1)) + 1;
  }

  return idf;
}

function computeTFIDFSimilarity(
  tokens1: string[],
  tokens2: string[],
  idf: { [term: string]: number }
): number {
  const tf1 = computeTermFrequency(tokens1);
  const tf2 = computeTermFrequency(tokens2);

  // Compute TF-IDF vectors
  const allTerms = new Set([...tokens1, ...tokens2]);
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (const term of allTerms) {
    const tfidf1 = (tf1[term] || 0) * (idf[term] || 1);
    const tfidf2 = (tf2[term] || 0) * (idf[term] || 1);

    dotProduct += tfidf1 * tfidf2;
    norm1 += tfidf1 * tfidf1;
    norm2 += tfidf2 * tfidf2;
  }

  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

// ============================================================================
// Structural Matching
// ============================================================================

interface StructuralMatch {
  score: number;
  matchedChapter: boolean;
  matchedPages: boolean;
  matchedKeywords: string[];
}

function computeStructuralMatch(
  block: SyllabusBlock,
  tocItem: TocItem
): StructuralMatch {
  let score = 0;
  let matchedChapter = false;
  let matchedPages = false;
  const matchedKeywords: string[] = [];

  // Chapter matching
  const blockChapters = block.extractedEntities.chapters;
  const tocChapterMatch = tocItem.title.match(/chapter\s*(\d+)/i);

  if (tocChapterMatch && blockChapters.length > 0) {
    const tocChapter = parseInt(tocChapterMatch[1]);
    if (blockChapters.includes(tocChapter)) {
      score += 0.5;
      matchedChapter = true;
    }
  }

  // Page range matching
  const blockPages = block.extractedEntities.pages;
  const tocPage = tocItem.pageNumber;

  if (blockPages.length > 0 && tocPage) {
    for (const range of blockPages) {
      if (tocPage >= range.start && tocPage <= range.end) {
        score += 0.3;
        matchedPages = true;
        break;
      }
    }
  }

  // Keyword matching
  const blockKeywords = new Set(block.extractedEntities.keywords.map((k) => k.toLowerCase()));
  const tocTokens = tokenize(tocItem.title);

  for (const token of tocTokens) {
    if (blockKeywords.has(token)) {
      matchedKeywords.push(token);
    }
  }

  if (matchedKeywords.length > 0) {
    score += Math.min(0.2, matchedKeywords.length * 0.05);
  }

  return {
    score: Math.min(1, score),
    matchedChapter,
    matchedPages,
    matchedKeywords,
  };
}

// ============================================================================
// Main Matching Algorithm
// ============================================================================

export interface MatchCandidate {
  tocItem: TocItem;
  textScore: number;
  embedScore: number;
  structScore: number;
  finalScore: number;
  reasons: string[];
}

/**
 * Generate match candidates for a syllabus block
 */
export function generateCandidates(
  block: SyllabusBlock,
  tocItems: TocItem[],
  config: MatchingConfig = DEFAULT_MATCHING_CONFIG
): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];

  // Flatten TOC
  const flatToc = flattenToc(tocItems);

  // Tokenize block
  const blockTokens = [
    ...tokenize(block.title),
    ...block.extractedEntities.keywords,
    ...block.extractedEntities.topics.flatMap((t) => tokenize(t)),
  ];

  // Build IDF from all TOC items
  const allDocs = flatToc.map((item) => tokenize(item.title));
  allDocs.push(blockTokens);
  const idf = computeIDF(allDocs);

  for (const tocItem of flatToc) {
    const tocTokens = tokenize(tocItem.title);

    // Text similarity (TF-IDF)
    const textScore = computeTFIDFSimilarity(blockTokens, tocTokens, idf);

    // Structural matching
    const structMatch = computeStructuralMatch(block, tocItem);

    // Embedding score (placeholder - would use actual embeddings in production)
    // For now, use enhanced text similarity
    const embedScore = computeEmbeddingScore(blockTokens, tocTokens);

    // Compute final score
    let finalScore =
      textScore * config.textWeight +
      embedScore * config.embedWeight +
      structMatch.score * config.structWeight;

    // Boost for structural matches
    if (config.boostChapterMatches && structMatch.matchedChapter) {
      finalScore = Math.min(1, finalScore + 0.15);
    }
    if (config.boostPageMatches && structMatch.matchedPages) {
      finalScore = Math.min(1, finalScore + 0.10);
    }

    // Generate reasons
    const reasons: string[] = [];
    if (textScore > 0.3) reasons.push(`Keyword overlap: ${Math.round(textScore * 100)}%`);
    if (structMatch.matchedChapter) reasons.push('Chapter number match');
    if (structMatch.matchedPages) reasons.push('Page range match');
    if (structMatch.matchedKeywords.length > 0) {
      reasons.push(`Keywords: ${structMatch.matchedKeywords.join(', ')}`);
    }

    if (finalScore > 0.2) {
      candidates.push({
        tocItem,
        textScore,
        embedScore,
        structScore: structMatch.score,
        finalScore,
        reasons,
      });
    }
  }

  // Sort by final score descending
  candidates.sort((a, b) => b.finalScore - a.finalScore);

  return candidates.slice(0, 10); // Top 10 candidates
}

/**
 * Placeholder embedding score - uses enhanced text similarity
 * In production, this would use actual embeddings (OpenAI, sentence-transformers, etc.)
 */
function computeEmbeddingScore(tokens1: string[], tokens2: string[]): number {
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  // Jaccard similarity as embedding proxy
  const jaccard = intersection.size / union.size || 0;

  // Boost for longer matches
  const lengthBoost = Math.min(1, intersection.size / 3);

  return jaccard * 0.7 + lengthBoost * 0.3;
}

/**
 * Create objective mapping from candidate
 */
export function createMapping(
  block: SyllabusBlock,
  candidate: MatchCandidate,
  config: MatchingConfig = DEFAULT_MATCHING_CONFIG
): ObjectiveMapping {
  // Determine status based on thresholds
  let status: MappingStatus;
  if (candidate.finalScore >= config.autoAcceptThreshold) {
    status = 'auto_accepted';
  } else if (candidate.finalScore >= config.reviewThreshold) {
    status = 'suggested_review';
  } else {
    status = 'needs_review';
  }

  return {
    id: `mapping_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    objectiveId: block.id,
    tocId: candidate.tocItem.id,
    confidenceScore: candidate.finalScore,
    textScore: candidate.textScore,
    embedScore: candidate.embedScore,
    structScore: candidate.structScore,
    status,
    reasons: candidate.reasons,
    createdAt: Date.now(),
  };
}

/**
 * Run full matching pipeline
 */
export function runMatchingPipeline(
  blocks: SyllabusBlock[],
  tocItems: TocItem[],
  config: MatchingConfig = DEFAULT_MATCHING_CONFIG
): {
  mappings: ObjectiveMapping[];
  lowConfidence: ObjectiveMapping[];
  unmapped: SyllabusBlock[];
} {
  const mappings: ObjectiveMapping[] = [];
  const lowConfidence: ObjectiveMapping[] = [];
  const unmapped: SyllabusBlock[] = [];

  for (const block of blocks) {
    // Skip non-content blocks
    if (['deliverable', 'assignment'].includes(block.type) && block.extractedEntities.chapters.length === 0) {
      continue;
    }

    const candidates = generateCandidates(block, tocItems, config);

    if (candidates.length === 0) {
      unmapped.push(block);
      continue;
    }

    // Create mapping from best candidate
    const bestCandidate = candidates[0];
    const mapping = createMapping(block, bestCandidate, config);

    mappings.push(mapping);

    if (mapping.status === 'needs_review' || mapping.status === 'suggested_review') {
      lowConfidence.push(mapping);
    }
  }

  return { mappings, lowConfidence, unmapped };
}

/**
 * Apply manual correction (gold mapping)
 */
export function applyGoldMapping(
  existingMappings: ObjectiveMapping[],
  objectiveId: string,
  tocId: string,
  userId: string
): ObjectiveMapping[] {
  // Remove any existing mapping for this objective
  const filtered = existingMappings.filter((m) => m.objectiveId !== objectiveId);

  // Add gold mapping
  const goldMapping: ObjectiveMapping = {
    id: `gold_${Date.now()}`,
    objectiveId,
    tocId,
    confidenceScore: 1.0,
    textScore: 1.0,
    embedScore: 1.0,
    structScore: 1.0,
    status: 'gold',
    reasons: ['Manual correction by user'],
    createdAt: Date.now(),
    userId,
  };

  return [...filtered, goldMapping];
}

/**
 * Get cluster mappings for objectives
 */
export function mapClustersToObjectives(
  mappings: ObjectiveMapping[],
  clusters: { id: string; pageRange?: { start: number; end: number }; embedding?: number[] }[],
  tocItems: TocItem[],
  examDate?: string
): ClusterMapping[] {
  const clusterMappings: ClusterMapping[] = [];

  for (const mapping of mappings) {
    const tocItem = findTocItemById(tocItems, mapping.tocId);
    if (!tocItem) continue;

    // Find clusters that overlap with this TOC section
    for (const cluster of clusters) {
      let similarity = 0;
      let pageOverlap = false;

      // Page range overlap
      if (cluster.pageRange && tocItem.pageNumber) {
        const tocEnd = tocItem.pageNumber + 10; // Estimate
        if (
          cluster.pageRange.start <= tocEnd &&
          cluster.pageRange.end >= tocItem.pageNumber
        ) {
          similarity += 0.4;
          pageOverlap = true;
        }
      }

      // Would add embedding similarity here in production

      // Exam proximity weight
      let examProximityWeight = 0.5;
      if (examDate) {
        const daysUntilExam = Math.max(0, (new Date(examDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysUntilExam <= 7) examProximityWeight = 1.0;
        else if (daysUntilExam <= 14) examProximityWeight = 0.8;
        else if (daysUntilExam <= 30) examProximityWeight = 0.6;
      }

      if (similarity > 0.2 || pageOverlap) {
        clusterMappings.push({
          objectiveId: mapping.objectiveId,
          clusterId: cluster.id,
          similarity,
          examProximityWeight,
          pageOverlap,
        });
      }
    }
  }

  // Sort by combined score
  clusterMappings.sort((a, b) => {
    const scoreA = a.similarity * 0.6 + a.examProximityWeight * 0.4;
    const scoreB = b.similarity * 0.6 + b.examProximityWeight * 0.4;
    return scoreB - scoreA;
  });

  return clusterMappings;
}

// ============================================================================
// Utility Functions
// ============================================================================

function flattenToc(items: TocItem[], result: TocItem[] = []): TocItem[] {
  for (const item of items) {
    result.push(item);
    if (item.children) {
      flattenToc(item.children, result);
    }
  }
  return result;
}

function findTocItemById(items: TocItem[], id: string): TocItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children) {
      const found = findTocItemById(item.children, id);
      if (found) return found;
    }
  }
  return null;
}
