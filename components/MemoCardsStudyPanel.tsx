"use client";

/**
 * MemoCardsStudyPanel - Memo.cards-style flashcard study UI
 *
 * Features:
 * - Clean, centered card flip animation
 * - Keyboard shortcuts (Space to reveal, 1-4 for grading)
 * - Touch swipe support for mobile
 * - Spaced repetition grading (Again, Hard, Good, Easy)
 * - Progress tracking with visual deck
 * - Session stats and streaks
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useStudySessionStore, type StudyCard, type CardGrade } from '@/lib/stores/studySessionStore';
import { useAnnotationStore } from '@/lib/stores/annotationStore';
import StudyLauncher, { type StudyMode, type StudyScope } from '@/components/study/StudyLauncher';

interface MemoCardsStudyPanelProps {
  documentId: string;
  documentTitle?: string;
  onNavigateToPage?: (pageIndex: number) => void;
  onClose?: () => void;
}

// Card grade colors and keyboard shortcuts (matches CardGrade type: 'again' | 'hard' | 'good' | 'easy')
const GRADE_CONFIG: Record<CardGrade, { key: string; color: string; bgColor: string; hoverBg: string; label: string; emoji: string; interval: string }> = {
  again: { key: '1', color: 'text-red-400', bgColor: 'bg-red-600', hoverBg: 'hover:bg-red-500', label: 'Again', emoji: '🔄', interval: '<1m' },
  hard: { key: '2', color: 'text-orange-400', bgColor: 'bg-orange-600', hoverBg: 'hover:bg-orange-500', label: 'Hard', emoji: '😓', interval: '~1d' },
  good: { key: '3', color: 'text-blue-400', bgColor: 'bg-blue-600', hoverBg: 'hover:bg-blue-500', label: 'Good', emoji: '👍', interval: '~2d' },
  easy: { key: '4', color: 'text-green-400', bgColor: 'bg-green-600', hoverBg: 'hover:bg-green-500', label: 'Easy', emoji: '✅', interval: '~4d' }
};

export default function MemoCardsStudyPanel({
  documentId,
  documentTitle = 'Document',
  onNavigateToPage,
  onClose
}: MemoCardsStudyPanelProps) {
  const {
    currentSession,
    deck,
    currentCardIndex,
    isRevealed,
    startSession,
    endSession,
    revealCard,
    gradeCard,
    getSessionStats,
    getDueCards,
    startQuickStudy,
    resumeLastSession,
    getWeakItemsCount,
    hasLastSession
  } = useStudySessionStore();

  const { getAllAnnotationsArray } = useAnnotationStore();

  // Local state
  const [isFlipping, setIsFlipping] = useState(false);
  const [showKeyboardHints, setShowKeyboardHints] = useState(true);
  const [streak, setStreak] = useState(0);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Current card
  const currentCard = deck[currentCardIndex];
  const stats = getSessionStats();
  const dueCardsCount = getDueCards(documentId).length;

  // Total cards available
  const totalCardsAvailable = useMemo(() => {
    const annotations = getAllAnnotationsArray().filter(a => a.documentId === documentId);
    return annotations.length;
  }, [getAllAnnotationsArray, documentId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentSession || !currentCard) return;

      // Space or Enter to reveal
      if ((e.code === 'Space' || e.code === 'Enter') && !isRevealed) {
        e.preventDefault();
        handleReveal();
        return;
      }

      // Number keys for grading (only when revealed)
      if (isRevealed) {
        const gradeKeys: Record<string, CardGrade> = {
          '1': 'again',
          '2': 'hard',
          '3': 'good',
          '4': 'easy'
        };

        if (gradeKeys[e.key]) {
          e.preventDefault();
          handleGrade(gradeKeys[e.key]);
        }
      }

      // Escape to end session
      if (e.code === 'Escape') {
        endSession();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSession, currentCard, isRevealed]);

  // Touch swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return;

    const touchEnd = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    const deltaX = touchEnd.x - touchStart.x;
    const deltaY = touchEnd.y - touchStart.y;

    // Only handle horizontal swipes
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (!isRevealed) {
        handleReveal();
      } else {
        // Swipe left = Again, Swipe right = Easy
        handleGrade(deltaX < 0 ? 'again' : 'easy');
      }
    } else if (!isRevealed && Math.abs(deltaY) < 20) {
      // Tap to reveal
      handleReveal();
    }

    setTouchStart(null);
  };

  // Handle card reveal with animation
  const handleReveal = () => {
    setIsFlipping(true);
    setTimeout(() => {
      revealCard();
      setIsFlipping(false);
    }, 150);
  };

  // Handle grading
  const handleGrade = (grade: CardGrade) => {
    if (grade === 'easy') {
      setStreak(s => s + 1);
    } else {
      setStreak(0);
    }
    gradeCard(grade);
  };

  // Handle starting session
  const handleStartSession = () => {
    setStreak(0);
    startSession(documentId);
  };

  // Render start screen
  if (!currentSession) {
    const weakItemsCount = getWeakItemsCount(documentId);
    const canResume = hasLastSession();

    const handleLaunch = (mode: StudyMode, scope: StudyScope) => {
      if (scope === 'weak') {
        startQuickStudy(documentId, 15);
        return;
      }
      if (mode === 'quick_recall') {
        startSession(documentId);
        return;
      }
      if (mode === 'connection_recall' || mode === 'compare_drill') {
        startQuickStudy(documentId, 12);
        return;
      }
      startSession(documentId);
    };

    return (
      <div className="h-full flex flex-col bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white" data-testid="memo-cards-start">
        <div className="flex items-center justify-between p-4 border-b border-gray-700/50">
          <h3 className="text-lg font-semibold">Flashcards</h3>
          {onClose && (
            <button onClick={onClose} className="text-gray-400 hover:text-white p-2">
              ✕
            </button>
          )}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="text-center max-w-sm w-full">
            {/* Card stack visualization */}
            <div className="relative w-48 h-32 mx-auto mb-8">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="absolute inset-0 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl shadow-xl"
                  style={{
                    transform: `translateY(${i * 4}px) rotate(${(i - 1) * 3}deg)`,
                    opacity: 1 - i * 0.2,
                    zIndex: 3 - i
                  }}
                />
              ))}
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <span className="text-5xl">{totalCardsAvailable > 0 ? '📚' : '📭'}</span>
              </div>
            </div>

            <h2 className="text-2xl font-bold mb-2">{documentTitle}</h2>
            <p className="text-gray-400 mb-6">
              {totalCardsAvailable > 0
                ? 'Review your flashcards with spaced repetition'
                : 'No cards yet. Scroll or select text to generate flashcards.'}
            </p>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="p-3 bg-gray-800/50 rounded-xl backdrop-blur">
                <div className="text-2xl font-bold text-purple-400">{totalCardsAvailable}</div>
                <div className="text-xs text-gray-400">Total</div>
              </div>
              <div className="p-3 bg-gray-800/50 rounded-xl backdrop-blur">
                <div className="text-2xl font-bold text-red-400">{weakItemsCount}</div>
                <div className="text-xs text-gray-400">Weak</div>
              </div>
              <div className="p-3 bg-gray-800/50 rounded-xl backdrop-blur">
                <div className="text-2xl font-bold text-blue-400">{dueCardsCount}</div>
                <div className="text-xs text-gray-400">Due</div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
              <StudyLauncher
                scope={{ documentId }}
                availableCounts={{
                  recall: totalCardsAvailable,
                  relation: Math.floor(totalCardsAvailable * 0.5),
                  compare: Math.floor(totalCardsAvailable * 0.3),
                  application: Math.floor(totalCardsAvailable * 0.4),
                  formula: Math.floor(totalCardsAvailable * 0.2),
                }}
                onLaunch={handleLaunch}
              />

              {weakItemsCount > 0 && (
                <button
                  onClick={() => startQuickStudy(documentId, 15)}
                  className="w-full px-6 py-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 rounded-xl font-semibold text-lg transition-all shadow-lg shadow-orange-500/25"
                  data-testid="quick-study-btn"
                >
                  ⚡ Quick Study ({Math.min(weakItemsCount, 15)} weak)
                </button>
              )}

              {canResume && (
                <button
                  onClick={resumeLastSession}
                  className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl font-medium transition-colors"
                >
                  ⏯️ Resume Session
                </button>
              )}

              <button
                onClick={handleStartSession}
                disabled={totalCardsAvailable === 0}
                className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed rounded-xl font-semibold text-lg transition-all shadow-lg shadow-purple-500/25"
                data-testid="start-session-btn"
              >
                {totalCardsAvailable === 0 ? 'No Cards Yet' : '▶ Start Session'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render complete screen
  if (!currentCard || currentCardIndex >= deck.length) {
    const accuracy = stats.reviewed > 0 ? Math.round((stats.correct / stats.reviewed) * 100) : 0;

    return (
      <div className="h-full flex flex-col bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white" data-testid="memo-cards-complete">
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="text-7xl mb-6">
              {accuracy >= 80 ? '🎉' : accuracy >= 50 ? '👍' : '💪'}
            </div>
            <h2 className="text-3xl font-bold mb-2">Session Complete!</h2>
            <p className="text-gray-400 mb-8">Great work on your study session</p>

            {/* Results */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="p-4 bg-gray-800/50 rounded-xl backdrop-blur">
                <div className="text-3xl font-bold text-blue-400">{stats.reviewed}</div>
                <div className="text-xs text-gray-400">Reviewed</div>
              </div>
              <div className="p-4 bg-gray-800/50 rounded-xl backdrop-blur">
                <div className="text-3xl font-bold text-green-400">{stats.correct}</div>
                <div className="text-xs text-gray-400">Correct</div>
              </div>
              <div className="p-4 bg-gray-800/50 rounded-xl backdrop-blur">
                <div className="text-3xl font-bold text-yellow-400">{accuracy}%</div>
                <div className="text-xs text-gray-400">Accuracy</div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleStartSession}
                className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl font-medium transition-colors"
              >
                🔄 Study Again
              </button>
              <button
                onClick={endSession}
                className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-medium transition-colors"
              >
                ✓ Done
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active study card
  const progressPercent = deck.length > 0 ? ((currentCardIndex + 1) / deck.length) * 100 : 0;

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white" data-testid="memo-cards-active">
      {/* Header */}
      <div className="p-4 border-b border-gray-700/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">
              {currentCardIndex + 1} / {deck.length}
            </span>
            {streak > 2 && (
              <span className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded-full text-xs font-medium">
                🔥 {streak} streak
              </span>
            )}
          </div>
          <button
            onClick={endSession}
            className="text-gray-400 hover:text-white text-sm px-3 py-1 rounded hover:bg-gray-700/50 transition-colors"
          >
            End
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Card area */}
      <div
        className="flex-1 flex flex-col p-6"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Card type badge */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            currentCard.source === 'quiz-miss' ? 'bg-red-500/20 text-red-400' :
            currentCard.source === 'flashcard' ? 'bg-purple-500/20 text-purple-400' :
            'bg-yellow-500/20 text-yellow-400'
          }`}>
            {currentCard.source === 'quiz-miss' ? '⚠️ Weak Item' :
             currentCard.source === 'flashcard' ? '📇 Flashcard' :
             '🔆 Highlight'}
          </span>
        </div>

        {/* Flashcard */}
        <div
          ref={cardRef}
          className={`flex-1 relative perspective-1000 cursor-pointer ${isFlipping ? 'pointer-events-none' : ''}`}
          onClick={() => !isRevealed && handleReveal()}
        >
          <div className={`absolute inset-0 transition-transform duration-300 transform-style-3d ${
            isRevealed ? 'rotate-y-180' : ''
          }`}>
            {/* Front of card */}
            <div className={`absolute inset-0 backface-hidden ${isRevealed ? 'invisible' : ''}`}>
              <div className="h-full bg-gradient-to-br from-gray-800 to-gray-750 rounded-2xl shadow-2xl p-8 flex flex-col items-center justify-center border border-gray-700/50">
                <p className="text-xl text-white text-center leading-relaxed max-w-lg">
                  {currentCard.front}
                </p>
                {!isRevealed && (
                  <p className="mt-8 text-gray-500 text-sm">
                    Tap or press Space to reveal
                  </p>
                )}
              </div>
            </div>

            {/* Back of card */}
            <div className={`absolute inset-0 backface-hidden rotate-y-180 ${!isRevealed ? 'invisible' : ''}`}>
              <div className="h-full bg-gradient-to-br from-purple-900/50 to-blue-900/50 rounded-2xl shadow-2xl p-8 flex flex-col border border-purple-500/30">
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="text-xs text-purple-400 uppercase tracking-wide mb-3">Answer</div>
                  <p className="text-lg text-white text-center leading-relaxed max-w-lg">
                    {currentCard.back}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Grading buttons (only when revealed) */}
        {isRevealed && (
          <div className="mt-6 space-y-3">
            <p className="text-center text-sm text-gray-400">How well did you know this?</p>
            <div className="grid grid-cols-3 gap-2">
              {(['again', 'hard', 'easy'] as CardGrade[]).map((grade) => {
                const config = GRADE_CONFIG[grade];
                return (
                  <button
                    key={grade}
                    onClick={() => handleGrade(grade)}
                    className={`px-3 py-4 ${config.bgColor} ${config.hoverBg} rounded-xl font-medium transition-all flex flex-col items-center gap-1 shadow-lg`}
                    data-testid={`grade-${grade}-btn`}
                  >
                    <span className="text-lg">{config.emoji}</span>
                    <span className="text-sm">{config.label}</span>
                    <span className="text-xs opacity-70">{config.interval}</span>
                    {showKeyboardHints && (
                      <kbd className="text-xs bg-black/20 px-1.5 py-0.5 rounded mt-1">{config.key}</kbd>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer with keyboard hints */}
      <div className="p-4 border-t border-gray-700/50 flex items-center justify-between text-xs text-gray-500">
        <span>✅ {stats.correct} correct</span>
        <button
          onClick={() => setShowKeyboardHints(!showKeyboardHints)}
          className="hover:text-gray-300 transition-colors"
        >
          {showKeyboardHints ? '⌨️ Hide shortcuts' : '⌨️ Show shortcuts'}
        </button>
        <span>📚 {stats.remaining} remaining</span>
      </div>
    </div>
  );
}
