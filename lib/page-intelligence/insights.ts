// lib/page-intelligence/insights.ts
// Convert signals and relations into ranked insights with DAT scoring

import type {
  Insight,
  InsightBadge,
  InsightTag,
  Signal,
  Relation,
  Segment,
  Cluster,
  DAT_SCORING_WEIGHTS,
  INSIGHT_BADGE_THRESHOLDS,
} from './types';
import { generateId, getInsightBadge } from './types';
import { groupSegmentsByHeading } from './segmenter';

// ============================================================================
// DAT Scoring Weights (from types.ts)
// ============================================================================

const WEIGHTS = {
  examKeywords: {
    weight: 12,
    maxPoints: 24,
    patterns: [
      /\b(most common|primary|key|important|high-yield|classic|hallmark)\b/i,
      /\b(remember|note|major|main|first-line|gold standard)\b/i,
    ]
  },
  definitions: {
    weight: 18,
    patterns: [
      /\b(defined as|refers to|is termed|is called|means)\b/i,
    ]
  },
  lists: {
    weight: 12,
    patterns: [
      /\b(includes|consists of|characterized by)\b/i,
    ]
  },
  causeEffect: {
    weight: 16,
    patterns: [
      /\b(leads to|results in|causes|due to|because of|resulting from)\b/i,
    ]
  },
  clinicalAction: {
    weight: 14,
    patterns: [
      /\b(diagnos|treatment|management|therap|prescribe|administer)\b/i,
    ]
  },
  numbers: {
    weight: 10,
    patterns: [
      /\d+\s*(mg|ml|mm|cm|%|days|hours|weeks|months|years)/i,
    ]
  },
  contrast: {
    weight: 10,
    patterns: [
      /\b(however|except|contraindicated|unlike|in contrast)\b/i,
    ]
  },
  headingProximity: {
    weight: 8,
  },
  repetition: {
    maxWeight: 10,
  },
  lowOCRPenalty: {
    weight: -10,
    threshold: 35,
  },
} as const;

// ============================================================================
// DAT Score Calculator
// ============================================================================

interface ScoreContext {
  text: string;
  isUnderHeading: boolean;
  conceptRepetitions: Map<string, number>;
  ocrConfidence?: number;
}

/**
 * Calculate DAT relevance score for a piece of text (0-100)
 */
export function calculateDATScore(context: ScoreContext): number {
  const { text, isUnderHeading, conceptRepetitions, ocrConfidence } = context;
  let score = 0;
  const lower = text.toLowerCase();

  // Exam keywords (+12 each, max 24)
  let examKeywordPoints = 0;
  for (const pattern of WEIGHTS.examKeywords.patterns) {
    const matches = lower.match(new RegExp(pattern, 'gi'));
    if (matches) {
      examKeywordPoints += matches.length * WEIGHTS.examKeywords.weight;
    }
  }
  score += Math.min(examKeywordPoints, WEIGHTS.examKeywords.maxPoints);

  // Definitions (+18)
  for (const pattern of WEIGHTS.definitions.patterns) {
    if (pattern.test(lower)) {
      score += WEIGHTS.definitions.weight;
      break;
    }
  }

  // Lists (+12)
  for (const pattern of WEIGHTS.lists.patterns) {
    if (pattern.test(lower)) {
      score += WEIGHTS.lists.weight;
      break;
    }
  }

  // Cause→Effect (+16)
  for (const pattern of WEIGHTS.causeEffect.patterns) {
    if (pattern.test(lower)) {
      score += WEIGHTS.causeEffect.weight;
      break;
    }
  }

  // Clinical actionability (+14)
  for (const pattern of WEIGHTS.clinicalAction.patterns) {
    if (pattern.test(lower)) {
      score += WEIGHTS.clinicalAction.weight;
      break;
    }
  }

  // Numbers/thresholds (+10)
  for (const pattern of WEIGHTS.numbers.patterns) {
    if (pattern.test(lower)) {
      score += WEIGHTS.numbers.weight;
      break;
    }
  }

  // Contrast/Exceptions (+10)
  for (const pattern of WEIGHTS.contrast.patterns) {
    if (pattern.test(lower)) {
      score += WEIGHTS.contrast.weight;
      break;
    }
  }

  // Heading proximity (+8)
  if (isUnderHeading) {
    score += WEIGHTS.headingProximity.weight;
  }

  // Repetition bonus (0-10)
  if (conceptRepetitions.size > 0) {
    const avgRepetition = Array.from(conceptRepetitions.values())
      .reduce((a, b) => a + b, 0) / conceptRepetitions.size;
    score += Math.min(avgRepetition * 2, WEIGHTS.repetition.maxWeight);
  }

  // OCR low confidence penalty (-10)
  if (ocrConfidence !== undefined && ocrConfidence < WEIGHTS.lowOCRPenalty.threshold) {
    score += WEIGHTS.lowOCRPenalty.weight;
  }

  // Normalize to 0-100
  return Math.max(0, Math.min(100, score));
}

