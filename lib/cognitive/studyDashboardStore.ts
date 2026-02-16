// lib/cognitive/studyDashboardStore.ts
// Study Dashboard Store - Spaced Repetition + Exam Emphasis
// Due queue, weak queue, exam emphasis queue, next best action

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  StudyCard,
  StudyQueue,
  StudyDashboardState,
  NextBestAction,
  CardId,
  ChapterId,
  SyllabusItemId,
} from './types';

// ============================================================================
// Spaced Repetition Algorithm (SM-2 inspired)
// ============================================================================

interface ReviewResult {
  cardId: CardId;
  score: number; // 0-5 (0-2 = fail, 3-5 = pass)
  reviewedAt: string;
}

function calculateNextReview(card: StudyCard, score: number): StudyCard {
  const isPass = score >= 3;
  let { repetition, easeFactor, interval } = card;

  if (isPass) {
    // Increase interval
    if (repetition === 0) {
      interval = 1;
    } else if (repetition === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetition += 1;

    // Adjust ease factor
    easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - score) * (0.08 + (5 - score) * 0.02)));
  } else {
    // Reset on fail
    repetition = 0;
    interval = 1;
  }

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);

  return {
    ...card,
    repetition,
    easeFactor,
    interval,
    lastReview: new Date().toISOString(),
    nextReview: nextReview.toISOString(),
    score,
  };
}

// ============================================================================
// State Interface
// ============================================================================

interface StudyDashboardActions {
  // Card management
  addCard: (cardId: CardId, importance?: number) => void;
  removeCard: (cardId: CardId) => void;
  reviewCard: (cardId: CardId, score: number) => void;

  // Queue management
  refreshQueues: () => void;
  getDueCards: () => StudyCard[];
  getWeakCards: () => StudyCard[];
  getExamEmphasisCards: () => StudyCard[];

  // Pinning
  pinChapter: (chapterId: ChapterId) => void;
  unpinChapter: (chapterId: ChapterId) => void;
  pinSyllabusItem: (syllabusItemId: SyllabusItemId) => void;
  unpinSyllabusItem: (syllabusItemId: SyllabusItemId) => void;

  // Mode
  setMode: (mode: 'auto' | 'manual') => void;
  setExamDate: (date: string | undefined) => void;

  // Next best actions
  computeNextBestActions: () => void;

  // Reset
  reset: () => void;
}

interface StudyDashboardFullState extends StudyDashboardState {
  cards: Record<CardId, StudyCard>;
  cardImportance: Record<CardId, number>;
}

type StudyDashboardStore = StudyDashboardFullState & StudyDashboardActions;

// ============================================================================
// Default State
// ============================================================================

const defaultState: StudyDashboardFullState = {
  queue: {
    due: [],
    weak: [],
    examEmphasis: [],
  },
  pinnedChapterIds: [],
  pinnedSyllabusIds: [],
  mode: 'auto',
  examDate: undefined,
  nextBestActions: [],
  cards: {},
  cardImportance: {},
};

// ============================================================================
// Store
// ============================================================================

