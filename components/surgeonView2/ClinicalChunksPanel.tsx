// components/surgeonView2/ClinicalChunksPanel.tsx
// Clickable "Clinical Chunks" (Pattern Clusters) with page jumps
// Shows clusters as compact cards in Expert View

import React from 'react';
import type { PatternCluster, Pattern, PatternType } from '@/lib/surgeonEngine/types';

// ============================================================================
// Constants
// ============================================================================

const PATTERN_TYPE_ICONS: Record<PatternType, { icon: string; label: string; color: string }> = {
  PRESENTATION: { icon: '🔍', label: 'Presentation', color: 'text-cyan-400' },
  MECHANISM: { icon: '⚙️', label: 'Mechanism', color: 'text-orange-400' },
  DIAGNOSTIC_PATHWAY: { icon: '🧪', label: 'Diagnostic', color: 'text-green-400' },
  TREATMENT_PATHWAY: { icon: '💊', label: 'Treatment', color: 'text-blue-400' },
  RISK_PATTERN: { icon: '⚠️', label: 'Risk', color: 'text-red-400' },
  ANATOMY_FUNCTION: { icon: '🦴', label: 'Anatomy', color: 'text-purple-400' },
  DEFINITIONAL_SCHEMA: { icon: '📖', label: 'Definition', color: 'text-gray-400' },
};

// ============================================================================
// Main Panel
// ============================================================================

interface ClinicalChunksPanelProps {
  clusters: PatternCluster[];
  patterns: Record<string, Pattern[]>;
  selectedClusterId?: string;
  onSelectCluster: (clusterId: string) => void;
  onJumpToPage: (page: number) => void;
}

export const ClinicalChunksPanel: React.FC<ClinicalChunksPanelProps> = ({
  clusters,
  patterns,
  selectedClusterId,
  onSelectCluster,
  onJumpToPage,
}) => {
  if (clusters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <span className="text-3xl mb-2">🧩</span>
        <p className="text-sm text-gray-400">No clinical chunks yet</p>
        <p className="text-xs text-gray-500 mt-1">Extract content to discover patterns</p>
      </div>
    );
  }

  // Sort: clusters with more patterns first, then by importance score
  const sorted = [...clusters].sort((a, b) => {
    const scoreA = (a.importanceScore || 0) + a.patternIds.length * 5;
    const scoreB = (b.importanceScore || 0) + b.patternIds.length * 5;
    return scoreB - scoreA;
  });

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Clinical Chunks
        </h3>
        <span className="text-xs text-gray-500">
          {clusters.length} cluster{clusters.length !== 1 ? 's' : ''}
        </span>
      </div>

      {sorted.map((cluster) => (
        <ClusterCard
          key={cluster.clusterId}
          cluster={cluster}
          clusterPatterns={patterns[cluster.clusterId] || []}
          isSelected={selectedClusterId === cluster.clusterId}
          onSelect={() => onSelectCluster(cluster.clusterId)}
          onJumpToPage={onJumpToPage}
        />
      ))}
    </div>
  );
};

// ============================================================================
// Cluster Card
// ============================================================================

interface ClusterCardProps {
  cluster: PatternCluster;
  clusterPatterns: Pattern[];
  isSelected: boolean;
  onSelect: () => void;
  onJumpToPage: (page: number) => void;
}

const ClusterCard: React.FC<ClusterCardProps> = ({
  cluster,
  clusterPatterns,
  isSelected,
  onSelect,
  onJumpToPage,
}) => {
  return (
    <div
      className={`
        p-2.5 rounded-lg cursor-pointer transition-all border
        ${isSelected
          ? 'bg-teal-900/30 border-teal-500'
          : 'bg-gray-800/50 border-gray-700 hover:border-gray-600 hover:bg-gray-800'
        }
      `}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="flex items-start gap-2 mb-1.5">
        <span className="text-sm">🧩</span>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-white truncate">
            {cluster.name}
          </h4>
          {/* Pattern type badges */}
          <div className="flex flex-wrap gap-1 mt-1">
            {cluster.types.map((type) => {
              const config = PATTERN_TYPE_ICONS[type];
              return (
                <span
                  key={type}
                  className={`inline-flex items-center gap-0.5 text-[10px] ${config.color}`}
                >
                  <span>{config.icon}</span>
                  <span>{config.label}</span>
                </span>
              );
            })}
          </div>
        </div>
        <span className="text-[10px] text-gray-500">
          {cluster.patternIds.length} pat.
        </span>
      </div>

      {/* Preview: Top patterns (show max 2) */}
      {clusterPatterns.slice(0, 2).map((pattern) => (
        <div key={pattern.patternId} className="ml-5 mt-1">
          <p className="text-[11px] text-gray-300 line-clamp-1">
            {pattern.trigger}
          </p>
        </div>
      ))}

      {/* Footer: Page range + jump */}
      {cluster.pageRange && (
        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-700/50">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onJumpToPage(cluster.pageRange!.start);
            }}
            className="text-[10px] text-teal-400 hover:text-teal-300"
          >
            pp. {cluster.pageRange.start}–{cluster.pageRange.end}
          </button>
          {cluster.importanceScore !== undefined && (
            <ImportanceBar score={cluster.importanceScore} />
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Importance Bar (mini horizontal bar)
// ============================================================================

const ImportanceBar: React.FC<{ score: number }> = ({ score }) => {
  const width = Math.min(100, Math.max(0, score));
  const color = score >= 75 ? 'bg-amber-500' : score >= 55 ? 'bg-blue-500' : 'bg-gray-500';

  return (
    <div className="flex items-center gap-1">
      <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-[10px] text-gray-500">{score}</span>
    </div>
  );
};

export default ClinicalChunksPanel;
