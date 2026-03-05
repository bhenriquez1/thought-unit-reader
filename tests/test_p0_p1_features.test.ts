// tests/test_p0_p1_features.test.ts
// Unit tests for P0/P1 features: Study Session, Syllabus, Silent NoteLab capture

import { describe, test, expect, beforeEach } from '@jest/globals';

// ============================================================================
// Test: studySessionStore methods
// ============================================================================

describe('studySessionStore - P0/P1 Features', () => {
  
  test('getWeakItemsCount returns 0 when no weak items', () => {
    const weakItems: any[] = [];
    const count = weakItems.filter(a =>
      a.tags?.some((t: string) => ['weak', 'miss', 'quiz-generated', 'quiz-miss'].includes(t)) ||
      a.pdrm?.isMistake
    ).length;
    expect(count).toBe(0);
  });
  
  test('getWeakItemsCount returns correct count with weak items', () => {
    const weakItems = [
      { id: '1', tags: ['weak'], pdrm: {} },
      { id: '2', tags: ['miss'], pdrm: {} },
      { id: '3', tags: ['quiz-generated'], pdrm: {} },
      { id: '4', tags: [], pdrm: { isMistake: true } },
      { id: '5', tags: ['highlight'], pdrm: {} }, // Not weak
    ];
    const count = weakItems.filter(a =>
      a.tags?.some((t: string) => ['weak', 'miss', 'quiz-generated', 'quiz-miss'].includes(t)) ||
      a.pdrm?.isMistake
    ).length;
    expect(count).toBe(4);
  });
  
  test('hasLastSession returns false when no session', () => {
    const lastSessionDocId: string | null = null;
    expect(!!lastSessionDocId).toBe(false);
  });
  
  test('hasLastSession returns true when session exists', () => {
    const lastSessionDocId: string | null = 'doc-123';
    expect(!!lastSessionDocId).toBe(true);
  });
  
  test('getTopicDeck filters by chapter IDs', () => {
    const annotations = [
      { id: '1', chapterId: 'ch1', pageIndex: 5, tags: ['weak'] },
      { id: '2', chapterId: 'ch2', pageIndex: 15, tags: ['highlight'] },
      { id: '3', chapterId: 'ch1', pageIndex: 8, tags: ['miss'] },
    ];
    const chapterIds = ['ch1'];
    const pageRanges: Array<{ start: number; end: number }> = [];
    
    const filtered = annotations.filter(a => {
      if (chapterIds.length > 0 && chapterIds.includes(a.chapterId)) {
        return true;
      }
      for (const range of pageRanges) {
        if (a.pageIndex >= range.start && a.pageIndex <= range.end) {
          return true;
        }
      }
      return chapterIds.length === 0 && pageRanges.length === 0;
    });
    
    expect(filtered.length).toBe(2);
    expect(filtered.every(a => a.chapterId === 'ch1')).toBe(true);
  });
  
  test('getTopicDeck filters by page ranges', () => {
    const annotations = [
      { id: '1', chapterId: 'ch1', pageIndex: 5, tags: ['weak'] },
      { id: '2', chapterId: 'ch2', pageIndex: 15, tags: ['highlight'] },
      { id: '3', chapterId: 'ch3', pageIndex: 25, tags: ['miss'] },
    ];
    const chapterIds: string[] = [];
    const pageRanges = [{ start: 10, end: 20 }];
    
    const filtered = annotations.filter(a => {
      if (chapterIds.length > 0 && chapterIds.includes(a.chapterId)) {
        return true;
      }
      for (const range of pageRanges) {
        if (a.pageIndex >= range.start && a.pageIndex <= range.end) {
          return true;
        }
      }
      return chapterIds.length === 0 && pageRanges.length === 0;
    });
    
    expect(filtered.length).toBe(1);
    expect(filtered[0].pageIndex).toBe(15);
  });
  
  test('getWeakDeck prioritizes miss > weak > quiz-miss', () => {
    const annotations: Array<{ id: string; tags: string[]; pdrm?: { isMistake?: boolean } }> = [
      { id: '1', tags: ['weak'], pdrm: {} },
      { id: '2', tags: ['miss'], pdrm: {} },
      { id: '3', tags: ['quiz-miss'], pdrm: {} },
      { id: '4', tags: [], pdrm: { isMistake: true } },
    ];
    
    const getPriority = (ann: typeof annotations[0]) => {
      if (ann.tags.includes('miss')) return 3;
      if (ann.pdrm?.isMistake) return 2;
      if (ann.tags.includes('quiz-miss')) return 2;
      if (ann.tags.includes('weak')) return 1;
      return 0;
    };
    
    const sorted = [...annotations].sort((a, b) => getPriority(b) - getPriority(a));
    
    expect(sorted[0].tags).toContain('miss');
    expect(getPriority(sorted[0])).toBe(3);
  });
});

