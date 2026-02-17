// lib/page-intelligence/cards.ts
// Auto-generate study cards from page insights

import type { StudyCard, Insight, InsightTag, Segment } from './types';
import { generateId } from './types';

// ============================================================================
// Configuration
// ============================================================================

const MIN_INSIGHT_SCORE_FOR_CARD = 50; // Only generate cards for insights >= this score
const MAX_CARDS_PER_INSIGHT = 2;
const MAX_CARDS_PER_PAGE = 15;
const CLOZE_MIN_LENGTH = 30;
const CLOZE_MAX_LENGTH = 200;

// ============================================================================
// Card Generation Types
// ============================================================================

type CardType = 'definition' | 'cloze' | 'qa' | 'relation';

interface CardTemplate {
  type: CardType;
  front: string;
  back: string;
}

// ============================================================================
// Cloze Card Generation
// ============================================================================

/**
 * Detect if text is suitable for cloze deletion
 */
function isClozeCandidate(text: string): boolean {
  return (
    text.length >= CLOZE_MIN_LENGTH &&
    text.length <= CLOZE_MAX_LENGTH &&
    // Has a key term that could be blanked
    /\b[A-Z][a-z]+(?:\s+[a-z]+){0,2}\b/.test(text)
  );
}

/**
 * Generate a cloze deletion card
 * Format: "The primary function of ___ is ___"
 */
function generateClozeCard(text: string): CardTemplate | null {
  // Pattern 1: "X is Y" definitions
  const defMatch = text.match(
    /\b([A-Z][a-z]+(?:\s+[a-z]+){0,2})\s+(?:is|are|refers to)\s+(.{10,100})/
  );
  if (defMatch) {
    const term = defMatch[1];
    const definition = defMatch[2].replace(/[.!?]+$/, '').trim();
    return {
      type: 'cloze',
      front: `"${term}" is/refers to ___`,
      back: definition,
    };
  }

  // Pattern 2: "X causes/leads to Y"
  const causalMatch = text.match(
    /\b([A-Z][a-z]+(?:\s+[a-z]+){0,2})\s+(?:causes?|leads?\s+to|results?\s+in)\s+(.{10,80})/
  );
  if (causalMatch) {
    const cause = causalMatch[1];
    const effect = causalMatch[2].replace(/[.!?]+$/, '').trim();
    return {
      type: 'cloze',
      front: `${cause} causes/leads to ___`,
      back: effect,
    };
  }

  // Pattern 3: Numbers/thresholds
  const numberMatch = text.match(
    /\b([A-Z][a-z]+(?:\s+[a-z]+){0,3})\s+(?:is|are|has|with)\s+(\d+[\d.\s]*(?:mg|ml|mm|cm|%|days|hours|weeks|months|years)[^.]{0,50})/i
  );
  if (numberMatch) {
    const concept = numberMatch[1];
    const value = numberMatch[2].trim();
    return {
      type: 'cloze',
      front: `${concept} has/is ___ (include units)`,
      back: value,
    };
  }

  return null;
}

// ============================================================================
// Q&A Card Generation
// ============================================================================

/**
 * Generate a question-answer card from insight
 */
function generateQACard(insight: Insight): CardTemplate | null {
  const title = insight.title;
  const body = insight.body;

  // Extract first meaningful line from body
  const lines = body.split('\n').filter(l => l.trim().length > 10);
  if (lines.length === 0) return null;

  const answer = lines
    .map(l => l.replace(/^[•\-]\s*/, '').trim())
    .slice(0, 3)
    .join('; ');

  // Generate question based on insight badge
  let question: string;

  if (insight.badge === 'DAT MUST KNOW') {
    question = `What is the key point about "${title}"?`;
  } else if (insight.tags.includes('definition')) {
    question = `Define: ${title}`;
  } else if (insight.tags.includes('clinical')) {
    question = `Clinical significance of ${title}?`;
  } else {
    question = `What is ${title}?`;
  }

  return {
    type: 'qa',
    front: question,
    back: answer,
  };
}

// ============================================================================
// Definition Card Generation
// ============================================================================

/**
 * Generate a definition card from a definition-type insight
 */
function generateDefinitionCard(insight: Insight, segments: Segment[]): CardTemplate | null {
  // Find the definition text
  const segmentMap = new Map(segments.map(s => [s.id, s]));
  let definitionText = '';

  for (const segId of insight.evidenceSegmentIds) {
    const segment = segmentMap.get(segId);
    if (!segment) continue;

    // Look for definition pattern
    const match = segment.text.match(
      /\b([A-Z][a-z]+(?:\s+[a-z]+){0,2})\s+(?:is defined as|refers to|is termed|means)\s+([^.!?]+)/i
    );
    if (match) {
      return {
        type: 'definition',
        front: `Define: ${match[1]}`,
        back: match[2].trim(),
      };
    }

    definitionText += ' ' + segment.text;
  }

  // Fallback: use insight body
  if (insight.tags.includes('definition')) {
    const firstLine = insight.body.split('\n')[0]?.replace(/^[•\-]\s*/, '').trim();
    if (firstLine && firstLine.length > 20) {
      return {
        type: 'definition',
        front: `Define: ${insight.title}`,
        back: firstLine,
      };
    }
  }

  return null;
}