export const useStudyDashboardStore = create<StudyDashboardStore>()(
  persist(
    (set, get) => ({
      ...defaultState,

      // ========================================
      // Card Management
      // ========================================

      addCard: (cardId, importance = 50) => {
        const existing = get().cards[cardId];
        if (existing) return;

        const now = new Date();
        const card: StudyCard = {
          cardId,
          dueDate: now.toISOString(),
          repetition: 0,
          easeFactor: 2.5,
          interval: 0,
          nextReview: now.toISOString(),
        };

        set((state) => ({
          cards: { ...state.cards, [cardId]: card },
          cardImportance: { ...state.cardImportance, [cardId]: importance },
        }));

        get().refreshQueues();
      },

      removeCard: (cardId) => {
        set((state) => {
          const { [cardId]: _, ...remainingCards } = state.cards;
          const { [cardId]: __, ...remainingImportance } = state.cardImportance;
          return {
            cards: remainingCards,
            cardImportance: remainingImportance,
          };
        });

        get().refreshQueues();
      },

      reviewCard: (cardId, score) => {
        const card = get().cards[cardId];
        if (!card) return;

        const updated = calculateNextReview(card, score);

        set((state) => ({
          cards: { ...state.cards, [cardId]: updated },
        }));

        get().refreshQueues();
        get().computeNextBestActions();
      },

      // ========================================
      // Queue Management
      // ========================================

      refreshQueues: () => {
        const { cards, cardImportance } = get();
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        const allCards = Object.values(cards);

        // Due cards: nextReview <= today
        const due = allCards
          .filter(c => c.nextReview.split('T')[0] <= todayStr)
          .sort((a, b) => new Date(a.nextReview).getTime() - new Date(b.nextReview).getTime());

        // Weak cards: low score or failed recently (score < 3)
        const weak = allCards
          .filter(c => c.score !== undefined && c.score < 3)
          .sort((a, b) => (a.score || 0) - (b.score || 0));

        // Exam emphasis: high importance cards
        const examEmphasis = allCards
          .filter(c => (cardImportance[c.cardId] || 0) >= 70)
          .sort((a, b) => (cardImportance[b.cardId] || 0) - (cardImportance[a.cardId] || 0));

        set({
          queue: { due, weak, examEmphasis },
        });
      },

      getDueCards: () => get().queue.due,
      getWeakCards: () => get().queue.weak,
      getExamEmphasisCards: () => get().queue.examEmphasis,

      // ========================================
      // Pinning
      // ========================================

      pinChapter: (chapterId) => {
        set((state) => ({
          pinnedChapterIds: state.pinnedChapterIds.includes(chapterId)
            ? state.pinnedChapterIds
            : [...state.pinnedChapterIds, chapterId],
        }));
      },

      unpinChapter: (chapterId) => {
        set((state) => ({
          pinnedChapterIds: state.pinnedChapterIds.filter(id => id !== chapterId),
        }));
      },

      pinSyllabusItem: (syllabusItemId) => {
        set((state) => ({
          pinnedSyllabusIds: state.pinnedSyllabusIds.includes(syllabusItemId)
            ? state.pinnedSyllabusIds
            : [...state.pinnedSyllabusIds, syllabusItemId],
        }));
      },

      unpinSyllabusItem: (syllabusItemId) => {
        set((state) => ({
          pinnedSyllabusIds: state.pinnedSyllabusIds.filter(id => id !== syllabusItemId),
        }));
      },

      // ========================================
      // Mode
      // ========================================

      setMode: (mode) => {
        set({ mode });
        get().computeNextBestActions();
      },

      setExamDate: (date) => {
        set({ examDate: date });
        get().computeNextBestActions();
      },

      // ========================================
      // Next Best Actions
      // ========================================

      computeNextBestActions: () => {
        const { queue, mode, examDate } = get();
        const actions: NextBestAction[] = [];

        // Due cards action
        if (queue.due.length > 0) {
          actions.push({
            type: 'review_due',
            label: `Review ${Math.min(10, queue.due.length)} due cards`,
            cardIds: queue.due.slice(0, 10).map(c => c.cardId),
            count: Math.min(10, queue.due.length),
          });
        }

        // Weak cards action
        if (queue.weak.length > 0) {
          actions.push({
            type: 'explain_weak',
            label: 'Explain 1 weak concept on whiteboard',
            cardIds: [queue.weak[0].cardId],
            count: 1,
          });
        }

        // High-yield action
        if (queue.examEmphasis.length > 0) {
          actions.push({
            type: 'read_high_yield',
            label: `Read ${Math.min(3, queue.examEmphasis.length)} high-yield cards`,
            cardIds: queue.examEmphasis.slice(0, 3).map(c => c.cardId),
            count: Math.min(3, queue.examEmphasis.length),
          });
        }

        // Auto mode: prioritize based on exam date
        if (mode === 'auto' && examDate) {
          const daysUntilExam = Math.ceil(
            (new Date(examDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );

          if (daysUntilExam <= 7) {
            // Close to exam: prioritize high-yield and weak
            actions.sort((a, b) => {
              if (a.type === 'read_high_yield') return -1;
              if (b.type === 'read_high_yield') return 1;
              if (a.type === 'explain_weak') return -1;
              if (b.type === 'explain_weak') return 1;
              return 0;
            });
          }
        }

        set({ nextBestActions: actions });
      },

      // ========================================
      // Reset
      // ========================================

      reset: () => {
        set(defaultState);
      },
    }),
    {
      name: 'study-dashboard-store',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
        return localStorage;
      }),
    }
  )
);

export default useStudyDashboardStore;
