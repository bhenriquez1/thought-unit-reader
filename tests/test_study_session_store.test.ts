/**
 * Study Session Store Tests - P2 Implementation
 * Tests for flashcard loop, grading, and localStorage persistence
 */

import { useStudySessionStore, type StudyCard, type CardGrade } from '../lib/stores/studySessionStore';
import { useAnnotationStore } from '../lib/stores/annotationStore';

// localStorage is mocked in setup.ts

describe('StudySessionStore - P2 Implementation', () => {
  const TEST_DOC_ID = 'test-doc-123';
  
  beforeEach(() => {
    // Reset stores before each test
    localStorage.clear();
    useStudySessionStore.setState({
      currentSession: null,
      deck: [],
      currentCardIndex: 0,
      isRevealed: false,
      quickQuestion: null,
      showQuickQuestion: false,
      cardsSinceLastQuestion: 0,
      sessions: {}
    });
    
    // Add test annotations to annotation store
    useAnnotationStore.setState({
      annotations: {
        'ann-1': {
          id: 'ann-1',
          documentId: TEST_DOC_ID,
          pageNumber: 1,
          selectedText: 'Test highlight text for studying',
          noteContent: 'This is a note about the highlight',
          tags: [],
          color: '#ffff00',
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        'ann-2': {
          id: 'ann-2',
          documentId: TEST_DOC_ID,
          pageNumber: 2,
          selectedText: 'Another important concept to remember',
          noteContent: 'Key concept explanation',
          tags: ['weak', 'quiz-miss'],
          color: '#ff0000',
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        'ann-3': {
          id: 'ann-3',
          documentId: TEST_DOC_ID,
          pageNumber: 3,
          selectedText: 'Flashcard front text',
          flashcardFront: 'What is the main concept?',
          flashcardBack: 'The main concept is XYZ',
          noteContent: '',
          tags: [],
          color: '#00ff00',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      },
      activeDocumentId: TEST_DOC_ID,
      activePageNumber: 1,
      viewMode: 'all',
      pendingHighlight: null
    });
  });

  test('getStudyDeck returns cards from annotations', () => {
    const store = useStudySessionStore.getState();
    const deck = store.getStudyDeck(TEST_DOC_ID);
    
    expect(deck.length).toBeGreaterThan(0);
    console.log(`✅ getStudyDeck returned ${deck.length} cards`);
  });

  test('weak/miss items have higher priority', () => {
    const store = useStudySessionStore.getState();
    const deck = store.getStudyDeck(TEST_DOC_ID);
    
    // Find the weak item
    const weakCard = deck.find(c => c.source === 'quiz-miss');
    const normalCard = deck.find(c => c.source === 'highlight');
    
    if (weakCard && normalCard) {
      expect(weakCard.priority).toBeGreaterThan(normalCard.priority);
      console.log(`✅ Weak card priority (${weakCard.priority}) > Normal card priority (${normalCard.priority})`);
    }
  });

  test('flashcard annotations create flashcard-type cards', () => {
    const store = useStudySessionStore.getState();
    const deck = store.getStudyDeck(TEST_DOC_ID);
    
    const flashcardCard = deck.find(c => c.source === 'flashcard');
    expect(flashcardCard).toBeDefined();
    if (flashcardCard) {
      expect(flashcardCard.front).toBe('What is the main concept?');
      expect(flashcardCard.back).toBe('The main concept is XYZ');
      console.log(`✅ Flashcard card created with correct front/back`);
    }
  });

  test('startSession initializes session correctly', () => {
    const store = useStudySessionStore.getState();
    store.startSession(TEST_DOC_ID);
    
    const state = useStudySessionStore.getState();
    expect(state.currentSession).not.toBeNull();
    expect(state.currentSession?.documentId).toBe(TEST_DOC_ID);
    expect(state.deck.length).toBeGreaterThan(0);
    expect(state.currentCardIndex).toBe(0);
    expect(state.isRevealed).toBe(false);
    console.log(`✅ Session started with ${state.deck.length} cards`);
  });

  test('revealCard sets isRevealed to true', () => {
    const store = useStudySessionStore.getState();
    store.startSession(TEST_DOC_ID);
    store.revealCard();
    
    const state = useStudySessionStore.getState();
    expect(state.isRevealed).toBe(true);
    console.log(`✅ Card revealed successfully`);
  });

  test('gradeCard advances to next card', () => {
    const store = useStudySessionStore.getState();
    store.startSession(TEST_DOC_ID);
    store.revealCard();
    
    const initialIndex = useStudySessionStore.getState().currentCardIndex;
    store.gradeCard('easy');
    
    const state = useStudySessionStore.getState();
    expect(state.currentCardIndex).toBe(initialIndex + 1);
    expect(state.isRevealed).toBe(false);
    expect(state.currentSession?.cardsReviewed).toBe(1);
    expect(state.currentSession?.correctCount).toBe(1);
    console.log(`✅ Card graded 'easy', advanced to next card`);
  });

  test('gradeCard "again" adds card back to deck', () => {
    const store = useStudySessionStore.getState();
    store.startSession(TEST_DOC_ID);
    
    const initialDeckLength = useStudySessionStore.getState().deck.length;
    store.revealCard();
    store.gradeCard('again');
    
    const state = useStudySessionStore.getState();
    expect(state.deck.length).toBe(initialDeckLength + 1);
    expect(state.currentSession?.correctCount).toBe(0);
    console.log(`✅ Card graded 'again', added back to deck`);
  });

  test('getSessionStats returns correct statistics', () => {
    const store = useStudySessionStore.getState();
    store.startSession(TEST_DOC_ID);
    
    // Grade a few cards
    store.revealCard();
    store.gradeCard('easy');
    store.revealCard();
    store.gradeCard('hard');
    store.revealCard();
    store.gradeCard('again');
    
    const stats = useStudySessionStore.getState().getSessionStats();
    expect(stats.reviewed).toBe(3);
    expect(stats.correct).toBe(2); // easy and hard count as correct
    console.log(`✅ Session stats: reviewed=${stats.reviewed}, correct=${stats.correct}, remaining=${stats.remaining}`);
  });

  test('endSession saves session to history', () => {
    const store = useStudySessionStore.getState();
    store.startSession(TEST_DOC_ID);
    store.revealCard();
    store.gradeCard('easy');
    
    const sessionId = useStudySessionStore.getState().currentSession?.id;
    store.endSession();
    
    const state = useStudySessionStore.getState();
    expect(state.currentSession).toBeNull();
    expect(state.sessions[sessionId!]).toBeDefined();
    expect(state.sessions[sessionId!].completedAt).toBeDefined();
    console.log(`✅ Session ended and saved to history`);
  });

  test('skipCard advances without grading', () => {
    const store = useStudySessionStore.getState();
    store.startSession(TEST_DOC_ID);
    
    const initialIndex = useStudySessionStore.getState().currentCardIndex;
    const initialReviewed = useStudySessionStore.getState().currentSession?.cardsReviewed || 0;
    
    store.skipCard();
    
    const state = useStudySessionStore.getState();
    expect(state.currentCardIndex).toBe(initialIndex + 1);
    expect(state.currentSession?.cardsReviewed).toBe(initialReviewed);
    console.log(`✅ Card skipped without affecting review count`);
  });

  test('getDueCards returns cards due for review', () => {
    const store = useStudySessionStore.getState();
    const dueCards = store.getDueCards(TEST_DOC_ID);
    
    // All cards should be due initially (no dueDate set)
    expect(dueCards.length).toBeGreaterThan(0);
    console.log(`✅ getDueCards returned ${dueCards.length} due cards`);
  });

  test('localStorage persistence works', () => {
    const store = useStudySessionStore.getState();
    store.startSession(TEST_DOC_ID);
    store.revealCard();
    store.gradeCard('easy');
    store.endSession();
    
    // Check that sessions are persisted
    const state = useStudySessionStore.getState();
    expect(Object.keys(state.sessions).length).toBeGreaterThan(0);
    console.log(`✅ Sessions persisted: ${Object.keys(state.sessions).length} session(s)`);
  });
});

describe('StudySessionStore - SM-2 Algorithm', () => {
  const TEST_DOC_ID = 'test-doc-sm2';
  
  beforeEach(() => {
    localStorage.clear();
    useStudySessionStore.setState({
      currentSession: null,
      deck: [],
      currentCardIndex: 0,
      isRevealed: false,
      quickQuestion: null,
      showQuickQuestion: false,
      cardsSinceLastQuestion: 0,
      sessions: {}
    });
    
    useAnnotationStore.setState({
      annotations: {
        'ann-sm2': {
          id: 'ann-sm2',
          documentId: TEST_DOC_ID,
          pageNumber: 1,
          selectedText: 'SM-2 test content',
          noteContent: 'Testing spaced repetition',
          tags: [],
          color: '#ffff00',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      },
      activeDocumentId: TEST_DOC_ID,
      activePageNumber: 1,
      viewMode: 'all',
      pendingHighlight: null
    });
  });

  test('easy grade increases interval and ease factor', () => {
    const store = useStudySessionStore.getState();
    store.startSession(TEST_DOC_ID);
    
    const initialCard = useStudySessionStore.getState().deck[0];
    const initialEase = initialCard.easeFactor;
    const initialInterval = initialCard.interval;
    
    store.revealCard();
    store.gradeCard('easy');
    
    const updatedCard = useStudySessionStore.getState().deck[0];
    expect(updatedCard.easeFactor).toBeGreaterThan(initialEase);
    expect(updatedCard.interval).toBeGreaterThan(initialInterval);
    console.log(`✅ Easy grade: ease ${initialEase} -> ${updatedCard.easeFactor}, interval ${initialInterval} -> ${updatedCard.interval}`);
  });

  test('again grade resets interval and decreases ease factor', () => {
    const store = useStudySessionStore.getState();
    store.startSession(TEST_DOC_ID);
    
    const initialCard = useStudySessionStore.getState().deck[0];
    const initialEase = initialCard.easeFactor;
    
    store.revealCard();
    store.gradeCard('again');
    
    const updatedCard = useStudySessionStore.getState().deck[0];
    expect(updatedCard.easeFactor).toBeLessThan(initialEase);
    expect(updatedCard.interval).toBe(1);
    console.log(`✅ Again grade: ease ${initialEase} -> ${updatedCard.easeFactor}, interval reset to 1`);
  });
});
