// lib/syllabusParser/coursePlanner.ts
// Course Planning Engine - Matches syllabus blocks to book TOC

import type { SyllabusBlock, ParsedSyllabus, Reading } from './parser';
import type { TocItem } from '../stores/tocStore';

// ============================================================================
// Types
// ============================================================================

export interface MatchedReading {
  syllabusReading: Reading;
  tocMatches: TocMatch[];
  confidence: number;
}

export interface TocMatch {
  tocItem: TocItem;
  score: number;
  matchType: 'exact' | 'chapter' | 'keyword' | 'fuzzy';
}

export interface BlockMapping {
  block: SyllabusBlock;
  matchedReadings: MatchedReading[];
  suggestedPages: { start: number; end: number }[];
  unmatchedTopics: string[];
  overallConfidence: number;
}

export interface CoursePlan {
  syllabus: ParsedSyllabus;
  toc: TocItem[];
  mappings: BlockMapping[];
  coverage: {
    matchedBlocks: number;
    totalBlocks: number;
    matchedReadings: number;
    totalReadings: number;
    avgConfidence: number;
  };
  studySchedule: StudyDay[];
}

export interface StudyDay {
  date: string;
  blockId: string;
  topics: string[];
  pages: { start: number; end: number }[];
  estimatedMinutes: number;
  isExamDay: boolean;
}

// ============================================================================
// Text Normalization
// ============================================================================

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(text: string): string[] {
  const normalized = normalizeText(text);
  const words = normalized.split(' ');

  // Filter out common stop words
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
    'chapter', 'section', 'part', 'unit', 'page', 'pages', 'pp'
  ]);

  return words.filter(word => word.length > 2 && !stopWords.has(word));
}

// ============================================================================
// Matching Algorithm
// ============================================================================

/**
 * Calculate similarity score between two strings
 * Uses a combination of exact match, keyword overlap, and fuzzy matching
 */
function calculateSimilarity(text1: string, text2: string): number {
  const norm1 = normalizeText(text1);
  const norm2 = normalizeText(text2);

  // Exact match
  if (norm1 === norm2) return 1.0;

  // Substring match
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return 0.9;
  }

  // Keyword overlap
  const keywords1 = new Set(extractKeywords(text1));
  const keywords2 = new Set(extractKeywords(text2));

  if (keywords1.size === 0 || keywords2.size === 0) return 0;

  const intersection = new Set([...keywords1].filter(k => keywords2.has(k)));
  const union = new Set([...keywords1, ...keywords2]);

  const jaccardSimilarity = intersection.size / union.size;

  // Boost for significant overlap
  if (intersection.size >= 2) {
    return Math.min(0.85, jaccardSimilarity + 0.2);
  }

  return jaccardSimilarity;
}

/**
 * Match a reading reference to TOC items
 */
