// lib/cognitive/importanceEngine.ts
// Importance Engine v2.1 - Final Scoring Logic
// Score = Syllabus + DAT Signal + Discriminators + Graph Centrality + Weakness + Recency

import type {
  KnowledgeCard,
  PageContext,
  SyllabusMatch,
  ExamType,
  CardId,
  ImportanceExplanation,
  ImportanceEngine,
  EvidenceSpan,
} from './types';

// ============================================================================
// Weight Configuration
// ============================================================================

const WEIGHTS = {
  syllabus: 25,       // 0-25 points for syllabus match
  datSignal: 25,      // 0-25 points for exam signal
  discriminators: 20, // 0-20 points for thresholds, exceptions, definitions
  graphCentrality: 15, // 0-15 points for number of links
  weakness: 10,       // 0-10 points for user weakness boost
  recency: 5,         // 0-5 points for new cards
};

// ============================================================================
// Signal Detectors
// ============================================================================

const DEFINITION_PATTERNS = [
  /\bis\s+defined\s+as\b/i,
  /\bdefinition\b/i,
  /\brefers\s+to\b/i,
  /\bis\s+characterized\s+by\b/i,
];

const THRESHOLD_PATTERNS = [
  /\b\d+\s*(mm|cm|mg|ml|%|mmHg|mmol|mEq|units?|IU)\b/i,
  /\b[<>≥≤]\s*\d+/,
  /\bcutoff\b|\bthreshold\b/i,
  /\bgreater\s+than\s+\d+/i,
  /\bless\s+than\s+\d+/i,
];

const EXCEPTION_PATTERNS = [
  /\bexcept\b/i,
  /\bhowever\b/i,
  /\bunlike\b/i,
  /\bonly\s+when\b/i,
  /\bin\s+contrast\b/i,
  /\brare(ly)?\b/i,
];

const HIGH_YIELD_PATTERNS = [
  /\bmost\s+common\b/i,
  /\bmost\s+likely\b/i,
  /\bgold\s+standard\b/i,
  /\bfirst[- ]line\b/i,
  /\bcontraindicated\b/i,
  /\bclassic\b/i,
  /\bpathognomonic\b/i,
];

// ============================================================================
// Scoring Functions
// ============================================================================

function computeSyllabusScore(
  card: KnowledgeCard,
  matches: SyllabusMatch[]
): { score: number; detail: string } {
  // Check if card's pages overlap with any syllabus match
  const cardPages = new Set(card.pageRefs);
  let bestMatch: SyllabusMatch | undefined;
  let bestOverlap = 0;

  for (const match of matches) {
    for (const range of match.pageRanges) {
      for (let p = range.start; p <= range.end; p++) {
        if (cardPages.has(p)) {
          const overlap = match.confidence;
          if (overlap > bestOverlap) {
            bestOverlap = overlap;
            bestMatch = match;
          }
        }
      }
    }
  }

  if (!bestMatch) {
    return { score: 0, detail: 'Not matched to syllabus' };
  }

  const score = Math.round(bestMatch.confidence * WEIGHTS.syllabus);
  return {
    score,
    detail: `Matched to syllabus item with ${Math.round(bestMatch.confidence * 100)}% confidence`,
  };
}

function computeDatSignalScore(
  card: KnowledgeCard,
  examType: ExamType
): { score: number; detail: string } {
  if (examType === 'GENERIC') {
    return { score: 0, detail: 'Generic exam type' };
  }

  const text = `${card.title} ${card.summary}`;
  let hits = 0;
  const matchedPatterns: string[] = [];

  for (const pattern of HIGH_YIELD_PATTERNS) {
    if (pattern.test(text)) {
      hits++;
      matchedPatterns.push(pattern.source.slice(0, 20));
    }
  }

  // Also check for exam-specific keywords
  const examKeywords: Record<ExamType, RegExp[]> = {
    DAT: [/\bdental\b/i, /\boral\b/i, /\bperiodontal\b/i, /\bcaries\b/i],
    NBDE: [/\bdental\b/i, /\bclinical\b/i, /\bboard\b/i],
    USMLE: [/\bstep\s+\d\b/i, /\bclinical\b/i, /\bdiagnosis\b/i],
    MCAT: [/\bbiology\b/i, /\bchemistry\b/i, /\bphysics\b/i],
    GENERIC: [],
  };

  for (const pattern of examKeywords[examType] || []) {
    if (pattern.test(text)) {
      hits += 0.5;
    }
  }

  const normalizedScore = Math.min(1, hits / 4);
  const score = Math.round(normalizedScore * WEIGHTS.datSignal);

  return {
    score,
    detail: matchedPatterns.length > 0
      ? `High-yield signals: ${matchedPatterns.slice(0, 3).join(', ')}`
      : 'No high-yield signals detected',
  };
}

