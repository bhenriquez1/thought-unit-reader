"use client";

import React, { useState, useMemo, memo } from 'react';
import type { CoreItemWithLearning, Trigger } from '../lib/core/types';
import { TRIGGER_LABELS } from '../lib/core/types';
import {
  calculateKnowledgeDebt,
  calculateExamReadiness,
  calculateTimeToExam,
  calculatePassFailMeter,
  type ExamConfig,
  type RecallAttempt,
  type KnowledgeDebt,
  type ExamReadiness,
  type TimeToExamForecast,
  type PassFailMeter,
} from '../lib/core/analytics';

// ============================================================================
// Types
// ============================================================================

interface AnalyticsDashboardProps {
  items: CoreItemWithLearning[];
  recallHistory: RecallAttempt[];
  examConfig: ExamConfig;
  studyHistory?: { date: string; minutesStudied: number }[];
  onStartExam?: () => void;
  onReviewWeakItems?: () => void;
}

// ============================================================================
// Pass/Fail Meter Component
// ============================================================================

const PassFailMeterDisplay = memo(function PassFailMeterDisplay({
  meter,
}: {
  meter: PassFailMeter;
}) {
  const statusColors = {
    failing: 'text-red-400 bg-red-600/20 border-red-500/50',
    'at-risk': 'text-orange-400 bg-orange-600/20 border-orange-500/50',
    'on-track': 'text-yellow-400 bg-yellow-600/20 border-yellow-500/50',
    ready: 'text-green-400 bg-green-600/20 border-green-500/50',
  };

  const meterColor =
    meter.probability >= 80
      ? 'bg-green-500'
      : meter.probability >= 60
      ? 'bg-yellow-500'
      : meter.probability >= 40
      ? 'bg-orange-500'
      : 'bg-red-500';

  return (
    <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Pass Probability</h3>
        <span
          className={`px-2 py-0.5 text-xs rounded border ${statusColors[meter.status]}`}
        >
          {meter.status.replace('-', ' ').toUpperCase()}
        </span>
      </div>

      {/* Probability Meter */}
      <div className="relative h-8 bg-gray-700 rounded-full overflow-hidden mb-2">
        <div
          className={`absolute inset-y-0 left-0 ${meterColor} transition-all duration-500`}
          style={{ width: `${meter.probability}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-white drop-shadow">
            {meter.probability}%
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-400">{meter.message}</p>

      {meter.improvementNeeded > 0 && (
        <p className="text-xs text-yellow-400 mt-1">
          Need +{meter.improvementNeeded}% to reach target
        </p>
      )}
    </div>
  );
});

// ============================================================================
// Knowledge Debt Display
// ============================================================================

const KnowledgeDebtDisplay = memo(function KnowledgeDebtDisplay({
  debt,
}: {
  debt: KnowledgeDebt;
}) {
  const debtColor =
    debt.total >= 70
      ? 'text-red-400'
      : debt.total >= 40
      ? 'text-yellow-400'
      : 'text-green-400';

  return (
    <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Knowledge Debt</h3>
        <span className={`text-2xl font-bold ${debtColor}`}>
          {Math.round(debt.total)}
        </span>
      </div>

      {/* Debt by Trigger */}
      <div className="space-y-1 mb-3">
        {Object.entries(debt.byTrigger)
          .filter(([_, value]) => value > 0)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 4)
          .map(([trigger, value]) => (
            <div key={trigger} className="flex items-center gap-2">
              <span className="w-6 text-xs text-purple-400 font-mono">{trigger}</span>
              <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full ${
                    value >= 70 ? 'bg-red-500' : value >= 40 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${value}%` }}
                />
              </div>
              <span className="w-8 text-xs text-gray-500 text-right">{Math.round(value)}</span>
            </div>
          ))}
      </div>

      {/* Urgent Items */}
      {debt.urgentItems.length > 0 && (
        <div className="text-xs text-red-400">
          ⚠️ {debt.urgentItems.length} urgent items need review
        </div>
      )}
    </div>
  );
});

// ============================================================================
// Exam Readiness Display
// ============================================================================

