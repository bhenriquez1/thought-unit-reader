/**
 * Learning Store - Zustand store for Core Learning Engine
 *
 * Manages spaced repetition state with:
 * - Per-document learning data
 * - Review history tracking
 * - Study session management
 * - localStorage persistence with SSR safety
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CoreItem, CoreItemWithLearning, LearningState } from '../core/types';
import {
  initializeLearning,
  processReview,
  getDueItems,
  sortByPriority,
  getStudyStats,
  type ReviewGrade,
  type ReviewResult,
} from '../core/learningEngine';

// ============================================================================
// Types
// ============================================================================

export interface StudySession {
  id: string;
  documentId: string;
  startedAt: number;
  endedAt: number | null;
  itemsReviewed: number;
  correctCount: number;
  againCount: number;
}

export interface LearningStoreState {
  // Data
  itemsByDocument: Map<string, Map<string, CoreItemWithLearning>>; // documentId → itemId → item
  sessions: StudySession[];
  currentSessionId: string | null;

  // Actions
  initializeItems: (documentId: string, items: CoreItem[]) => CoreItemWithLearning[];
  getItem: (documentId: string, itemId: string) => CoreItemWithLearning | null;
  getItemsForDocument: (documentId: string) => CoreItemWithLearning[];
  getDueItemsForDocument: (documentId: string) => CoreItemWithLearning[];

  // Review
  recordReview: (documentId: string, itemId: string, grade: ReviewGrade) => ReviewResult | null;

  // Session
  startSession: (documentId: string) => string;
  endSession: () => void;
  getCurrentSession: () => StudySession | null;

  // Stats
  getStats: (documentId: string) => ReturnType<typeof getStudyStats>;
  getOverallStats: () => {
    totalItems: number;
    totalMastered: number;
    totalWeak: number;
    sessionsCompleted: number;
  };

  // Cleanup
  clearDocument: (documentId: string) => void;
  clearAll: () => void;
}

// ============================================================================
// Store
// ============================================================================

export const useLearningStore = create<LearningStoreState>()(
  persist(
    (set, get) => ({
      // Initial State
      itemsByDocument: new Map(),
      sessions: [],
      currentSessionId: null,

      // Initialize learning data for Core items
      initializeItems: (documentId, items) => {
        const existingMap = get().itemsByDocument.get(documentId) || new Map();
        const newItems: CoreItemWithLearning[] = [];

        for (const item of items) {
          // Check if we already have learning data for this item
          const existing = existingMap.get(item.id);
          if (existing) {
            // Update core data but preserve learning state
            newItems.push({
              ...existing,
              ...item,
              learning: existing.learning,
              flashcard: existing.flashcard,
            });
          } else {
            // Initialize new learning data
            const initialized = initializeLearning(item);
            newItems.push(initialized);
            existingMap.set(item.id, initialized);
          }
        }

        set((state) => {
          const newMap = new Map(state.itemsByDocument);
          newMap.set(documentId, existingMap);
          return { itemsByDocument: newMap };
        });

        return newItems;
      },

      getItem: (documentId, itemId) => {
        return get().itemsByDocument.get(documentId)?.get(itemId) || null;
      },

      getItemsForDocument: (documentId) => {
        const map = get().itemsByDocument.get(documentId);
        return map ? Array.from(map.values()) : [];
      },

      getDueItemsForDocument: (documentId) => {
        const items = get().getItemsForDocument(documentId);
        return sortByPriority(getDueItems(items));
      },

      // Record a review
      recordReview: (documentId, itemId, grade) => {
        const item = get().getItem(documentId, itemId);
        if (!item) return null;

        const result = processReview(item, grade);

        // Update store
        set((state) => {
          const docMap = state.itemsByDocument.get(documentId);
          if (!docMap) return state;

          const newDocMap = new Map(docMap);
          newDocMap.set(itemId, result.item);

          const newItemsMap = new Map(state.itemsByDocument);
          newItemsMap.set(documentId, newDocMap);

          // Update current session if active
          let sessions = state.sessions;
          if (state.currentSessionId) {
            sessions = sessions.map((s) =>
              s.id === state.currentSessionId
                ? {
                    ...s,
                    itemsReviewed: s.itemsReviewed + 1,
                    correctCount: grade !== 'again' ? s.correctCount + 1 : s.correctCount,
                    againCount: grade === 'again' ? s.againCount + 1 : s.againCount,
                  }
                : s
            );
          }

          return { itemsByDocument: newItemsMap, sessions };
        });

        return result;
      },

      // Session management
      startSession: (documentId) => {
        const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        set((state) => ({
          currentSessionId: sessionId,
          sessions: [
            ...state.sessions,
            {
              id: sessionId,
              documentId,
              startedAt: Date.now(),
              endedAt: null,
              itemsReviewed: 0,
              correctCount: 0,
              againCount: 0,
            },
          ],
        }));

        return sessionId;
      },

      endSession: () => {
        set((state) => {
          if (!state.currentSessionId) return state;

          return {
            currentSessionId: null,
            sessions: state.sessions.map((s) =>
              s.id === state.currentSessionId
                ? { ...s, endedAt: Date.now() }
                : s
            ),
          };
        });
      },

      getCurrentSession: () => {
        const { currentSessionId, sessions } = get();
        if (!currentSessionId) return null;
        return sessions.find((s) => s.id === currentSessionId) || null;
      },

      // Stats
      getStats: (documentId) => {
        const items = get().getItemsForDocument(documentId);
        return getStudyStats(items);
      },

      getOverallStats: () => {
        const { itemsByDocument, sessions } = get();
        let totalItems = 0;
        let totalMastered = 0;
        let totalWeak = 0;

        for (const docMap of itemsByDocument.values()) {
          for (const item of docMap.values()) {
            totalItems++;
            if (item.learning.state === 'mastered') totalMastered++;
            if (item.learning.state === 'weak') totalWeak++;
          }
        }

        return {
          totalItems,
          totalMastered,
          totalWeak,
          sessionsCompleted: sessions.filter((s) => s.endedAt !== null).length,
        };
      },

      // Cleanup
      clearDocument: (documentId) => {
        set((state) => {
          const newMap = new Map(state.itemsByDocument);
          newMap.delete(documentId);
          return { itemsByDocument: newMap };
        });
      },

      clearAll: () => {
        set({
          itemsByDocument: new Map(),
          sessions: [],
          currentSessionId: null,
        });
      },
    }),
    {
      name: 'learning-store',
      storage: createJSONStorage(() => {
        // SSR-safe localStorage access
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
      // Custom serialization for Maps
      partialize: (state) => ({
        itemsByDocument: Array.from(state.itemsByDocument.entries()).map(
          ([docId, itemMap]) => [docId, Array.from(itemMap.entries())]
        ),
        sessions: state.sessions,
      }),
      // Custom deserialization
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.itemsByDocument)) {
          state.itemsByDocument = new Map(
            (state.itemsByDocument as unknown as [string, [string, CoreItemWithLearning][]][]).map(
              ([docId, items]) => [docId, new Map(items)]
            )
          );
        }
      },
      skipHydration: typeof window === 'undefined',
    }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const selectDueCount = (state: LearningStoreState, documentId: string): number => {
  return state.getDueItemsForDocument(documentId).length;
};

export const selectLearningState = (
  state: LearningStoreState,
  documentId: string,
  itemId: string
): LearningState | null => {
  return state.getItem(documentId, itemId)?.learning.state || null;
};

export const selectCombinedConfidence = (
  state: LearningStoreState,
  documentId: string,
  itemId: string
): number | null => {
  return state.getItem(documentId, itemId)?.learning.combinedConfidence || null;
};
