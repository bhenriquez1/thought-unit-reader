// lib/stores/courseContextStore.ts
// CourseContext Store - Central hub connecting syllabus, page intelligence, study, and notes
// This store bridges all course-aware features into a unified data flow

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useSyllabusStore, type SyllabusTopic, type Syllabus } from './syllabusStore';
import type { PageIntelligence, StudyCard as PageIntelStudyCard, Insight, Segment } from '../page-intelligence/types';

// ============================================================================
// IndexedDB Storage for PageIntelligence
// ============================================================================

const DB_NAME = 'CourseContextDB';
const DB_VERSION = 1;
const STORES = {
  pageIntelligence: 'pageIntelligence',
};

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('📚 CourseContextDB: Failed to open database');
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log('📚 CourseContextDB: Database opened successfully');
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      console.log('📚 CourseContextDB: Upgrading database schema');

      // Create pageIntelligence store with compound key
      if (!db.objectStoreNames.contains(STORES.pageIntelligence)) {
        const store = db.createObjectStore(STORES.pageIntelligence, { keyPath: 'key' });
        store.createIndex('docId', 'docId', { unique: false });
        store.createIndex('pageNumber', 'pageNumber', { unique: false });
        console.log('📚 CourseContextDB: Created pageIntelligence store');
      }
    };
  });

  return dbPromise;
}

async function savePageIntelToDB(
  documentId: string,
  pageNumber: number,
  intelligence: PageIntelligence
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.pageIntelligence, 'readwrite');
      const store = transaction.objectStore(STORES.pageIntelligence);
      const key = `${documentId}:${pageNumber}`;
      const request = store.put({
        key,
        docId: documentId,
        pageNumber,
        data: intelligence,
        updatedAt: Date.now(),
      });

      request.onsuccess = () => {
        console.log(`📚 CourseContextDB: Saved pageIntel for ${documentId} page ${pageNumber}`);
        resolve();
      };
      request.onerror = () => {
        console.error('📚 CourseContextDB: Failed to save pageIntel:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.warn('📚 CourseContextDB: savePageIntel failed:', error);
  }
}

async function loadPageIntelFromDB(
  documentId: string,
  pageNumber: number
): Promise<PageIntelligence | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.pageIntelligence, 'readonly');
      const store = transaction.objectStore(STORES.pageIntelligence);
      const key = `${documentId}:${pageNumber}`;
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        if (result?.data) {
          console.log(`📚 CourseContextDB: Loaded pageIntel for ${documentId} page ${pageNumber}`);
          resolve(result.data as PageIntelligence);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => {
        console.error('📚 CourseContextDB: Failed to load pageIntel:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.warn('📚 CourseContextDB: loadPageIntel failed:', error);
    return null;
  }
}

async function loadAllPageIntelForDoc(documentId: string): Promise<Record<number, PageIntelligence>> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.pageIntelligence, 'readonly');
      const store = transaction.objectStore(STORES.pageIntelligence);
      const index = store.index('docId');
      const request = index.getAll(documentId);

      request.onsuccess = () => {
        const results = request.result || [];
        const byPage: Record<number, PageIntelligence> = {};
        results.forEach((item: { pageNumber: number; data: PageIntelligence }) => {
          byPage[item.pageNumber] = item.data;
        });
        console.log(`📚 CourseContextDB: Loaded ${results.length} pages for ${documentId}`);
        resolve(byPage);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('📚 CourseContextDB: loadAllPageIntel failed:', error);
    return {};
  }
}

// ============================================================================
// Types
// ============================================================================

export interface DebugStatus {
  syllabusTopicsCount: number;
  currentPage: number;
  paragraphsExtracted: number;
  insightsGenerated: number;
  cardsGenerated: number;
  lastRunTimestamp: number | null;
  activeDocumentId: string | null;
}

export interface PriorityItem {
  segmentId: string;
  text: string;
  score: number;
  reason: string;
  pageNumber: number;
  topicId?: string;
}

export interface CourseContextState {
  // Document context
  activeDocumentId: string | null;
  currentPage: number;
  totalPages: number;

  // Syllabus topics (synced from syllabusStore)
  syllabusTopics: SyllabusTopic[];
  currentSyllabus: Syllabus | null;

  // Page Intelligence by page (LRU cache in memory, full store in IndexedDB)
  pageIntelByPage: Record<number, PageIntelligence>;
  pageIntelCache: Set<number>; // Track which pages are in memory

  // Computed priorities (top items across all extracted pages)
  priorities: PriorityItem[];

  // Aggregated study cards from page intelligence
  pageIntelCards: PageIntelStudyCard[];

  // Notes organization indexes
  notesByTopic: Record<string, string[]>;      // topicId -> annotationIds
  notesByEvidence: Record<string, string[]>;   // segmentId -> annotationIds

