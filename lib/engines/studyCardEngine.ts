// lib/engines/studyCardEngine.ts
// Generates Study cards (flashcards) from Insights
// Creates SRS-ready cards from "What Matters" items

import type {
  DocID,
  PageIndex,
  ChapterID,
  StudyCard,
  InsightsResult,
  InsightItem,
  EvidenceRef,
  ExtractionMode,
  Tag,
} from './types';
import { putDocCache, getDocCache } from '../storage/indexedDB';

// ============================================================================
// Study Card Storage Keys
// ============================================================================

const STUDY_CARDS_KEY = (docId: DocID) => `studycards:${docId}`;

// ============================================================================
// Generate Cards from Insights
// ============================================================================

export interface GenerateCardsOptions {
  insights: InsightsResult;
  includeWhatMissing?: boolean; // Also generate cards from "What You May Be Missing"
}

export async function generateCardsFromInsights(options: GenerateCardsOptions): Promise<StudyCard[]> {
  const { insights, includeWhatMissing = false } = options;
  const { docId, scope, whatMatters, whatMissing } = insights;

  const cards: StudyCard[] = [];

  // Generate cards from "What Matters"
  for (const item of whatMatters) {
    const card = insightToCard(item, docId, scope);
    cards.push(card);
  }

  // Optionally include "What You May Be Missing" as learning prompts
  if (includeWhatMissing) {
    for (const item of whatMissing) {
      const card = insightToCard(item, docId, scope, true);
      cards.push(card);
    }
  }

  // Store cards
  await storeCards(docId, cards);

  return cards;
}

