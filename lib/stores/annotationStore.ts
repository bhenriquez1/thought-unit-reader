// lib/stores/annotationStore.ts
// Unified Annotation Store for Surgeon View + NoteLab
// Uses Zustand for state management with persistence
// 
// IMPORTANT: This store is the SINGLE SOURCE OF TRUTH for both Surgeon View and NoteLab.
// Both views must use the same IDs: documentId/chapterId/pageIndex/thoughtUnitId

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getDbInstance } from '@/lib/firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  serverTimestamp,
  onSnapshot,
  type Unsubscribe
} from 'firebase/firestore';

// ============================================================================
// Types - Matches user-specified schema exactly
// ============================================================================

export type AnnotationType = 'highlight';  // Highlight is the "container" per user spec

export type ModeContext = 'clean' | 'context';

// Anchor: text-selection based (primary) with bbox fallback
export interface TextRangeAnchor {
  type: 'textRange';
  start: number;
  end: number;
}

export interface BBoxAnchor {
  type: 'bbox';
  boxes: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

export type HighlightAnchor = TextRangeAnchor | BBoxAnchor;

// PDRM metadata attached to highlights (per user spec: tags/labels, not separate types)
export interface PDRMMetadata {
  pattern?: string;           // P: Core principles & patterns
  decisionRule?: string;      // D: Critical decision points
  mnemonic?: string;          // M: Memory aids
  isMistake?: boolean;        // Mistake flag for quiz tracking
  weakAreaTags?: string[];    // Tags for weak areas
}

// Main Annotation/Highlight interface - matches user spec exactly
export interface Annotation {
  id: string;
  
  // Required location fields (per user spec)
  documentId: string;
  chapterId: string;
  pageIndex: number;
  thoughtUnitId?: string;
  
  // Anchor data (per user spec)
  anchor: HighlightAnchor;
  
  // Selected text content
  selectedText: string;
  
  // View mode context (optional per user spec)
  modeContext?: ModeContext;
  
  // PDRM metadata attached to highlight (per user spec: tags as metadata)
  pdrm: PDRMMetadata;
  
  // UI presentation
  color: string;
  
  // For notes attached to highlights
  noteContent?: string;
  noteTitle?: string;
  
  // For flashcards from highlights
  flashcardFront?: string;
  flashcardBack?: string;
  
  // General tags
  tags: string[];
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  
  // User
  userId: string;
}

// Legacy support - keep for backward compatibility
export type ImportanceLevel = 'critical' | 'important' | 'normal' | 'reference';
export interface TextRange {
  startOffset: number;
  endOffset: number;
  text: string;
}
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex: number;
}

export interface ChapterQuizResult {
  id: string;
  documentId: string;
  chapterId: string;
  userId: string;
  
  totalQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  
  mistakes: string[]; // Annotation IDs marked as mistakes
  completedAt: string;
}

export interface ViewMode {
  mode: 'clean' | 'context' | 'full';
  showOnlyHighlights: boolean;
  showHeadings: boolean;
  showFigureCaptions: boolean;
  contextSentences: number; // Number of surrounding sentences in context mode
}

// ============================================================================
// Store State Interface
// ============================================================================

interface AnnotationState {
  // Annotations data
  annotations: Map<string, Annotation>;
  annotationsByPage: Map<number, string[]>; // pageIndex -> annotation IDs
  annotationsByChapter: Map<string, string[]>; // chapterId -> annotation IDs
  
  // Quiz results
  quizResults: Map<string, ChapterQuizResult>;
  
  // View state
  viewMode: ViewMode;
  activeDocumentId: string | null;
  activeChapterId: string | null;
  activePageIndex: number;
  
  // Selection state
  selectedAnnotationId: string | null;
  pendingHighlight: {
    text: string;
    pageIndex: number;
    textRange?: TextRange;
    boundingBoxes?: BoundingBox[];
  } | null;
  
  // UI state
  isLoading: boolean;
  isSaving: boolean;
  lastSyncTimestamp: number;
  
  // Firestore subscription
  firestoreUnsubscribe: Unsubscribe | null;
  
  // Actions
  setActiveDocument: (documentId: string, userId: string) => Promise<void>;
  setActiveChapter: (chapterId: string | null) => void;
  setActivePage: (pageIndex: number) => void;
  
