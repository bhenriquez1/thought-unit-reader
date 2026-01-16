// lib/stores/quizStore.ts
// Quiz Store for Chapter Quiz functionality
// Generates questions from highlights, stores attempts, creates flashcards for wrong answers

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useAnnotationStore, type Annotation, type CreateAnnotationInput } from './annotationStore';

// ============================================================================
// Types
// ============================================================================

export type QuestionType = 'recall' | 'application';

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  question: string;
  options?: string[];  // For MCQ
  correctAnswer: string;
  explanation?: string;
  sourceHighlightIds: string[];  // Link to source highlights
  sourceText: string;
}

export interface QuizAnswer {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  timeSpent?: number;  // milliseconds
}

export interface QuizAttempt {
  id: string;
  documentId: string;
  chapterId: string;
  attemptNumber: number;
  score: number;
  totalQuestions: number;
  answers: QuizAnswer[];
  wrongQuestionIds: string[];
  createdAt: string;
  completedAt?: string;
}

export interface QuizState {
  // Current quiz session
  currentQuiz: {
    documentId: string;
    chapterId: string;
    questions: QuizQuestion[];
    answers: QuizAnswer[];
    currentIndex: number;
    startedAt: string;
  } | null;
  
  // Quiz attempts history
  attempts: Record<string, QuizAttempt>;  // attemptId -> attempt
  
  // Loading states
  isGenerating: boolean;
  isSubmitting: boolean;
  
  // Actions
  generateQuiz: (documentId: string, chapterId: string, highlights: Annotation[], headings: string[]) => Promise<void>;
  submitAnswer: (questionId: string, answer: string) => void;
  nextQuestion: () => void;
  prevQuestion: () => void;
  finishQuiz: () => Promise<QuizAttempt | null>;
  clearCurrentQuiz: () => void;
  
  // Getters
  getAttemptsForChapter: (documentId: string, chapterId: string) => QuizAttempt[];
  getLastAttempt: (documentId: string, chapterId: string) => QuizAttempt | null;
  getBestScore: (documentId: string, chapterId: string) => number;
}

// ============================================================================
// Question Generation Helpers
// ============================================================================

function generateId(): string {
  return `quiz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Generate recall question (MCQ or fill-in-blank)
function generateRecallQuestion(highlight: Annotation, allHighlights: Annotation[]): QuizQuestion {
  const text = highlight.selectedText.trim();
  const words = text.split(/\s+/);
  
  // Create a fill-in-blank or definition question
  let question: string;
  let correctAnswer: string;
  let options: string[] | undefined;
  
  if (words.length <= 10) {
    // Short highlight - ask for definition/explanation
    question = `What is the significance of: "${text}"?`;
    correctAnswer = text;
    
    // Generate distractor options from other highlights
    const distractors = allHighlights
      .filter(h => h.id !== highlight.id)
      .slice(0, 3)
      .map(h => h.selectedText.substring(0, 50));
    
    if (distractors.length >= 2) {
      options = shuffleArray([correctAnswer.substring(0, 50), ...distractors]);
    }
  } else {
    // Longer highlight - create fill-in-blank
    const keywordIndex = Math.floor(words.length / 2);
    const keyword = words[keywordIndex];
    const blankedText = words.map((w, i) => i === keywordIndex ? '______' : w).join(' ');
    
    question = `Fill in the blank:\n"${blankedText}"`;
    correctAnswer = keyword;
    
    // Generate similar-looking distractors
    const distractors = allHighlights
      .filter(h => h.id !== highlight.id)
      .flatMap(h => h.selectedText.split(/\s+/))
      .filter(w => w.length > 3 && w !== keyword)
      .slice(0, 3);
    
    if (distractors.length >= 2) {
      options = shuffleArray([keyword, ...distractors.slice(0, 3)]);
    }
  }
  
  return {
    id: generateId(),
    type: 'recall',
    question,
    options,
    correctAnswer,
    explanation: `From your highlight: "${text}"`,
    sourceHighlightIds: [highlight.id],
    sourceText: text
  };
}

// Generate application question (scenario-based)
function generateApplicationQuestion(highlight: Annotation, context: { chapterId: string, headings: string[] }): QuizQuestion {
  const text = highlight.selectedText.trim();
  
  // Create scenario-based question
  const scenarios = [
    `Given the concept: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}", how would you apply this in a clinical scenario?`,
    `A patient presents with symptoms related to: "${text.substring(0, 80)}...". What's the most appropriate approach based on this concept?`,
    `You're explaining "${text.substring(0, 60)}..." to a colleague. What's the key takeaway they should remember?`,
    `If "${text.substring(0, 80)}..." is true, what would be the expected outcome in practice?`
  ];
  
  const question = scenarios[Math.floor(Math.random() * scenarios.length)];
  
  return {
    id: generateId(),
    type: 'application',
    question,
    correctAnswer: text, // The original highlight serves as the model answer
    explanation: `This tests your ability to apply: "${text.substring(0, 150)}..."`,
    sourceHighlightIds: [highlight.id],
    sourceText: text
  };
}