function insightToCard(
  item: InsightItem,
  docId: DocID,
  scope: InsightsResult['scope'],
  isMissing: boolean = false
): StudyCard {
  const id = `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Generate front (question/cue)
  const front = generateCardFront(item, isMissing);

  // Generate back (answer + key rule + evidence)
  const back = generateCardBack(item, isMissing);

  // Calculate initial difficulty based on tags
  const initialEase = calculateInitialEase(item.tags);

  return {
    id,
    docId,
    createdAt: Date.now(),
    source: scope,
    tags: item.tags,
    front,
    back,
    evidence: item.evidence,
    srs: {
      intervalDays: 1,
      ease: initialEase,
      dueAt: Date.now(), // Due immediately
      reps: 0,
    },
  };
}

function generateCardFront(item: InsightItem, isMissing: boolean): string {
  if (isMissing) {
    // For missing items, generate a learning prompt
    return `What ${item.title.replace('Missing: ', '').toLowerCase()} should you consider when studying this topic?`;
  }

  // For "What Matters" items, generate based on type
  if (item.tags.includes('DEFINITION')) {
    return `What is ${item.title}?`;
  }

  if (item.tags.includes('DIAGNOSIS')) {
    return `How is ${item.title} diagnosed?`;
  }

  if (item.tags.includes('TREATMENT')) {
    return `What is the treatment for ${item.title}?`;
  }

  if (item.tags.includes('TRAP') || item.tags.includes('EXCEPTION')) {
    return `What is the important exception regarding ${item.title}?`;
  }

  if (item.tags.includes('HIGH_YIELD')) {
    return `Explain: ${item.title}`;
  }

  // Default
  return `What do you need to know about ${item.title}?`;
}

function generateCardBack(item: InsightItem, isMissing: boolean): string {
  const parts: string[] = [];

  // Main answer
  parts.push(item.summary);

  // Key rule / Why it matters
  if (item.whyItMatters && !isMissing) {
    parts.push(`\n📌 Key Point: ${item.whyItMatters}`);
  }

  // Evidence snippet
  if (item.evidence.length > 0) {
    const snippet = item.evidence[0].snippet;
    if (snippet && snippet.length > 20) {
      parts.push(`\n📖 Source: "${snippet.slice(0, 100)}..."`);
    }
  }

  // Tags for context
  const examTags = item.tags.filter(t => ['DAT', 'NBDE', 'MCAT', 'DENT', 'MED'].includes(t));
  if (examTags.length > 0) {
    parts.push(`\n🎯 Exam relevance: ${examTags.join(', ')}`);
  }

  return parts.join('\n');
}

function calculateInitialEase(tags: Tag[]): number {
  // Start with default ease
  let ease = 2.5;

  // Harder items start with lower ease
  if (tags.includes('TRAP') || tags.includes('EXCEPTION')) {
    ease = 2.2; // More challenging
  }

  if (tags.includes('HIGH_YIELD')) {
    ease = 2.3; // Important but manageable
  }

  if (tags.includes('DEFINITION')) {
    ease = 2.6; // Usually straightforward
  }

  return ease;
}

// ============================================================================
// Storage Operations
// ============================================================================

async function storeCards(docId: DocID, cards: StudyCard[]): Promise<void> {
  const key = STUDY_CARDS_KEY(docId);

  // Get existing cards
  const existing = await getDocCache<Record<string, StudyCard>>(key) || {};

  // Merge new cards
  for (const card of cards) {
    existing[card.id] = card;
  }

  // Store
  await putDocCache(key, existing);
}

export async function getCardsForDocument(docId: DocID): Promise<StudyCard[]> {
  const key = STUDY_CARDS_KEY(docId);
  const stored = await getDocCache<Record<string, StudyCard>>(key);
  return stored ? Object.values(stored) : [];
}

export async function getDueCards(docId: DocID): Promise<StudyCard[]> {
  const cards = await getCardsForDocument(docId);
  const now = Date.now();
  return cards.filter(card => card.srs.dueAt <= now);
}

export async function updateCardSRS(
  docId: DocID,
  cardId: string,
  quality: 0 | 1 | 2 | 3 | 4 | 5 // 0=complete fail, 5=perfect
): Promise<StudyCard | null> {
  const key = STUDY_CARDS_KEY(docId);
  const stored = await getDocCache<Record<string, StudyCard>>(key);

  if (!stored || !stored[cardId]) {
    return null;
  }

  const card = stored[cardId];

  // SM-2 algorithm implementation
  const { ease: oldEase, intervalDays: oldInterval, reps } = card.srs;

  let newEase = oldEase;
  let newInterval = oldInterval;
  let newReps = reps;

  if (quality >= 3) {
    // Correct response
    if (reps === 0) {
      newInterval = 1;
    } else if (reps === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(oldInterval * oldEase);
    }
    newReps = reps + 1;
  } else {
    // Incorrect response
    newReps = 0;
    newInterval = 1;
  }

  // Update ease factor
  newEase = oldEase + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  newEase = Math.max(1.3, newEase); // Minimum ease

  // Calculate next due date
  const dueAt = Date.now() + newInterval * 24 * 60 * 60 * 1000;

  // Update card
  card.srs = {
    intervalDays: newInterval,
    ease: newEase,
    dueAt,
    reps: newReps,
  };

  stored[cardId] = card;
  await putDocCache(key, stored);

  return card;
}

// ============================================================================
// Bulk Operations
// ============================================================================

export async function deleteCard(docId: DocID, cardId: string): Promise<boolean> {
  const key = STUDY_CARDS_KEY(docId);
  const stored = await getDocCache<Record<string, StudyCard>>(key);

  if (!stored || !stored[cardId]) {
    return false;
  }

  delete stored[cardId];
  await putDocCache(key, stored);
  return true;
}

export async function getCardStats(docId: DocID): Promise<{
  total: number;
  due: number;
  newCards: number;
  learned: number;
  byTag: Record<string, number>;
}> {
  const cards = await getCardsForDocument(docId);
  const now = Date.now();

  const stats = {
    total: cards.length,
    due: 0,
    newCards: 0,
    learned: 0,
    byTag: {} as Record<string, number>,
  };

  for (const card of cards) {
    if (card.srs.dueAt <= now) {
      stats.due++;
    }

    if (card.srs.reps === 0) {
      stats.newCards++;
    } else if (card.srs.reps >= 3) {
      stats.learned++;
    }

    for (const tag of card.tags) {
      stats.byTag[tag] = (stats.byTag[tag] || 0) + 1;
    }
  }

  return stats;
}

// ============================================================================
// Export
// ============================================================================

export {
  insightToCard,
  generateCardFront,
  generateCardBack,
  calculateInitialEase,
};
