// lib/cognitive/expertViewStore.ts
// Expert View 2.1 Store - Orchestrates all cognitive engines
// Page-aware extraction with minimal UI

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useCurrentLearningContext } from '../context/learningContext';
import type {
  DocId,
  PageIndex,
  ChapterId,
  CardId,
  KnowledgeCard,
  PageContext,
  SyllabusItem,
  SyllabusMatch,
  ExamType,
  ExpertViewPayload,
  ExpertViewCard,
  ExpertViewFilters,
  CardFilterKind,
  TocNode,
  ReasoningChain,
  DifferentialTable,
  ExamEmphasisPlan,
} from './types';
import { scoreCard, rankCards } from './importanceEngine';
import { datApexEngine } from './datApexEngine';
import { clinicalReasoningEngine } from './clinicalReasoningEngine';
import { matchSyllabusToToc, getSyllabusMatchForPage } from './syllabusMatchingEngine';
import { smartSpeechEngine } from './smartSpeechEngine';
import { createSafeStorage } from '../storage';

// ============================================================================
// State Interface
// ============================================================================

interface ExpertViewState {
  // Document context
  docId: DocId;
  docTitle: string;
  totalPages: number;

  // Current page context
  pageContext: PageContext;

  // Exam type
  examType: ExamType;

  // Knowledge cards (extracted)
  cards: Record<CardId, KnowledgeCard>;
  cardsByPage: Record<PageIndex, CardId[]>;

  // Syllabus
  syllabusItems: SyllabusItem[];
  syllabusMatches: SyllabusMatch[];

  // TOC
  tocNodes: TocNode[];

  // User weakness (from study history)
  userWeakness: Record<CardId, number>;

  // UI state
  selectedCardId?: CardId;
  activeTab: 'priority' | 'explain' | 'compare' | 'insights';
  filters: ExpertViewFilters;

  // Processing
  isExtracting: boolean;
  extractionProgress: number;

  // DAT Apex mode
  datApexEnabled: boolean;
}

interface ExpertViewActions {
  // Document setup
  setDocument: (docId: DocId, title: string, totalPages: number) => void;
  setExamType: (examType: ExamType) => void;
  setTocNodes: (nodes: TocNode[]) => void;

  // Page navigation
  setPage: (pageIndex: PageIndex) => void;

  // Cards
  addCards: (cards: KnowledgeCard[]) => void;
  clearCards: () => void;
  extractCurrentPage: () => Promise<void>;
  extractChapter: () => Promise<void>;

  // Syllabus
  setSyllabusItems: (items: SyllabusItem[]) => void;
  runSyllabusMatching: () => void;

  // UI
  selectCard: (cardId: CardId | undefined) => void;
  setActiveTab: (tab: ExpertViewState['activeTab']) => void;
  setFilters: (filters: Partial<ExpertViewFilters>) => void;
  toggleDatApex: () => void;

  // Getters
  getExpertViewPayload: () => ExpertViewPayload;
  getCardsForCurrentPage: () => KnowledgeCard[];
  getCardsForCurrentChapter: () => KnowledgeCard[];
  getRankedCards: () => ExpertViewCard[];
  getReasoningChain: () => ReasoningChain;
  getDifferentialTable: (cardId: CardId) => DifferentialTable | undefined;
  getSpeechPlan: () => ExamEmphasisPlan;

  // Reset
  reset: () => void;
}

type ExpertViewStore = ExpertViewState & ExpertViewActions;

// ============================================================================
// Helpers
// ============================================================================

function computePageContext(
  docId: DocId,
  pageIndex: PageIndex,
  totalPages: number,
  tocNodes: TocNode[]
): PageContext {
  // Find chapter for current page
  let tocPath: PageContext['tocPath'];
  let confidence = 0;

  for (const node of tocNodes) {
    if (pageIndex >= node.pageStart && (!node.pageEnd || pageIndex <= node.pageEnd)) {
      tocPath = {
        chapterId: node.id,
        tocNodeId: node.id,
        title: node.title,
      };
      confidence = 0.9;
      break;
    }
  }

  return {
    docId,
    pageIndex,
    totalPages,
    tocPath,
    confidence,
    updatedAt: Date.now(),
  };
}

// ============================================================================
// Default State
// ============================================================================

const defaultFilters: ExpertViewFilters = {
  kindFilter: 'all',
  minConfidence: 0.5,
  showTrapsOnly: false,
  datApexEnabled: true,
};

const defaultState: ExpertViewState = {
  docId: '',
  docTitle: '',
  totalPages: 0,
  pageContext: {
    docId: '',
    pageIndex: 0,
    totalPages: 0,
    confidence: 0,
    updatedAt: Date.now(),
  },
  examType: 'DAT',
  cards: {},
  cardsByPage: {},
  syllabusItems: [],
  syllabusMatches: [],
  tocNodes: [],
  userWeakness: {},
  selectedCardId: undefined,
  activeTab: 'priority',
  filters: defaultFilters,
  isExtracting: false,
  extractionProgress: 0,
  datApexEnabled: true,
};