const ExamReadinessDisplay = memo(function ExamReadinessDisplay({
  readiness,
}: {
  readiness: ExamReadiness;
}) {
  return (
    <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Exam Readiness</h3>
        <div className="text-right">
          <span className="text-2xl font-bold text-purple-400">{readiness.overall}%</span>
          <span className="text-xs text-gray-500 ml-1">
            ({readiness.confidenceRange[0]}-{readiness.confidenceRange[1]})
          </span>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {Object.entries(readiness.byCategory).map(([category, value]) => (
          <div key={category} className="flex items-center justify-between text-xs">
            <span className="text-gray-400 capitalize">{category}</span>
            <span
              className={`font-medium ${
                value >= 70 ? 'text-green-400' : value >= 50 ? 'text-yellow-400' : 'text-red-400'
              }`}
            >
              {value}%
            </span>
          </div>
        ))}
      </div>

      {/* Weak Areas */}
      {readiness.weakAreas.length > 0 && (
        <div className="text-xs">
          <span className="text-gray-500">Weak: </span>
          {readiness.weakAreas.map((area, i) => (
            <span key={area.trigger} className="text-red-400">
              {TRIGGER_LABELS[area.trigger]}
              {i < readiness.weakAreas.length - 1 ? ', ' : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
});

// ============================================================================
// Time to Exam Display
// ============================================================================

const TimeToExamDisplay = memo(function TimeToExamDisplay({
  forecast,
  daysUntilExam,
}: {
  forecast: TimeToExamForecast;
  daysUntilExam: number;
}) {
  const onTrack = forecast.daysToReady <= daysUntilExam;

  return (
    <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Time to Exam</h3>
        <span className="text-lg font-bold text-blue-400">{daysUntilExam} days</span>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-2xl font-bold text-white">{forecast.daysToReady}</div>
          <div className="text-xs text-gray-400">days to ready</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-white">{forecast.requiredDailyMinutes}</div>
          <div className="text-xs text-gray-400">min/day needed</div>
        </div>
      </div>

      {/* Probability Comparison */}
      <div className="flex items-center gap-4 mb-3 text-sm">
        <div>
          <span className="text-gray-400">Now: </span>
          <span
            className={`font-medium ${
              forecast.currentPassProbability >= 60 ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {forecast.currentPassProbability}%
          </span>
        </div>
        <span className="text-gray-600">→</span>
        <div>
          <span className="text-gray-400">Projected: </span>
          <span
            className={`font-medium ${
              forecast.projectedPassProbability >= 60 ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {forecast.projectedPassProbability}%
          </span>
        </div>
      </div>

      {/* Status */}
      <div
        className={`text-xs ${
          onTrack ? 'text-green-400' : 'text-red-400'
        }`}
      >
        {onTrack
          ? '✓ On track to be ready by exam'
          : '⚠️ May not be ready at current pace'}
      </div>

      {/* Risks */}
      {forecast.risks.length > 0 && (
        <div className="mt-2 space-y-1">
          {forecast.risks.map((risk, i) => (
            <div key={i} className="text-xs text-orange-400">
              ⚠️ {risk}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// ============================================================================
// Study Plan Display
// ============================================================================

const StudyPlanDisplay = memo(function StudyPlanDisplay({
  forecast,
}: {
  forecast: TimeToExamForecast;
}) {
  const [showAll, setShowAll] = useState(false);
  const displayPlan = showAll ? forecast.studyPlan : forecast.studyPlan.slice(0, 5);

  return (
    <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
      <h3 className="text-sm font-semibold text-white mb-3">Study Plan</h3>

      <div className="space-y-2">
        {displayPlan.map((day, i) => (
          <div
            key={day.date}
            className={`flex items-center justify-between text-xs ${
              i === 0 ? 'bg-purple-900/30 -mx-2 px-2 py-1 rounded' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-gray-400 w-20">{day.date}</span>
              <span className="text-white">{day.itemsToReview} items</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">{day.estimatedMinutes} min</span>
              <div className="flex gap-0.5">
                {day.focusAreas.map((t) => (
                  <span
                    key={t}
                    className="px-1 py-0.5 bg-purple-600/30 text-purple-300 rounded text-[10px]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {forecast.studyPlan.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-2 text-xs text-purple-400 hover:text-purple-300"
        >
          {showAll ? 'Show less' : `Show all ${forecast.studyPlan.length} days`}
        </button>
      )}
    </div>
  );
});

// ============================================================================
// Main Analytics Dashboard
// ============================================================================

export const AnalyticsDashboard = memo(function AnalyticsDashboard({
  items,
  recallHistory,
  examConfig,
  studyHistory = [],
  onStartExam,
  onReviewWeakItems,
}: AnalyticsDashboardProps) {
  // Calculate all analytics
  const analytics = useMemo(() => {
    const debt = calculateKnowledgeDebt(items, recallHistory);
    const readiness = calculateExamReadiness(items, examConfig);
    const forecast = calculateTimeToExam(items, examConfig, studyHistory);
    const passMeter = calculatePassFailMeter(readiness, examConfig);

    return { debt, readiness, forecast, passMeter };
  }, [items, recallHistory, examConfig, studyHistory]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="text-4xl mb-3">📊</div>
        <p className="text-sm text-gray-400">No data to analyze yet.</p>
        <p className="text-xs text-gray-500 mt-1">
          Extract concepts with ⚡ Core to see analytics.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 overflow-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700/50">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <span>📊</span>
          <span>Study Analytics</span>
        </h2>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 space-y-4 overflow-auto">
        {/* Pass/Fail Meter - Full Width */}
        <PassFailMeterDisplay meter={analytics.passMeter} />

        {/* Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <KnowledgeDebtDisplay debt={analytics.debt} />
          <ExamReadinessDisplay readiness={analytics.readiness} />
        </div>

        {/* Time to Exam */}
        <TimeToExamDisplay
          forecast={analytics.forecast}
          daysUntilExam={examConfig.daysUntilExam}
        />

        {/* Study Plan */}
        <StudyPlanDisplay forecast={analytics.forecast} />

        {/* Actions */}
        <div className="flex gap-3">
          {onStartExam && (
            <button
              onClick={onStartExam}
              className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
            >
              📝 Start Exam
            </button>
          )}
          {onReviewWeakItems && analytics.debt.urgentItems.length > 0 && (
            <button
              onClick={onReviewWeakItems}
              className="flex-1 py-3 bg-red-600/80 hover:bg-red-500 text-white font-medium rounded-lg transition-colors"
            >
              ⚠️ Review Weak ({analytics.debt.urgentItems.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export default AnalyticsDashboard;
