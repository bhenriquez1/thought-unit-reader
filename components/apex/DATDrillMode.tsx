// components/apex/DATDrillMode.tsx
// DAT Drill Mode - Micro-quiz for top insights

import React, { useState, useCallback, useMemo } from 'react';
import type { RankedInsight } from '@/lib/relationshipSchema/types';
import { useNoteLabStore } from '@/lib/cognitiveEngine/noteLabStore';

// ============================================================================
// Types
// ============================================================================

interface DATDrillModeProps {
  insights: RankedInsight[];
  onClose: () => void;
  onComplete?: (results: DrillResults) => void;
}

interface DrillQuestion {
  id: string;
  insightId: string;
  question: string;
  correctAnswer: string;
  decoyAnswers: string[];
  explanation: string;
  patternName?: string;
}

interface DrillResults {
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  missedInsightIds: string[];
  accuracy: number;
}

// ============================================================================
// Question Generation
// ============================================================================

function generateQuestionFromInsight(insight: RankedInsight): DrillQuestion {
  // Parse the claim to create a question
  const claim = insight.claim;

  // Generate question based on insight type
  let question: string;
  let correctAnswer: string;
  let decoyAnswers: string[] = [];

  // Extract subject and object from claim if it contains an arrow
  const arrowMatch = claim.match(/(.+?)\s+(?:→|causes|produces|triggers|suggests|indicates)\s+(.+)/i);

  if (arrowMatch) {
    const [, subject, object] = arrowMatch;
    question = `What does ${subject.trim()} lead to/cause?`;
    correctAnswer = object.trim();

    // Generate decoys based on common confusion patterns
    decoyAnswers = [
      `Inhibition of ${subject.trim()}`,
      `The opposite effect`,
      `No direct relationship`,
    ];
  } else if (insight.type === 'DECISION_RULE') {
    // For decision rules, ask about the action
    question = `Given the condition described, what should you do?`;
    correctAnswer = claim.replace(/^IF\s+.+?\s+THEN\s+/i, '').trim();
    decoyAnswers = [
      'Wait and observe',
      'Order additional tests first',
      'Refer to specialist',
    ];
  } else {
    // Generic question format
    question = `What is the key point about: "${insight.title}"?`;
    correctAnswer = insight.whyItMatters;
    decoyAnswers = [
      'This is rarely tested',
      'There is no clinical significance',
      'Further research is needed',
    ];
  }

  return {
    id: `drill_${insight.id}_${Date.now()}`,
    insightId: insight.id,
    question,
    correctAnswer,
    decoyAnswers,
    explanation: insight.whyItMatters,
    patternName: insight.apexBadge?.patternName,
  };
}

// ============================================================================
// Component
// ============================================================================

