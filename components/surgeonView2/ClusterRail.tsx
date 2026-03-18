// components/surgeonView2/ClusterRail.tsx
// Left rail: Cluster list grouped by kind

import React from 'react';
import type { PatternCluster, PatternClusterKind } from '@/lib/relationshipSchema/types';
import { sanitizeRenderText } from '@/lib/page-intelligence/outputSanitizer';

interface ClusterGroup {
  kind: PatternClusterKind;
  clusters: PatternCluster[];
  relationCount: number;
}

interface ClusterRailProps {
  clusterGroups: ClusterGroup[];
  selectedClusterId?: string;
  expertMode: boolean;
  onSelectCluster: (cluster: PatternCluster) => void;
  onClusterInsightClick: (cluster: PatternCluster) => void;
}

const KIND_ICONS: Record<PatternClusterKind, { icon: string; color: string; bgColor: string }> = {
  process: { icon: '⚙️', color: 'text-blue-400', bgColor: 'bg-blue-900/30' },
  causal: { icon: '➡️', color: 'text-green-400', bgColor: 'bg-green-900/30' },
  diagnostic: { icon: '🩺', color: 'text-purple-400', bgColor: 'bg-purple-900/30' },
  risk: { icon: '⚠️', color: 'text-red-400', bgColor: 'bg-red-900/30' },
  exception: { icon: '❗', color: 'text-amber-400', bgColor: 'bg-amber-900/30' },
};

export const ClusterRail: React.FC<ClusterRailProps> = ({
  clusterGroups,
  selectedClusterId,
  expertMode,
  onSelectCluster,
  onClusterInsightClick,
}) => {
  // Don't show empty developer artifacts - just render minimal header
  if (clusterGroups.length === 0) {
    return (
      <div className="p-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
          Pattern Clusters
        </h2>
        <p className="text-xs text-gray-500 italic">
          Extract a page to discover patterns.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
        Pattern Clusters
      </h2>

      <div className="space-y-6">
        {clusterGroups.map((group) => (
          <ClusterKindGroup
            key={group.kind}
            group={group}
            selectedClusterId={selectedClusterId}
            expertMode={expertMode}
            onSelectCluster={onSelectCluster}
            onClusterInsightClick={onClusterInsightClick}
          />
        ))}
      </div>
    </div>
  );
};

// Cluster Kind Group
const ClusterKindGroup: React.FC<{
  group: ClusterGroup;
  selectedClusterId?: string;
  expertMode: boolean;
  onSelectCluster: (cluster: PatternCluster) => void;
  onClusterInsightClick: (cluster: PatternCluster) => void;
}> = ({ group, selectedClusterId, expertMode, onSelectCluster, onClusterInsightClick }) => {
  const style = KIND_ICONS[group.kind];

  return (
    <div>
      {/* Kind Header */}
      <div className={`flex items-center gap-2 px-2 py-1 rounded ${style.bgColor} mb-2`}>
        <span>{style.icon}</span>
        <span className={`text-sm font-medium ${style.color}`}>
          {group.kind.charAt(0).toUpperCase() + group.kind.slice(1)}
        </span>
        <span className="text-xs text-gray-400 ml-auto">
          {group.clusters.length} clusters
        </span>
      </div>

      {/* Cluster List */}
      <div className="space-y-1">
        {group.clusters.map((cluster) => (
          <ClusterCard
            key={cluster.id}
            cluster={cluster}
            isSelected={selectedClusterId === cluster.id}
            expertMode={expertMode}
            kindStyle={style}
            onClick={() => onSelectCluster(cluster)}
            onInsightClick={() => onClusterInsightClick(cluster)}
          />
        ))}
      </div>
    </div>
  );
};

// Cluster Card
const ClusterCard: React.FC<{
  cluster: PatternCluster;
  isSelected: boolean;
  expertMode: boolean;
  kindStyle: { icon: string; color: string; bgColor: string };
  onClick: () => void;
  onInsightClick: () => void;
}> = ({ cluster, isSelected, expertMode, kindStyle, onClick, onInsightClick }) => {
  const title = sanitizeRenderText(cluster.title);
  const summary = sanitizeRenderText(cluster.summary);
  return (
    <div
      className={`
        p-2 rounded-lg cursor-pointer transition-all border
        ${isSelected
          ? `${kindStyle.bgColor} border-${kindStyle.color.replace('text-', '')}`
          : 'border-transparent hover:bg-gray-800'
        }
      `}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {title}
          </p>
          {!expertMode && summary && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">
              {summary}
            </p>
          )}
        </div>

        {/* Insight button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onInsightClick();
          }}
          className="p-1 hover:bg-gray-700 rounded ml-2"
          title="View insights"
        >
          <span className="text-sm">💡</span>
        </button>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-2 mt-2 text-xs">
        <span className="text-gray-400">
          {cluster.relationIds.length} rel
        </span>
        <ConfidenceMini value={cluster.confidence} />
        {cluster.refs.length > 0 && (
          <span className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300 flex items-center gap-1">
            <span>📄</span>
            <span>p.{cluster.refs[0].page}</span>
            {cluster.refs.length > 1 && <span className="text-gray-500">+{cluster.refs.length - 1}</span>}
          </span>
        )}
      </div>
    </div>
  );
};

// Mini confidence badge
const ConfidenceMini: React.FC<{ value: number }> = ({ value }) => {
  const percent = Math.round(value * 100);
  const color = percent >= 80 ? 'text-green-400' : percent >= 60 ? 'text-amber-400' : 'text-red-400';
  return <span className={`${color}`}>{percent}%</span>;
};

export default ClusterRail;
