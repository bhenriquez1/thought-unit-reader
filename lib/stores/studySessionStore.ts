// lib/stores/studySessionStore.ts
// Study Session Store - Flashcard loop with spaced repetition
// PRIORITY ORDER: Core-derived → saved/edited → legacy highlight-based
// Uses learningStore for Core items, annotationStore for legacy

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useAnnotationStore, type Annotation } from './annotationStore';
import { useQuizStore, type QuizQuestion } from './quizStore';
import { useLearningStore } from './learningStore';
import { getCoreFlashcardsByPriority, getDueCoreFlashcards, type CoreFlashcard } from '../core/coreFlashcards';

// ============================================================================
// Types
// ============================================================================

export type CardGrade = 'again' | 'hard' | 'easy';

export interface StudyCard {
  id: string;
  annotationId: string;      // For legacy cards; 'core_xxx' for Core cards
  coreItemId?: string;       // For Core-derived cards
  front: string;
  back: string;
  source: 'core' | 'flashcard' | 'highlight' | 'quiz-miss';  // Core first priority
  priority: number;  // Higher = more urgent (weak/miss items get higher priority)
  lastReviewed?: string;
  reviewCount: number;
  easeFactor: number;  // SM-2 ease factor (default 2.5)
  interval: number;    // Days until next review
  dueDate?: string;
  pageNumber?: number; // For Core cards to show location
}

export interface StudyAttempt {
  cardId: string;
  grade: CardGrade;
  timestamp: string;
  responseTime: number;  // milliseconds
}

export interface StudySession {
  id: string;
  documentId: string;
  startedAt: string;
  completedAt?: string;
  cardsReviewed: number;
  correctCount: number;
  attempts: StudyAttempt[];
  quickQuestions: number;
}

export interface StudySessionState {
  // Current session
  currentSession: StudySession | null;
  deck: StudyCard[];
  currentCardIndex: number;
  isRevealed: boolean;
  
  // Quick question state
  quickQuestion: QuizQuestion | null;
  showQuickQuestion: boolean;
  cardsSinceLastQuestion: number;
  
  // History
  sessions: Record<string, StudySession>;
  
  // Last session for resume
  lastSessionDocId: string | null;
  lastSessionCardIndex: number;
  
  // Actions
  startSession: (documentId: string) => void;
  startTopicSession: (documentId: string, topicId: string, chapterIds: string[], pageRanges: Array<{ start: number; end: number }>) => void;
  startQuickStudy: (documentId: string, maxCards?: number, topicId?: string) => void;
  resumeLastSession: () => boolean;
  endSession: () => void;
  
  // Card actions
  revealCard: () => void;
  gradeCard: (grade: CardGrade) => void;
  skipCard: () => void;
  
  // Quick question
  generateQuickQuestion: () => void;
  answerQuickQuestion: (answer: string) => boolean;
  dismissQuickQuestion: () => void;
  
  // Deck management
  getStudyDeck: (documentId: string) => StudyCard[];
  getTopicDeck: (documentId: string, chapterIds: string[], pageRanges: Array<{ start: number; end: number }>) => StudyCard[];
  getWeakDeck: (documentId: string, maxCards?: number) => StudyCard[];
  refreshDeck: (documentId: string) => void;
  