  // Annotation CRUD
  addAnnotation: (annotation: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => Promise<void>;
  deleteAnnotation: (id: string) => Promise<void>;
  
  // Highlight creation
  setPendingHighlight: (highlight: AnnotationState['pendingHighlight']) => void;
  confirmHighlight: (type: AnnotationType, options?: Partial<Annotation>) => Promise<string | null>;
  cancelHighlight: () => void;
  
  // View mode
  setViewMode: (mode: Partial<ViewMode>) => void;
  toggleCleanMode: () => void;
  
  // Selection
  selectAnnotation: (id: string | null) => void;
  
  // Quiz
  saveQuizResult: (result: Omit<ChapterQuizResult, 'id' | 'completedAt'>) => Promise<void>;
  getChapterQuizResults: (chapterId: string) => ChapterQuizResult[];
  markAsMistake: (annotationId: string) => Promise<void>;
  
  // Getters
  getAnnotationsForPage: (pageIndex: number) => Annotation[];
  getAnnotationsForChapter: (chapterId: string) => Annotation[];
  getHighlightsOnly: () => Annotation[];
  getMistakes: () => Annotation[];
  getFlashcards: () => Annotation[];
  getMnemonics: () => Annotation[];
  
  // Sync
  syncToFirestore: () => Promise<void>;
  loadFromFirestore: (documentId: string, userId: string) => Promise<void>;
  
  // Cleanup
  cleanup: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateId(): string {
  return `ann_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function createAnnotationIndex(annotations: Map<string, Annotation>): {
  byPage: Map<number, string[]>;
  byChapter: Map<string, string[]>;
} {
  const byPage = new Map<number, string[]>();
  const byChapter = new Map<string, string[]>();
  
  annotations.forEach((ann, id) => {
    // Index by page
    const pageAnns = byPage.get(ann.pageIndex) || [];
    pageAnns.push(id);
    byPage.set(ann.pageIndex, pageAnns);
    
    // Index by chapter
    if (ann.chapterId) {
      const chapterAnns = byChapter.get(ann.chapterId) || [];
      chapterAnns.push(id);
      byChapter.set(ann.chapterId, chapterAnns);
    }
  });
  
  return { byPage, byChapter };
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useAnnotationStore = create<AnnotationState>()(
  persist(
    (set, get) => ({
      // Initial state
      annotations: new Map(),
      annotationsByPage: new Map(),
      annotationsByChapter: new Map(),
      quizResults: new Map(),
      
      viewMode: {
        mode: 'full',
        showOnlyHighlights: false,
        showHeadings: true,
        showFigureCaptions: true,
        contextSentences: 2
      },
      
      activeDocumentId: null,
      activeChapterId: null,
      activePageIndex: 0,
      
      selectedAnnotationId: null,
      pendingHighlight: null,
      
      isLoading: false,
      isSaving: false,
      lastSyncTimestamp: 0,
      firestoreUnsubscribe: null,
      
      // Actions
      setActiveDocument: async (documentId: string, userId: string) => {
        const { cleanup, loadFromFirestore } = get();
        
        // Cleanup previous subscription
        cleanup();
        
        set({ 
          activeDocumentId: documentId,
          isLoading: true 
        });
        
        await loadFromFirestore(documentId, userId);
        
        set({ isLoading: false });
      },
      
      setActiveChapter: (chapterId: string | null) => {
        set({ activeChapterId: chapterId });
      },
      
      setActivePage: (pageIndex: number) => {
        set({ activePageIndex: pageIndex });
      },
      
      // Annotation CRUD
      addAnnotation: async (annotationData) => {
        const id = generateId();
        const now = new Date().toISOString();
        
        const annotation: Annotation = {
          ...annotationData,
          id,
          createdAt: now,
          updatedAt: now
        };
        
        set((state) => {
          const newAnnotations = new Map(state.annotations);
          newAnnotations.set(id, annotation);
          
          const { byPage, byChapter } = createAnnotationIndex(newAnnotations);
          
          return {
            annotations: newAnnotations,
            annotationsByPage: byPage,
            annotationsByChapter: byChapter
          };
        });
        
        // Sync to Firestore
        try {
          const db = getDbInstance();
          if (db && annotation.userId) {
            const docRef = doc(db, 'users', annotation.userId, 'annotations', id);
            await setDoc(docRef, {
              ...annotation,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }
        } catch (error) {
          console.error('Failed to save annotation to Firestore:', error);
        }
        
        return id;
      },
      
      updateAnnotation: async (id: string, updates: Partial<Annotation>) => {
        const annotation = get().annotations.get(id);
        if (!annotation) return;
        
        const updatedAnnotation: Annotation = {
          ...annotation,
          ...updates,
          updatedAt: new Date().toISOString()
        };
        
        set((state) => {
          const newAnnotations = new Map(state.annotations);
          newAnnotations.set(id, updatedAnnotation);
          
          const { byPage, byChapter } = createAnnotationIndex(newAnnotations);
          
          return {
            annotations: newAnnotations,
            annotationsByPage: byPage,
            annotationsByChapter: byChapter
          };
        });
        
        // Sync to Firestore
        try {
          const db = getDbInstance();
          if (db && annotation.userId) {
            const docRef = doc(db, 'users', annotation.userId, 'annotations', id);
            await setDoc(docRef, {
              ...updatedAnnotation,
              updatedAt: serverTimestamp()
            }, { merge: true });
          }
        } catch (error) {
          console.error('Failed to update annotation in Firestore:', error);
        }
      },
      
      deleteAnnotation: async (id: string) => {
        const annotation = get().annotations.get(id);
        if (!annotation) return;
        
        set((state) => {
          const newAnnotations = new Map(state.annotations);
          newAnnotations.delete(id);
          
          const { byPage, byChapter } = createAnnotationIndex(newAnnotations);
          
          return {
            annotations: newAnnotations,
            annotationsByPage: byPage,
            annotationsByChapter: byChapter,
            selectedAnnotationId: state.selectedAnnotationId === id ? null : state.selectedAnnotationId
          };
        });
        
        // Delete from Firestore
        try {
          const db = getDbInstance();
          if (db && annotation.userId) {
            await deleteDoc(doc(db, 'users', annotation.userId, 'annotations', id));
          }
        } catch (error) {
          console.error('Failed to delete annotation from Firestore:', error);
        }
      },
      
      // Highlight creation
      setPendingHighlight: (highlight) => {
        set({ pendingHighlight: highlight });
      },
      
      confirmHighlight: async (type: AnnotationType, options?: Partial<Annotation>) => {
        const { pendingHighlight, activeDocumentId, activeChapterId } = get();
        if (!pendingHighlight || !activeDocumentId) return null;
        
        const annotationData: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'> = {
          documentId: activeDocumentId,
          chapterId: activeChapterId || undefined,
          pageIndex: pendingHighlight.pageIndex,
          type,
          text: pendingHighlight.text,
          textRange: pendingHighlight.textRange,
          boundingBoxes: pendingHighlight.boundingBoxes,
          importance: options?.importance || 'important',
          tags: options?.tags || [],
          color: options?.color || getColorForType(type),
          userId: options?.userId || 'guest',
          ...options
        };
        
        const id = await get().addAnnotation(annotationData);
        set({ pendingHighlight: null });
        
        return id;
      },
      
      cancelHighlight: () => {
        set({ pendingHighlight: null });
      },
      
      // View mode
      setViewMode: (mode: Partial<ViewMode>) => {
        set((state) => ({
          viewMode: { ...state.viewMode, ...mode }
        }));
      },
      
      toggleCleanMode: () => {
        set((state) => ({
          viewMode: {
            ...state.viewMode,
            mode: state.viewMode.mode === 'clean' ? 'full' : 'clean',
            showOnlyHighlights: state.viewMode.mode !== 'clean'
          }
        }));
      },
      
      // Selection
      selectAnnotation: (id: string | null) => {
        set({ selectedAnnotationId: id });
      },
      
      // Quiz
      saveQuizResult: async (result) => {
        const id = `quiz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const quizResult: ChapterQuizResult = {
          ...result,
          id,
          completedAt: new Date().toISOString()
        };
        
        set((state) => {
          const newResults = new Map(state.quizResults);
          newResults.set(id, quizResult);
          return { quizResults: newResults };
        });
        
        // Mark mistakes
        for (const mistakeId of result.mistakes) {
          await get().markAsMistake(mistakeId);
        }
        
        // Sync to Firestore
        try {
          const db = getDbInstance();
          if (db && result.userId) {
            const docRef = doc(db, 'users', result.userId, 'quizResults', id);
            await setDoc(docRef, quizResult);
          }
        } catch (error) {
          console.error('Failed to save quiz result:', error);
        }
      },
      
      getChapterQuizResults: (chapterId: string) => {
        const results: ChapterQuizResult[] = [];
        get().quizResults.forEach((result) => {
          if (result.chapterId === chapterId) {
            results.push(result);
          }
        });
        return results.sort((a, b) => 
          new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
        );
      },
      
      markAsMistake: async (annotationId: string) => {
        await get().updateAnnotation(annotationId, { isMistake: true });
      },
      
      // Getters
      getAnnotationsForPage: (pageIndex: number) => {
        const { annotations, annotationsByPage } = get();
        const ids = annotationsByPage.get(pageIndex) || [];
        return ids.map(id => annotations.get(id)).filter(Boolean) as Annotation[];
      },
      
      getAnnotationsForChapter: (chapterId: string) => {
        const { annotations, annotationsByChapter } = get();
        const ids = annotationsByChapter.get(chapterId) || [];
        return ids.map(id => annotations.get(id)).filter(Boolean) as Annotation[];
      },
      
      getHighlightsOnly: () => {
        const highlights: Annotation[] = [];
        get().annotations.forEach((ann) => {
          if (ann.type === 'highlight' || ann.importance === 'critical' || ann.importance === 'important') {
            highlights.push(ann);
          }
        });
        return highlights;
      },
      
      getMistakes: () => {
        const mistakes: Annotation[] = [];
        get().annotations.forEach((ann) => {
          if (ann.isMistake || ann.type === 'mistake') {
            mistakes.push(ann);
          }
        });
        return mistakes;
      },
      
      getFlashcards: () => {
        const flashcards: Annotation[] = [];
        get().annotations.forEach((ann) => {
          if (ann.type === 'flashcard') {
            flashcards.push(ann);
          }
        });
        return flashcards;
      },
      
      getMnemonics: () => {
        const mnemonics: Annotation[] = [];
        get().annotations.forEach((ann) => {
          if (ann.type === 'mnemonic') {
            mnemonics.push(ann);
          }
        });
        return mnemonics;
      },
      
      // Sync
      syncToFirestore: async () => {
        // Batch sync all annotations
        const { annotations } = get();
        set({ isSaving: true });
        
        try {
          const db = getDbInstance();
          if (!db) return;
          
          const promises: Promise<void>[] = [];
          annotations.forEach((ann) => {
            if (ann.userId && ann.userId !== 'guest') {
              const docRef = doc(db, 'users', ann.userId, 'annotations', ann.id);
              promises.push(setDoc(docRef, ann, { merge: true }));
            }
          });
          
          await Promise.all(promises);
          set({ lastSyncTimestamp: Date.now() });
        } catch (error) {
          console.error('Failed to sync annotations:', error);
        } finally {
          set({ isSaving: false });
        }
      },
      
      loadFromFirestore: async (documentId: string, userId: string) => {
        try {
          const db = getDbInstance();
          if (!db || !userId || userId === 'guest') return;
          
          const q = query(
            collection(db, 'users', userId, 'annotations'),
            where('documentId', '==', documentId),
            orderBy('createdAt', 'desc')
          );
          
          const snapshot = await getDocs(q);
          const newAnnotations = new Map<string, Annotation>();
          
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as Annotation;
            newAnnotations.set(docSnap.id, {
              ...data,
              id: docSnap.id,
              createdAt: data.createdAt || new Date().toISOString(),
              updatedAt: data.updatedAt || new Date().toISOString()
            });
          });
          
          const { byPage, byChapter } = createAnnotationIndex(newAnnotations);
          
          set({
            annotations: newAnnotations,
            annotationsByPage: byPage,
            annotationsByChapter: byChapter,
            lastSyncTimestamp: Date.now()
          });
          
          // Set up real-time listener
          const unsubscribe = onSnapshot(q, (snapshot) => {
            const updatedAnnotations = new Map<string, Annotation>();
            snapshot.forEach((docSnap) => {
              const data = docSnap.data() as Annotation;
              updatedAnnotations.set(docSnap.id, {
                ...data,
                id: docSnap.id
              });
            });
            
            const indices = createAnnotationIndex(updatedAnnotations);
            set({
              annotations: updatedAnnotations,
              annotationsByPage: indices.byPage,
              annotationsByChapter: indices.byChapter
            });
          });
          
          set({ firestoreUnsubscribe: unsubscribe });
          
        } catch (error) {
          console.error('Failed to load annotations from Firestore:', error);
        }
      },
      
      // Cleanup
      cleanup: () => {
        const { firestoreUnsubscribe } = get();
        if (firestoreUnsubscribe) {
          firestoreUnsubscribe();
        }
        set({ firestoreUnsubscribe: null });
      }
    }),
    {
      name: 'annotation-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist view settings, not annotations (those sync with Firestore)
        viewMode: state.viewMode,
        activeDocumentId: state.activeDocumentId,
        activeChapterId: state.activeChapterId
      })
    }
  )
);

// ============================================================================
// Helper: Color mapping for annotation types
// ============================================================================

function getColorForType(type: AnnotationType): string {
  const colors: Record<AnnotationType, string> = {
    highlight: '#FFEB3B',
    note: '#4CAF50',
    flashcard: '#9C27B0',
    mnemonic: '#FF9800',
    mistake: '#F44336',
    pattern: '#673AB7',
    decision: '#2196F3',
    risk: '#E91E63',
    mechanism: '#00BCD4'
  };
  return colors[type] || '#FFEB3B';
}

// ============================================================================
// Selectors for optimized re-renders
// ============================================================================

export const selectAnnotationsForPage = (pageIndex: number) => 
  (state: AnnotationState) => state.getAnnotationsForPage(pageIndex);

export const selectHighlights = (state: AnnotationState) => state.getHighlightsOnly();

export const selectViewMode = (state: AnnotationState) => state.viewMode;

export const selectPendingHighlight = (state: AnnotationState) => state.pendingHighlight;

export const selectIsLoading = (state: AnnotationState) => state.isLoading;

export default useAnnotationStore;
