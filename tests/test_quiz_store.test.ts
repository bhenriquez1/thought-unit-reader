/**
 * Quiz Store Unit Tests (Jest)
 * Tests for P1 Chapter Quiz functionality:
 * - Quiz generation from highlights
 * - Quiz answer submission
 * - Quiz completion and flashcard creation for wrong answers
 * - localStorage persistence
 */

// Test data
const mockHighlights = [
  {
    id: 'highlight_1',
    documentId: 'doc_1',
    chapterId: 'chapter_1',
    pageIndex: 0,
    selectedText: 'The mitochondria is the powerhouse of the cell',
    anchor: { type: 'textRange' as const, start: 0, end: 45 },
    pdrm: {},
    color: '#FFEB3B',
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: 'guest'
  },
  {
    id: 'highlight_2',
    documentId: 'doc_1',
    chapterId: 'chapter_1',
    pageIndex: 0,
    selectedText: 'ATP is the energy currency of the cell',
    anchor: { type: 'textRange' as const, start: 50, end: 88 },
    pdrm: {},
    color: '#FFEB3B',
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: 'guest'
  },
  {
    id: 'highlight_3',
    documentId: 'doc_1',
    chapterId: 'chapter_1',
    pageIndex: 1,
    selectedText: 'Cellular respiration produces ATP through oxidative phosphorylation',
    anchor: { type: 'textRange' as const, start: 0, end: 67 },
    pdrm: {},
    color: '#FFEB3B',
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: 'guest'
  },
  {
    id: 'highlight_4',
    documentId: 'doc_1',
    chapterId: 'chapter_1',
    pageIndex: 1,
    selectedText: 'The electron transport chain is located in the inner mitochondrial membrane',
    anchor: { type: 'textRange' as const, start: 70, end: 145 },
    pdrm: {},
    color: '#FFEB3B',
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: 'guest'
  },
  {
    id: 'highlight_5',
    documentId: 'doc_1',
    chapterId: 'chapter_1',
    pageIndex: 2,
    selectedText: 'Glycolysis occurs in the cytoplasm and produces pyruvate',
    anchor: { type: 'textRange' as const, start: 0, end: 56 },
    pdrm: {},
    color: '#FFEB3B',
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: 'guest'
  }
];

const mockHeadings = ['Chapter 1: Cell Biology', 'Section 1.1: Mitochondria', 'Section 1.2: ATP Production'];