// Generate questions from headings (for chapters with few highlights)
function generateHeadingQuestion(heading: string): QuizQuestion {
  return {
    id: generateId(),
    type: 'recall',
    question: `What are the key points covered in the section: "${heading}"?`,
    correctAnswer: heading,
    explanation: `This section covers: ${heading}`,
    sourceHighlightIds: [],
    sourceText: heading
  };
}

// Main question generation function
function generateQuestions(
  highlights: Annotation[], 
  headings: string[],
  count: number = 5
): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  
  // Target: 3 recall, 2 application
  const recallCount = Math.min(3, Math.ceil(count * 0.6));
  const applicationCount = count - recallCount;
  
  // Shuffle highlights to get variety
  const shuffledHighlights = shuffleArray([...highlights]);
  
  // Generate recall questions from highlights
  for (let i = 0; i < recallCount && i < shuffledHighlights.length; i++) {
    questions.push(generateRecallQuestion(shuffledHighlights[i], highlights));
  }
  
  // If not enough highlights, use headings
  if (questions.length < recallCount && headings.length > 0) {
    const remainingRecall = recallCount - questions.length;
    for (let i = 0; i < remainingRecall && i < headings.length; i++) {
      questions.push(generateHeadingQuestion(headings[i]));
    }
  }
  
  // Generate application questions
  const remainingHighlights = shuffledHighlights.slice(recallCount);
  for (let i = 0; i < applicationCount && i < remainingHighlights.length; i++) {
    questions.push(generateApplicationQuestion(
      remainingHighlights[i],
      { chapterId: remainingHighlights[i].chapterId, headings }
    ));
  }
  
  // Fill remaining with more recall if needed
  while (questions.length < count && shuffledHighlights.length > questions.length) {
    const idx = questions.length;
    if (idx < shuffledHighlights.length) {
      questions.push(generateRecallQuestion(shuffledHighlights[idx], highlights));
    } else {
      break;
    }
  }
  
  return shuffleArray(questions);
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useQuizStore = create<QuizState>()(
  persist(
    (set, get) => ({
      currentQuiz: null,
      attempts: {},
      isGenerating: false,
      isSubmitting: false,
      
      // Generate quiz from highlights and headings
      generateQuiz: async (documentId: string, chapterId: string, highlights: Annotation[], headings: string[]) => {
        set({ isGenerating: true });
        
        try {
          // Filter highlights for this chapter
          const chapterHighlights = highlights.filter(h => 
            h.documentId === documentId && 
            (h.chapterId === chapterId || !chapterId)
          );
          
          // Generate 5 questions (3 recall, 2 application)
          const questions = generateQuestions(chapterHighlights, headings, 5);
          
          if (questions.length === 0) {
            console.warn('No questions could be generated - not enough highlights');
            set({ isGenerating: false });
            return;
          }
          
          set({
            currentQuiz: {
              documentId,
              chapterId,
              questions,
              answers: [],
              currentIndex: 0,
              startedAt: new Date().toISOString()
            },
            isGenerating: false
          });
          
          console.log(`📝 Generated ${questions.length} quiz questions for chapter: ${chapterId}`);
        } catch (error) {
          console.error('Failed to generate quiz:', error);
          set({ isGenerating: false });
        }
      },
      
      // Submit answer for current question
      submitAnswer: (questionId: string, answer: string) => {
        const { currentQuiz } = get();
        if (!currentQuiz) return;
        
        const question = currentQuiz.questions.find(q => q.id === questionId);
        if (!question) return;
        
        // Check if answer is correct (case-insensitive, trimmed)
        const isCorrect = answer.toLowerCase().trim() === question.correctAnswer.toLowerCase().trim() ||
          (question.options && answer === question.correctAnswer);
        
        const quizAnswer: QuizAnswer = {
          questionId,
          userAnswer: answer,
          isCorrect
        };
        
        set({
          currentQuiz: {
            ...currentQuiz,
            answers: [...currentQuiz.answers.filter(a => a.questionId !== questionId), quizAnswer]
          }
        });
      },
      
      // Navigate to next question
      nextQuestion: () => {
        const { currentQuiz } = get();
        if (!currentQuiz) return;
        
        const nextIndex = Math.min(currentQuiz.currentIndex + 1, currentQuiz.questions.length - 1);
        set({
          currentQuiz: {
            ...currentQuiz,
            currentIndex: nextIndex
          }
        });
      },
      
      // Navigate to previous question
      prevQuestion: () => {
        const { currentQuiz } = get();
        if (!currentQuiz) return;
        
        const prevIndex = Math.max(currentQuiz.currentIndex - 1, 0);
        set({
          currentQuiz: {
            ...currentQuiz,
            currentIndex: prevIndex
          }
        });
      },
      
      // Finish quiz and save attempt
      finishQuiz: async () => {
        const { currentQuiz, attempts } = get();
        if (!currentQuiz) return null;
        
        set({ isSubmitting: true });
        
        try {
          // Calculate score
          const correctCount = currentQuiz.answers.filter(a => a.isCorrect).length;
          const wrongQuestionIds = currentQuiz.answers
            .filter(a => !a.isCorrect)
            .map(a => a.questionId);
          
          // Get attempt number for this chapter
          const chapterAttempts = Object.values(attempts).filter(
            a => a.documentId === currentQuiz.documentId && a.chapterId === currentQuiz.chapterId
          );
          
          // Create attempt record
          const attempt: QuizAttempt = {
            id: generateId(),
            documentId: currentQuiz.documentId,
            chapterId: currentQuiz.chapterId,
            attemptNumber: chapterAttempts.length + 1,
            score: Math.round((correctCount / currentQuiz.questions.length) * 100),
            totalQuestions: currentQuiz.questions.length,
            answers: currentQuiz.answers,
            wrongQuestionIds,
            createdAt: currentQuiz.startedAt,
            completedAt: new Date().toISOString()
          };
          
          // Save attempt
          set({
            attempts: { ...attempts, [attempt.id]: attempt },
            isSubmitting: false
          });
          
          // Create flashcards for wrong answers
          if (wrongQuestionIds.length > 0) {
            const annotationStore = useAnnotationStore.getState();
            
            for (const qId of wrongQuestionIds) {
              const question = currentQuiz.questions.find(q => q.id === qId);
              if (!question) continue;
              
              // Create flashcard annotation
              const flashcardInput: CreateAnnotationInput = {
                documentId: currentQuiz.documentId,
                chapterId: currentQuiz.chapterId,
                pageIndex: 0, // Will be updated when linked to source
                selectedText: question.sourceText,
                anchor: { type: 'textRange', start: 0, end: question.sourceText.length },
                pdrm: {
                  isMistake: true,
                  weakAreaTags: ['quiz-miss', 'weak']
                },
                color: '#EF4444', // Red for mistakes
                tags: ['flashcard', 'miss', 'weak', 'quiz-generated'],
                flashcardFront: question.question,
                flashcardBack: question.correctAnswer,
                userId: 'guest'
              };
              
              await annotationStore.addAnnotation(flashcardInput);
              console.log(`📇 Created flashcard for missed question: ${qId}`);
            }
          }
          
          console.log(`✅ Quiz completed: ${attempt.score}% (${correctCount}/${currentQuiz.questions.length})`);
          
          return attempt;
        } catch (error) {
          console.error('Failed to finish quiz:', error);
          set({ isSubmitting: false });
          return null;
        }
      },
      
      // Clear current quiz
      clearCurrentQuiz: () => {
        set({ currentQuiz: null });
      },
      
      // Get all attempts for a chapter
      getAttemptsForChapter: (documentId: string, chapterId: string) => {
        const { attempts } = get();
        return Object.values(attempts)
          .filter(a => a.documentId === documentId && a.chapterId === chapterId)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      },
      
      // Get last attempt for chapter
      getLastAttempt: (documentId: string, chapterId: string) => {
        const attempts = get().getAttemptsForChapter(documentId, chapterId);
        return attempts[0] || null;
      },
      
      // Get best score for chapter
      getBestScore: (documentId: string, chapterId: string) => {
        const attempts = get().getAttemptsForChapter(documentId, chapterId);
        if (attempts.length === 0) return 0;
        return Math.max(...attempts.map(a => a.score));
      }
    }),
    {
      name: 'quiz-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        attempts: state.attempts
      })
    }
  )
);

export default useQuizStore;
