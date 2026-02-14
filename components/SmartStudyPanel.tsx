"use client";

import React, { useState, useMemo, useCallback, memo } from 'react';
import type { CoreItemWithLearning, Trigger, LearningState } from '../lib/core/types';
import { TRIGGER_LABELS } from '../lib/core/types';
// CoreCard has been updated to use new CoreConcept schema;
// SmartStudyPanel uses legacy CoreItemWithLearning — render inline cards instead
import ExamMode, { ExamResultsPanel } from './ExamMode';
import AnalyticsDashboard from './AnalyticsDashboard';
import RelationDrillPanel from './surgeonView2/RelationDrillPanel';
import {
  sortByPriority,
  getDueItems,
  type ReviewGrade,
} from '../lib/core/learningEngine';
import {
  calculateKnowledgeDebt,
  type RecallAttempt,
  type ExamConfig,
} from '../lib/core/analytics';
import { useLearningStore } from '../lib/stores/learningStore';
import { useRelationshipStore } from '../lib/relationshipSchema/store';

// ============================================================================
// Types
// ============================================================================

interface SmartStudyPanelProps {
  documentId: string;
  items: CoreItemWithLearning[];
  onItemReview: (itemId: string, grade: ReviewGrade) => void;
  onItemSelect?: (item: CoreItemWithLearning) => void;
  onJumpToPage?: (page: number) => void;
}

type StudyView = 'relations' | 'queue' | 'analytics' | 'exam' | 'results';
type FilterMode = 'all' | 'due' | 'weak' | 'new' | 'mastered';

// ============================================================================
// Study Queue Display
// ============================================================================