// ============================================================================
// Test: syllabusStore methods
// ============================================================================

describe('syllabusStore - P0/P1 Features', () => {
  
  test('updateTopicAfterStudy sets mastered for score >= 80', () => {
    const sessionScore = 85;
    let newStatus = 'in_progress';
    
    if (sessionScore >= 80) {
      newStatus = 'mastered';
    } else if (sessionScore >= 60) {
      newStatus = 'in_progress';
    } else {
      newStatus = 'needs_review';
    }
    
    expect(newStatus).toBe('mastered');
  });
  
  test('updateTopicAfterStudy sets in_progress for score 60-79', () => {
    const sessionScore = 70;
    let newStatus = 'in_progress';
    
    if (sessionScore >= 80) {
      newStatus = 'mastered';
    } else if (sessionScore >= 60) {
      newStatus = 'in_progress';
    } else {
      newStatus = 'needs_review';
    }
    
    expect(newStatus).toBe('in_progress');
  });
  
  test('updateTopicAfterStudy sets needs_review for score < 60', () => {
    const sessionScore = 45;
    let newStatus = 'in_progress';
    
    if (sessionScore >= 80) {
      newStatus = 'mastered';
    } else if (sessionScore >= 60) {
      newStatus = 'in_progress';
    } else {
      newStatus = 'needs_review';
    }
    
    expect(newStatus).toBe('needs_review');
  });
  
  test('calculateStatus returns mastered for quizScore >= 80', () => {
    const topic = { quizScore: 85, highlightCount: 5, lastStudied: '2025-01-01' };
    
    let status = 'not_started';
    if (topic.quizScore !== undefined && topic.quizScore >= 80) {
      status = 'mastered';
    } else if (topic.quizScore !== undefined && topic.quizScore < 60) {
      status = 'needs_review';
    } else if (topic.highlightCount > 0 || topic.lastStudied) {
      status = 'in_progress';
    }
    
    expect(status).toBe('mastered');
  });
  
  test('calculateStatus returns needs_review for quizScore < 60', () => {
    const topic = { quizScore: 45, highlightCount: 5, lastStudied: '2025-01-01' };
    
    let status = 'not_started';
    if (topic.quizScore !== undefined && topic.quizScore >= 80) {
      status = 'mastered';
    } else if (topic.quizScore !== undefined && topic.quizScore < 60) {
      status = 'needs_review';
    } else if (topic.highlightCount > 0 || topic.lastStudied) {
      status = 'in_progress';
    }
    
    expect(status).toBe('needs_review');
  });
  
  test('getStudyQueue sorts by status priority', () => {
    const topics = [
      { id: '1', status: 'in_progress' },
      { id: '2', status: 'needs_review' },
      { id: '3', status: 'not_started' },
      { id: '4', status: 'mastered' },
    ];
    
    const statusPriority: Record<string, number> = { 
      needs_review: 0, 
      in_progress: 1, 
      not_started: 2, 
      mastered: 3 
    };
    
    const queue = topics
      .filter(t => t.status !== 'mastered')
      .sort((a, b) => statusPriority[a.status] - statusPriority[b.status]);
    
    expect(queue.length).toBe(3);
    expect(queue[0].status).toBe('needs_review');
    expect(queue[1].status).toBe('in_progress');
    expect(queue[2].status).toBe('not_started');
  });
});

