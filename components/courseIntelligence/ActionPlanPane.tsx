// components/courseIntelligence/ActionPlanPane.tsx
// Right Pane: Action Plan (Today → This Week → Before Exam)

import React, { useState } from 'react';
import type { StudyPlan, PlanBlock, WeakCluster, TimeBudget } from '@/lib/courseIntelligence/types';

interface ActionPlanPaneProps {
  plan: StudyPlan | null;
  timeBudget: TimeBudget;
  onStartBlock: (blockId: string) => void;
  onCompleteBlock: (blockId: string) => void;
  onSkipBlock: (blockId: string) => void;
  onJumpToCluster: (clusterId: string) => void;
  onStartExplainer: (clusterId: string) => void;
  onTimeBudgetChange: (budget: Partial<TimeBudget>) => void;
}

type PlanTab = 'today' | 'week' | 'exam';

export const ActionPlanPane: React.FC<ActionPlanPaneProps> = ({
  plan,
  timeBudget,
  onStartBlock,
  onCompleteBlock,
  onSkipBlock,
  onJumpToCluster,
  onStartExplainer,
  onTimeBudgetChange,
}) => {
  const [activeTab, setActiveTab] = useState<PlanTab>('today');

  if (!plan) {
    return <NoPlanState />;
  }

  const tabs: { id: PlanTab; label: string; icon: string }[] = [
    { id: 'today', label: 'Today', icon: '📅' },
    { id: 'week', label: 'This Week', icon: '📆' },
    { id: 'exam', label: 'Before Exam', icon: '🎯' },
  ];

  // Get blocks for active tab
  const getBlocksForTab = (): PlanBlock[] => {
    switch (activeTab) {
      case 'today':
        return plan.todayBlocks.filter((b) => b.status !== 'completed');
      case 'week':
        return plan.weekBlocks.filter((b) => b.status !== 'completed');
      case 'exam':
        return plan.examBlocks.filter((b) => b.status !== 'completed');
    }
  };

  // Get all blocks for counting
  const allBlocks = [...plan.todayBlocks, ...plan.weekBlocks, ...plan.examBlocks];
  const blocks = getBlocksForTab();
  const completedToday = plan.todayBlocks.filter(
    (b) => b.status === 'completed'
  ).length;

  // Calculate time totals
  const totalMinutes = blocks.reduce((sum, b) => sum + b.estimatedMinutes, 0);
  const availableMinutes = timeBudget.total;

  return (
    <div className="flex flex-col h-full">
      {/* Header with Time Budget */}
      <div className="p-4 bg-gradient-to-r from-gray-800 to-gray-850 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <span>📋</span> Action Plan
          </h2>
          <TimeBudgetEditor
            budget={timeBudget}
            onChange={onTimeBudgetChange}
          />
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-400">Today:</span>
          <span className="text-green-400">{completedToday} done</span>
          <span className="text-gray-600">•</span>
          <span className="text-amber-400">{blocks.length} remaining</span>
          <span className="text-gray-600">•</span>
          <span className={totalMinutes > availableMinutes ? 'text-red-400' : 'text-teal-400'}>
            {formatMinutes(totalMinutes)} / {formatMinutes(availableMinutes)}
          </span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex-1 py-2 px-3 text-sm font-medium transition-colors
              ${activeTab === tab.id
                ? 'text-teal-400 border-b-2 border-teal-400 bg-gray-800/50'
                : 'text-gray-400 hover:text-gray-300'
              }
            `}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Weak Clusters Alert */}
      {plan.weakClusters.length > 0 && activeTab === 'exam' && (
        <WeakClustersAlert
          clusters={plan.weakClusters}
          onJump={onJumpToCluster}
          onExplain={onStartExplainer}
        />
      )}

      {/* Plan Blocks */}
      <div className="flex-1 overflow-y-auto p-4">
        {blocks.length > 0 ? (
          <div className="space-y-2">
            {blocks.map((block) => (
              <PlanBlockCard
                key={block.id}
                block={block}
                onStart={() => onStartBlock(block.id)}
                onComplete={() => onCompleteBlock(block.id)}
                onSkip={() => onSkipBlock(block.id)}
                onJump={() => onJumpToCluster(block.clusterIds[0] || block.id)}
              />
            ))}
          </div>
        ) : (
          <AllDoneState tab={activeTab} />
        )}
      </div>

      {/* Quick Stats Footer */}
      <div className="p-3 bg-gray-800 border-t border-gray-700">
        <div className="flex items-center justify-around text-center">
          <QuickStat
            value={allBlocks.filter((b) => b.status === 'completed').length}
            label="Completed"
            color="text-green-400"
          />
          <QuickStat
            value={allBlocks.filter((b) => b.status === 'in_progress').length}
            label="In Progress"
            color="text-amber-400"
          />
          <QuickStat
            value={plan.weakClusters.length}
            label="Weak Areas"
            color="text-red-400"
          />
        </div>
      </div>
    </div>
  );
};

// Time Budget Editor
const TimeBudgetEditor: React.FC<{
  budget: TimeBudget;
  onChange: (budget: Partial<TimeBudget>) => void;
}> = ({ budget, onChange }) => {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
      >
        <span>⏱️</span>
        <span>{budget.total}min/day</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={budget.total}
        onChange={(e) => onChange({ total: parseInt(e.target.value) || 60 })}
        className="w-16 px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white"
        min={15}
        max={480}
        step={15}
      />
      <span className="text-xs text-gray-400">min/day</span>
      <button
        onClick={() => setEditing(false)}
        className="text-xs text-teal-400 hover:text-teal-300"
      >
        Done
      </button>
    </div>
  );
};

// Plan Block Card
const PlanBlockCard: React.FC<{
  block: PlanBlock;
  onStart: () => void;
  onComplete: () => void;
  onSkip: () => void;
  onJump: () => void;
}> = ({ block, onStart, onComplete, onSkip, onJump }) => {
  const typeStyles: Record<PlanBlock['type'], { bg: string; icon: string }> = {
    reading: { bg: 'bg-blue-900/30 border-blue-700/50', icon: '📖' },
    reasoning: { bg: 'bg-green-900/30 border-green-700/50', icon: '🧠' },
    drill: { bg: 'bg-purple-900/30 border-purple-700/50', icon: '✍️' },
  };

  const statusStyles: Record<PlanBlock['status'], string> = {
    pending: 'opacity-100',
    in_progress: 'ring-2 ring-amber-500',
    completed: 'opacity-50',
    skipped: 'opacity-30',
  };

  const style = typeStyles[block.type];

  return (
    <div
      className={`
        p-3 rounded-lg border ${style.bg} ${statusStyles[block.status]}
        transition-all
      `}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span>{style.icon}</span>
            <span className="font-medium text-white text-sm truncate">
              {block.title}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
            <span>⏱️ {block.estimatedMinutes}min</span>
            {block.pageRange && (
              <button
                onClick={onJump}
                className="text-teal-400 hover:text-teal-300"
              >
                p.{block.pageRange.start}-{block.pageRange.end}
              </button>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 ml-2">
          {block.status === 'pending' && (
            <>
              <ActionButton icon="▶️" title="Start" onClick={onStart} variant="primary" />
              <ActionButton icon="⏭️" title="Skip" onClick={onSkip} variant="ghost" />
            </>
          )}
          {block.status === 'in_progress' && (
            <ActionButton icon="✓" title="Complete" onClick={onComplete} variant="success" />
          )}
          {block.status === 'completed' && (
            <span className="text-green-400 text-sm">✓</span>
          )}
        </div>
      </div>
    </div>
  );
};

// Action Button
const ActionButton: React.FC<{
  icon: string;
  title: string;
  onClick: () => void;
  variant?: 'primary' | 'success' | 'ghost';
}> = ({ icon, title, onClick, variant = 'ghost' }) => {
  const variants = {
    primary: 'bg-teal-600 hover:bg-teal-500 text-white',
    success: 'bg-green-600 hover:bg-green-500 text-white',
    ghost: 'hover:bg-gray-700 text-gray-400',
  };

  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${variants[variant]}`}
    >
      <span className="text-sm">{icon}</span>
    </button>
  );
};

