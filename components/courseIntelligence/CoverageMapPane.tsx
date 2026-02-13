// components/courseIntelligence/CoverageMapPane.tsx
// Center Pane: Coverage Map (Objectives → TOC → Clusters)

import React from 'react';
import type { CoverageGraph, CoverageNode } from '@/lib/courseIntelligence/types';

interface CoverageMapPaneProps {
  coverageGraph: CoverageGraph | null;
  highYieldOnly: boolean;
  selectedExamId?: string;
  onSelectNode: (nodeId: string, nodeType: 'objective' | 'toc' | 'cluster') => void;
  onAddToPlan: (nodeId: string) => void;
  onExplain: (nodeId: string) => void;
  onStudy: (nodeId: string) => void;
  onJumpToPage: (page: number) => void;
}

export const CoverageMapPane: React.FC<CoverageMapPaneProps> = ({
  coverageGraph,
  highYieldOnly,
  selectedExamId,
  onSelectNode,
  onAddToPlan,
  onExplain,
  onStudy,
  onJumpToPage,
}) => {
  if (!coverageGraph) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Summary Bar */}
      <CoverageSummaryBar
        coveragePercent={coverageGraph.coveragePercent}
        weakClustersCount={coverageGraph.weakClustersCount}
        dueSoonCount={coverageGraph.dueSoonCount}
        lowConfidenceCount={coverageGraph.lowConfidenceCount}
      />

      {/* Filter Info */}
      {(highYieldOnly || selectedExamId) && (
        <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center gap-2">
          {highYieldOnly && (
            <span className="text-xs px-2 py-1 bg-amber-900/50 text-amber-300 rounded">
              ⭐ High-Yield Only
            </span>
          )}
          {selectedExamId && (
            <span className="text-xs px-2 py-1 bg-red-900/50 text-red-300 rounded">
              📝 Filtered for Exam
            </span>
          )}
        </div>
      )}

      {/* Coverage Tree */}
      <div className="flex-1 overflow-y-auto p-4">
        {coverageGraph.lowConfidenceCount > 0 && (
          <div className="mb-4 p-3 bg-amber-900/20 border border-amber-700/50 rounded-lg">
            <h3 className="text-sm font-medium text-amber-300 mb-2">
              ⚠️ Low Confidence Mappings ({coverageGraph.lowConfidenceCount})
            </h3>
            <p className="text-xs text-gray-400">
              Some syllabus topics couldn't be confidently matched to book sections.
              Review and correct these for better planning.
            </p>
          </div>
        )}

        {coverageGraph.roots.length > 0 ? (
          <div className="space-y-2">
            {coverageGraph.roots.map((node) => (
              <CoverageNodeCard
                key={node.id}
                node={node}
                depth={0}
                onSelect={() => onSelectNode(node.id, node.type)}
                onAddToPlan={() => onAddToPlan(node.id)}
                onExplain={() => onExplain(node.id)}
                onStudy={() => onStudy(node.id)}
                onJumpToPage={onJumpToPage}
              />
            ))}
          </div>
        ) : (
          <NoMappingsState />
        )}
      </div>
    </div>
  );
};

// Coverage Summary Bar
const CoverageSummaryBar: React.FC<{
  coveragePercent: number;
  weakClustersCount: number;
  dueSoonCount: number;
  lowConfidenceCount: number;
}> = ({ coveragePercent, weakClustersCount, dueSoonCount, lowConfidenceCount }) => (
  <div className="px-4 py-3 bg-gradient-to-r from-gray-800 to-gray-850 border-b border-gray-700">
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-sm font-semibold text-white flex items-center gap-2">
        <span>📊</span> Coverage Map
      </h2>
      <span className="text-lg font-bold text-teal-400">{coveragePercent}%</span>
    </div>

    {/* Progress bar */}
    <div className="h-2 bg-gray-700 rounded-full overflow-hidden mb-3">
      <div
        className={`h-full transition-all ${
          coveragePercent >= 80 ? 'bg-green-500' :
          coveragePercent >= 50 ? 'bg-yellow-500' : 'bg-red-500'
        }`}
        style={{ width: `${coveragePercent}%` }}
      />
    </div>

    {/* Stats */}
    <div className="flex items-center gap-4 text-xs">
      <div className="flex items-center gap-1">
        <span className="text-red-400">●</span>
        <span className="text-gray-400">{weakClustersCount} weak clusters</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-amber-400">●</span>
        <span className="text-gray-400">{dueSoonCount} due soon</span>
      </div>
      {lowConfidenceCount > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-yellow-400">●</span>
          <span className="text-gray-400">{lowConfidenceCount} needs review</span>
        </div>
      )}
    </div>
  </div>
);