// ============================================================================
// Store
// ============================================================================

export const useExpertViewStore = create<ExpertViewStore>()(
  persist(
    (set, get) => ({
      ...defaultState,

      // ========================================
      // Document Setup
      // ========================================

      setDocument: (docId, title, totalPages) => {
        const pageContext = computePageContext(docId, 0, totalPages, get().tocNodes);
        set({
          docId,
          docTitle: title,
          totalPages,
          pageContext,
          cards: {},
          cardsByPage: {},
          selectedCardId: undefined,
        });
      },

      setExamType: (examType) => {
        set({ examType });
      },

      setTocNodes: (nodes) => {
        const { docId, pageContext, totalPages } = get();
        const newPageContext = computePageContext(docId, pageContext.pageIndex, totalPages, nodes);
        set({
          tocNodes: nodes,
          pageContext: newPageContext,
        });
      },

      // ========================================
      // Page Navigation
      // ========================================

      setPage: (pageIndex) => {
        const { docId, totalPages, tocNodes } = get();
        const pageContext = computePageContext(docId, pageIndex, totalPages, tocNodes);
        set({ pageContext });
      },

      // ========================================
      // Cards
      // ========================================

      addCards: (newCards) => {
        set((state) => {
          const cards = { ...state.cards };
          const cardsByPage = { ...state.cardsByPage };

          for (const card of newCards) {
            cards[card.id] = card;

            for (const page of card.pageRefs) {
              if (!cardsByPage[page]) {
                cardsByPage[page] = [];
              }
              if (!cardsByPage[page].includes(card.id)) {
                cardsByPage[page].push(card.id);
              }
            }
          }

          return { cards, cardsByPage };
        });
      },

      clearCards: () => {
        set({
          cards: {},
          cardsByPage: {},
          selectedCardId: undefined,
        });
      },

      extractCurrentPage: async () => {
        // This would call an extraction API
        // For now, just mark as extracting
        set({ isExtracting: true, extractionProgress: 0 });

        // Simulate extraction
        await new Promise(resolve => setTimeout(resolve, 100));

        set({ isExtracting: false, extractionProgress: 100 });
      },

      extractChapter: async () => {
        set({ isExtracting: true, extractionProgress: 0 });
        await new Promise(resolve => setTimeout(resolve, 100));
        set({ isExtracting: false, extractionProgress: 100 });
      },

      // ========================================
      // Syllabus
      // ========================================

      setSyllabusItems: (items) => {
        set({ syllabusItems: items });
      },

      runSyllabusMatching: () => {
        const { syllabusItems, tocNodes, docId, cards } = get();
        const matches = matchSyllabusToToc(
          syllabusItems,
          tocNodes,
          docId,
          Object.values(cards)
        );
        set({ syllabusMatches: matches });
      },

      // ========================================
      // UI
      // ========================================

      selectCard: (cardId) => {
        set({ selectedCardId: cardId });
      },

      setActiveTab: (tab) => {
        set({ activeTab: tab });
      },

      setFilters: (filters) => {
        set((state) => ({
          filters: { ...state.filters, ...filters },
        }));
      },

      toggleDatApex: () => {
        set((state) => ({ datApexEnabled: !state.datApexEnabled }));
      },

      // ========================================
      // Getters
      // ========================================

      getCardsForCurrentPage: () => {
        const { cards, cardsByPage, pageContext } = get();
        const cardIds = cardsByPage[pageContext.pageIndex] || [];
        return cardIds.map(id => cards[id]).filter(Boolean);
      },

      getCardsForCurrentChapter: () => {
        const { cards, cardsByPage, pageContext, tocNodes } = get();

        // Find chapter range
        const chapter = tocNodes.find(n =>
          pageContext.pageIndex >= n.pageStart &&
          (!n.pageEnd || pageContext.pageIndex <= n.pageEnd)
        );

        if (!chapter) return get().getCardsForCurrentPage();

        const start = chapter.pageStart;
        const end = chapter.pageEnd ?? start + 20;

        const result: KnowledgeCard[] = [];
        for (let p = start; p <= end; p++) {
          const cardIds = cardsByPage[p] || [];
          for (const id of cardIds) {
            if (cards[id] && !result.some(c => c.id === id)) {
              result.push(cards[id]);
            }
          }
        }

        return result;
      },

      getRankedCards: () => {
        const {
          pageContext,
          syllabusMatches,
          examType,
          userWeakness,
          filters,
          datApexEnabled,
        } = get();

        const pageCards = get().getCardsForCurrentPage();

        // Filter by kind
        let filteredCards = pageCards;
        if (filters.kindFilter !== 'all') {
          const kindMap: Record<CardFilterKind, string[]> = {
            all: [],
            process: ['pattern', 'decision'],
            causal: ['rule'],
            diagnostic: ['decision', 'definition'],
            risk: ['trap', 'exception'],
            exception: ['exception'],
          };
          const allowedKinds = kindMap[filters.kindFilter];
          filteredCards = pageCards.filter(c => allowedKinds.includes(c.kind));
        }

        // Filter by confidence
        filteredCards = filteredCards.filter(c =>
          (c.scores?.confidence ?? 1) >= filters.minConfidence
        );

        // Score and rank
        const ranked = rankCards(filteredCards, {
          page: pageContext,
          matches: syllabusMatches,
          examType,
          userWeakness,
        });

        // Add DAT apex data
        return ranked.map(({ card, score, explanation }) => {
          const datResult = datApexEnabled
            ? datApexEngine.scoreCard(card, { examType })
            : { datSignal: 0, traps: [] };

          return {
            card,
            importanceScore: score,
            importanceExplanation: explanation,
            traps: datResult.traps,
            datSignal: datResult.datSignal,
          };
        });
      },

      getExpertViewPayload: () => {
        const { docId, pageContext, syllabusMatches } = get();
        const rankedCards = get().getRankedCards();
        const reasoningChain = get().getReasoningChain();

        // Get differential for selected card
        const selectedCardId = get().selectedCardId;
        let differential: DifferentialTable | undefined;
        if (selectedCardId) {
          differential = get().getDifferentialTable(selectedCardId);
        }

        return {
          docId,
          pageContext,
          cards: rankedCards,
          differential,
          reasoningChain,
          syllabusMatches: getSyllabusMatchForPage(pageContext.pageIndex, syllabusMatches),
        };
      },

      getReasoningChain: () => {
        const { pageContext, cards } = get();
        const pageCards = Object.values(cards).filter(c =>
          c.pageRefs.includes(pageContext.pageIndex)
        );
        return clinicalReasoningEngine.buildChain(pageCards, pageContext);
      },

      getDifferentialTable: (cardId) => {
        const { cards, examType } = get();
        const card = cards[cardId];
        if (!card) return undefined;

        // Get related cards as neighbors
        const neighbors = card.relatedCardIds
          .map(id => cards[id])
          .filter(Boolean);

        return datApexEngine.buildDifferential(card, neighbors);
      },

      getSpeechPlan: () => {
        const { docId, pageContext, examType, cards } = get();
        const pageCards = Object.values(cards).filter(c =>
          c.pageRefs.includes(pageContext.pageIndex)
        );
        return smartSpeechEngine.planFromPage(
          docId,
          pageContext.pageIndex,
          pageCards,
          examType
        );
      },

      // ========================================
      // Reset
      // ========================================

      reset: () => {
        set(defaultState);
      },
    }),
    {
      name: 'expert-view-store',
      storage: createJSONStorage(() => createSafeStorage({
        maxSize: 50 * 1024, // 50KB limit for UI state
        onQuotaExceeded: (error, key) => {
          console.warn(`[ExpertView] Storage quota exceeded for ${key}:`, error.message);
        },
        onStateTooLarge: (size, key) => {
          console.warn(`[ExpertView] State too large for ${key}: ${Math.round(size / 1024)}KB`);
        },
        // Extract minimal state if full state is too large
        getMinimalState: (state: unknown) => {
          const s = state as Partial<ExpertViewState>;
          return {
            examType: s.examType,
            filters: s.filters,
            datApexEnabled: s.datApexEnabled,
            // Limit userWeakness to most recent 100 entries
            userWeakness: Object.fromEntries(
              Object.entries(s.userWeakness || {}).slice(-100)
            ),
          };
        },
      })),
      // Only persist minimal UI state - NOT large data collections
      partialize: (state) => ({
        examType: state.examType,
        filters: state.filters,
        datApexEnabled: state.datApexEnabled,
        // Limit userWeakness to prevent unbounded growth
        userWeakness: Object.fromEntries(
          Object.entries(state.userWeakness).slice(-100)
        ),
      }),
    }
  )
);

// Phase 2 One Brain: auto-sync current page from CurrentLearningContext.
// setDocument is NOT subscribed here — it requires documentTitle which is not
// in CurrentLearningContext yet (planned for Phase 3).
if (typeof window !== 'undefined') {
  useCurrentLearningContext.subscribe((state, prev) => {
    if (state.currentPage !== prev.currentPage) {
      useExpertViewStore.getState().setPage(Math.max(1, state.currentPage));
    }
  });
}

export default useExpertViewStore;
