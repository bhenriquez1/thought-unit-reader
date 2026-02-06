"use client";

import React, { useState, useCallback, useEffect, useMemo, memo } from 'react';
import type { CoreItemWithLearning, Trigger } from '../lib/core/types';
import { TRIGGER_LABELS } from '../lib/core/types';
import type { RecallAttempt } from '../lib/core/analytics';

// ============================================================================
// Types
// ============================================================================

interface ExamModeProps {
  items: CoreItemWithLearning[];
  onRecallAttempt: (attempt: RecallAttempt) => void;
  onComplete: (results: ExamResults) => void;
  onExit: () => void;
}

interface ExamResults {
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
  averageResponseTime: number;
  byTrigger: Record<Trigger, { correct: number; total: number }>;
  weakItems: string[];
}

interface QuestionState {
  itemId: string;
  question: string;
  answer: string;
  triggers: Trigger[];
  showAnswer: boolean;
  startTime: number;
  response: 'correct' | 'incorrect' | 'skipped' | null;
}

// ============================================================================
// Exam Mode Component
// ============================================================================

export const ExamMode = memo(function ExamMode({
  items,
  onRecallAttempt,
  onComplete,
  onExit,
}: ExamModeProps) {
  // State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [questions, setQuestions] = useState<QuestionState[]>([]);
  const [isRevealed, setIsRevealed] = useState(false);
  const [selfScore, setSelfScore] = useState<'correct' | 'incorrect' | null>(null);
  const [examStartTime] = useState(Date.now());

  // Generate questions from items
  useEffect(() => {
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    const generated = shuffled.map((item) => ({
      itemId: item.id,
      question: item.flashcard?.front || `What is: ${item.core_sentence.slice(0, 50)}...?`,
      answer: item.flashcard?.back || item.core_sentence,
      triggers: item.triggers,
      showAnswer: false,
      startTime: 0,
      response: null as QuestionState['response'],
    }));
    setQuestions(generated);
  }, [items]);

  // Current question
  const currentQuestion = questions[currentIndex];
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  // Start timer when question changes
  useEffect(() => {
    if (currentQuestion && !currentQuestion.startTime) {
      setQuestions((prev) =>
        prev.map((q, i) =>
          i === currentIndex ? { ...q, startTime: Date.now() } : q
        )
      );
    }
  }, [currentIndex, currentQuestion]);

  // Reveal answer
  const handleReveal = useCallback(() => {
    setIsRevealed(true);
  }, []);

  // Score response
  const handleScore = useCallback(
    (correct: boolean) => {
      if (!currentQuestion) return;

      const responseTime = Date.now() - currentQuestion.startTime;
      const response = correct ? 'correct' : 'incorrect';

      // Update question state
      setQuestions((prev) =>
        prev.map((q, i) => (i === currentIndex ? { ...q, response, showAnswer: true } : q))
      );

      // Find the item to get confidence values
      const item = items.find((i) => i.id === currentQuestion.itemId);
      if (item) {
        // Record attempt
        onRecallAttempt({
          itemId: currentQuestion.itemId,
          timestamp: Date.now(),
          correct,
          responseTimeMs: responseTime,
          confidenceBefore: item.learning.combinedConfidence,
          confidenceAfter: correct
            ? Math.min(1, item.learning.combinedConfidence + 0.1)
            : Math.max(0, item.learning.combinedConfidence - 0.15),
        });
      }

      setSelfScore(response);
    },
    [currentIndex, currentQuestion, items, onRecallAttempt]
  );

  // Next question
  const handleNext = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setIsRevealed(false);
      setSelfScore(null);
    } else {
      // Exam complete
      const results = calculateResults(questions, items);
      onComplete(results);
    }
  }, [currentIndex, questions, items, onComplete]);

  // Skip question
  const handleSkip = useCallback(() => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === currentIndex ? { ...q, response: 'skipped' } : q))
    );
    handleNext();
  }, [currentIndex, handleNext]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!currentQuestion) return;

      switch (e.key) {
        case ' ':
        case 'Enter':
          if (!isRevealed) {
            handleReveal();
          } else if (selfScore) {
            handleNext();
          }
          break;
        case '1':
          if (isRevealed && !selfScore) handleScore(false);
          break;
        case '2':
          if (isRevealed && !selfScore) handleScore(true);
          break;
        case 's':
          if (!selfScore) handleSkip();
          break;
        case 'Escape':
          onExit();
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentQuestion, isRevealed, selfScore, handleReveal, handleNext, handleScore, handleSkip, onExit]);

  // Results calculation
  const currentStats = useMemo(() => {
    const answered = questions.filter((q) => q.response !== null);
    const correct = answered.filter((q) => q.response === 'correct').length;
    return {
      answered: answered.length,
      correct,
      percentage: answered.length > 0 ? Math.round((correct / answered.length) * 100) : 0,
    };
  }, [questions]);

  if (!currentQuestion) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-900 text-white">
        <div className="animate-pulse text-4xl mb-4">📝</div>
        <p className="text-gray-400">Loading exam questions...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">📝</span>
            <h2 className="font-semibold">Exam Mode</h2>
          </div>
          <button
            onClick={onExit}
            className="px-3 py-1 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Exit (Esc)
          </button>
        </div>

        {/* Progress Bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-gray-400">
            {currentIndex + 1} / {questions.length}
          </span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
          <span>✓ {currentStats.correct} correct</span>
          <span>📊 {currentStats.percentage}%</span>
        </div>
      </div>

      {/* Question Card */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {/* Trigger Badges */}
        <div className="flex gap-1 mb-4">
          {currentQuestion.triggers.map((t, i) => (
            <span
              key={i}
              className="px-2 py-0.5 text-xs bg-purple-600/30 text-purple-300 rounded"
            >
              {t}: {TRIGGER_LABELS[t]}
            </span>
          ))}
        </div>

        {/* Question */}
        <div className="w-full max-w-2xl mb-6">
          <div className="p-6 bg-gray-800 rounded-xl border border-gray-700">
            <p className="text-lg text-center leading-relaxed">
              {currentQuestion.question}
            </p>
          </div>
        </div>

        {/* Answer (revealed) */}
        {isRevealed && (
          <div className="w-full max-w-2xl mb-6 animate-fadeIn">
            <div className="p-6 bg-green-900/20 rounded-xl border border-green-600/30">
              <p className="text-sm text-green-400 mb-2">Answer:</p>
              <p className="text-base leading-relaxed">{currentQuestion.answer}</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col items-center gap-4">
          {!isRevealed ? (
            <>
              <button
                onClick={handleReveal}
                className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
              >
                Show Answer (Space)
              </button>
              <button
                onClick={handleSkip}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Skip (S)
              </button>
            </>
          ) : !selfScore ? (
            <div className="flex gap-4">
              <button
                onClick={() => handleScore(false)}
                className="flex items-center gap-2 px-6 py-3 bg-red-600/80 hover:bg-red-500 text-white font-medium rounded-lg transition-colors"
              >
                <span>✗</span>
                <span>Incorrect (1)</span>
              </button>
              <button
                onClick={() => handleScore(true)}
                className="flex items-center gap-2 px-6 py-3 bg-green-600/80 hover:bg-green-500 text-white font-medium rounded-lg transition-colors"
              >
                <span>✓</span>
                <span>Correct (2)</span>
              </button>
            </div>
          ) : (
            <button
              onClick={handleNext}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
            >
              {currentIndex < questions.length - 1 ? 'Next Question (Enter)' : 'See Results'}
            </button>
          )}
        </div>
      </div>

      {/* Keyboard Hints */}
      <div className="px-4 py-2 border-t border-gray-700/30 text-xs text-gray-500 text-center">
        Space/Enter: Reveal/Next · 1: Incorrect · 2: Correct · S: Skip · Esc: Exit
      </div>
    </div>
  );
});

