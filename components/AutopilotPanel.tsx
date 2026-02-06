"use client";

import React, { useState, useCallback, useMemo, memo, useEffect } from 'react';
import type { CoreItemWithLearning, Trigger } from '../lib/core/types';
import { TRIGGER_LABELS } from '../lib/core/types';
import type { RecallAttempt } from '../lib/core/analytics';
import {
  generateDailyQueue,
  startSession,
  getCurrentItem,
  recordResult,
  getProgress,
  getSessionStats,
  getTodaySummary,
  type AutopilotSession,
  type SessionPhase,
  type DailyQueue,
  type AutopilotConfig,
} from '../lib/core/autopilot';

// ============================================================================
// Types
// ============================================================================

interface AutopilotPanelProps {
  items: CoreItemWithLearning[];
  recallHistory?: RecallAttempt[];
  config?: Partial<AutopilotConfig>;
  onItemReview?: (itemId: string, grade: 'again' | 'hard' | 'good' | 'easy') => void;
  onComplete?: (session: AutopilotSession) => void;
}

// ============================================================================
// Phase Badge Component
// ============================================================================

const PhaseBadge = memo(function PhaseBadge({ phase }: { phase: SessionPhase }) {
  const phaseConfig: Record<SessionPhase, { label: string; color: string; icon: string }> = {
    warmup: { label: 'Warm-up', color: 'bg-green-600/30 text-green-300', icon: '🔥' },
    'debt-attack': { label: 'Debt Attack', color: 'bg-red-600/30 text-red-300', icon: '⚔️' },
    exam: { label: 'Exam Mode', color: 'bg-purple-600/30 text-purple-300', icon: '📝' },
    'fix-loop': { label: 'Fix Loop', color: 'bg-orange-600/30 text-orange-300', icon: '🔄' },
    complete: { label: 'Complete', color: 'bg-blue-600/30 text-blue-300', icon: '✅' },
  };

  const config = phaseConfig[phase];

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded ${config.color}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
});

// ============================================================================
// Today Summary Component
// ============================================================================

interface TodaySummaryProps {
  items: CoreItemWithLearning[];
  recallHistory: RecallAttempt[];
  config?: Partial<AutopilotConfig>;
  onStart: (queue: DailyQueue) => void;
}