// ============================================================================
// Insight Generation
// ============================================================================

export interface GenerateInsightsOptions {
  segments: Segment[];
  signals: Signal[];
  relations: Relation[];
  clusters: Cluster[];
  ocrConfidence?: number;
  minScore?: number;
  maxInsights?: number;
}

/**
 * Generate insights from signals, relations, and clusters
 */
export function generateInsights(options: GenerateInsightsOptions): Insight[] {
  const {
    segments,
    signals,
    relations,
    clusters,
    ocrConfidence,
    minScore = 20,
    maxInsights = 20,
  } = options;

  const insights: Insight[] = [];
  const processedSegmentIds = new Set<string>();

  // Build segment ID to segment map
  const segmentMap = new Map(segments.map(s => [s.id, s]));

  // Group segments by heading for context
  const headingGroups = groupSegmentsByHeading(segments);

  // Track concept repetitions
  const conceptRepetitions = new Map<string, number>();
  for (const relation of relations) {
    conceptRepetitions.set(
      relation.from.toLowerCase(),
      (conceptRepetitions.get(relation.from.toLowerCase()) || 0) + 1
    );
    conceptRepetitions.set(
      relation.to.toLowerCase(),
      (conceptRepetitions.get(relation.to.toLowerCase()) || 0) + 1
    );
  }

  // Process signals into insights
  for (const signal of signals) {
    const segmentIds = signal.evidenceSegmentIds;
    const evidenceTexts: string[] = [];
    let combinedText = '';
    let isUnderHeading = false;

    for (const segId of segmentIds) {
      if (processedSegmentIds.has(segId)) continue;

      const segment = segmentMap.get(segId);
      if (!segment) continue;

      evidenceTexts.push(segment.text);
      combinedText += ' ' + segment.text;

      // Check if under heading
      const segIndex = segments.indexOf(segment);
      if (segIndex > 0 && segments[segIndex - 1]?.kind === 'heading') {
        isUnderHeading = true;
      }
    }

    if (combinedText.trim().length < 30) continue;

    // Calculate score
    const score = calculateDATScore({
      text: combinedText,
      isUnderHeading,
      conceptRepetitions,
      ocrConfidence,
    });

    if (score < minScore) continue;

    // Generate title and body
    const title = generateInsightTitle(signal, combinedText);
    const body = generateInsightBody(signal, evidenceTexts);
    const tags = generateInsightTags(signal, score);

    insights.push({
      id: generateId('ins'),
      title,
      body,
      score,
      badge: getInsightBadge(score),
      tags,
      evidenceSegmentIds: segmentIds,
    });

    // Mark segments as processed
    for (const segId of segmentIds) {
      processedSegmentIds.add(segId);
    }
  }

  // Process high-value relations into insights
  for (const relation of relations) {
    if (relation.score < 0.7) continue;

    const segmentIds = relation.evidenceSegmentIds;
    const alreadyProcessed = segmentIds.every(id => processedSegmentIds.has(id));
    if (alreadyProcessed) continue;

    const evidenceTexts: string[] = [];
    for (const segId of segmentIds) {
      const segment = segmentMap.get(segId);
      if (segment) evidenceTexts.push(segment.text);
    }

    const combinedText = evidenceTexts.join(' ');
    const score = calculateDATScore({
      text: combinedText,
      isUnderHeading: false,
      conceptRepetitions,
      ocrConfidence,
    });

    if (score < minScore) continue;

    const title = `${relation.from} → ${relation.to}`;
    const body = formatRelationInsightBody(relation, evidenceTexts);
    const tags = generateRelationTags(relation, score);

    insights.push({
      id: generateId('ins'),
      title,
      body,
      score,
      badge: getInsightBadge(score),
      tags,
      evidenceSegmentIds: segmentIds,
    });

    for (const segId of segmentIds) {
      processedSegmentIds.add(segId);
    }
  }

  // Sort by score descending and limit
  insights.sort((a, b) => b.score - a.score);
  return insights.slice(0, maxInsights);
}

