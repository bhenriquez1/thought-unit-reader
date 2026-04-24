// components/surgeonView2/CockpitHeader.tsx
// Surgeon View 2.0 Cockpit Header

import React from 'react';
import type { PatternClusterKind } from '@/lib/relationshipSchema/types';

interface CockpitHeaderProps {
  documentTitle: string;
  expertModeEnabled: boolean;
  filterByKind?: PatternClusterKind;
  filterByConfidence: number;
  isExtracting: boolean;
  extractionProgress: number;
  stats: {
    concepts: number;
    relations: number;
    clusters: number;
    rules: number;
    avgConfidence: number;
  };
  onToggleExpertMode: () => void;
  onFilterByKind: (kind: PatternClusterKind | undefined) => void;
  onFilterByConfidence: (confidence: number) => void;
  onExtract: () => void;
  canExtract: boolean;
}

const KIND_OPTIONS: { value: PatternClusterKind | 'all'; label: string; icon: string }[] = [
  { value: 'all', label: 'All', icon: '🔍' },
  { value: 'process', label: 'Process', icon: '⚙️' },
  { value: 'causal', label: 'Causal', icon: '➡️' },
  { value: 'diagnostic', label: 'Diagnostic', icon: '🩺' },
  { value: 'risk', label: 'Risk', icon: '⚠️' },
  { value: 'exception', label: 'Exception', icon: '❗' },
];

export const CockpitHeader: React.FC<CockpitHeaderProps> = ({
  documentTitle,
  expertModeEnabled,
  filterByKind,
  filterByConfidence,
  isExtracting,
  extractionProgress,
  stats,
  onToggleExpertMode,
  onFilterByKind,
  onFilterByConfidence,
  onExtract,
  canExtract,
}) => {
  return (
    <div className="border-b border-gray-700 bg-gradient-to-r from-gray-800 to-gray-850">
      {/* Top row: Title + Stats + Expert toggle */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎯</span>
          <div>
            <h1 className="text-lg font-bold text-white">Surgeon View</h1>
            <p className="text-xs text-gray-400 truncate max-w-[200px]">{documentTitle}</p>
            {/* Build SHA indicator — confirms the deployed build is current */}
            {process.env.NEXT_PUBLIC_BUILD_SHA && (
              <p className="text-[9px] font-mono text-gray-600 select-none">
                build {process.env.NEXT_PUBLIC_BUILD_SHA}
              </p>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4">
          <StatBadge label="Relations" value={stats.relations} icon="🔗" />
          <StatBadge label="Clusters" value={stats.clusters} icon="📊" />
          <StatBadge label="Rules" value={stats.rules} icon="📋" />
          <ConfidenceBadge value={stats.avgConfidence} />
        </div>

        {/* Expert Mode Toggle */}
        <button
          onClick={onToggleExpertMode}
          className={`
            px-4 py-2 rounded-lg text-sm font-medium transition-all
            ${expertModeEnabled
              ? 'bg-purple-600 text-white ring-2 ring-purple-400'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }
          `}
        >
          {expertModeEnabled ? '🎯 Expert ON' : '👁️ Normal'}
        </button>
      </div>

      {/* Bottom row: Filters + Extract button */}
      <div className="flex items-center justify-between px-4 pb-3">
        {/* Filter by Kind */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Filter:</span>
          <div className="flex gap-1">
            {KIND_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => onFilterByKind(option.value === 'all' ? undefined : option.value)}
                className={`
                  px-2 py-1 rounded text-xs font-medium transition-colors
                  ${(option.value === 'all' && !filterByKind) || filterByKind === option.value
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }
                `}
              >
                <span className="mr-1">{option.icon}</span>
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Confidence slider */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Min confidence:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={filterByConfidence * 100}
            onChange={(e) => onFilterByConfidence(parseInt(e.target.value) / 100)}
            className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <span className="text-xs text-gray-300 w-8">{Math.round(filterByConfidence * 100)}%</span>
        </div>

        {/* Extract button */}
        <button
          onClick={onExtract}
          disabled={!canExtract || isExtracting}
          className={`
            px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2
            ${isExtracting
              ? 'bg-amber-600 text-white'
              : canExtract
                ? 'bg-teal-600 text-white hover:bg-teal-500'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }
          `}
        >
          {isExtracting ? (
            <>
              <span className="animate-spin">⚙️</span>
              Extracting {Math.round(extractionProgress * 100)}%
            </>
          ) : (
            <>
              <span>🔬</span>
              Extract Relations
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// Sub-components
const StatBadge: React.FC<{ label: string; value: number; icon: string }> = ({ label, value, icon }) => (
  <div className="flex items-center gap-1 px-2 py-1 bg-gray-800 rounded">
    <span className="text-sm">{icon}</span>
    <span className="text-sm font-bold text-white">{value}</span>
    <span className="text-xs text-gray-400">{label}</span>
  </div>
);

const ConfidenceBadge: React.FC<{ value: number }> = ({ value }) => {
  const percent = Math.round(value * 100);
  const color = percent >= 80 ? 'text-green-400' : percent >= 60 ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-gray-800 rounded">
      <span className={`text-sm font-bold ${color}`}>{percent}%</span>
      <span className="text-xs text-gray-400">avg</span>
    </div>
  );
};

export default CockpitHeader;