  // Stats
  getSessionStats: () => { reviewed: number; correct: number; remaining: number };
  getDueCards: (documentId: string) => StudyCard[];
  getWeakItemsCount: (documentId: string) => number;
  hasLastSession: () => boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function generateId(): string {
  return `study_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Convert Core flashcard to study card (highest priority source)
function coreFlashcardToStudyCard(fc: CoreFlashcard): StudyCard {
  return {
    id: `card_${fc.id}`,
    annotationId: `core_${fc.coreItemId}`,  // Marker for Core source
    coreItemId: fc.coreItemId,
    front: fc.front,
    back: fc.back,
    source: 'core',
    priority: fc.priority + 200,  // Boost Core cards above all others
    reviewCount: 0,
    easeFactor: 2.5,
    interval: 1,
    pageNumber: fc.pageNumber ?? undefined,
    dueDate: fc.dueAt ? new Date(fc.dueAt).toISOString() : undefined,
  };
}

// Convert annotation to study card
function annotationToCard(ann: Annotation, priority: number): StudyCard {
  const isFlashcard = ann.flashcardFront && ann.flashcardBack;
  const isWeakMiss = ann.tags.some(t => ['weak', 'miss', 'quiz-generated', 'quiz-miss'].includes(t)) ||
    ann.pdrm?.isMistake;
  
  return {
    id: `card_${ann.id}`,
    annotationId: ann.id,
    front: isFlashcard ? (ann.flashcardFront || ann.selectedText) : ann.selectedText,
    back: isFlashcard ? (ann.flashcardBack || 'Review this highlight') : (ann.noteContent || 'What do you remember about this?'),
    source: isWeakMiss ? 'quiz-miss' : (isFlashcard ? 'flashcard' : 'highlight'),
    priority,
    reviewCount: 0,
    easeFactor: 2.5,
    interval: 1
  };
}

// Calculate next interval based on SM-2 algorithm (simplified)
function calculateNextInterval(card: StudyCard, grade: CardGrade): { interval: number; easeFactor: number } {
  let { easeFactor, interval } = card;
  
  switch (grade) {
    case 'again':
      interval = 1;
      easeFactor = Math.max(1.3, easeFactor - 0.2);
      break;
    case 'hard':
      interval = Math.max(1, Math.round(interval * 1.2));
      easeFactor = Math.max(1.3, easeFactor - 0.15);
      break;
    case 'easy':
      interval = Math.round(interval * easeFactor);
      easeFactor = Math.min(3.0, easeFactor + 0.1);
      break;
  }
  
  return { interval, easeFactor };
}

// Generate quick question from recent missed cards
function generateQuickQuestionFromCards(missedCards: StudyCard[]): QuizQuestion | null {
  if (missedCards.length === 0) return null;
  
  const card = missedCards[Math.floor(Math.random() * missedCards.length)];
  
  return {
    id: generateId(),
    type: 'recall',
    question: `Quick review: What do you remember about:\n"${card.front.substring(0, 100)}${card.front.length > 100 ? '...' : ''}"`,
    correctAnswer: card.back,
    sourceHighlightIds: [card.annotationId],
    sourceText: card.front
  };
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useStudySessionStore = create<StudySessionState>()(
  persist(
    (set, get) => ({
      currentSession: null,
      deck: [],
      currentCardIndex: 0,
      isRevealed: false,
      quickQuestion: null,
      showQuickQuestion: false,
      cardsSinceLastQuestion: 0,
      sessions: {},
      lastSessionDocId: null,
      lastSessionCardIndex: 0,
      
      // Start a new study session
      startSession: (documentId: string) => {
        const deck = get().getStudyDeck(documentId);
        
        const session: StudySession = {
          id: generateId(),
          documentId,
          startedAt: new Date().toISOString(),
          cardsReviewed: 0,
          correctCount: 0,
          attempts: [],
          quickQuestions: 0
        };
        
        set({
          currentSession: session,
          deck,
          currentCardIndex: 0,
          isRevealed: false,
          cardsSinceLastQuestion: 0,
          showQuickQuestion: false,
          quickQuestion: null,
          lastSessionDocId: documentId,
          lastSessionCardIndex: 0
        });
        
        console.log(`📚 Study session started with ${deck.length} cards`);
      },
      
      // Start a topic-filtered study session (Syllabus integration)
      startTopicSession: (documentId: string, topicId: string, chapterIds: string[], pageRanges: Array<{ start: number; end: number }>) => {
        const deck = get().getTopicDeck(documentId, chapterIds, pageRanges);
        
        const session: StudySession = {
          id: generateId(),
          documentId,
          startedAt: new Date().toISOString(),
          cardsReviewed: 0,
          correctCount: 0,
          attempts: [],
          quickQuestions: 0
        };
        
        set({
          currentSession: session,
          deck,
          currentCardIndex: 0,
          isRevealed: false,
          cardsSinceLastQuestion: 0,
          showQuickQuestion: false,
          quickQuestion: null,
          lastSessionDocId: documentId,
          lastSessionCardIndex: 0
        });
        
        console.log(`📚 Topic session started for ${topicId} with ${deck.length} cards`);
      },
      
      // Start Quick Study - automatically finds weakest items
      startQuickStudy: (documentId: string, maxCards: number = 15, topicId?: string) => {
        const deck = get().getWeakDeck(documentId, maxCards);
        
        const session: StudySession = {
          id: generateId(),
          documentId,
          startedAt: new Date().toISOString(),
          cardsReviewed: 0,
          correctCount: 0,
          attempts: [],
          quickQuestions: 0
        };
        
        set({
          currentSession: session,
          deck,
          currentCardIndex: 0,
          isRevealed: false,
          cardsSinceLastQuestion: 0,
          showQuickQuestion: false,
          quickQuestion: null,
          lastSessionDocId: documentId,
          lastSessionCardIndex: 0
        });
        
        console.log(`⚡ Quick Study started with ${deck.length} weak items`);
      },
      
      // Resume last session
      resumeLastSession: () => {
        const { lastSessionDocId, lastSessionCardIndex, sessions } = get();
        if (!lastSessionDocId) return false;
        
        const deck = get().getStudyDeck(lastSessionDocId);
        if (deck.length === 0) return false;
        
        const resumeIndex = Math.min(lastSessionCardIndex, deck.length - 1);
        
        const session: StudySession = {
          id: generateId(),
          documentId: lastSessionDocId,
          startedAt: new Date().toISOString(),
          cardsReviewed: 0,
          correctCount: 0,
          attempts: [],
          quickQuestions: 0
        };
        
        set({
          currentSession: session,
          deck,
          currentCardIndex: resumeIndex,
          isRevealed: false,
          cardsSinceLastQuestion: 0,
          showQuickQuestion: false,
          quickQuestion: null
        });
        
        console.log(`📚 Resumed session at card ${resumeIndex + 1}/${deck.length}`);
        return true;
      },
      
      // End current session
      endSession: () => {
        const { currentSession, sessions, currentCardIndex, deck } = get();
        if (!currentSession) return;
        
        const completedSession: StudySession = {
          ...currentSession,
          completedAt: new Date().toISOString()
        };
        
        set({
          currentSession: null,
          sessions: { ...sessions, [completedSession.id]: completedSession },
          deck: [],
          currentCardIndex: 0,
          isRevealed: false,
          // Save position for resume
          lastSessionCardIndex: currentCardIndex
        });
        
        console.log(`📚 Study session ended: ${completedSession.cardsReviewed} cards reviewed`);
        
        // Return session stats for syllabus integration
        return {
          cardsReviewed: completedSession.cardsReviewed,
          correctCount: completedSession.correctCount,
          score: completedSession.cardsReviewed > 0 
            ? Math.round((completedSession.correctCount / completedSession.cardsReviewed) * 100) 
            : 0
        };
      },
      
      // Reveal current card
      revealCard: () => {
        set({ isRevealed: true });
      },
      
      // Grade current card and move to next
      gradeCard: (grade: CardGrade) => {
        const { deck, currentCardIndex, currentSession, cardsSinceLastQuestion } = get();
        if (!currentSession || currentCardIndex >= deck.length) return;
        
        const card = deck[currentCardIndex];
        const startTime = Date.now();
        
        // Update card with new interval
        const { interval, easeFactor } = calculateNextInterval(card, grade);
        const updatedCard: StudyCard = {
          ...card,
          interval,
          easeFactor,
          reviewCount: card.reviewCount + 1,
          lastReviewed: new Date().toISOString(),
          dueDate: new Date(Date.now() + interval * 24 * 60 * 60 * 1000).toISOString()
        };
        
        // Record attempt
        const attempt: StudyAttempt = {
          cardId: card.id,
          grade,
          timestamp: new Date().toISOString(),
          responseTime: Date.now() - startTime
        };
        
        const newCardsSinceQuestion = cardsSinceLastQuestion + 1;
        const shouldShowQuestion = newCardsSinceQuestion >= 5 && grade !== 'easy';
        
        // Update deck and session
        const newDeck = [...deck];
        newDeck[currentCardIndex] = updatedCard;
        
        // If 'again', add card back to end of deck
        if (grade === 'again') {
          newDeck.push({ ...updatedCard, priority: updatedCard.priority + 1 });
        }
        
        const updatedSession: StudySession = {
          ...currentSession,
          cardsReviewed: currentSession.cardsReviewed + 1,
          correctCount: grade !== 'again' ? currentSession.correctCount + 1 : currentSession.correctCount,
          attempts: [...currentSession.attempts, attempt]
        };
        
        set({
          deck: newDeck,
          currentCardIndex: currentCardIndex + 1,
          isRevealed: false,
          currentSession: updatedSession,
          cardsSinceLastQuestion: shouldShowQuestion ? 0 : newCardsSinceQuestion
        });
        
        // Generate quick question after 5 cards
        if (shouldShowQuestion) {
          get().generateQuickQuestion();
        }
      },
      
      // Skip current card
      skipCard: () => {
        const { currentCardIndex, deck } = get();
        if (currentCardIndex < deck.length - 1) {
          set({
            currentCardIndex: currentCardIndex + 1,
            isRevealed: false
          });
        }
      },
      
      // Generate quick question from recent misses
      generateQuickQuestion: () => {
        const { currentSession, deck } = get();
        if (!currentSession) return;
        
        // Get cards that were marked 'again' in this session
        const missedCardIds = currentSession.attempts
          .filter(a => a.grade === 'again')
          .map(a => a.cardId);
        
        const missedCards = deck.filter(c => missedCardIds.includes(c.id));
        const question = generateQuickQuestionFromCards(missedCards.length > 0 ? missedCards : deck.slice(0, 5));
        
        if (question) {
          set({
            quickQuestion: question,
            showQuickQuestion: true
          });
        }
      },
      
      // Answer quick question
      answerQuickQuestion: (answer: string) => {
        const { quickQuestion, currentSession } = get();
        if (!quickQuestion || !currentSession) return false;
        
        const isCorrect = answer.toLowerCase().trim().includes(
          quickQuestion.correctAnswer.toLowerCase().trim().substring(0, 20)
        );
        
        set({
          currentSession: {
            ...currentSession,
            quickQuestions: currentSession.quickQuestions + 1
          }
        });
        
        return isCorrect;
      },
      
      // Dismiss quick question
      dismissQuickQuestion: () => {
        set({
          showQuickQuestion: false,
          quickQuestion: null
        });
      },
      
      // Build study deck from Core items + annotations
      // PRIORITY: Core-derived → saved/edited flashcards → legacy highlights
      getStudyDeck: (documentId: string) => {
        const cards: StudyCard[] = [];

        // ========================================
        // PRIORITY 1: Core-derived flashcards (automatic from ⚡ Core extraction)
        // ========================================
        try {
          const learningStore = useLearningStore.getState();
          const coreItems = learningStore.getItemsForDocument(documentId);

          if (coreItems.length > 0) {
            const coreFlashcards = getCoreFlashcardsByPriority(coreItems);
            for (const fc of coreFlashcards) {
              cards.push(coreFlashcardToStudyCard(fc));
            }
            console.log(`⚡ Study: Added ${coreFlashcards.length} Core flashcards`);
          }
        } catch (err) {
          console.warn('Could not load Core flashcards:', err);
        }

        // ========================================
        // PRIORITY 2-4: Annotation-based cards (legacy)
        // ========================================
        const annotationStore = useAnnotationStore.getState();
        const annotations = annotationStore.getAllAnnotationsArray()
          .filter(a => a.documentId === documentId);

        // Priority 2: Weak/miss items
        annotations
          .filter(a =>
            a.tags.some(t => ['weak', 'miss', 'quiz-generated', 'quiz-miss'].includes(t)) ||
            a.pdrm?.isMistake
          )
          .forEach(ann => {
            // Skip if already have a Core card for this
            if (!cards.find(c => c.annotationId === ann.id || c.annotationId === `core_${ann.id}`)) {
              cards.push(annotationToCard(ann, 100));
            }
          });

        // Priority 3: Explicit saved/edited flashcards
        annotations
          .filter(a => a.flashcardFront && a.flashcardBack && !cards.find(c => c.annotationId === a.id))
          .forEach(ann => {
            cards.push(annotationToCard(ann, 50));
          });

        // Priority 4: Highlights (lower priority, fallback)
        annotations
          .filter(a => a.selectedText.length > 20 && !cards.find(c => c.annotationId === a.id))
          .slice(0, 20)  // Limit to prevent too many cards
          .forEach(ann => {
            cards.push(annotationToCard(ann, 10));
          });

        // Sort by priority (highest first)
        return cards.sort((a, b) => b.priority - a.priority);
      },
      
      // Refresh deck
      refreshDeck: (documentId: string) => {
        const deck = get().getStudyDeck(documentId);
        set({ deck, currentCardIndex: 0, isRevealed: false });
      },
      
      // Get session stats
      getSessionStats: () => {
        const { currentSession, deck, currentCardIndex } = get();
        return {
          reviewed: currentSession?.cardsReviewed || 0,
          correct: currentSession?.correctCount || 0,
          remaining: Math.max(0, deck.length - currentCardIndex)
        };
      },
      
      // Get due cards
      getDueCards: (documentId: string) => {
        const deck = get().getStudyDeck(documentId);
        const now = new Date();
        return deck.filter(card => {
          if (!card.dueDate) return true;
          return new Date(card.dueDate) <= now;
        });
      },
      
      // Get topic-filtered deck (Syllabus integration)
      getTopicDeck: (documentId: string, chapterIds: string[], pageRanges: Array<{ start: number; end: number }>) => {
        const annotationStore = useAnnotationStore.getState();
        const allAnnotations = annotationStore.getAllAnnotationsArray()
          .filter(a => a.documentId === documentId);
        
        // Filter by chapter or page range
        const filteredAnnotations = allAnnotations.filter(a => {
          // Check chapter match
          if (chapterIds.length > 0 && chapterIds.includes(a.chapterId)) {
            return true;
          }
          // Check page range match
          for (const range of pageRanges) {
            if (a.pageIndex >= range.start && a.pageIndex <= range.end) {
              return true;
            }
          }
          return chapterIds.length === 0 && pageRanges.length === 0;
        });
        
        const cards: StudyCard[] = [];
        
        // Priority 1: Weak/miss items first
        filteredAnnotations
          .filter(a => 
            a.tags.some(t => ['weak', 'miss', 'quiz-generated', 'quiz-miss', 'notelab-weak'].includes(t)) ||
            a.pdrm?.isMistake
          )
          .forEach(ann => {
            cards.push(annotationToCard(ann, 100));
          });
        
        // Priority 2: Flashcards
        filteredAnnotations
          .filter(a => a.flashcardFront && a.flashcardBack && !cards.find(c => c.annotationId === a.id))
          .forEach(ann => {
            cards.push(annotationToCard(ann, 50));
          });
        
        // Priority 3: Highlights
        filteredAnnotations
          .filter(a => a.selectedText.length > 20 && !cards.find(c => c.annotationId === a.id))
          .slice(0, 20)
          .forEach(ann => {
            cards.push(annotationToCard(ann, 10));
          });
        
        return cards.sort((a, b) => b.priority - a.priority);
      },
      
      // Get weak items only (for Quick Study) - Core items first
      getWeakDeck: (documentId: string, maxCards: number = 15) => {
        const cards: StudyCard[] = [];

        // ========================================
        // PRIORITY 1: Weak Core items
        // ========================================
        try {
          const learningStore = useLearningStore.getState();
          const coreItems = learningStore.getItemsForDocument(documentId);
          const weakCoreItems = coreItems.filter(item => item.learning.state === 'weak');

          if (weakCoreItems.length > 0) {
            const coreFlashcards = getCoreFlashcardsByPriority(weakCoreItems);
            for (const fc of coreFlashcards.slice(0, maxCards)) {
              cards.push(coreFlashcardToStudyCard(fc));
            }
          }
        } catch (err) {
          console.warn('Could not load weak Core items:', err);
        }

        if (cards.length >= maxCards) {
          return cards.slice(0, maxCards);
        }

        // ========================================
        // PRIORITY 2: Weak annotations
        // ========================================
        const annotationStore = useAnnotationStore.getState();
        const annotations = annotationStore.getAllAnnotationsArray()
          .filter(a => a.documentId === documentId);

        // Get weak/miss items
        const weakAnnotations = annotations.filter(a =>
          a.tags.some(t => ['weak', 'miss', 'quiz-generated', 'quiz-miss', 'notelab-weak'].includes(t)) ||
          a.pdrm?.isMistake
        );

        // Sort by how "weak" they are (miss > weak > quiz-miss)
        weakAnnotations.sort((a, b) => {
          const getPriority = (ann: typeof a) => {
            if (ann.tags.includes('miss')) return 3;
            if (ann.pdrm?.isMistake) return 2;
            if (ann.tags.includes('quiz-miss')) return 2;
            if (ann.tags.includes('weak')) return 1;
            return 0;
          };
          return getPriority(b) - getPriority(a);
        });

        // Add weak annotations up to maxCards
        const remaining1 = maxCards - cards.length;
        weakAnnotations.slice(0, remaining1).forEach(ann => {
          if (!cards.find(c => c.annotationId === ann.id)) {
            cards.push(annotationToCard(ann, 100));
          }
        });

        // If not enough weak items, add recent highlights
        if (cards.length < maxCards) {
          const remaining2 = maxCards - cards.length;
          annotations
            .filter(a => a.selectedText.length > 20 && !cards.find(c => c.annotationId === a.id))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, remaining2)
            .forEach(ann => {
              cards.push(annotationToCard(ann, 10));
            });
        }

        return cards;
      },
      
      // Get count of weak items (Core + annotations)
      getWeakItemsCount: (documentId: string) => {
        let count = 0;

        // Count weak Core items
        try {
          const learningStore = useLearningStore.getState();
          const coreItems = learningStore.getItemsForDocument(documentId);
          count += coreItems.filter(item => item.learning.state === 'weak').length;
        } catch (err) {
          // Ignore
        }

        // Count weak annotations
        const annotationStore = useAnnotationStore.getState();
        count += annotationStore.getAllAnnotationsArray()
          .filter(a => a.documentId === documentId)
          .filter(a =>
            a.tags.some(t => ['weak', 'miss', 'quiz-generated', 'quiz-miss', 'notelab-weak'].includes(t)) ||
            a.pdrm?.isMistake
          ).length;

        return count;
      },
      
      // Check if there's a last session to resume
      hasLastSession: () => {
        const { lastSessionDocId } = get();
        return !!lastSessionDocId;
      }
    }),
    {
      name: 'study-session-store',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
      partialize: (state) => ({
        sessions: state.sessions,
        lastSessionDocId: state.lastSessionDocId,
        lastSessionCardIndex: state.lastSessionCardIndex
      }),
      skipHydration: typeof window === 'undefined',
    }
  )
);

export default useStudySessionStore;