function computeDiscriminatorScore(
  card: KnowledgeCard
): { score: number; detail: string } {
  const text = `${card.title} ${card.summary}`;
  let score = 0;
  const found: string[] = [];

  // Check definitions (5 points)
  if (DEFINITION_PATTERNS.some(p => p.test(text))) {
    score += 5;
    found.push('definition');
  }

  // Check thresholds (7 points)
  if (THRESHOLD_PATTERNS.some(p => p.test(text))) {
    score += 7;
    found.push('numeric threshold');
  }

  // Check exceptions (8 points - highest because most testable)
  if (EXCEPTION_PATTERNS.some(p => p.test(text))) {
    score += 8;
    found.push('exception');
  }

  return {
    score: Math.min(score, WEIGHTS.discriminators),
    detail: found.length > 0
      ? `Discriminators: ${found.join(', ')}`
      : 'No discriminators detected',
  };
}

function computeGraphCentralityScore(
  card: KnowledgeCard
): { score: number; detail: string } {
  const linkCount = card.relatedCardIds.length;

  // Logarithmic scaling: 1 link = 5pts, 3 links = 10pts, 7+ links = 15pts
  let score = 0;
  if (linkCount >= 7) score = 15;
  else if (linkCount >= 5) score = 12;
  else if (linkCount >= 3) score = 10;
  else if (linkCount >= 1) score = 5;

  return {
    score: Math.min(score, WEIGHTS.graphCentrality),
    detail: `${linkCount} related concepts`,
  };
}

function computeWeaknessScore(
  card: KnowledgeCard,
  userWeakness?: Record<CardId, number>
): { score: number; detail: string } {
  if (!userWeakness) {
    return { score: 0, detail: 'No weakness data' };
  }

  const weakness = userWeakness[card.id] ?? 0;
  if (weakness === 0) {
    return { score: 0, detail: 'No weakness recorded' };
  }

  const score = Math.round(weakness * WEIGHTS.weakness);
  return {
    score,
    detail: `Weakness level: ${Math.round(weakness * 100)}%`,
  };
}

function computeRecencyScore(
  card: KnowledgeCard
): { score: number; detail: string } {
  // New cards get a small boost
  // Cards without scores are considered new
  if (!card.scores?.confidence) {
    return {
      score: WEIGHTS.recency,
      detail: 'New card - slight boost',
    };
  }

  // Lower confidence extraction = newer/less reviewed
  if (card.scores.confidence < 0.5) {
    return {
      score: Math.round(WEIGHTS.recency * 0.5),
      detail: 'Recently extracted',
    };
  }

  return { score: 0, detail: 'Established card' };
}

// ============================================================================
// Main Engine
// ============================================================================

export function scoreCard(
  card: KnowledgeCard,
  ctx: {
    page: PageContext;
    matches: SyllabusMatch[];
    examType: ExamType;
    userWeakness?: Record<CardId, number>;
  }
): { score: number; explanation: ImportanceExplanation } {
  const syllabusResult = computeSyllabusScore(card, ctx.matches);
  const datResult = computeDatSignalScore(card, ctx.examType);
  const discriminatorResult = computeDiscriminatorScore(card);
  const centralityResult = computeGraphCentralityScore(card);
  const weaknessResult = computeWeaknessScore(card, ctx.userWeakness);
  const recencyResult = computeRecencyScore(card);

  const totalScore = Math.min(100,
    syllabusResult.score +
    datResult.score +
    discriminatorResult.score +
    centralityResult.score +
    weaknessResult.score +
    recencyResult.score
  );

  // Build reasons sorted by weight
  const allReasons = [
    { label: 'Syllabus Match', weight: syllabusResult.score, detail: syllabusResult.detail },
    { label: 'Exam Signal', weight: datResult.score, detail: datResult.detail },
    { label: 'Discriminators', weight: discriminatorResult.score, detail: discriminatorResult.detail },
    { label: 'Concept Links', weight: centralityResult.score, detail: centralityResult.detail },
    { label: 'Weakness Boost', weight: weaknessResult.score, detail: weaknessResult.detail },
    { label: 'Recency Boost', weight: recencyResult.score, detail: recencyResult.detail },
  ].filter(r => r.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  return {
    score: totalScore,
    explanation: {
      importanceScore: totalScore,
      reasons: allReasons.slice(0, 3), // Top 3 reasons
    },
  };
}

export function scoreCards(
  cards: KnowledgeCard[],
  ctx: {
    page: PageContext;
    matches: SyllabusMatch[];
    examType: ExamType;
    userWeakness?: Record<CardId, number>;
  }
): Map<CardId, { score: number; explanation: ImportanceExplanation }> {
  const results = new Map<CardId, { score: number; explanation: ImportanceExplanation }>();

  for (const card of cards) {
    results.set(card.id, scoreCard(card, ctx));
  }

  return results;
}

export function rankCards(
  cards: KnowledgeCard[],
  ctx: {
    page: PageContext;
    matches: SyllabusMatch[];
    examType: ExamType;
    userWeakness?: Record<CardId, number>;
  }
): Array<{ card: KnowledgeCard; score: number; explanation: ImportanceExplanation }> {
  const scored = cards.map(card => ({
    card,
    ...scoreCard(card, ctx),
  }));

  return scored.sort((a, b) => b.score - a.score);
}

// Export as ImportanceEngine interface implementation
export const importanceEngine: ImportanceEngine = {
  scoreCard,
};

export default importanceEngine;