  // Debug/status tracking
  lastExtractedPage: number | null;
  lastExtractedAt: number | null;
  isExtracting: boolean;
  extractionError: string | null;

  // Actions - Document
  setDocument: (docId: string, totalPages: number) => void;
  clearDocument: () => void;
  setPage: (page: number) => void;

  // Actions - Page Intelligence
  storePageIntelligence: (page: number, intel: PageIntelligence) => Promise<void>;
  getPageIntelligence: (page: number) => Promise<PageIntelligence | null>;
  loadPageIntelligenceFromDB: (page: number) => Promise<PageIntelligence | null>;
  setExtracting: (isExtracting: boolean, error?: string | null) => void;

  // Actions - Cards
  getAllStudyCards: () => PageIntelStudyCard[];
  getCardsForPage: (page: number) => PageIntelStudyCard[];
  getCardsForTopic: (topicId: string) => PageIntelStudyCard[];

  // Actions - Topics
  getTopicForPage: (page: number) => SyllabusTopic | null;
  getChapterRangeForPage: (page: number) => { start: number; end: number } | null;
  syncSyllabusTopics: () => void;

  // Actions - Notes organization
  linkNoteToTopic: (annotationId: string, topicId: string) => void;
  linkNoteToEvidence: (annotationId: string, segmentId: string) => void;
  getNotesForTopic: (topicId: string) => string[];
  getNotesForEvidence: (segmentId: string) => string[];

  // Actions - Debug
  getDebugStatus: () => DebugStatus;