const StudyQueueDisplay = memo(function StudyQueueDisplay({
  items,
  filterMode,
  onFilterChange,
  onItemSelect,
  onStartReview,
}: {
  items: CoreItemWithLearning[];
  filterMode: FilterMode;
  onFilterChange: (mode: FilterMode) => void;
  onItemSelect?: (item: CoreItemWithLearning) => void;
  onStartReview: () => void;
}) {
  // Filter items based on mode
  const filteredItems = useMemo(() => {
    switch (filterMode) {
      case 'due':
        return getDueItems(items);
      case 'weak':
        return items.filter((i) => i.learning.state === 'weak');
      case 'new':
        return items.filter((i) => i.learning.state === 'new');
      case 'mastered':
        return items.filter((i) => i.learning.state === 'mastered');
      default:
        return items;
    }
  }, [items, filterMode]);

  // Sort by priority
  const sortedItems = useMemo(() => sortByPriority(filteredItems), [filteredItems]);

  // Stats
  const stats = useMemo(() => ({
    total: items.length,
    due: getDueItems(items).length,
    weak: items.filter((i) => i.learning.state === 'weak').length,
    new: items.filter((i) => i.learning.state === 'new').length,
    mastered: items.filter((i) => i.learning.state === 'mastered').length,
  }), [items]);

  return (
    <div className="flex flex-col h-full">
      {/* Filter Tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-700/50 overflow-x-auto">
        {[
          { mode: 'all' as const, label: 'All', count: stats.total },
          { mode: 'due' as const, label: 'Due', count: stats.due, color: 'text-yellow-400' },
          { mode: 'weak' as const, label: 'Weak', count: stats.weak, color: 'text-red-400' },
          { mode: 'new' as const, label: 'New', count: stats.new, color: 'text-blue-400' },
          { mode: 'mastered' as const, label: 'Mastered', count: stats.mastered, color: 'text-green-400' },
        ].map(({ mode, label, count, color }) => (
          <button
            key={mode}
            onClick={() => onFilterChange(mode)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
              filterMode === mode
                ? 'bg-purple-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {label}
            <span className={`ml-1 ${filterMode === mode ? 'text-purple-200' : color || 'text-gray-500'}`}>
              ({count})
            </span>
          </button>
        ))}
      </div>

      {/* Start Review Button */}
      {stats.due > 0 && (
        <div className="px-3 py-2 border-b border-gray-700/30">
          <button
            onClick={onStartReview}
            className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
          >
            Start Review ({stats.due} due)
          </button>
        </div>
      )}

      {/* Items List */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {sortedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-4xl mb-3">
              {filterMode === 'mastered' ? '🎉' : '✨'}
            </div>
            <p className="text-sm text-gray-400">
              {filterMode === 'due'
                ? 'No items due for review!'
                : filterMode === 'weak'
                ? 'No weak items!'
                : filterMode === 'mastered'
                ? 'No mastered items yet. Keep studying!'
                : 'No items in this category.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedItems.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-gray-800/50 border border-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-800/70"
                onClick={() => onItemSelect?.(item)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-400 uppercase">{item.learning.state}</span>
                  <span className="text-[10px] text-gray-500">{Math.round(item.learning.combinedConfidence * 100)}%</span>
                </div>
                <p className="text-sm text-gray-200">{item.core_sentence}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

// ============================================================================
// Review Session
// ============================================================================

const ReviewSession = memo(function ReviewSession({
  items,
  onReview,
  onComplete,
}: {
  items: CoreItemWithLearning[];
  onReview: (itemId: string, grade: ReviewGrade) => void;
  onComplete: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const currentItem = items[currentIndex];
  const progress = ((currentIndex + 1) / items.length) * 100;

  const handleGrade = useCallback(
    (grade: ReviewGrade) => {
      if (!currentItem) return;
      onReview(currentItem.id, grade);

      if (currentIndex < items.length - 1) {
        setCurrentIndex((prev) => prev + 1);
        setShowAnswer(false);
      } else {
        onComplete();
      }
    },
    [currentItem, currentIndex, items.length, onReview, onComplete]
  );

  if (!currentItem) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-4xl mb-3">🎉</div>
        <p className="text-gray-400">No items to review!</p>
        <button
          onClick={onComplete}
          className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
        >
          Back to Queue
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Progress */}
      <div className="px-4 py-2 border-b border-gray-700/50">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400">Review Progress</span>
          <span className="text-xs text-gray-400">
            {currentIndex + 1} / {items.length}
          </span>
        </div>
        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Question */}
          <div className="p-6 bg-gray-800 rounded-xl border border-gray-700 mb-4">
            <div className="flex gap-1 mb-3">
              {currentItem.triggers.map((t, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 text-xs bg-purple-600/30 text-purple-300 rounded"
                >
                  {t}
                </span>
              ))}
            </div>
            <p className="text-center">
              {currentItem.flashcard?.front || currentItem.core_sentence}
            </p>
          </div>

          {/* Answer */}
          {showAnswer ? (
            <div className="p-6 bg-green-900/20 rounded-xl border border-green-600/30 mb-4">
              <p className="text-sm text-green-400 mb-2">Answer:</p>
              <p>{currentItem.flashcard?.back || currentItem.core_sentence}</p>
            </div>
          ) : (
            <button
              onClick={() => setShowAnswer(true)}
              className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Show Answer
            </button>
          )}

          {/* Grade Buttons */}
          {showAnswer && (
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleGrade('again')}
                className="py-3 bg-red-600/80 hover:bg-red-500 text-white rounded-lg transition-colors"
              >
                Again
              </button>
              <button
                onClick={() => handleGrade('hard')}
                className="py-3 bg-yellow-600/80 hover:bg-yellow-500 text-white rounded-lg transition-colors"
              >
                Hard
              </button>
              <button
                onClick={() => handleGrade('easy')}
                className="py-3 bg-green-600/80 hover:bg-green-500 text-white rounded-lg transition-colors"
              >
                Easy
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// Main Smart Study Panel
// ============================================================================

export const SmartStudyPanel = memo(function SmartStudyPanel({
  documentId,
  items,
  onItemReview,
  onItemSelect,
  onJumpToPage,
}: SmartStudyPanelProps) {
  // Check if we have relations to drill
  const { relations } = useRelationshipStore();
  const hasRelations = Object.keys(relations).length > 0;

  // State - default to relations if available
  const [view, setView] = useState<StudyView>(hasRelations ? 'relations' : 'queue');
  const [filterMode, setFilterMode] = useState<FilterMode>('due');
  const [examResults, setExamResults] = useState<any>(null);
  const [recallHistory, setRecallHistory] = useState<RecallAttempt[]>([]);

  // Exam config
  const examConfig: ExamConfig = useMemo(
    () => ({
      daysUntilExam: 14, // Default 2 weeks
      targetScore: 70,
      triggerWeights: {},
      dailyStudyMinutes: 30,
    }),
    []
  );

  // Due items for review
  const dueItems = useMemo(() => getDueItems(items), [items]);

  // Handle recall attempt from exam
  const handleRecallAttempt = useCallback((attempt: RecallAttempt) => {
    setRecallHistory((prev) => [...prev, attempt]);
  }, []);

  // Handle exam complete
  const handleExamComplete = useCallback((results: any) => {
    setExamResults(results);
    setView('results');
  }, []);

  // Render based on view
  const renderContent = () => {
    switch (view) {
      case 'relations':
        return (
          <RelationDrillPanel
            onJumpToPage={onJumpToPage}
          />
        );

      case 'exam':
        return (
          <ExamMode
            items={items}
            onRecallAttempt={handleRecallAttempt}
            onComplete={handleExamComplete}
            onExit={() => setView('relations')}
          />
        );

      case 'results':
        return examResults ? (
          <ExamResultsPanel
            results={examResults}
            onRetry={() => setView('exam')}
            onReviewWeak={() => {
              setFilterMode('weak');
              setView('queue');
            }}
            onClose={() => {
              setExamResults(null);
              setView('relations');
            }}
          />
        ) : null;

      case 'analytics':
        return (
          <AnalyticsDashboard
            items={items}
            recallHistory={recallHistory}
            examConfig={examConfig}
            onStartExam={() => setView('exam')}
            onReviewWeakItems={() => {
              setFilterMode('weak');
              setView('queue');
            }}
          />
        );

      case 'queue':
      default:
        if (dueItems.length > 0 && filterMode === 'due') {
          return (
            <ReviewSession
              items={dueItems}
              onReview={onItemReview}
              onComplete={() => setFilterMode('all')}
            />
          );
        }
        return (
          <StudyQueueDisplay
            items={items}
            filterMode={filterMode}
            onFilterChange={setFilterMode}
            onItemSelect={onItemSelect}
            onStartReview={() => setFilterMode('due')}
          />
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <h2 className="text-sm font-semibold text-white">Smart Study</h2>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setView('relations')}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              view === 'relations'
                ? 'bg-purple-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Relations
          </button>
          <button
            onClick={() => setView('queue')}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              view === 'queue' || view === 'results'
                ? 'bg-purple-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Cards
          </button>
          <button
            onClick={() => setView('analytics')}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              view === 'analytics'
                ? 'bg-purple-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Stats
          </button>
          <button
            onClick={() => setView('exam')}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              view === 'exam'
                ? 'bg-purple-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Exam
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">{renderContent()}</div>
    </div>
  );
});

export default SmartStudyPanel;