describe('Quiz Store Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.resetModules();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Quiz Generation', () => {
    it('should generate quiz questions from highlights', async () => {
      // Import store dynamically to get fresh instance
      const { useQuizStore } = require('../lib/stores/quizStore');
      const store = useQuizStore.getState();
      
      // Generate quiz
      await store.generateQuiz('doc_1', 'chapter_1', mockHighlights as any, mockHeadings);
      
      const { currentQuiz } = useQuizStore.getState();
      
      // Verify quiz was created
      expect(currentQuiz).not.toBeNull();
      expect(currentQuiz?.documentId).toBe('doc_1');
      expect(currentQuiz?.chapterId).toBe('chapter_1');
      
      // Verify questions were generated (should be 5 questions: 3 recall, 2 application)
      expect(currentQuiz?.questions.length).toBe(5);
      
      // Verify question types
      const recallQuestions = currentQuiz?.questions.filter((q: any) => q.type === 'recall') || [];
      const applicationQuestions = currentQuiz?.questions.filter((q: any) => q.type === 'application') || [];
      
      expect(recallQuestions.length).toBe(3);
      expect(applicationQuestions.length).toBe(2);
      
      console.log('✅ Quiz generation test passed');
    });

    it('should generate quiz from headings when no highlights available', async () => {
      const { useQuizStore } = require('../lib/stores/quizStore');
      const store = useQuizStore.getState();
      
      // Try to generate quiz with empty highlights but with headings
      await store.generateQuiz('doc_1', 'chapter_1', [], mockHeadings);
      
      const { currentQuiz } = useQuizStore.getState();
      
      // Quiz should be created from headings as fallback
      expect(currentQuiz).not.toBeNull();
      expect(currentQuiz?.questions.length).toBeGreaterThan(0);
      
      // All questions should be recall type (from headings)
      const allRecall = currentQuiz?.questions.every((q: any) => q.type === 'recall');
      expect(allRecall).toBe(true);
      
      console.log('✅ Headings fallback test passed');
    });
    
    it('should not generate quiz without highlights AND headings', async () => {
      const { useQuizStore } = require('../lib/stores/quizStore');
      const store = useQuizStore.getState();
      
      // Try to generate quiz with empty highlights and empty headings
      await store.generateQuiz('doc_1', 'chapter_1', [], []);
      
      const { currentQuiz } = useQuizStore.getState();
      
      // Quiz should not be created
      expect(currentQuiz).toBeNull();
      
      console.log('✅ Empty highlights and headings test passed');
    });
  });

  describe('Quiz Answer Submission', () => {
    it('should track correct and incorrect answers', async () => {
      const { useQuizStore } = require('../lib/stores/quizStore');
      const store = useQuizStore.getState();
      
      // Generate quiz first
      await store.generateQuiz('doc_1', 'chapter_1', mockHighlights as any, mockHeadings);
      
      let { currentQuiz } = useQuizStore.getState();
      expect(currentQuiz).not.toBeNull();
      
      if (currentQuiz && currentQuiz.questions.length > 0) {
        const firstQuestion = currentQuiz.questions[0];
        
        // Submit correct answer
        store.submitAnswer(firstQuestion.id, firstQuestion.correctAnswer);
        
        // Check answer was recorded
        const updatedState = useQuizStore.getState();
        const answer = updatedState.currentQuiz?.answers.find((a: any) => a.questionId === firstQuestion.id);
        
        expect(answer).toBeDefined();
        expect(answer?.isCorrect).toBe(true);
        
        console.log('✅ Answer submission test passed');
      }
    });

    it('should navigate between questions', async () => {
      const { useQuizStore } = require('../lib/stores/quizStore');
      const store = useQuizStore.getState();
      
      // Generate quiz
      await store.generateQuiz('doc_1', 'chapter_1', mockHighlights as any, mockHeadings);
      
      let { currentQuiz } = useQuizStore.getState();
      expect(currentQuiz?.currentIndex).toBe(0);
      
      // Navigate to next question
      store.nextQuestion();
      currentQuiz = useQuizStore.getState().currentQuiz;
      expect(currentQuiz?.currentIndex).toBe(1);
      
      // Navigate back
      store.prevQuestion();
      currentQuiz = useQuizStore.getState().currentQuiz;
      expect(currentQuiz?.currentIndex).toBe(0);
      
      console.log('✅ Question navigation test passed');
    });
  });

  describe('Quiz Completion', () => {
    it('should save quiz attempt on finish', async () => {
      const { useQuizStore } = require('../lib/stores/quizStore');
      const store = useQuizStore.getState();
      
      // Generate quiz
      await store.generateQuiz('doc_1', 'chapter_1', mockHighlights as any, mockHeadings);
      
      let { currentQuiz } = useQuizStore.getState();
      
      if (currentQuiz) {
        // Answer all questions (some correct, some wrong)
        currentQuiz.questions.forEach((q: any, idx: number) => {
          if (idx < 3) {
            // First 3 correct
            store.submitAnswer(q.id, q.correctAnswer);
          } else {
            // Last 2 wrong
            store.submitAnswer(q.id, 'wrong answer');
          }
        });
        
        // Finish quiz
        const attempt = await store.finishQuiz();
        
        expect(attempt).not.toBeNull();
        expect(attempt?.score).toBe(60); // 3/5 = 60%
        expect(attempt?.totalQuestions).toBe(5);
        expect(attempt?.wrongQuestionIds.length).toBe(2);
        
        // Check attempt was saved
        const { attempts } = useQuizStore.getState();
        expect(Object.keys(attempts).length).toBeGreaterThan(0);
        
        console.log('✅ Quiz completion test passed');
      }
    });

    it('should calculate best score for chapter', async () => {
      const { useQuizStore } = require('../lib/stores/quizStore');
      let store = useQuizStore.getState();
      
      // Generate and complete first quiz with 60% score
      await store.generateQuiz('doc_1', 'chapter_1', mockHighlights as any, mockHeadings);
      let { currentQuiz } = useQuizStore.getState();
      
      if (currentQuiz) {
        currentQuiz.questions.forEach((q: any, idx: number) => {
          store.submitAnswer(q.id, idx < 3 ? q.correctAnswer : 'wrong');
        });
        await store.finishQuiz();
      }
      
      // Generate and complete second quiz with 80% score
      store = useQuizStore.getState();
      await store.generateQuiz('doc_1', 'chapter_1', mockHighlights as any, mockHeadings);
      currentQuiz = useQuizStore.getState().currentQuiz;
      
      if (currentQuiz) {
        currentQuiz.questions.forEach((q: any, idx: number) => {
          store.submitAnswer(q.id, idx < 4 ? q.correctAnswer : 'wrong');
        });
        await store.finishQuiz();
      }
      
      // Check best score
      store = useQuizStore.getState();
      const bestScore = store.getBestScore('doc_1', 'chapter_1');
      expect(bestScore).toBe(80);
      
      console.log('✅ Best score calculation test passed');
    });
  });

  describe('localStorage Persistence', () => {
    it('should persist quiz attempts to localStorage', async () => {
      const { useQuizStore } = require('../lib/stores/quizStore');
      const store = useQuizStore.getState();
      
      // Generate and complete quiz
      await store.generateQuiz('doc_1', 'chapter_1', mockHighlights as any, mockHeadings);
      let { currentQuiz } = useQuizStore.getState();
      
      if (currentQuiz) {
        currentQuiz.questions.forEach((q: any, idx: number) => {
          store.submitAnswer(q.id, idx < 3 ? q.correctAnswer : 'wrong');
        });
        await store.finishQuiz();
      }
      
      // Check localStorage
      const storedData = localStorage.getItem('quiz-store');
      expect(storedData).not.toBeNull();
      
      if (storedData) {
        const parsed = JSON.parse(storedData);
        expect(parsed.state.attempts).toBeDefined();
        expect(Object.keys(parsed.state.attempts).length).toBeGreaterThan(0);
      }
      
      console.log('✅ localStorage persistence test passed');
    });
  });
});
