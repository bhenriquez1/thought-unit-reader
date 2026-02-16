// lib/cognitive/noteLabStore.ts
// NoteLab 2.0 Store - PDRM Cognitive Workflow
// Capture -> Structure into PDRM atoms -> Linkage -> Output actions

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  PDRMAtom,
  PDRMAtomType,
  NoteLabNote,
  EvidenceSpan,
  SyllabusItemId,
  CardId,
  ChapterId,
  PageIndex,
} from './types';

// ============================================================================
// State Interface
// ============================================================================

interface NoteLabState {
  // Notes and atoms
  notes: Record<string, NoteLabNote>;
  atoms: Record<string, PDRMAtom>;

  // Indexes
  notesByChapter: Record<ChapterId, string[]>;
  notesByPage: Record<PageIndex, string[]>;
  atomsByType: Record<PDRMAtomType, string[]>;
  atomsBySyllabusItem: Record<SyllabusItemId, string[]>;

  // UI state
  selectedNoteId?: string;
  selectedAtomId?: string;
  filterByType?: PDRMAtomType;
  filterBySyllabusId?: SyllabusItemId;
  showExamEmphasisOnly: boolean;

  // PDRM Composer state
  composerOpen: boolean;
  composerDraft: Partial<PDRMAtom>;
}

interface NoteLabActions {
  // Note CRUD
  createNote: (data: {
    atoms: PDRMAtom[];
    chapterId?: ChapterId;
    pageIndex?: PageIndex;
    tags?: string[];
  }) => string;
  updateNote: (noteId: string, updates: Partial<NoteLabNote>) => void;
  deleteNote: (noteId: string) => void;

