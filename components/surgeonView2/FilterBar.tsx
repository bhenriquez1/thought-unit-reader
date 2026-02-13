// components/surgeonView2/FilterBar.tsx
// Filter bar for view modes, DAT lenses, and priority filters

import React from 'react';
import type { ViewFilters, ViewMode, DATLens, ConceptPriority } from '../../lib/surgeonView2/types';

interface FilterBarProps {
  filters: ViewFilters;
  onViewModeChange: (mode: ViewMode) => void;
  onDATLensChange: (lens: DATLens | undefined) => void;
  onHighYieldToggle: () => void;
  onShowPearlsToggle: () => void;
  onPriorityChange: (priorities: ConceptPriority[]) => void;
  onReset: () => void;
}

const VIEW_MODES: { value: ViewMode; label: string; icon: string }[] = [
  { value: 'study', label: 'Study', icon: '📖' },
  { value: 'exam', label: 'Exam', icon: '📝' },
  { value: 'review', label: 'Review', icon: '🔄' },
  { value: 'clinical', label: 'Clinical', icon: '🏥' },
];

const DAT_LENSES: { value: DATLens; label: string }[] = [
  { value: 'bio', label: 'BIO' },
  { value: 'gc', label: 'GC' },
  { value: 'oc', label: 'OC' },
  { value: 'rc', label: 'RC' },
  { value: 'qr', label: 'QR' },
  { value: 'pat', label: 'PAT' },
  { value: 'general', label: 'GEN' },
];

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onViewModeChange,
  onDATLensChange,
  onHighYieldToggle,
  onShowPearlsToggle,
  onPriorityChange,
  onReset,
}) => {
  const togglePriority = (priority: ConceptPriority) => {
    const current = filters.priorityFilter;
    const newPriorities = current.includes(priority)
      ? current.filter((p) => p !== priority)
      : [...current, priority];
    onPriorityChange(newPriorities.length > 0 ? newPriorities : ['high', 'medium', 'low']);
  };

  return (
    <div className="space-y-3 p-3 bg-white border-b border-gray-200">
      {/* Row 1: View Mode Tabs */}
      <div className="flex items-center gap-1">
        {VIEW_MODES.map((mode) => (
          <button
            key={mode.value}
            onClick={() => onViewModeChange(mode.value)}
            className={`
              flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium
              transition-colors
              ${filters.mode === mode.value
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:bg-gray-100'
              }
            `}
          >
            <span>{mode.icon}</span>
            <span>{mode.label}</span>
          </button>
        ))}
      </div>

      {/* Row 2: DAT Lenses (only show when exam mode or always for DAT users) */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 font-medium">DAT:</span>
        <div className="flex items-center gap-1">
          {DAT_LENSES.map((lens) => (
            <button
              key={lens.value}
              onClick={() =>
                onDATLensChange(filters.datLens === lens.value ? undefined : lens.value)
              }
              className={`
                px-2 py-1 rounded text-xs font-medium transition-colors
                ${filters.datLens === lens.value
                  ? 'bg-purple-100 text-purple-700'
                  : 'text-gray-500 hover:bg-gray-100'
                }
              `}
            >
              {lens.label}
            </button>
          ))}
        </div>
      </div>

      {/* Row 3: Quick Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* High-Yield Toggle */}
          <button
            onClick={onHighYieldToggle}
            className={`
              flex items-center gap-1 px-2 py-1 rounded text-xs font-medium
              transition-colors border
              ${filters.highYieldOnly
                ? 'bg-red-100 text-red-700 border-red-200'
                : 'text-gray-500 border-gray-200 hover:bg-gray-50'
              }
            `}
          >
            <span className={`w-2 h-2 rounded-full ${filters.highYieldOnly ? 'bg-red-500' : 'bg-gray-300'}`} />
            High-Yield Only
          </button>

          {/* Show Pearls Toggle */}
          <button
            onClick={onShowPearlsToggle}
            className={`
              flex items-center gap-1 px-2 py-1 rounded text-xs font-medium
              transition-colors border
              ${filters.showPearls
                ? 'bg-amber-100 text-amber-700 border-amber-200'
                : 'text-gray-500 border-gray-200 hover:bg-gray-50'
              }
            `}
          >
            💡 Pearls
          </button>

          {/* Priority Pills */}
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={() => togglePriority('high')}
              className={`
                w-6 h-6 rounded-full text-xs font-bold transition-all
                ${filters.priorityFilter.includes('high')
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-200 text-gray-400'
                }
              `}
              title="High priority"
            >
              H
            </button>
            <button
              onClick={() => togglePriority('medium')}
              className={`
                w-6 h-6 rounded-full text-xs font-bold transition-all
                ${filters.priorityFilter.includes('medium')
                  ? 'bg-yellow-500 text-white'
                  : 'bg-gray-200 text-gray-400'
                }
              `}
              title="Medium priority"
            >
              M
            </button>
            <button
              onClick={() => togglePriority('low')}
              className={`
                w-6 h-6 rounded-full text-xs font-bold transition-all
                ${filters.priorityFilter.includes('low')
                  ? 'bg-gray-500 text-white'
                  : 'bg-gray-200 text-gray-400'
                }
              `}
              title="Low priority"
            >
              L
            </button>
          </div>
        </div>

        {/* Reset Button */}
        <button
          onClick={onReset}
          className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          Reset filters
        </button>
      </div>
    </div>
  );
};

export default FilterBar;