// ============================================================================
// Title Generation
// ============================================================================

function generateInsightTitle(signal: Signal, text: string): string {
  // Extract first meaningful phrase
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length === 0) return signal.label;

  const first = sentences[0].trim();

  // Try to extract a noun phrase or concept
  const conceptMatch = first.match(/\b([A-Z][a-z]+(?:\s+[a-z]+){0,3})\b/);
  if (conceptMatch && conceptMatch[1].length > 5) {
    return `${conceptMatch[1]}: ${signal.label}`;
  }

  // Truncate first sentence
  if (first.length > 60) {
    return first.slice(0, 57) + '...';
  }

  return first;
}

// ============================================================================
// Body Generation
// ============================================================================

function generateInsightBody(signal: Signal, evidenceTexts: string[]): string {
  // Combine evidence into bullet points
  const bullets: string[] = [];

  for (const text of evidenceTexts) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    for (const sentence of sentences.slice(0, 3)) {
      const cleaned = sentence.trim();
      if (cleaned.length < 150) {
        bullets.push(cleaned);
      } else {
        bullets.push(cleaned.slice(0, 147) + '...');
      }
    }
  }

  // Deduplicate and limit
  const uniqueBullets = [...new Set(bullets)].slice(0, 4);
  return uniqueBullets.map(b => `• ${b}`).join('\n');
}

function formatRelationInsightBody(relation: Relation, evidenceTexts: string[]): string {
  const relationText = `${relation.from} ${getRelationVerb(relation.type)} ${relation.to}`;
  const evidence = evidenceTexts.join(' ').slice(0, 200);
  return `${relationText}\n\nEvidence: ${evidence}...`;
}

function getRelationVerb(type: Relation['type']): string {
  const verbs: Record<string, string> = {
    causes: 'causes',
    leads_to: 'leads to',
    associated_with: 'is associated with',
    is_a: 'is a type of',
    part_of: 'is part of',
    contraindicated: 'is contraindicated in',
    indicates: 'indicates',
  };
  return verbs[type] || 'relates to';
}

// ============================================================================
// Tag Generation
// ============================================================================

function generateInsightTags(signal: Signal, score: number): InsightTag[] {
  const tags: InsightTag[] = [];

  // Score-based tags
  if (score >= 80) {
    tags.push('must-know', 'high-yield');
  } else if (score >= 60) {
    tags.push('high-yield');
  }

  // Signal-based tags
  switch (signal.type) {
    case 'definition':
      tags.push('definition');
      break;
    case 'contrast':
      tags.push('contrast');
      break;
    case 'diagnostic':
    case 'treatment':
    case 'risk_factor':
      tags.push('clinical');
      break;
  }

  // Always add DAT for high scores
  if (score >= 60) {
    tags.push('DAT');
  }

  return tags;
}

function generateRelationTags(relation: Relation, score: number): InsightTag[] {
  const tags: InsightTag[] = [];

  if (score >= 80) {
    tags.push('must-know', 'high-yield', 'DAT');
  } else if (score >= 60) {
    tags.push('high-yield', 'DAT');
  }

  if (relation.type === 'contraindicated') {
    tags.push('clinical', 'contrast');
  }

  return tags;
}

// ============================================================================
// Utility: Get top insights
// ============================================================================

export function getTopInsights(insights: Insight[], count: number = 5): Insight[] {
  return insights
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

// ============================================================================
// Utility: Get insights by badge
// ============================================================================

export function getInsightsByBadge(insights: Insight[], badge: InsightBadge): Insight[] {
  return insights.filter(i => i.badge === badge);
}

// ============================================================================
// Utility: Get insights by tag
// ============================================================================

export function getInsightsByTag(insights: Insight[], tag: InsightTag): Insight[] {
  return insights.filter(i => i.tags.includes(tag));
}