function matchReadingToToc(reading: Reading, tocItems: TocItem[]): TocMatch[] {
  const matches: TocMatch[] = [];

  // Flatten TOC (include children)
  const flatToc = flattenToc(tocItems);

  for (const tocItem of flatToc) {
    let score = 0;
    let matchType: TocMatch['matchType'] = 'fuzzy';

    // Chapter number matching
    if (reading.kind === 'CHAPTER' && reading.normalized?.chapter) {
      const chapterNum = reading.normalized.chapter;
      const tocChapterMatch = tocItem.title.match(/chapter\s*(\d+)/i);

      if (tocChapterMatch && parseInt(tocChapterMatch[1]) === chapterNum) {
        score = 0.95;
        matchType = 'chapter';
      }
    }

    // Section matching (e.g., "3.1" matches TOC item with "3.1")
    if (reading.kind === 'SECTION' && reading.normalized?.section) {
      if (tocItem.title.includes(reading.normalized.section)) {
        score = 0.9;
        matchType = 'exact';
      }
    }

    // Keyword matching for all types
    if (score === 0) {
      const similarity = calculateSimilarity(reading.value, tocItem.title);
      if (similarity > 0.3) {
        score = similarity;
        matchType = similarity > 0.7 ? 'keyword' : 'fuzzy';
      }
    }

    if (score > 0.3) {
      matches.push({ tocItem, score, matchType });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  // Return top 3 matches
  return matches.slice(0, 3);
}

/**
 * Match syllabus topics to TOC items
 */
function matchTopicsToToc(topics: string[], tocItems: TocItem[]): TocMatch[] {
  const matches: TocMatch[] = [];
  const flatToc = flattenToc(tocItems);

  for (const topic of topics) {
    for (const tocItem of flatToc) {
      const similarity = calculateSimilarity(topic, tocItem.title);

      if (similarity > 0.4) {
        // Check if we already have this TOC item
        const existing = matches.find(m => m.tocItem.id === tocItem.id);
        if (existing) {
          existing.score = Math.max(existing.score, similarity);
        } else {
          matches.push({
            tocItem,
            score: similarity,
            matchType: similarity > 0.7 ? 'keyword' : 'fuzzy',
          });
        }
      }
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 5);
}

/**
 * Flatten TOC tree to array
 */
function flattenToc(items: TocItem[], result: TocItem[] = []): TocItem[] {
  for (const item of items) {
    result.push(item);
    if (item.children) {
      flattenToc(item.children, result);
    }
  }
  return result;
}

// ============================================================================
// Course Planning
// ============================================================================

/**
 * Map a single syllabus block to TOC items
 */
function mapBlockToToc(block: SyllabusBlock, tocItems: TocItem[]): BlockMapping {
  const matchedReadings: MatchedReading[] = [];
  const suggestedPages: { start: number; end: number }[] = [];
  const unmatchedTopics: string[] = [];

  // Match readings
  for (const reading of block.readings) {
    const tocMatches = matchReadingToToc(reading, tocItems);

    if (tocMatches.length > 0) {
      const confidence = tocMatches[0].score;
      matchedReadings.push({
        syllabusReading: reading,
        tocMatches,
        confidence,
      });

      // Add suggested pages from best match
      const bestMatch = tocMatches[0].tocItem;
      suggestedPages.push({
        start: bestMatch.pageNumber,
        end: bestMatch.pageNumber + 10, // Estimate ~10 pages per section
      });
    }
  }

  // Match topics that weren't covered by readings
  const topicMatches = matchTopicsToToc(block.topics, tocItems);

  for (const topic of block.topics) {
    const hasMatch = topicMatches.some(m =>
      calculateSimilarity(topic, m.tocItem.title) > 0.5
    );
    if (!hasMatch) {
      unmatchedTopics.push(topic);
    }
  }

  // Add topic-matched pages
  for (const match of topicMatches) {
    if (!suggestedPages.some(p => p.start === match.tocItem.pageNumber)) {
      suggestedPages.push({
        start: match.tocItem.pageNumber,
        end: match.tocItem.pageNumber + 5,
      });
    }
  }

  // Sort and merge overlapping page ranges
  suggestedPages.sort((a, b) => a.start - b.start);

  // Calculate overall confidence
  const readingScores = matchedReadings.map(r => r.confidence);
  const topicScore = topicMatches.length > 0
    ? topicMatches.reduce((sum, m) => sum + m.score, 0) / topicMatches.length
    : 0;

  const overallConfidence = readingScores.length > 0
    ? (readingScores.reduce((a, b) => a + b, 0) / readingScores.length + topicScore) / 2
    : topicScore;

  return {
    block,
    matchedReadings,
    suggestedPages,
    unmatchedTopics,
    overallConfidence,
  };
}

/**
 * Generate a complete course plan from syllabus and TOC
 */
export function generateCoursePlan(
  syllabus: ParsedSyllabus,
  tocItems: TocItem[]
): CoursePlan {
  const mappings: BlockMapping[] = [];

  // Map each syllabus block
  for (const block of syllabus.blocks) {
    const mapping = mapBlockToToc(block, tocItems);
    mappings.push(mapping);
  }

  // Calculate coverage statistics
  const matchedBlocks = mappings.filter(m => m.overallConfidence > 0.3).length;
  const totalReadings = syllabus.blocks.reduce((sum, b) => sum + b.readings.length, 0);
  const matchedReadings = mappings.reduce(
    (sum, m) => sum + m.matchedReadings.filter(r => r.confidence > 0.3).length,
    0
  );
  const avgConfidence = mappings.length > 0
    ? mappings.reduce((sum, m) => sum + m.overallConfidence, 0) / mappings.length
    : 0;

  // Generate study schedule
  const studySchedule = generateStudySchedule(mappings, syllabus.metadata);

  return {
    syllabus,
    toc: tocItems,
    mappings,
    coverage: {
      matchedBlocks,
      totalBlocks: syllabus.blocks.length,
      matchedReadings,
      totalReadings,
      avgConfidence,
    },
    studySchedule,
  };
}

/**
 * Generate a study schedule from block mappings
 */
function generateStudySchedule(
  mappings: BlockMapping[],
  metadata: ParsedSyllabus['metadata']
): StudyDay[] {
  const schedule: StudyDay[] = [];
  const today = new Date();

  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i];
    const block = mapping.block;

    // Estimate study time based on page count
    const totalPages = mapping.suggestedPages.reduce(
      (sum, p) => sum + (p.end - p.start),
      0
    );
    const estimatedMinutes = Math.max(30, totalPages * 3); // ~3 min per page

    // Determine if this is an exam day
    const isExamDay = block.type === 'EXAM';

    // Parse date from block if available, otherwise estimate
    let date: string;
    if (block.dateRange?.start) {
      date = block.dateRange.start;
    } else {
      // Estimate based on week number
      const weekMatch = block.label.match(/week\s*(\d+)/i);
      const weekNum = weekMatch ? parseInt(weekMatch[1]) : i + 1;
      const studyDate = new Date(today);
      studyDate.setDate(studyDate.getDate() + (weekNum - 1) * 7);
      date = studyDate.toISOString().split('T')[0];
    }

    schedule.push({
      date,
      blockId: block.id,
      topics: block.topics,
      pages: mapping.suggestedPages,
      estimatedMinutes,
      isExamDay,
    });
  }

  return schedule;
}

/**
 * Find best TOC matches for a search query
 */
export function searchTocForTopic(query: string, tocItems: TocItem[]): TocMatch[] {
  const flatToc = flattenToc(tocItems);
  const matches: TocMatch[] = [];

  for (const tocItem of flatToc) {
    const similarity = calculateSimilarity(query, tocItem.title);

    if (similarity > 0.3) {
      matches.push({
        tocItem,
        score: similarity,
        matchType: similarity > 0.7 ? 'keyword' : 'fuzzy',
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 10);
}

/**
 * Get reading suggestions for a specific topic
 */
export function getReadingSuggestions(
  topic: string,
  tocItems: TocItem[]
): { tocItem: TocItem; reason: string }[] {
  const matches = searchTocForTopic(topic, tocItems);

  return matches.map(match => ({
    tocItem: match.tocItem,
    reason: match.matchType === 'keyword'
      ? `Contains keywords from "${topic}"`
      : `Related to "${topic}" (${Math.round(match.score * 100)}% match)`,
  }));
}