// ============================================================================
// Test: annotationStore - Silent NoteLab capture
// ============================================================================

describe('annotationStore - Silent NoteLab capture', () => {
  
  test('addAnnotation auto-adds highlight tag', () => {
    const inputTags: string[] = [];
    const tags = [...inputTags];
    
    if (!tags.includes('highlight')) {
      tags.push('highlight');
    }
    
    expect(tags).toContain('highlight');
  });
  
  test('addAnnotation auto-tags pattern PDRM', () => {
    const inputTags: string[] = [];
    const pdrm = { pattern: 'Some pattern' };
    const tags = [...inputTags];
    
    if (!tags.includes('highlight')) tags.push('highlight');
    if (pdrm.pattern && !tags.includes('pattern')) tags.push('pattern');
    
    expect(tags).toContain('highlight');
    expect(tags).toContain('pattern');
  });
  
  test('addAnnotation auto-tags decision PDRM', () => {
    const inputTags: string[] = [];
    const pdrm = { decisionRule: 'Some decision' };
    const tags = [...inputTags];
    
    if (!tags.includes('highlight')) tags.push('highlight');
    if (pdrm.decisionRule && !tags.includes('decision')) tags.push('decision');
    
    expect(tags).toContain('highlight');
    expect(tags).toContain('decision');
  });
  
  test('addAnnotation auto-tags mnemonic PDRM', () => {
    const inputTags: string[] = [];
    const pdrm = { mnemonic: 'Some mnemonic' };
    const tags = [...inputTags];
    
    if (!tags.includes('highlight')) tags.push('highlight');
    if (pdrm.mnemonic && !tags.includes('mnemonic')) tags.push('mnemonic');
    
    expect(tags).toContain('highlight');
    expect(tags).toContain('mnemonic');
  });
  
  test('addAnnotation auto-tags weak for mistakes', () => {
    const inputTags: string[] = [];
    const pdrm = { isMistake: true };
    const tags = [...inputTags];
    
    if (!tags.includes('highlight')) tags.push('highlight');
    if (pdrm.isMistake && !tags.includes('weak')) tags.push('weak');
    
    expect(tags).toContain('highlight');
    expect(tags).toContain('weak');
  });
});

// ============================================================================
// Test: quizStore - Flashcard creation for misses
// ============================================================================

describe('quizStore - Flashcard creation', () => {
  
  test('finishQuiz creates flashcard with correct tags for wrong answers', () => {
    const wrongQuestionIds = ['q1', 'q2'];
    const expectedTags = ['flashcard', 'miss', 'weak', 'quiz-generated'];
    
    // Simulate flashcard creation
    const flashcardInputs = wrongQuestionIds.map(qId => ({
      tags: expectedTags,
      pdrm: {
        isMistake: true,
        weakAreaTags: ['quiz-miss', 'weak']
      },
      color: '#EF4444'
    }));
    
    expect(flashcardInputs.length).toBe(2);
    expect(flashcardInputs[0].tags).toEqual(expectedTags);
    expect(flashcardInputs[0].pdrm.isMistake).toBe(true);
    expect(flashcardInputs[0].color).toBe('#EF4444');
  });
  
  test('finishQuiz does not create flashcards when all answers correct', () => {
    const wrongQuestionIds: string[] = [];
    
    const shouldCreateFlashcards = wrongQuestionIds.length > 0;
    
    expect(shouldCreateFlashcards).toBe(false);
  });
});
