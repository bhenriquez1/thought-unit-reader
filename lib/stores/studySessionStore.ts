// lib/stores/studySessionStore.ts
// Study Session Store - Flashcard loop with spaced repetition
// Uses existing annotationStore for cards, extends quizStore for quick questions

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useAnnotationStore, type Annotation } from './annotationStore';
import { useQuizStore, type QuizQuestion } from './quizStore';
import { useCourseContextStore } from './courseContextStore';
import type { StudyCard as PageIntelStudyCard } from '../page-intelligence/types';

// ============================================================================
// Types
// ============================================================================

export type CardGrade = 'again' | 'hard' | 'good' | 'easy';

export interface StudyCard {
  id: string;
  annotationId: string;
  front: string;
  back: string;
  source: 'flashcard' | 'highlight' | 'quiz-miss';
  priority: number;  // Higher = more urgent (weak/miss items get higher priority)
  lastReviewed?: string;
  reviewCount: number;
  easeFactor: number;  // SM-2 ease factor (default 2.5)
  interval: number;    // Days until next review
  dueDate?: string;
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
      // Completely reset - show again soon
      interval = 1;
      easeFactor = Math.max(1.3, easeFactor - 0.2);
      break;
    case 'hard':
      // Slight increase, reduce ease
      interval = Math.max(1, Math.round(interval * 1.2));
      easeFactor = Math.max(1.3, easeFactor - 0.15);
      break;
    case 'good':
      // Normal progression
      interval = Math.round(interval * easeFactor);
      // Keep ease factor the same
      break;
    case 'easy':
      // Faster progression, increase ease
      interval = Math.round(interval * easeFactor * 1.3);
      easeFactor = Math.min(3.0, easeFactor + 0.15);
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
        const shouldShowQuestion = newCardsSinceQuestion >= 5 && grade === 'again';
        
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
      
      // Build study deck from annotations
      getStudyDeck: (documentId: string) => {
        const annotationStore = useAnnotationStore.getState();
        const courseContext = useCourseContextStore.getState();
        const annotations = annotationStore.getAllAnnotationsArray()
          .filter(a => a.documentId === documentId);

        const cards: StudyCard[] = [];

        // Priority 1: Weak/miss items (highest priority)
        annotations
          .filter(a =>
            a.tags.some(t => ['weak', 'miss', 'quiz-generated', 'quiz-miss'].includes(t)) ||
            a.pdrm?.isMistake
          )
          .forEach(ann => {
            cards.push(annotationToCard(ann, 100));
          });

        // Priority 2: Explicit flashcards
        annotations
          .filter(a => a.flashcardFront && a.flashcardBack && !cards.find(c => c.annotationId === a.id))
          .forEach(ann => {
            cards.push(annotationToCard(ann, 50));
          });

        // Priority 3: Highlights (lower priority)
        annotations
          .filter(a => a.selectedText.length > 20 && !cards.find(c => c.annotationId === a.id))
          .slice(0, 20)  // Limit to prevent too many cards
          .forEach(ann => {
            cards.push(annotationToCard(ann, 10));
          });

        // Priority 4: Auto-generated cards from Page Intelligence (CourseContext integration)
        // These are DAT-scored cards extracted from page content
        try {
          const pageIntelCards = courseContext.getAllStudyCards();
          const docPrefix = `${documentId}:`;
          pageIntelCards
            .filter(c => c.deck.startsWith(docPrefix))
            .forEach(piCard => {
              // Skip if we already have a similar card (basic dedup by front text)
              const isDuplicate = cards.some(c =>
                c.front.substring(0, 50) === piCard.front.substring(0, 50)
              );

              if (!isDuplicate) {
                // Convert PageIntelStudyCard to StudyCard format
                const isDATCard = piCard.tags.includes('DAT') || piCard.tags.includes('high-yield');
                cards.push({
                  id: `pageIntel_${piCard.id}`,
                  annotationId: '',  // No annotation backing
                  front: piCard.front,
                  back: piCard.back,
                  source: 'highlight',  // Treat as highlight-style
                  priority: isDATCard ? 75 : 25,  // DAT cards get higher priority
                  reviewCount: 0,
                  easeFactor: 2.5,
                  interval: 1
                });
              }
            });
        } catch (e) {
          // CourseContext not available, skip page intel cards
          console.log('📚 StudySession: CourseContext not available for page intel cards');
        }

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
        const courseContext = useCourseContextStore.getState();
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

        // Priority 4: Page Intelligence cards from pages within the topic range
        try {
          const pageIntelCards = courseContext.getAllStudyCards();
          pageIntelCards.forEach(piCard => {
            // Extract page number from deck (format: docId:page:pageNumber)
            const match = piCard.deck.match(/:page:(\d+)$/);
            if (!match) return;
            const cardPage = parseInt(match[1], 10);

            // Check if card is within topic's page ranges
            const inRange = pageRanges.some(r => cardPage >= r.start && cardPage <= r.end);
            if (!inRange) return;

            // Skip duplicates
            const isDuplicate = cards.some(c =>
              c.front.substring(0, 50) === piCard.front.substring(0, 50)
            );
            if (isDuplicate) return;

            const isDATCard = piCard.tags.includes('DAT') || piCard.tags.includes('high-yield');
            cards.push({
              id: `pageIntel_${piCard.id}`,
              annotationId: '',
              front: piCard.front,
              back: piCard.back,
              source: 'highlight',
              priority: isDATCard ? 75 : 25,
              reviewCount: 0,
              easeFactor: 2.5,
              interval: 1
            });
          });
        } catch (e) {
          // CourseContext not available
        }

        return cards.sort((a, b) => b.priority - a.priority);
      },
      
      // Get weak items only (for Quick Study)
      getWeakDeck: (documentId: string, maxCards: number = 15) => {
        const annotationStore = useAnnotationStore.getState();
        const annotations = annotationStore.getAllAnnotationsArray()
          .filter(a => a.documentId === documentId);
        
        const cards: StudyCard[] = [];
        
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
        
        // Take top maxCards
        weakAnnotations.slice(0, maxCards).forEach(ann => {
          cards.push(annotationToCard(ann, 100));
        });
        
        // If not enough weak items, add recent highlights
        if (cards.length < maxCards) {
          const remaining = maxCards - cards.length;
          annotations
            .filter(a => a.selectedText.length > 20 && !cards.find(c => c.annotationId === a.id))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, remaining)
            .forEach(ann => {
              cards.push(annotationToCard(ann, 10));
            });
        }
        
        return cards;
      },
      
      // Get count of weak items
      getWeakItemsCount: (documentId: string) => {
        const annotationStore = useAnnotationStore.getState();
        return annotationStore.getAllAnnotationsArray()
          .filter(a => a.documentId === documentId)
          .filter(a =>
            a.tags.some(t => ['weak', 'miss', 'quiz-generated', 'quiz-miss', 'notelab-weak'].includes(t)) ||
            a.pdrm?.isMistake
          ).length;
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