  // Atom CRUD
  createAtom: (data: Omit<PDRMAtom, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateAtom: (atomId: string, updates: Partial<PDRMAtom>) => void;
  deleteAtom: (atomId: string) => void;
  addAtomToNote: (noteId: string, atomId: string) => void;
  removeAtomFromNote: (noteId: string, atomId: string) => void;

  // Quick capture from Expert View
  captureFromCard: (cardId: CardId, evidence: EvidenceSpan[], type?: PDRMAtomType) => string;
  captureFromHighlight: (text: string, evidence: EvidenceSpan) => string;
  captureManual: (title: string, content: string, type: PDRMAtomType) => string;

  // Linkage
  linkAtomToSyllabus: (atomId: string, syllabusItemId: SyllabusItemId) => void;
  linkAtoms: (atomId1: string, atomId2: string) => void;
  unlinkAtoms: (atomId1: string, atomId2: string) => void;

  // Output actions
  addToExamEmphasisQueue: (noteId: string) => void;
  removeFromExamEmphasisQueue: (noteId: string) => void;
  addToStudyPlan: (noteId: string, date: string) => void;
  generateFlashcardFromAtom: (atomId: string) => { question: string; answer: string };

  // UI
  selectNote: (noteId: string | undefined) => void;
  selectAtom: (atomId: string | undefined) => void;
  setFilterByType: (type: PDRMAtomType | undefined) => void;
  setFilterBySyllabusId: (id: SyllabusItemId | undefined) => void;
  toggleShowExamEmphasisOnly: () => void;
  openComposer: (draft?: Partial<PDRMAtom>) => void;
  closeComposer: () => void;
  updateComposerDraft: (updates: Partial<PDRMAtom>) => void;

  // Getters
  getNotesForChapter: (chapterId: ChapterId) => NoteLabNote[];
  getNotesForPage: (pageIndex: PageIndex) => NoteLabNote[];
  getAtomsByType: (type: PDRMAtomType) => PDRMAtom[];
  getAtomsForSyllabusItem: (syllabusItemId: SyllabusItemId) => PDRMAtom[];
  getRelatedAtoms: (atomId: string) => PDRMAtom[];
  getExamEmphasisNotes: () => NoteLabNote[];

  // Reset
  reset: () => void;
}

type NoteLabStore = NoteLabState & NoteLabActions;

// ============================================================================
// Helpers
// ============================================================================

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function inferAtomType(text: string): PDRMAtomType {
  const lower = text.toLowerCase();
  if (/\bpattern\b|\btypically\b|\bclassic\b|\busually\b/i.test(lower)) return 'pattern';
  if (/\bdecision\b|\bchoose\b|\bselect\b|\bwhen to\b/i.test(lower)) return 'decision';
  if (/\brule\b|\balways\b|\bnever\b|\bmust\b/i.test(lower)) return 'rule';
  if (/\bmnemonic\b|\bremember\b|\btrick\b/i.test(lower)) return 'mnemonic';
  if (/\btrap\b|\bconfuse\b|\bexcept\b|\bwatchout\b/i.test(lower)) return 'trap';
  return 'evidence';
}

// ============================================================================
// Default State
// ============================================================================

const defaultState: NoteLabState = {
  notes: {},
  atoms: {},
  notesByChapter: {},
  notesByPage: {},
  atomsByType: {
    pattern: [],
    decision: [],
    rule: [],
    mnemonic: [],
    trap: [],
    evidence: [],
  },
  atomsBySyllabusItem: {},
  selectedNoteId: undefined,
  selectedAtomId: undefined,
  filterByType: undefined,
  filterBySyllabusId: undefined,
  showExamEmphasisOnly: false,
  composerOpen: false,
  composerDraft: {},
};

// ============================================================================
// Store
// ============================================================================

export const useNoteLabStore2 = create<NoteLabStore>()(
  persist(
    (set, get) => ({
      ...defaultState,

      // ========================================
      // Note CRUD
      // ========================================

      createNote: (data) => {
        const id = generateId('note');
        const now = Date.now();

        const note: NoteLabNote = {
          id,
          atoms: data.atoms,
          chapterId: data.chapterId,
          pageIndex: data.pageIndex,
          tags: data.tags || [],
          flashcardIds: [],
          examEmphasisQueue: false,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => {
          const notes = { ...state.notes, [id]: note };

          // Update indexes
          const notesByChapter = { ...state.notesByChapter };
          if (data.chapterId) {
            notesByChapter[data.chapterId] = [
              ...(notesByChapter[data.chapterId] || []),
              id,
            ];
          }

          const notesByPage = { ...state.notesByPage };
          if (data.pageIndex !== undefined) {
            notesByPage[data.pageIndex] = [
              ...(notesByPage[data.pageIndex] || []),
              id,
            ];
          }

          return { notes, notesByChapter, notesByPage };
        });

        return id;
      },

      updateNote: (noteId, updates) => {
        set((state) => {
          const note = state.notes[noteId];
          if (!note) return state;

          return {
            notes: {
              ...state.notes,
              [noteId]: {
                ...note,
                ...updates,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      deleteNote: (noteId) => {
        set((state) => {
          const note = state.notes[noteId];
          if (!note) return state;

          const { [noteId]: _, ...remainingNotes } = state.notes;

          // Update indexes
          const notesByChapter = { ...state.notesByChapter };
          if (note.chapterId) {
            notesByChapter[note.chapterId] = (notesByChapter[note.chapterId] || [])
              .filter(id => id !== noteId);
          }

          const notesByPage = { ...state.notesByPage };
          if (note.pageIndex !== undefined) {
            notesByPage[note.pageIndex] = (notesByPage[note.pageIndex] || [])
              .filter(id => id !== noteId);
          }

          return {
            notes: remainingNotes,
            notesByChapter,
            notesByPage,
            selectedNoteId: state.selectedNoteId === noteId ? undefined : state.selectedNoteId,
          };
        });
      },

      // ========================================
      // Atom CRUD
      // ========================================

      createAtom: (data) => {
        const id = generateId('atom');
        const now = Date.now();

        const atom: PDRMAtom = {
          ...data,
          id,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => {
          const atoms = { ...state.atoms, [id]: atom };

          // Update type index
          const atomsByType = { ...state.atomsByType };
          atomsByType[atom.type] = [...(atomsByType[atom.type] || []), id];

          // Update syllabus index
          const atomsBySyllabusItem = { ...state.atomsBySyllabusItem };
          for (const syllabusId of atom.syllabusLinks) {
            atomsBySyllabusItem[syllabusId] = [
              ...(atomsBySyllabusItem[syllabusId] || []),
              id,
            ];
          }

          return { atoms, atomsByType, atomsBySyllabusItem };
        });

        return id;
      },

      updateAtom: (atomId, updates) => {
        set((state) => {
          const atom = state.atoms[atomId];
          if (!atom) return state;

          return {
            atoms: {
              ...state.atoms,
              [atomId]: {
                ...atom,
                ...updates,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      deleteAtom: (atomId) => {
        set((state) => {
          const atom = state.atoms[atomId];
          if (!atom) return state;

          const { [atomId]: _, ...remainingAtoms } = state.atoms;

          // Update type index
          const atomsByType = { ...state.atomsByType };
          atomsByType[atom.type] = (atomsByType[atom.type] || [])
            .filter(id => id !== atomId);

          // Update syllabus index
          const atomsBySyllabusItem = { ...state.atomsBySyllabusItem };
          for (const syllabusId of atom.syllabusLinks) {
            atomsBySyllabusItem[syllabusId] = (atomsBySyllabusItem[syllabusId] || [])
              .filter(id => id !== atomId);
          }

          return {
            atoms: remainingAtoms,
            atomsByType,
            atomsBySyllabusItem,
            selectedAtomId: state.selectedAtomId === atomId ? undefined : state.selectedAtomId,
          };
        });
      },

      addAtomToNote: (noteId, atomId) => {
        const note = get().notes[noteId];
        const atom = get().atoms[atomId];
        if (!note || !atom) return;

        if (!note.atoms.some(a => a.id === atomId)) {
          get().updateNote(noteId, {
            atoms: [...note.atoms, atom],
          });
        }
      },

      removeAtomFromNote: (noteId, atomId) => {
        const note = get().notes[noteId];
        if (!note) return;

        get().updateNote(noteId, {
          atoms: note.atoms.filter(a => a.id !== atomId),
        });
      },

      // ========================================
      // Quick Capture
      // ========================================

      captureFromCard: (cardId, evidence, type) => {
        const atomType = type || 'evidence';
        const title = evidence[0]?.text?.slice(0, 50) || 'Captured from card';

        return get().createAtom({
          type: atomType,
          title,
          content: evidence.map(e => e.text).join('\n\n'),
          evidence,
          syllabusLinks: [],
          relatedAtomIds: [],
          cardId,
        });
      },

      captureFromHighlight: (text, evidence) => {
        const atomType = inferAtomType(text);

        return get().createAtom({
          type: atomType,
          title: text.slice(0, 50),
          content: text,
          evidence: [evidence],
          syllabusLinks: [],
          relatedAtomIds: [],
        });
      },

      captureManual: (title, content, type) => {
        return get().createAtom({
          type,
          title,
          content,
          evidence: [],
          syllabusLinks: [],
          relatedAtomIds: [],
        });
      },

      // ========================================
      // Linkage
      // ========================================

      linkAtomToSyllabus: (atomId, syllabusItemId) => {
        const atom = get().atoms[atomId];
        if (!atom) return;

        if (!atom.syllabusLinks.includes(syllabusItemId)) {
          get().updateAtom(atomId, {
            syllabusLinks: [...atom.syllabusLinks, syllabusItemId],
          });

          // Update index
          set((state) => ({
            atomsBySyllabusItem: {
              ...state.atomsBySyllabusItem,
              [syllabusItemId]: [
                ...(state.atomsBySyllabusItem[syllabusItemId] || []),
                atomId,
              ],
            },
          }));
        }
      },

      linkAtoms: (atomId1, atomId2) => {
        const atom1 = get().atoms[atomId1];
        const atom2 = get().atoms[atomId2];
        if (!atom1 || !atom2) return;

        if (!atom1.relatedAtomIds.includes(atomId2)) {
          get().updateAtom(atomId1, {
            relatedAtomIds: [...atom1.relatedAtomIds, atomId2],
          });
        }
        if (!atom2.relatedAtomIds.includes(atomId1)) {
          get().updateAtom(atomId2, {
            relatedAtomIds: [...atom2.relatedAtomIds, atomId1],
          });
        }
      },

      unlinkAtoms: (atomId1, atomId2) => {
        const atom1 = get().atoms[atomId1];
        const atom2 = get().atoms[atomId2];

        if (atom1) {
          get().updateAtom(atomId1, {
            relatedAtomIds: atom1.relatedAtomIds.filter(id => id !== atomId2),
          });
        }
        if (atom2) {
          get().updateAtom(atomId2, {
            relatedAtomIds: atom2.relatedAtomIds.filter(id => id !== atomId1),
          });
        }
      },

      // ========================================
      // Output Actions
      // ========================================

      addToExamEmphasisQueue: (noteId) => {
        get().updateNote(noteId, { examEmphasisQueue: true });
      },

      removeFromExamEmphasisQueue: (noteId) => {
        get().updateNote(noteId, { examEmphasisQueue: false });
      },

      addToStudyPlan: (noteId, date) => {
        get().updateNote(noteId, { studyPlanDate: date });
      },

      generateFlashcardFromAtom: (atomId) => {
        const atom = get().atoms[atomId];
        if (!atom) {
          return { question: '', answer: '' };
        }

        // Generate flashcard based on atom type
        switch (atom.type) {
          case 'pattern':
            return {
              question: `What is the classic pattern for: ${atom.title}?`,
              answer: atom.content,
            };
          case 'decision':
            return {
              question: `When do you choose: ${atom.title}?`,
              answer: atom.content,
            };
          case 'rule':
            return {
              question: `What is the rule for: ${atom.title}?`,
              answer: atom.content,
            };
          case 'mnemonic':
            return {
              question: `What does this mnemonic help you remember: ${atom.title}?`,
              answer: atom.content,
            };
          case 'trap':
            return {
              question: `What is the trap/exception for: ${atom.title}?`,
              answer: atom.content,
            };
          default:
            return {
              question: atom.title,
              answer: atom.content,
            };
        }
      },

      // ========================================
      // UI
      // ========================================

      selectNote: (noteId) => {
        set({ selectedNoteId: noteId });
      },

      selectAtom: (atomId) => {
        set({ selectedAtomId: atomId });
      },

      setFilterByType: (type) => {
        set({ filterByType: type });
      },

      setFilterBySyllabusId: (id) => {
        set({ filterBySyllabusId: id });
      },

      toggleShowExamEmphasisOnly: () => {
        set((state) => ({ showExamEmphasisOnly: !state.showExamEmphasisOnly }));
      },

      openComposer: (draft) => {
        set({ composerOpen: true, composerDraft: draft || {} });
      },

      closeComposer: () => {
        set({ composerOpen: false, composerDraft: {} });
      },

      updateComposerDraft: (updates) => {
        set((state) => ({
          composerDraft: { ...state.composerDraft, ...updates },
        }));
      },

      // ========================================
      // Getters
      // ========================================

      getNotesForChapter: (chapterId) => {
        const { notes, notesByChapter } = get();
        const noteIds = notesByChapter[chapterId] || [];
        return noteIds.map(id => notes[id]).filter(Boolean);
      },

      getNotesForPage: (pageIndex) => {
        const { notes, notesByPage } = get();
        const noteIds = notesByPage[pageIndex] || [];
        return noteIds.map(id => notes[id]).filter(Boolean);
      },

      getAtomsByType: (type) => {
        const { atoms, atomsByType } = get();
        const atomIds = atomsByType[type] || [];
        return atomIds.map(id => atoms[id]).filter(Boolean);
      },

      getAtomsForSyllabusItem: (syllabusItemId) => {
        const { atoms, atomsBySyllabusItem } = get();
        const atomIds = atomsBySyllabusItem[syllabusItemId] || [];
        return atomIds.map(id => atoms[id]).filter(Boolean);
      },

      getRelatedAtoms: (atomId) => {
        const { atoms } = get();
        const atom = atoms[atomId];
        if (!atom) return [];
        return atom.relatedAtomIds.map(id => atoms[id]).filter(Boolean);
      },

      getExamEmphasisNotes: () => {
        const { notes } = get();
        return Object.values(notes).filter(n => n.examEmphasisQueue);
      },

      // ========================================
      // Reset
      // ========================================

      reset: () => {
        set(defaultState);
      },
    }),
    {
      name: 'notelab2-store',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
        return localStorage;
      }),
    }
  )
);

export default useNoteLabStore2;