// Coverage Node Card
const CoverageNodeCard: React.FC<{
  node: CoverageNode;
  depth: number;
  onSelect: () => void;
  onAddToPlan: () => void;
  onExplain: () => void;
  onStudy: () => void;
  onJumpToPage: (page: number) => void;
}> = ({ node, depth, onSelect, onAddToPlan, onExplain, onStudy, onJumpToPage }) => {
  const [expanded, setExpanded] = React.useState(depth < 2);

  const typeStyles: Record<string, { bg: string; icon: string }> = {
    objective: { bg: 'bg-blue-900/30 border-blue-700/50', icon: '📋' },
    toc: { bg: 'bg-purple-900/30 border-purple-700/50', icon: '📖' },
    cluster: { bg: 'bg-teal-900/30 border-teal-700/50', icon: '🔗' },
  };

  const style = typeStyles[node.type] || typeStyles.toc;

  const getMasteryColor = (score?: number) => {
    if (!score) return 'bg-gray-600';
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getConfidenceColor = (score?: number) => {
    if (!score) return 'text-gray-400';
    if (score >= 0.7) return 'text-green-400';
    if (score >= 0.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div
        className={`
          p-3 rounded-lg border ${style.bg} transition-all cursor-pointer
          hover:border-gray-500
        `}
      >
        <div className="flex items-start justify-between">
          {/* Title and badges */}
          <div className="flex-1 min-w-0" onClick={onSelect}>
            <div className="flex items-center gap-2">
              {node.children.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(!expanded);
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  {expanded ? '▼' : '▶'}
                </button>
              )}
              <span>{style.icon}</span>
              <span className="font-medium text-white text-sm truncate">{node.title}</span>
              {node.isHighYield && (
                <span className="text-xs px-1.5 py-0.5 bg-amber-600 text-white rounded">HY</span>
              )}
            </div>

            {/* Badges row */}
            <div className="flex items-center gap-2 mt-1">
              {node.mappingConfidence !== undefined && (
                <span className={`text-xs ${getConfidenceColor(node.mappingConfidence)}`}>
                  {Math.round(node.mappingConfidence * 100)}% match
                </span>
              )}
              {node.masteryScore !== undefined && (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <span className={`w-2 h-2 rounded-full ${getMasteryColor(node.masteryScore)}`} />
                  {node.masteryScore}% mastery
                </span>
              )}
              {node.pageRange && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onJumpToPage(node.pageRange!.start);
                  }}
                  className="text-xs text-teal-400 hover:text-teal-300"
                >
                  p.{node.pageRange.start}-{node.pageRange.end}
                </button>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-1 ml-2">
            <ActionButton icon="📖" title="Study" onClick={onStudy} />
            <ActionButton icon="🎙️" title="Explain" onClick={onExplain} />
            <ActionButton icon="+" title="Add to Plan" onClick={onAddToPlan} />
          </div>
        </div>
      </div>

      {/* Children */}
      {expanded && node.children.length > 0 && (
        <div className="mt-1 space-y-1">
          {node.children.map((child) => (
            <CoverageNodeCard
              key={child.id}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              onAddToPlan={onAddToPlan}
              onExplain={onExplain}
              onStudy={onStudy}
              onJumpToPage={onJumpToPage}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Action Button
const ActionButton: React.FC<{
  icon: string;
  title: string;
  onClick: () => void;
}> = ({ icon, title, onClick }) => (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    title={title}
    className="p-1.5 hover:bg-gray-700 rounded transition-colors"
  >
    <span className="text-sm">{icon}</span>
  </button>
);

// Empty State
const EmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full text-center p-8">
    <span className="text-5xl mb-4">📊</span>
    <h3 className="text-lg font-medium text-white mb-2">No Coverage Data Yet</h3>
    <p className="text-sm text-gray-400 max-w-sm">
      Upload a syllabus and we'll map it to your book's table of contents
      to show your coverage.
    </p>
  </div>
);

// No Mappings State
const NoMappingsState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <span className="text-4xl mb-3">🔗</span>
    <h3 className="text-sm font-medium text-white mb-1">No Mappings Found</h3>
    <p className="text-xs text-gray-400">
      The syllabus couldn't be mapped to book sections.
      Try uploading a different syllabus format.
    </p>
  </div>
);

export default CoverageMapPane;