// Weak Clusters Alert
const WeakClustersAlert: React.FC<{
  clusters: WeakCluster[];
  onJump: (clusterId: string) => void;
  onExplain: (clusterId: string) => void;
}> = ({ clusters, onJump, onExplain }) => (
  <div className="m-4 p-3 bg-red-900/20 border border-red-700/50 rounded-lg">
    <h3 className="text-sm font-medium text-red-300 mb-2 flex items-center gap-2">
      <span>⚠️</span> Weak Areas Need Attention
    </h3>
    <div className="space-y-2">
      {clusters.slice(0, 3).map((cluster) => (
        <div
          key={cluster.clusterId}
          className="flex items-center justify-between text-xs"
        >
          <span className="text-gray-300 truncate flex-1">{cluster.clusterName}</span>
          <div className="flex items-center gap-2 ml-2">
            <span className="text-red-400">{cluster.masteryScore}%</span>
            <button
              onClick={() => onJump(cluster.clusterId)}
              className="text-teal-400 hover:text-teal-300"
            >
              Go
            </button>
            <button
              onClick={() => onExplain(cluster.clusterId)}
              className="text-purple-400 hover:text-purple-300"
            >
              🎙️
            </button>
          </div>
        </div>
      ))}
    </div>
    {clusters.length > 3 && (
      <p className="text-xs text-gray-400 mt-2">
        +{clusters.length - 3} more weak areas
      </p>
    )}
  </div>
);

// Quick Stat
const QuickStat: React.FC<{
  value: number;
  label: string;
  color: string;
}> = ({ value, label, color }) => (
  <div>
    <div className={`text-lg font-bold ${color}`}>{value}</div>
    <div className="text-xs text-gray-400">{label}</div>
  </div>
);

// No Plan State
const NoPlanState: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full text-center p-8">
    <span className="text-5xl mb-4">📋</span>
    <h3 className="text-lg font-medium text-white mb-2">No Study Plan Yet</h3>
    <p className="text-sm text-gray-400 max-w-sm">
      Upload a syllabus or map your TOC to generate a personalized study plan
      based on your mastery levels.
    </p>
  </div>
);

// All Done State
const AllDoneState: React.FC<{ tab: PlanTab }> = ({ tab }) => {
  const messages: Record<PlanTab, { title: string; subtitle: string }> = {
    today: {
      title: "You're all caught up!",
      subtitle: "No more tasks for today. Great work!",
    },
    week: {
      title: 'Week complete!',
      subtitle: "You've finished all tasks for this week.",
    },
    exam: {
      title: 'Fully prepared!',
      subtitle: "You've completed all exam preparation tasks.",
    },
  };

  const msg = messages[tab];

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="text-4xl mb-3">🎉</span>
      <h3 className="text-sm font-medium text-white mb-1">{msg.title}</h3>
      <p className="text-xs text-gray-400">{msg.subtitle}</p>
    </div>
  );
};

// Helpers
function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

export default ActionPlanPane;