const TodaySummary = memo(function TodaySummary({
  items,
  recallHistory,
  config,
  onStart,
}: TodaySummaryProps) {
  const summary = useMemo(
    () => getTodaySummary(items, recallHistory, config),
    [items, recallHistory, config]
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-4xl mb-3">📚</div>
        <p className="text-sm text-gray-400">No items to study yet.</p>
        <p className="text-xs text-gray-500 mt-1">
          Extract concepts with ⚡ Core to build your study queue.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-white mb-1">What to Study Today</h3>
        <p className="text-sm text-purple-300">{summary.recommendation}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 bg-gray-800/50 rounded-lg text-center">
          <div className="text-2xl font-bold text-white">{summary.queue.stats.totalItems}</div>
          <div className="text-xs text-gray-400">Items</div>
        </div>
        <div className="p-3 bg-gray-800/50 rounded-lg text-center">
          <div className="text-2xl font-bold text-white">{summary.estimatedMinutes}</div>
          <div className="text-xs text-gray-400">Minutes</div>
        </div>
        <div className="p-3 bg-gray-800/50 rounded-lg text-center">
          <div className="text-2xl font-bold text-red-400">{summary.urgentCount}</div>
          <div className="text-xs text-gray-400">Urgent</div>
        </div>
      </div>

      {/* Focus Areas */}
      {summary.focusAreas.length > 0 && (
        <div className="p-3 bg-gray-800/30 rounded-lg">
          <p className="text-xs text-gray-400 mb-2">Focus Areas</p>
          <div className="flex flex-wrap gap-2">
            {summary.focusAreas.map((trigger) => (
              <span
                key={trigger}
                className="px-2 py-1 text-xs bg-purple-600/30 text-purple-300 rounded"
              >
                {trigger}: {TRIGGER_LABELS[trigger]}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Phase Preview */}
      <div className="space-y-2">
        <p className="text-xs text-gray-400">Session Structure</p>
        <div className="flex items-center gap-2">
          <PhaseBadge phase="warmup" />
          <span className="text-gray-600">→</span>
          <PhaseBadge phase="debt-attack" />
          <span className="text-gray-600">→</span>
          <PhaseBadge phase="exam" />
          <span className="text-gray-600">→</span>
          <PhaseBadge phase="fix-loop" />
        </div>
      </div>

      {/* Start Button */}
      <button
        onClick={() => onStart(summary.queue)}
        className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
      >
        Start Session ({summary.queue.stats.totalItems} items)
      </button>
    </div>
  );
});

// ============================================================================
// Review Card Component
// ============================================================================

interface ReviewCardProps {
  session: AutopilotSession;
  onGrade: (grade: 'again' | 'hard' | 'good' | 'easy') => void;
}

const ReviewCard = memo(function ReviewCard({ session, onGrade }: ReviewCardProps) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [startTime] = useState(Date.now());

  const currentItem = getCurrentItem(session);
  const progress = getProgress(session);

  // Reset show answer when item changes
  useEffect(() => {
    setShowAnswer(false);
  }, [session.currentIndex]);

  if (!currentItem) {
    return null;
  }

  const item = currentItem.item;

  return (
    <div className="flex flex-col h-full">
      {/* Progress Header */}
      <div className="px-4 py-3 border-b border-gray-700/50">
        <div className="flex items-center justify-between mb-2">
          <PhaseBadge phase={currentItem.phase} />
          <span className="text-xs text-gray-400">
            {progress.completed + 1} / {progress.total}
          </span>
        </div>
        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500 transition-all"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1">{currentItem.reason}</p>
      </div>

      {/* Card Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {/* Triggers */}
        <div className="flex gap-1 mb-4">
          {item.triggers.map((t, i) => (
            <span
              key={i}
              className="px-2 py-0.5 text-xs bg-purple-600/30 text-purple-300 rounded"
            >
              {t}
            </span>
          ))}
        </div>

        {/* Question */}
        <div className="w-full max-w-md mb-4">
          <div className="p-6 bg-gray-800 rounded-xl border border-gray-700">
            <p className="text-center leading-relaxed">
              {item.flashcard?.front || item.core_sentence}
            </p>
          </div>
        </div>

        {/* Answer */}
        {showAnswer ? (
          <div className="w-full max-w-md mb-4 animate-fadeIn">
            <div className="p-6 bg-green-900/20 rounded-xl border border-green-600/30">
              <p className="text-sm text-green-400 mb-2">Answer:</p>
              <p className="leading-relaxed">
                {item.flashcard?.back || item.core_sentence}
              </p>
              {item.exceptions.length > 0 && (
                <div className="mt-3 pt-3 border-t border-green-600/20">
                  <p className="text-xs text-orange-400 mb-1">Exceptions:</p>
                  {item.exceptions.map((exc, i) => (
                    <p key={i} className="text-xs text-orange-300">{exc.sentence}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAnswer(true)}
            className="w-full max-w-md py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Show Answer
          </button>
        )}

        {/* Grade Buttons */}
        {showAnswer && (
          <div className="w-full max-w-md grid grid-cols-4 gap-2">
            <button
              onClick={() => onGrade('again')}
              className="py-3 bg-red-600/80 hover:bg-red-500 text-white text-sm rounded-lg transition-colors"
            >
              Again
            </button>
            <button
              onClick={() => onGrade('hard')}
              className="py-3 bg-orange-600/80 hover:bg-orange-500 text-white text-sm rounded-lg transition-colors"
            >
              Hard
            </button>
            <button
              onClick={() => onGrade('good')}
              className="py-3 bg-green-600/80 hover:bg-green-500 text-white text-sm rounded-lg transition-colors"
            >
              Good
            </button>
            <button
              onClick={() => onGrade('easy')}
              className="py-3 bg-blue-600/80 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
            >
              Easy
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

// ============================================================================
// Session Complete Component
// ============================================================================

interface SessionCompleteProps {
  session: AutopilotSession;
  onRestart: () => void;
  onClose: () => void;
}

const SessionComplete = memo(function SessionComplete({
  session,
  onRestart,
  onClose,
}: SessionCompleteProps) {
  const stats = getSessionStats(session);

  return (
    <div className="flex flex-col items-center justify-center h-full p-6">
      <div className="text-5xl mb-4">🎉</div>
      <h3 className="text-xl font-bold text-white mb-2">Session Complete!</h3>

      {/* Stats */}
      <div className="w-full max-w-sm space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-gray-800/50 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-400">{stats.accuracy}%</div>
            <div className="text-xs text-gray-400">Accuracy</div>
          </div>
          <div className="p-3 bg-gray-800/50 rounded-lg text-center">
            <div className="text-2xl font-bold text-white">
              {Math.round(stats.totalTime / 60000)}m
            </div>
            <div className="text-xs text-gray-400">Time</div>
          </div>
        </div>

        {/* Grade Breakdown */}
        <div className="p-3 bg-gray-800/30 rounded-lg">
          <p className="text-xs text-gray-400 mb-2">Response Breakdown</p>
          <div className="flex justify-between text-sm">
            <span className="text-red-400">Again: {stats.byGrade.again}</span>
            <span className="text-orange-400">Hard: {stats.byGrade.hard}</span>
            <span className="text-green-400">Good: {stats.byGrade.good}</span>
            <span className="text-blue-400">Easy: {stats.byGrade.easy}</span>
          </div>
        </div>

        {/* Phase Breakdown */}
        <div className="p-3 bg-gray-800/30 rounded-lg space-y-2">
          <p className="text-xs text-gray-400">By Phase</p>
          {(['warmup', 'debt-attack', 'exam', 'fix-loop'] as SessionPhase[]).map((phase) => {
            const phaseStats = stats.byPhase[phase];
            if (phaseStats.total === 0) return null;
            return (
              <div key={phase} className="flex items-center justify-between text-xs">
                <PhaseBadge phase={phase} />
                <span className="text-gray-300">
                  {phaseStats.correct}/{phaseStats.total} correct
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-6">
        <button
          onClick={onRestart}
          className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
        >
          New Session
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

// ============================================================================
// Main Autopilot Panel
// ============================================================================

export const AutopilotPanel = memo(function AutopilotPanel({
  items,
  recallHistory = [],
  config,
  onItemReview,
  onComplete,
}: AutopilotPanelProps) {
  const [session, setSession] = useState<AutopilotSession | null>(null);
  const [reviewStartTime, setReviewStartTime] = useState(Date.now());

  // Start session
  const handleStart = useCallback((queue: DailyQueue) => {
    const newSession = startSession(queue);
    setSession(newSession);
    setReviewStartTime(Date.now());
  }, []);

  // Handle grade
  const handleGrade = useCallback(
    (grade: 'again' | 'hard' | 'good' | 'easy') => {
      if (!session) return;

      const responseTime = Date.now() - reviewStartTime;
      const currentItem = getCurrentItem(session);

      if (currentItem) {
        onItemReview?.(currentItem.item.id, grade);
      }

      const updatedSession = recordResult(session, grade, responseTime);
      setSession(updatedSession);
      setReviewStartTime(Date.now());

      if (updatedSession.completedAt) {
        onComplete?.(updatedSession);
      }
    },
    [session, reviewStartTime, onItemReview, onComplete]
  );

  // Reset
  const handleRestart = useCallback(() => {
    setSession(null);
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🚀</span>
            <h2 className="text-sm font-semibold text-white">Autopilot</h2>
          </div>
          {session && !session.completedAt && (
            <button
              onClick={handleRestart}
              className="px-2 py-1 text-xs text-gray-400 hover:text-white"
            >
              Exit
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {!session ? (
          <TodaySummary
            items={items}
            recallHistory={recallHistory}
            config={config}
            onStart={handleStart}
          />
        ) : session.completedAt ? (
          <SessionComplete
            session={session}
            onRestart={handleRestart}
            onClose={handleRestart}
          />
        ) : (
          <ReviewCard session={session} onGrade={handleGrade} />
        )}
      </div>
    </div>
  );
});

export default AutopilotPanel;