// ============================================================================
// Main Card Generator
// ============================================================================

export interface GenerateCardsOptions {
  insights: Insight[];
  segments: Segment[];
  pageNumber: number;
  docId?: string;
  minScore?: number;
  maxCards?: number;
}

/**
 * Generate study cards from page insights
 */
export function generateCards(options: GenerateCardsOptions): StudyCard[] {
  const {
    insights,
    segments,
    pageNumber,
    docId = 'unknown',
    minScore = MIN_INSIGHT_SCORE_FOR_CARD,
    maxCards = MAX_CARDS_PER_PAGE,
  } = options;

  const cards: StudyCard[] = [];
  const usedQuestions = new Set<string>();

  // Filter insights by score
  const eligibleInsights = insights
    .filter(i => i.score >= minScore)
    .sort((a, b) => b.score - a.score);

  for (const insight of eligibleInsights) {
    if (cards.length >= maxCards) break;

    let cardsForInsight = 0;

    // Try definition card first for definition insights
    if (insight.tags.includes('definition') || insight.badge === 'DAT MUST KNOW') {
      const defCard = generateDefinitionCard(insight, segments);
      if (defCard && !usedQuestions.has(defCard.front.toLowerCase())) {
        cards.push(createStudyCard(defCard, insight, pageNumber, docId));
        usedQuestions.add(defCard.front.toLowerCase());
        cardsForInsight++;
      }
    }

    // Try cloze cards
    if (cardsForInsight < MAX_CARDS_PER_INSIGHT) {
      const segmentMap = new Map(segments.map(s => [s.id, s]));
      for (const segId of insight.evidenceSegmentIds) {
        const segment = segmentMap.get(segId);
        if (!segment || !isClozeCandidate(segment.text)) continue;

        const clozeCard = generateClozeCard(segment.text);
        if (clozeCard && !usedQuestions.has(clozeCard.front.toLowerCase())) {
          cards.push(createStudyCard(clozeCard, insight, pageNumber, docId));
          usedQuestions.add(clozeCard.front.toLowerCase());
          cardsForInsight++;
          if (cardsForInsight >= MAX_CARDS_PER_INSIGHT) break;
        }
      }
    }

    // Try Q&A card as fallback
    if (cardsForInsight < MAX_CARDS_PER_INSIGHT) {
      const qaCard = generateQACard(insight);
      if (qaCard && !usedQuestions.has(qaCard.front.toLowerCase())) {
        cards.push(createStudyCard(qaCard, insight, pageNumber, docId));
        usedQuestions.add(qaCard.front.toLowerCase());
        cardsForInsight++;
      }
    }
  }

  return cards;
}

// ============================================================================
// Card Creation Helper
// ============================================================================

function createStudyCard(
  template: CardTemplate,
  insight: Insight,
  pageNumber: number,
  docId: string
): StudyCard {
  return {
    id: generateId('card'),
    deck: `${docId}:page:${pageNumber}`,
    front: template.front,
    back: template.back,
    tags: insight.tags,
    evidenceSegmentIds: insight.evidenceSegmentIds,
    due: undefined, // Will be set by SRS system
  };
}

// ============================================================================
// Utility: Generate cards from selected text
// ============================================================================

export function generateCardsFromText(
  text: string,
  pageNumber: number,
  docId: string = 'unknown'
): StudyCard[] {
  const cards: StudyCard[] = [];

  // Try cloze
  const clozeCard = generateClozeCard(text);
  if (clozeCard) {
    cards.push({
      id: generateId('card'),
      deck: `${docId}:page:${pageNumber}`,
      front: clozeCard.front,
      back: clozeCard.back,
      tags: ['high-yield'],
      evidenceSegmentIds: [],
      due: undefined,
    });
  }

  // Try basic Q&A
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  if (sentences.length >= 2) {
    cards.push({
      id: generateId('card'),
      deck: `${docId}:page:${pageNumber}`,
      front: `What is the key point? "${sentences[0].slice(0, 50)}..."`,
      back: sentences.slice(1).join('. ').slice(0, 200),
      tags: [],
      evidenceSegmentIds: [],
      due: undefined,
    });
  }

  return cards;
}

// ============================================================================
// Utility: Get cards for deck
// ============================================================================

export function getCardsForDeck(cards: StudyCard[], deck: string): StudyCard[] {
  return cards.filter(c => c.deck === deck);
}

// ============================================================================
// Utility: Get due cards
// ============================================================================

export function getDueCards(cards: StudyCard[], asOf: string = new Date().toISOString()): StudyCard[] {
  return cards.filter(c => !c.due || c.due <= asOf);
}