// ============================================================================
// Results Calculation
// ============================================================================

function calculateResults(
  questions: QuestionState[],
  items: CoreItemWithLearning[]
): ExamResults {
  const answered = questions.filter((q) => q.response !== null);
  const correct = answered.filter((q) => q.response === 'correct');
  const incorrect = answered.filter((q) => q.response === 'incorrect');
  const skipped = answered.filter((q) => q.response === 'skipped');

  // Calculate average response time
  const responseTimes = answered
    .filter((q) => q.response !== 'skipped')
    .map((q) => Date.now() - q.startTime);
  const averageResponseTime =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

  // Calculate by trigger
  const byTrigger: Record<Trigger, { correct: number; total: number }> = {
    A: { correct: 0, total: 0 },
    B: { correct: 0, total: 0 },
    C: { correct: 0, total: 0 },
    D: { correct: 0, total: 0 },
    E: { correct: 0, total: 0 },
    F: { correct: 0, total: 0 },
    G: { correct: 0, total: 0 },
    H: { correct: 0, total: 0 },
  };

  for (const q of answered) {
    for (const trigger of q.triggers) {
      byTrigger[trigger].total++;
      if (q.response === 'correct') {
        byTrigger[trigger].correct++;
      }
    }
  }

  // Identify weak items
  const weakItems = incorrect.map((q) => q.itemId);

  return {
    totalQuestions: questions.length,
    correctCount: correct.length,
    incorrectCount: incorrect.length,
    skippedCount: skipped.length,
    averageResponseTime,
    byTrigger,
    weakItems,
  };
}