  // Hydration
  hydrateFromDB: (docId: string) => Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_CACHED_PAGES = 10; // LRU cache size

// ============================================================================
// Internal Helpers (defined before store to avoid circular refs)
// ============================================================================

// Store reference for internal helpers - will be set after store is created
let storeRef: typeof useCourseContextStore | null = null;

// Helper function to update priorities - called after storing page intelligence
function updatePrioritiesInternal(page: number, intel: PageIntelligence): void {
  if (!storeRef) return;
  const state = storeRef.getState();
  const { syllabusTopics, priorities } = state;

  // Get topic for this page
  const topic = syllabusTopics.find(t =>
    t.pageRanges.some(r => page >= r.start && page <= r.end)
  );

  // Convert insights to priority items
  const newPriorities: PriorityItem[] = intel.insights
    .filter(insight => insight.score >= 60) // Only high-yield insights
    .map(insight => {
      // Find the segment text
      const segment = intel.segments.find(s => insight.evidenceSegmentIds.includes(s.id));
      return {
        segmentId: insight.evidenceSegmentIds[0] || insight.id,
        text: segment?.text || insight.body,
        score: insight.score,
        reason: insight.badge,
        pageNumber: page,
        topicId: topic?.id,
      };
    });

  // Merge with existing priorities (remove duplicates from same page)
  const existingPriorities = priorities.filter(p => p.pageNumber !== page);
  const mergedPriorities = [...existingPriorities, ...newPriorities]
    .sort((a, b) => b.score - a.score)
    .slice(0, 50); // Keep top 50 priorities

  storeRef.setState({ priorities: mergedPriorities });
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useCourseContextStore = create<CourseContextState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    activeDocumentId: null,
    currentPage: 0,
    totalPages: 0,
    syllabusTopics: [],
    currentSyllabus: null,
    pageIntelByPage: {},
    pageIntelCache: new Set(),
    priorities: [],
    pageIntelCards: [],
    notesByTopic: {},
    notesByEvidence: {},
    lastExtractedPage: null,
    lastExtractedAt: null,
    isExtracting: false,
    extractionError: null,

    // ========================================================================
    // Document Actions
    // ========================================================================

    setDocument: (docId: string, totalPages: number) => {
      const currentDocId = get().activeDocumentId;
      if (currentDocId === docId) {
        // Same document, just update page count if different
        if (get().totalPages !== totalPages) {
          set({ totalPages });
        }
        return;
      }

      // New document - reset state and hydrate
      set({
        activeDocumentId: docId,
        totalPages,
        currentPage: 0,
        pageIntelByPage: {},
        pageIntelCache: new Set(),
        priorities: [],
        pageIntelCards: [],
        notesByTopic: {},
        notesByEvidence: {},
        lastExtractedPage: null,
        lastExtractedAt: null,
        isExtracting: false,
        extractionError: null,
      });

      // Sync syllabus topics
      get().syncSyllabusTopics();

      // Hydrate from IndexedDB
      get().hydrateFromDB(docId);
    },

    clearDocument: () => {
      set({
        activeDocumentId: null,
        totalPages: 0,
        currentPage: 0,
        pageIntelByPage: {},
        pageIntelCache: new Set(),
        priorities: [],
        pageIntelCards: [],
        syllabusTopics: [],
        currentSyllabus: null,
        notesByTopic: {},
        notesByEvidence: {},
        lastExtractedPage: null,
        lastExtractedAt: null,
      });
    },

    setPage: (page: number) => {
      set({ currentPage: page });
    },

    // ========================================================================
    // Page Intelligence Actions
    // ========================================================================

    storePageIntelligence: async (page: number, intel: PageIntelligence) => {
      const { activeDocumentId, pageIntelByPage, pageIntelCache, pageIntelCards } = get();
      if (!activeDocumentId) {
        console.warn('📚 CourseContext: No active document for storePageIntelligence');
        return;
      }

      // Update in-memory cache
      const newCache = new Set(pageIntelCache);
      newCache.add(page);

      // LRU eviction if cache is full
      if (newCache.size > MAX_CACHED_PAGES) {
        const oldest = Array.from(newCache)[0];
        newCache.delete(oldest);
        const { [oldest]: _, ...restPages } = pageIntelByPage;
        set({
          pageIntelByPage: { ...restPages, [page]: intel },
          pageIntelCache: newCache,
        });
      } else {
        set({
          pageIntelByPage: { ...pageIntelByPage, [page]: intel },
          pageIntelCache: newCache,
        });
      }

      // Update cards from this page
      const existingCards = pageIntelCards.filter(c => !c.deck.includes(`:page:${page}`));
      const newCards = intel.cards.map(card => ({
        ...card,
        deck: `${activeDocumentId}:page:${page}`,
      }));
      set({
        pageIntelCards: [...existingCards, ...newCards],
        lastExtractedPage: page,
        lastExtractedAt: Date.now(),
      });

      // Update priorities from this page's insights
      updatePrioritiesInternal(page, intel);

      // Persist to IndexedDB
      await savePageIntelToDB(activeDocumentId, page, intel);
    },

    getPageIntelligence: async (page: number) => {
      const { pageIntelByPage } = get();

      // Check in-memory cache first
      if (pageIntelByPage[page]) {
        return pageIntelByPage[page];
      }

      // Load from IndexedDB
      return get().loadPageIntelligenceFromDB(page);
    },

    loadPageIntelligenceFromDB: async (page: number) => {
      const { activeDocumentId, pageIntelByPage, pageIntelCache } = get();
      if (!activeDocumentId) return null;

      const intel = await loadPageIntelFromDB(activeDocumentId, page);
      if (intel) {
        // Add to in-memory cache
        const newCache = new Set(pageIntelCache);
        newCache.add(page);

        // LRU eviction
        if (newCache.size > MAX_CACHED_PAGES) {
          const oldest = Array.from(newCache)[0];
          newCache.delete(oldest);
          const { [oldest]: _, ...restPages } = pageIntelByPage;
          set({
            pageIntelByPage: { ...restPages, [page]: intel },
            pageIntelCache: newCache,
          });
        } else {
          set({
            pageIntelByPage: { ...pageIntelByPage, [page]: intel },
            pageIntelCache: newCache,
          });
        }
      }
      return intel;
    },

    setExtracting: (isExtracting: boolean, error?: string | null) => {
      set({
        isExtracting,
        extractionError: error ?? null,
      });
    },

    // ========================================================================
    // Card Actions
    // ========================================================================

    getAllStudyCards: () => {
      return get().pageIntelCards;
    },

    getCardsForPage: (page: number) => {
      const { activeDocumentId, pageIntelCards } = get();
      if (!activeDocumentId) return [];
      const deckPrefix = `${activeDocumentId}:page:${page}`;
      return pageIntelCards.filter(c => c.deck === deckPrefix);
    },

    getCardsForTopic: (topicId: string) => {
      const { pageIntelCards, syllabusTopics } = get();
      const topic = syllabusTopics.find(t => t.id === topicId);
      if (!topic) return [];

      // Get all cards from pages in the topic's range
      return pageIntelCards.filter(card => {
        // Extract page number from deck string
        const match = card.deck.match(/:page:(\d+)$/);
        if (!match) return false;
        const cardPage = parseInt(match[1], 10);
        return topic.pageRanges.some(r => cardPage >= r.start && cardPage <= r.end);
      });
    },

    // ========================================================================
    // Topic Actions
    // ========================================================================

    getTopicForPage: (page: number) => {
      const { syllabusTopics } = get();
      return syllabusTopics.find(t =>
        t.pageRanges.some(r => page >= r.start && page <= r.end)
      ) || null;
    },

    getChapterRangeForPage: (page: number) => {
      const topic = get().getTopicForPage(page);
      if (!topic || topic.pageRanges.length === 0) return null;

      // Find the range that contains this page
      const range = topic.pageRanges.find(r => page >= r.start && page <= r.end);
      return range || topic.pageRanges[0];
    },

    syncSyllabusTopics: () => {
      const syllabusState = useSyllabusStore.getState();
      set({
        syllabusTopics: syllabusState.currentSyllabus?.topics || [],
        currentSyllabus: syllabusState.currentSyllabus,
      });
    },

    // ========================================================================
    // Notes Organization Actions
    // ========================================================================

    linkNoteToTopic: (annotationId: string, topicId: string) => {
      const { notesByTopic } = get();
      const existing = notesByTopic[topicId] || [];
      if (!existing.includes(annotationId)) {
        set({
          notesByTopic: {
            ...notesByTopic,
            [topicId]: [...existing, annotationId],
          },
        });
      }
    },

    linkNoteToEvidence: (annotationId: string, segmentId: string) => {
      const { notesByEvidence } = get();
      const existing = notesByEvidence[segmentId] || [];
      if (!existing.includes(annotationId)) {
        set({
          notesByEvidence: {
            ...notesByEvidence,
            [segmentId]: [...existing, annotationId],
          },
        });
      }
    },

    getNotesForTopic: (topicId: string) => {
      return get().notesByTopic[topicId] || [];
    },

    getNotesForEvidence: (segmentId: string) => {
      return get().notesByEvidence[segmentId] || [];
    },

    // ========================================================================
    // Debug Actions
    // ========================================================================

    getDebugStatus: (): DebugStatus => {
      const state = get();
      const currentPageIntel = state.pageIntelByPage[state.currentPage];

      return {
        syllabusTopicsCount: state.syllabusTopics.length,
        currentPage: state.currentPage,
        paragraphsExtracted: currentPageIntel?.segments?.filter(s => s.kind === 'paragraph').length || 0,
        insightsGenerated: currentPageIntel?.insights?.length || 0,
        cardsGenerated: state.pageIntelCards.length,
        lastRunTimestamp: state.lastExtractedAt,
        activeDocumentId: state.activeDocumentId,
      };
    },

    // ========================================================================
    // Hydration
    // ========================================================================

    hydrateFromDB: async (docId: string) => {
      console.log(`📚 CourseContext: Hydrating from IndexedDB for ${docId}`);

      try {
        const allPageIntel = await loadAllPageIntelForDoc(docId);
        const pageNumbers = Object.keys(allPageIntel).map(Number);

        if (pageNumbers.length === 0) {
          console.log('📚 CourseContext: No existing page intelligence found');
          return;
        }

        // Load most recent pages into memory (up to MAX_CACHED_PAGES)
        const recentPages = pageNumbers.slice(-MAX_CACHED_PAGES);
        const pageIntelByPage: Record<number, PageIntelligence> = {};
        const pageIntelCache = new Set<number>();

        recentPages.forEach(page => {
          pageIntelByPage[page] = allPageIntel[page];
          pageIntelCache.add(page);
        });

        // Aggregate all cards
        const allCards: PageIntelStudyCard[] = [];
        Object.entries(allPageIntel).forEach(([page, intel]) => {
          intel.cards.forEach(card => {
            allCards.push({
              ...card,
              deck: `${docId}:page:${page}`,
            });
          });
        });

        // Find most recent extraction
        let lastExtractedAt: number | null = null;
        let lastExtractedPage: number | null = null;
        Object.entries(allPageIntel).forEach(([page, intel]) => {
          if (intel.extractedAt && (!lastExtractedAt || intel.extractedAt > lastExtractedAt)) {
            lastExtractedAt = intel.extractedAt;
            lastExtractedPage = parseInt(page, 10);
          }
        });

        set({
          pageIntelByPage,
          pageIntelCache,
          pageIntelCards: allCards,
          lastExtractedAt,
          lastExtractedPage,
        });

        console.log(`📚 CourseContext: Hydrated ${pageNumbers.length} pages, ${allCards.length} cards`);
      } catch (error) {
        console.error('📚 CourseContext: Hydration failed:', error);
      }
    },
  }))
);

// ============================================================================
// Post-creation setup
// ============================================================================

// Set the store reference for internal helpers
storeRef = useCourseContextStore;

// ============================================================================
// Syllabus Store Subscription
// ============================================================================

// Subscribe to syllabus store changes to keep topics in sync
if (typeof window !== 'undefined') {
  let prevSyllabus = useSyllabusStore.getState().currentSyllabus;
  useSyllabusStore.subscribe((state) => {
    if (state.currentSyllabus !== prevSyllabus) {
      prevSyllabus = state.currentSyllabus;
      console.log('📚 CourseContext: Syllabus changed, syncing topics');
      useCourseContextStore.setState({
        syllabusTopics: state.currentSyllabus?.topics || [],
        currentSyllabus: state.currentSyllabus,
      });
    }
  });
}

export default useCourseContextStore;
