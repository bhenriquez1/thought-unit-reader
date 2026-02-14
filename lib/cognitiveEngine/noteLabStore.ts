// lib/cognitiveEngine/noteLabStore.ts
// NoteLab 2.0 Store - 3-Lane Kanban for Cognitive Notes

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  NoteLabNote,
  NoteLabNoteType,
  NoteLabLane,
  NoteLabStoreState,
  NoteLabStoreActions,
  QuickCaptureType,
  MissDetector,
} from './types';

// ============================================================================
// Helpers
// ============================================================================

function generateNoteId(): string {
  return `note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function getLaneForType(type: NoteLabNoteType): NoteLabLane {
  switch (type) {
    case 'INSIGHT':
      return 'insights';
    case 'DIFFERENTIAL':
    case 'DECISION_RULE':
    case 'PATHWAY':
    case 'QUESTION':
      return 'reasoning';
    case 'TRAP':
    case 'MNEMONIC':
      return 'memory';
    default:
      return 'insights';
  }
}

function getTypeForQuickCapture(type: QuickCaptureType): NoteLabNoteType {
  switch (type) {
    case 'insight':
    case 'high_yield':
      return 'INSIGHT';
    case 'confusing':
      return 'QUESTION';
    case 'review':
      return 'MNEMONIC';
    case 'question':
      return 'QUESTION';
    default:
      return 'INSIGHT';
  }
}

function getLaneForQuickCapture(type: QuickCaptureType): NoteLabLane {
  switch (type) {
    case 'insight':
    case 'high_yield':
      return 'insights';
    case 'confusing':
    case 'question':
      return 'reasoning';
    case 'review':
      return 'memory';
    default:
      return 'insights';
  }
}

// ============================================================================
// Default State
// ============================================================================

const defaultState: NoteLabStoreState = {
  notes: {},
  notesByLane: {
    insights: [],
    reasoning: [],
    memory: [],
  },
  notesByType: {
    INSIGHT: [],
    DIFFERENTIAL: [],
    DECISION_RULE: [],
    PATHWAY: [],
    TRAP: [],
    MNEMONIC: [],
    QUESTION: [],
  },
  notesByPage: {},
  selectedNoteId: undefined,
  activeLane: 'insights',
  filterByType: undefined,
  showMasteredNotes: false,
  searchQuery: '',
};

// ============================================================================
// Store
// ============================================================================

type NoteLabStore = NoteLabStoreState & NoteLabStoreActions;

export const useNoteLabStore = create<NoteLabStore>()(
  persist(
    (set, get) => ({
      ...defaultState,

      // ========================================
      // CRUD
      // ========================================

      addNote: (noteData) => {
        const id = generateNoteId();
        const now = Date.now();

        const note: NoteLabNote = {
          ...noteData,
          id,
          createdAt: now,
          updatedAt: now,
          reviewCount: 0,
        };

        set((state) => {
          const newNotes = { ...state.notes, [id]: note };

          // Update indexes
          const newNotesByLane = { ...state.notesByLane };
          newNotesByLane[note.lane] = [...newNotesByLane[note.lane], id];

          const newNotesByType = { ...state.notesByType };
          newNotesByType[note.noteType] = [...newNotesByType[note.noteType], id];

          const newNotesByPage = { ...state.notesByPage };
          if (note.pageIndex !== undefined) {
            const pageNotes = newNotesByPage[note.pageIndex] || [];
            newNotesByPage[note.pageIndex] = [...pageNotes, id];
          }

          return {
            notes: newNotes,
            notesByLane: newNotesByLane,
            notesByType: newNotesByType,
            notesByPage: newNotesByPage,
          };
        });

        return id;
      },

      updateNote: (noteId, updates) => {
        set((state) => {
          const existing = state.notes[noteId];
          if (!existing) return state;

          const updated: NoteLabNote = {
            ...existing,
            ...updates,
            updatedAt: Date.now(),
          };

          // Handle lane changes
          let newNotesByLane = state.notesByLane;
          if (updates.lane && updates.lane !== existing.lane) {
            newNotesByLane = { ...state.notesByLane };
            newNotesByLane[existing.lane] = newNotesByLane[existing.lane].filter(id => id !== noteId);
            newNotesByLane[updates.lane] = [...newNotesByLane[updates.lane], noteId];
          }

          // Handle type changes
          let newNotesByType = state.notesByType;
          if (updates.noteType && updates.noteType !== existing.noteType) {
            newNotesByType = { ...state.notesByType };
            newNotesByType[existing.noteType] = newNotesByType[existing.noteType].filter(id => id !== noteId);
            newNotesByType[updates.noteType] = [...newNotesByType[updates.noteType], noteId];
          }

          return {
            notes: { ...state.notes, [noteId]: updated },
            notesByLane: newNotesByLane,
            notesByType: newNotesByType,
          };
        });
      },

      deleteNote: (noteId) => {
        set((state) => {
          const note = state.notes[noteId];
          if (!note) return state;

          const { [noteId]: removed, ...remainingNotes } = state.notes;

          // Update indexes
          const newNotesByLane = { ...state.notesByLane };
          newNotesByLane[note.lane] = newNotesByLane[note.lane].filter(id => id !== noteId);

          const newNotesByType = { ...state.notesByType };
          newNotesByType[note.noteType] = newNotesByType[note.noteType].filter(id => id !== noteId);

          const newNotesByPage = { ...state.notesByPage };
          if (note.pageIndex !== undefined) {
            newNotesByPage[note.pageIndex] = (newNotesByPage[note.pageIndex] || []).filter(id => id !== noteId);
          }

          return {
            notes: remainingNotes,
            notesByLane: newNotesByLane,
            notesByType: newNotesByType,
            notesByPage: newNotesByPage,
            selectedNoteId: state.selectedNoteId === noteId ? undefined : state.selectedNoteId,
          };
        });
      },

      // ========================================
      // Quick Capture
      // ========================================

      quickCapture: (type, content, sourceId, pageIndex) => {
        const noteType = getTypeForQuickCapture(type);
        const lane = getLaneForQuickCapture(type);

        return get().addNote({
          title: content.slice(0, 50) + (content.length > 50 ? '...' : ''),
          content,
          noteType,
          lane,
          sourceType: sourceId ? 'manual' : 'manual',
          sourceId,
          pageIndex,
          tags: [type],
          isConfusing: type === 'confusing',
          isMastered: false,
        });
      },

      // ========================================
      // Import from Insight
      // ========================================

      importFromInsight: (insight) => {
        const content = `${insight.claim}\n\n**Why it matters:** ${insight.whyItMatters}`;

        return get().addNote({
          title: insight.title,
          content,
          noteType: 'INSIGHT',
          lane: 'insights',
          sourceType: 'insight',
          sourceId: insight.sourceId,
          pageIndex: insight.evidence[0]?.page,
          quote: insight.evidence[0]?.text,
          tags: insight.tags,
          importanceBucket: insight.bucket as NoteLabNote['importanceBucket'],
          isConfusing: false,
          isMastered: false,
        });
      },

      // ========================================
      // Miss Detector
      // ========================================

      updateMissDetector: (noteId, missDetector) => {
        get().updateNote(noteId, { missDetector });
      },

      // ========================================
      // State Changes
      // ========================================

      markConfusing: (noteId) => {
        const note = get().notes[noteId];
        if (!note) return;

        get().updateNote(noteId, {
          isConfusing: true,
          isMastered: false,
        });

        // Move to reasoning lane if not already there
        if (note.lane !== 'reasoning') {
          get().moveToLane(noteId, 'reasoning');
        }
      },

      markMastered: (noteId) => {
        get().updateNote(noteId, {
          isMastered: true,
          isConfusing: false,
        });
      },

      moveToLane: (noteId, lane) => {
        get().updateNote(noteId, { lane });
      },

      // ========================================
      // Review
      // ========================================

      recordReview: (noteId) => {
        const note = get().notes[noteId];
        if (!note) return;

        get().updateNote(noteId, {
          reviewCount: note.reviewCount + 1,
          lastReviewedAt: Date.now(),
        });
      },

      // ========================================
      // UI
      // ========================================

      selectNote: (noteId) => {
        set({ selectedNoteId: noteId });
      },

      setActiveLane: (lane) => {
        set({ activeLane: lane });
      },

      setFilterByType: (type) => {
        set({ filterByType: type });
      },

      toggleShowMastered: () => {
        set((state) => ({ showMasteredNotes: !state.showMasteredNotes }));
      },

      setSearchQuery: (query) => {
        set({ searchQuery: query });
      },

      // ========================================
      // Getters
      // ========================================

      getNotesForLane: (lane) => {
        const { notes, notesByLane, filterByType, showMasteredNotes, searchQuery } = get();
        const noteIds = notesByLane[lane] || [];

        return noteIds
          .map(id => notes[id])
          .filter(Boolean)
          .filter(note => {
            // Filter by type
            if (filterByType && note.noteType !== filterByType) return false;
            // Filter mastered
            if (!showMasteredNotes && note.isMastered) return false;
            // Search filter
            if (searchQuery) {
              const searchLower = searchQuery.toLowerCase();
              return (
                note.title.toLowerCase().includes(searchLower) ||
                note.content.toLowerCase().includes(searchLower) ||
                note.tags.some(t => t.toLowerCase().includes(searchLower))
              );
            }
            return true;
          })
          .sort((a, b) => b.updatedAt - a.updatedAt);
      },

      getConfusingNotes: () => {
        const { notes } = get();
        return Object.values(notes)
          .filter(note => note.isConfusing)
          .sort((a, b) => b.updatedAt - a.updatedAt);
      },

      getNotesForReview: () => {
        const { notes } = get();
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        return Object.values(notes)
          .filter(note => {
            // Not mastered
            if (note.isMastered) return false;
            // Is confusing
            if (note.isConfusing) return true;
            // Haven't reviewed in a day
            if (!note.lastReviewedAt || now - note.lastReviewedAt > oneDay) return true;
            return false;
          })
          .sort((a, b) => {
            // Confusing first
            if (a.isConfusing && !b.isConfusing) return -1;
            if (!a.isConfusing && b.isConfusing) return 1;
            // Then by importance
            const bucketOrder = ['CRITICAL', 'HIGH_YIELD', 'IMPORTANT', 'CONTEXT'];
            const aIndex = bucketOrder.indexOf(a.importanceBucket || 'CONTEXT');
            const bIndex = bucketOrder.indexOf(b.importanceBucket || 'CONTEXT');
            return aIndex - bIndex;
          });
      },
    }),
    {
      name: 'notelab-store',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
        return localStorage;
      }),
    }
  )
);

export default useNoteLabStore;
