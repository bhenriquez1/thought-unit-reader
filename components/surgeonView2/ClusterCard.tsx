// components/surgeonView2/ClusterCard.tsx
// Collapsible cluster card containing grouped concepts

import React from 'react';
import type { ConceptCluster, CoreConceptV2 } from '../../lib/surgeonView2/types';
import ConceptCard from './ConceptCard';

interface ClusterCardProps {
  cluster: ConceptCluster;
  concepts: CoreConceptV2[];
  isCollapsed: boolean;
  selectedConceptId: string | null;
  onToggle: () => void;
  onConceptClick: (concept: CoreConceptV2) => void;
  onConceptTagChange: (conceptId: string, tags: any[]) => void;
  onJumpToSource: (concept: CoreConceptV2) => void;
}

// Priority indicator colors
const PRIORITY_BADGE: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-yellow-500',
  low: 'bg-gray-400',
};

export const ClusterCard: React.FC<ClusterCardProps> = ({
  cluster,
  concepts,
  isCollapsed,
  selectedConceptId,
  onToggle,
  onConceptClick,
  onConceptTagChange,
  onJumpToSource,
}) => {
  // Count by priority
  const highCount = concepts.filter((c) => c.priority === 'high').length;
  const mediumCount = concepts.filter((c) => c.priority === 'medium').length;

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      {/* Cluster header - always visible */}
      <button
        onClick={onToggle}
        className="
          w-full flex items-center justify-between p-3
          hover:bg-gray-50 transition-colors
          text-left
        "
      >
        <div className="flex items-center gap-3">
          {/* Expand/collapse chevron */}
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
              isCollapsed ? '' : 'rotate-90'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>

          {/* Cluster title */}
          <div>
            <h3 className="font-semibold text-gray-900">{cluster.title}</h3>
            {cluster.subtitle && (
              <p className="text-xs text-gray-500">{cluster.subtitle}</p>
            )}
          </div>
        </div>

        {/* Right side: counts & page range */}
        <div className="flex items-center gap-3">
          {/* Priority dots */}
          <div className="flex items-center gap-1">
            {highCount > 0 && (
              <span className="flex items-center gap-0.5">
                <span className={`w-2 h-2 rounded-full ${PRIORITY_BADGE.high}`} />
                <span className="text-xs text-gray-600">{highCount}</span>
              </span>
            )}
            {mediumCount > 0 && (
              <span className="flex items-center gap-0.5 ml-1">
                <span className={`w-2 h-2 rounded-full ${PRIORITY_BADGE.medium}`} />
                <span className="text-xs text-gray-600">{mediumCount}</span>
              </span>
            )}
          </div>

          {/* Total count badge */}
          <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-600">
            {concepts.length} concepts
          </span>

          {/* Page range */}
          <span className="text-xs text-gray-500">
            p.{cluster.pageRange.start + 1}
            {cluster.pageRange.end !== cluster.pageRange.start && (
              <>–{cluster.pageRange.end + 1}</>
            )}
          </span>
        </div>
      </button>

      {/* Expanded content */}
      {!isCollapsed && (
        <div className="border-t border-gray-100 p-3 space-y-2 bg-gray-50">
          {concepts.map((concept) => (
            <ConceptCard
              key={concept.id}
              concept={concept}
              isSelected={selectedConceptId === concept.id}
              onClick={() => onConceptClick(concept)}
              onTagChange={(tags) => onConceptTagChange(concept.id, tags)}
              onJumpToSource={() => onJumpToSource(concept)}
            />
          ))}

          {concepts.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              No concepts in this cluster
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ClusterCard;