export const DATDrillMode: React.FC<DATDrillModeProps> = ({
  insights,
  onClose,
  onComplete,
}) => {
  // Get top 10 insights for drilling
  const drillInsights = useMemo(() => {
    return insights
      .filter(i => i.bucket === 'CRITICAL' || i.bucket === 'HIGH_YIELD')
      .slice(0, 10);
  }, [insights]);

  const questions = useMemo(() => {
    return drillInsights.map(generateQuestionFromInsight);
  }, [drillInsights]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [results, setResults] = useState<{
    correct: string[];
    incorrect: string[];
  }>({ correct: [], incorrect: [] });

  const { importFromInsight, markConfusing } = useNoteLabStore();

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const isComplete = currentIndex >= questions.length;

  // Shuffle answers
  const shuffledAnswers = useMemo(() => {
    if (!currentQuestion) return [];
    const allAnswers = [currentQuestion.correctAnswer, ...currentQuestion.decoyAnswers];
    return allAnswers.sort(() => Math.random() - 0.5);
  }, [currentQuestion]);

  const handleSelectAnswer = useCallback((answer: string) => {
    if (showResult) return;
    setSelectedAnswer(answer);
  }, [showResult]);

  const handleSubmit = useCallback(() => {
    if (!selectedAnswer || !currentQuestion) return;

    const isCorrect = selectedAnswer === currentQuestion.correctAnswer;

    setResults(prev => ({
      correct: isCorrect ? [...prev.correct, currentQuestion.insightId] : prev.correct,
      incorrect: !isCorrect ? [...prev.incorrect, currentQuestion.insightId] : prev.incorrect,
    }));

    setShowResult(true);
  }, [selectedAnswer, currentQuestion]);

  const handleNext = useCallback(() => {
    setSelectedAnswer(null);
    setShowResult(false);
    setCurrentIndex(prev => prev + 1);
  }, []);

  const handleSaveMissed = useCallback(() => {
    if (!currentQuestion) return;

    const insight = drillInsights.find(i => i.id === currentQuestion.insightId);
    if (!insight) return;

    const noteId = importFromInsight({
      id: insight.id,
      title: `MISSED: ${insight.title}`,
      claim: insight.claim,
      whyItMatters: `I missed this in drill mode. ${insight.whyItMatters}`,
      bucket: insight.bucket,
      sourceId: insight.sourceId,
      sourceType: insight.sourceType,
      evidence: insight.evidence,
      tags: [...insight.tags, 'drill-miss'],
    });
    markConfusing(noteId);
  }, [currentQuestion, drillInsights, importFromInsight, markConfusing]);

  const handleComplete = useCallback(() => {
    const finalResults: DrillResults = {
      totalQuestions: questions.length,
      correctCount: results.correct.length,
      incorrectCount: results.incorrect.length,
      missedInsightIds: results.incorrect,
      accuracy: questions.length > 0
        ? (results.correct.length / questions.length) * 100
        : 0,
    };
    onComplete?.(finalResults);
    onClose();
  }, [questions.length, results, onComplete, onClose]);

  // Empty state
  if (questions.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-8 max-w-md text-center">
          <span className="text-5xl block mb-4">🎮</span>
          <h2 className="text-xl font-bold text-white mb-2">No Questions Available</h2>
          <p className="text-gray-400 mb-4">
            Extract more insights to enable DAT Drill Mode.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Completion screen
  if (isComplete) {
    const accuracy = (results.correct.length / questions.length) * 100;

    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-8 max-w-md">
          {/* Header */}
          <div className="text-center mb-6">
            <span className="text-5xl block mb-4">
              {accuracy >= 80 ? '🎉' : accuracy >= 60 ? '👍' : '📚'}
            </span>
            <h2 className="text-2xl font-bold text-white mb-2">Drill Complete!</h2>
            <p className="text-gray-400">
              Here&apos;s how you did on DAT patterns
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-3 bg-green-900/30 rounded">
              <div className="text-2xl font-bold text-green-400">{results.correct.length}</div>
              <div className="text-xs text-green-300">Correct</div>
            </div>
            <div className="text-center p-3 bg-red-900/30 rounded">
              <div className="text-2xl font-bold text-red-400">{results.incorrect.length}</div>
              <div className="text-xs text-red-300">Missed</div>
            </div>
            <div className="text-center p-3 bg-purple-900/30 rounded">
              <div className="text-2xl font-bold text-purple-400">{Math.round(accuracy)}%</div>
              <div className="text-xs text-purple-300">Accuracy</div>
            </div>
          </div>

          {/* Feedback */}
          {results.incorrect.length > 0 && (
            <div className="mb-6 p-4 bg-amber-900/30 border border-amber-600/50 rounded">
              <p className="text-sm text-amber-200">
                Missed questions have been saved to NoteLab for review.
                Focus on these patterns before your exam.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleComplete}
              className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded font-medium"
            >
              Done
            </button>
            <button
              onClick={() => {
                setCurrentIndex(0);
                setResults({ correct: [], incorrect: [] });
                setSelectedAnswer(null);
                setShowResult(false);
              }}
              className="px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Question screen
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎮</span>
            <div>
              <h2 className="font-semibold text-white">DAT Drill Mode</h2>
              <p className="text-xs text-gray-400">
                Question {currentIndex + 1} of {questions.length}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded"
          >
            ✕
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-700">
          <div
            className="h-full bg-purple-500 transition-all"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>

        {/* Question */}
        <div className="p-6">
          {currentQuestion.patternName && (
            <div className="mb-4 px-2 py-1 bg-purple-900/50 rounded inline-block">
              <span className="text-xs text-purple-300">
                🎯 {currentQuestion.patternName}
              </span>
            </div>
          )}

          <h3 className="text-lg font-medium text-white mb-6">
            {currentQuestion.question}
          </h3>

          {/* Answer choices */}
          <div className="space-y-3">
            {shuffledAnswers.map((answer, idx) => {
              const isSelected = selectedAnswer === answer;
              const isCorrect = answer === currentQuestion.correctAnswer;
              const showCorrectness = showResult && (isSelected || isCorrect);

              return (
                <button
                  key={idx}
                  onClick={() => handleSelectAnswer(answer)}
                  disabled={showResult}
                  className={`
                    w-full p-4 text-left rounded-lg border transition-all
                    ${showCorrectness && isCorrect
                      ? 'bg-green-900/50 border-green-500 text-green-100'
                      : showCorrectness && isSelected && !isCorrect
                        ? 'bg-red-900/50 border-red-500 text-red-100'
                        : isSelected
                          ? 'bg-purple-900/50 border-purple-500 text-white'
                          : 'bg-gray-700/50 border-gray-600 text-gray-200 hover:border-gray-500'
                    }
                    ${showResult ? 'cursor-default' : 'cursor-pointer'}
                  `}
                >
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 flex items-center justify-center bg-gray-600 rounded text-sm">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="flex-1">{answer}</span>
                    {showCorrectness && isCorrect && <span>✅</span>}
                    {showCorrectness && isSelected && !isCorrect && <span>❌</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Explanation (after submit) */}
          {showResult && (
            <div className="mt-6 p-4 bg-gray-700/50 rounded-lg">
              <h4 className="font-medium text-white mb-2">Explanation</h4>
              <p className="text-sm text-gray-300">{currentQuestion.explanation}</p>

              {/* Save missed option */}
              {selectedAnswer !== currentQuestion.correctAnswer && (
                <button
                  onClick={handleSaveMissed}
                  className="mt-3 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm"
                >
                  💾 Save to NoteLab for Review
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex justify-between">
          <div className="text-sm text-gray-400">
            {results.correct.length} correct • {results.incorrect.length} missed
          </div>

          {!showResult ? (
            <button
              onClick={handleSubmit}
              disabled={!selectedAnswer}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded font-medium"
            >
              Submit
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-medium"
            >
              {isLastQuestion ? 'See Results' : 'Next Question'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DATDrillMode;
