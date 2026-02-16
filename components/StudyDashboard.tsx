// components/StudyDashboard.tsx
// Study Dashboard - Spaced Repetition + Exam Emphasis Mode
// Due queue, weak queue, exam emphasis queue, next best actions

import React, { useEffect, useMemo } from 'react';
import { useStudyDashboardStore } from '@/lib/cognitive/studyDashboardStore';
import type { StudyCard, NextBestAction } from '@/lib/cognitive/types';

interface StudyDashboardProps {
  onStartReview?: (cardIds: string[]) => void;
  onExplainCard?: (cardId: string) => void;
  onReadCards?: (cardIds: string[]) => void;
}

export const StudyDashboard: React.FC<StudyDashboardProps> = ({
  onStartReview,
  onExplainCard,
  onReadCards,
}) => {
  const {
    queue,
    mode,
    examDate,
    nextBestActions,
    pinnedChapterIds,
    pinnedSyllabusIds,
    setMode,
    setExamDate,
    refreshQueues,
    computeNextBestActions,
  } = useStudyDashboardStore();

  // Refresh on mount
  useEffect(() => {
    refreshQueues();
    computeNextBestActions();
  }, []);

  // Format date
  const examDateFormatted = examDate
    ? new Date(examDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Not set';

  const daysUntilExam = examDate
    ? Math.ceil((new Date(examDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const handleAction = (action: NextBestAction) => {
    switch (action.type) {
      case 'review_due':
        onStartReview?.(action.cardIds);
        break;
      case 'explain_weak':
        onExplainCard?.(action.cardIds[0]);
        break;
      case 'read_high_yield':
        onReadCards?.(action.cardIds);
        break;
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Header */}
      <header className="px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Study Dashboard</h1>

          <div className="flex items-center gap-4">
            {/* Mode Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Mode:</span>
              <div className="flex bg-gray-700 rounded-lg p-0.5">
                <button
                  onClick={() => setMode('auto')}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    mode === 'auto'
                      ? 'bg-teal-600 text-white'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  Auto
                </button>
                <button
                  onClick={() => setMode('manual')}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    mode === 'manual'
                      ? 'bg-teal-600 text-white'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  Manual
                </button>
              </div>
            </div>

            {/* Exam Date */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Exam:</span>
              <input
                type="date"
                value={examDate?.split('T')[0] || ''}
                onChange={(e) => setExamDate(e.target.value ? new Date(e.target.value).toISOString() : undefined)}
                className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded border border-gray-600"
              />
              {daysUntilExam !== null && (
                <span className={`text-xs font-medium ${
                  daysUntilExam <= 7 ? 'text-red-400' :
                  daysUntilExam <= 30 ? 'text-yellow-400' :
                  'text-green-400'
                }`}>
                  {daysUntilExam} days
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Next Best Actions */}
        <section>
          <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <span>🎯</span> Next Best Action
          </h2>

          {nextBestActions.length > 0 ? (
            <div className="space-y-2">
              {nextBestActions.slice(0, 3).map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAction(action)}
                  className={`
                    w-full text-left px-4 py-3 rounded-lg border transition-colors
                    ${idx === 0
                      ? 'bg-teal-500/20 border-teal-500/40 hover:bg-teal-500/30'
                      : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                    }
                  `}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-200">{action.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      action.type === 'review_due' ? 'bg-blue-500/20 text-blue-400' :
                      action.type === 'explain_weak' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-purple-500/20 text-purple-400'
                    }`}>
                      {action.count} card{action.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-400">No actions available. Add cards to start studying!</p>
            </div>
          )}
        </section>

        {/* Queue Overview */}
        <div className="grid grid-cols-3 gap-4">
          {/* Due Queue */}
          <QueueCard
            title="Due Today"
            icon="📅"
            count={queue.due.length}
            cards={queue.due.slice(0, 5)}
            emptyMessage="No cards due"
            color="blue"
            onCardClick={(card) => onStartReview?.([card.cardId])}
          />

          {/* Weak Queue */}
          <QueueCard
            title="Weak Cards"
            icon="⚠️"
            count={queue.weak.length}
            cards={queue.weak.slice(0, 5)}
            emptyMessage="No weak cards"
            color="amber"
            onCardClick={(card) => onExplainCard?.(card.cardId)}
          />

          {/* Exam Emphasis */}
          <QueueCard
            title="High Yield"
            icon="🔥"
            count={queue.examEmphasis.length}
            cards={queue.examEmphasis.slice(0, 5)}
            emptyMessage="No high-yield cards"
            color="purple"
            onCardClick={(card) => onReadCards?.([card.cardId])}
          />
        </div>

        {/* Pinned Items */}
        {(pinnedChapterIds.length > 0 || pinnedSyllabusIds.length > 0) && (
          <section>
            <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
              <span>📌</span> Pinned Items
            </h2>

            <div className="flex flex-wrap gap-2">
              {pinnedChapterIds.map(id => (
                <span key={id} className="px-2 py-1 text-xs bg-gray-800 text-gray-300 rounded border border-gray-700">
                  Chapter: {id}
                </span>
              ))}
              {pinnedSyllabusIds.map(id => (
                <span key={id} className="px-2 py-1 text-xs bg-gray-800 text-gray-300 rounded border border-gray-700">
                  Syllabus: {id}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Study Stats */}
        <section>
          <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <span>📊</span> Study Progress
          </h2>

          <div className="grid grid-cols-4 gap-4">
            <StatCard
              label="Total Cards"
              value={queue.due.length + queue.weak.length + queue.examEmphasis.length}
              icon="📚"
            />
            <StatCard
              label="Mastered"
              value={0}
              icon="✅"
            />
            <StatCard
              label="Learning"
              value={queue.due.length}
              icon="📖"
            />
            <StatCard
              label="Review"
              value={queue.weak.length}
              icon="🔄"
            />
          </div>
        </section>
      </div>
    </div>
  );
};

// Queue Card Component
const QueueCard: React.FC<{
  title: string;
  icon: string;
  count: number;
  cards: StudyCard[];
  emptyMessage: string;
  color: 'blue' | 'amber' | 'purple';
  onCardClick: (card: StudyCard) => void;
}> = ({ title, icon, count, cards, emptyMessage, color, onCardClick }) => {
  const colorClasses = {
    blue: 'border-blue-500/40 bg-blue-500/10',
    amber: 'border-amber-500/40 bg-amber-500/10',
    purple: 'border-purple-500/40 bg-purple-500/10',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-1">
          <span>{icon}</span> {title}
        </h3>
        <span className="text-lg font-bold text-gray-200">{count}</span>
      </div>

      {cards.length > 0 ? (
        <div className="space-y-1.5">
          {cards.map(card => (
            <button
              key={card.cardId}
              onClick={() => onCardClick(card)}
              className="w-full text-left px-2 py-1.5 text-xs bg-gray-800/50 rounded hover:bg-gray-700/50 text-gray-300 truncate"
            >
              {card.cardId}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500 italic">{emptyMessage}</p>
      )}
    </div>
  );
};

// Stat Card Component
const StatCard: React.FC<{
  label: string;
  value: number;
  icon: string;
}> = ({ label, value, icon }) => (
  <div className="bg-gray-800 rounded-lg p-3 text-center">
    <div className="text-2xl mb-1">{icon}</div>
    <div className="text-xl font-bold text-gray-200">{value}</div>
    <div className="text-[10px] text-gray-500 uppercase">{label}</div>
  </div>
);

export default StudyDashboard;