// ============================================================================
// Exam Results Component
// ============================================================================

interface ExamResultsProps {
  results: ExamResults;
  onRetry: () => void;
  onReviewWeak: () => void;
  onClose: () => void;
}

export const ExamResultsPanel = memo(function ExamResultsPanel({
  results,
  onRetry,
  onReviewWeak,
  onClose,
}: ExamResultsProps) {
  const percentage = Math.round(
    (results.correctCount / (results.totalQuestions - results.skippedCount)) * 100
  );
  const passed = percentage >= 70;

  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-900 text-white p-6">
      {/* Score */}
      <div
        className={`text-6xl font-bold mb-2 ${
          passed ? 'text-green-400' : 'text-red-400'
        }`}
      >
        {percentage}%
      </div>
      <p className={`text-lg mb-6 ${passed ? 'text-green-300' : 'text-red-300'}`}>
        {passed ? '🎉 Passed!' : '📚 Keep studying!'}
      </p>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-6 text-center">
        <div className="p-4 bg-gray-800 rounded-lg">
          <div className="text-2xl font-bold text-green-400">{results.correctCount}</div>
          <div className="text-xs text-gray-400">Correct</div>
        </div>
        <div className="p-4 bg-gray-800 rounded-lg">
          <div className="text-2xl font-bold text-red-400">{results.incorrectCount}</div>
          <div className="text-xs text-gray-400">Incorrect</div>
        </div>
        <div className="p-4 bg-gray-800 rounded-lg">
          <div className="text-2xl font-bold text-gray-400">{results.skippedCount}</div>
          <div className="text-xs text-gray-400">Skipped</div>
        </div>
      </div>

      {/* Trigger Breakdown */}
      <div className="w-full max-w-md mb-6">
        <h3 className="text-sm font-medium text-gray-400 mb-2">By Category</h3>
        <div className="space-y-1">
          {Object.entries(results.byTrigger)
            .filter(([_, data]) => data.total > 0)
            .map(([trigger, data]) => (
              <div key={trigger} className="flex items-center gap-2">
                <span className="w-8 text-xs text-purple-400">{trigger}</span>
                <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      data.correct / data.total >= 0.7 ? 'bg-green-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${(data.correct / data.total) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400">
                  {data.correct}/{data.total}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        {results.weakItems.length > 0 && (
          <button
            onClick={onReviewWeak}
            className="px-6 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg transition-colors"
          >
            Review Weak Items ({results.weakItems.length})
          </button>
        )}
        <button
          onClick={onRetry}
          className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
        >
          Retry Exam
        </button>
        <button
          onClick={onClose}
          className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
});

export default ExamMode;
