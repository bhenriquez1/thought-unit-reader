// components/surgeonView2/SurgeonStackPanel.tsx
// Main panel containing concepts, clusters, and pearls with filtering

import React, { useMemo } from 'react';
import type {
  CoreConceptV2,
  ConceptCluster,
  Pearl,
  ViewFilters,
  ConceptTag,
} from '../../lib/surgeonView2/types';
import ConceptCard from './ConceptCard';
import ClusterCard from './ClusterCard';
import PearlCard from './PearlCard';
import FilterBar from './FilterBar';

interface SurgeonStackPanelProps {
  documentId: string;
  pageNumber: number;
  concepts: CoreConceptV2[];
  clusters: ConceptCluster[];
  pearls: Pearl[];
  filters: ViewFilters;
  selectedConceptId: string | null;
  selectedPearlId: string | null;
  isExtracting: boolean;
  extractionProgress: number;
  onConceptClick: (concept: CoreConceptV2) => void;
  onPearlClick: (pearl: Pearl) => void;
  onTagChange: (conceptId: string, tags: ConceptTag[]) => void;
  onFilterChange: (filters: Partial<ViewFilters>) => void;
  onClusterToggle: (clusterId: string) => void;
  onJumpToSource: (concept: CoreConceptV2 | Pearl) => void;
}

export const SurgeonStackPanel: React.FC<SurgeonStackPanelProps> = ({
  documentId,
  pageNumber,
  concepts,
  clusters,
  pearls,
  filters,
  selectedConceptId,
  selectedPearlId,
  isExtracting,
  extractionProgress,
  onConceptClick,
  onPearlClick,
  onTagChange,
  onFilterChange,
  onClusterToggle,
  onJumpToSource,
}) => {
  // Filter concepts based on current filters
  const filteredConcepts = useMemo(() => {
    return concepts.filter((concept) => {
      // Priority filter
      if (!filters.priorityFilter.includes(concept.priority)) {
        return false;
      }

      // High-yield only
      if (filters.highYieldOnly && concept.priority !== 'high') {
        return false;
      }

      // Tag filters
      if (!filters.showDefinitions && concept.tags.includes('definition')) {
        return false;
      }
      if (!filters.showProcesses && concept.tags.includes('process')) {
        return false;
      }
      if (!filters.showExamples && concept.tags.includes('example')) {
        return false;
      }

      return true;
    });
  }, [concepts, filters]);

  // Filter pearls
  const filteredPearls = useMemo(() => {
    if (!filters.showPearls) return [];

    return pearls.filter((pearl) => {
      if (filters.highYieldOnly && pearl.priority !== 'high') {
        return false;
      }
      return true;
    });
  }, [pearls, filters]);

  // Group concepts by cluster
  const clusteredConcepts = useMemo(() => {
    const grouped: Record<string, CoreConceptV2[]> = {};
    const unclustered: CoreConceptV2[] = [];

    filteredConcepts.forEach((concept) => {
      if (concept.clusterId) {
        if (!grouped[concept.clusterId]) {
          grouped[concept.clusterId] = [];
        }
        grouped[concept.clusterId].push(concept);
      } else {
        unclustered.push(concept);
      }
    });

    return { grouped, unclustered };
  }, [filteredConcepts]);

  // Stats for header
  const stats = useMemo(() => ({
    total: concepts.length,
    filtered: filteredConcepts.length,
    highYield: concepts.filter((c) => c.priority === 'high').length,
    pearls: filteredPearls.length,
  }), [concepts, filteredConcepts, filteredPearls]);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Filter bar */}
      <FilterBar
        filters={filters}
        onViewModeChange={(mode) => onFilterChange({ mode })}
        onDATLensChange={(datLens) => onFilterChange({ datLens })}
        onHighYieldToggle={() => onFilterChange({ highYieldOnly: !filters.highYieldOnly })}
        onShowPearlsToggle={() => onFilterChange({ showPearls: !filters.showPearls })}
        onPriorityChange={(priorityFilter) => onFilterChange({ priorityFilter })}
        onReset={() => onFilterChange({
          mode: 'study',
          datLens: undefined,
          highYieldOnly: false,
          showPearls: true,
          showDefinitions: true,
          showProcesses: true,
          showExamples: true,
          priorityFilter: ['high', 'medium', 'low'],
        })}
      />

      {/* Stats header */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-600">
            Page <span className="font-semibold">{pageNumber}</span>
          </span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-600">
            <span className="font-semibold text-blue-600">{stats.filtered}</span>
            {stats.filtered !== stats.total && (
              <span className="text-gray-400"> / {stats.total}</span>
            )}{' '}
            concepts
          </span>
          {stats.highYield > 0 && (
            <>
              <span className="text-gray-400">|</span>
              <span className="text-red-600 font-medium">
                {stats.highYield} high-yield
              </span>
            </>
          )}
          {stats.pearls > 0 && (
            <>
              <span className="text-gray-400">|</span>
              <span className="text-amber-600 font-medium">
                {stats.pearls} pearls
              </span>
            </>
          )}
        </div>
      </div>

      {/* Extraction progress */}
      {isExtracting && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
          <div className="flex items-center gap-3">
            <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
            <span className="text-sm text-blue-700">
              Extracting concepts... {extractionProgress}%
            </span>
          </div>
          <div className="mt-1 h-1 bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${extractionProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Pearls section (if enabled) */}
        {filteredPearls.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1">
              <span>💡</span> Pearls
            </h2>
            <div className="space-y-2">
              {filteredPearls.map((pearl) => (
                <PearlCard
                  key={pearl.id}
                  pearl={pearl}
                  isSelected={selectedPearlId === pearl.id}
                  onClick={() => onPearlClick(pearl)}
                  onJumpToSource={() => onJumpToSource(pearl)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Clustered concepts */}
        {clusters.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Concept Clusters
            </h2>
            <div className="space-y-3">
              {clusters.map((cluster) => {
                const clusterConcepts = clusteredConcepts.grouped[cluster.id] || [];
                if (clusterConcepts.length === 0) return null;

                return (
                  <ClusterCard
                    key={cluster.id}
                    cluster={cluster}
                    concepts={clusterConcepts}
                    isCollapsed={cluster.collapsed}
                    selectedConceptId={selectedConceptId}
                    onToggle={() => onClusterToggle(cluster.id)}
                    onConceptClick={onConceptClick}
                    onConceptTagChange={onTagChange}
                    onJumpToSource={onJumpToSource}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Unclustered concepts */}
        {clusteredConcepts.unclustered.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {clusters.length > 0 ? 'Other Concepts' : 'Concepts'}
            </h2>
            <div className="space-y-2">
              {clusteredConcepts.unclustered.map((concept) => (
                <ConceptCard
                  key={concept.id}
                  concept={concept}
                  isSelected={selectedConceptId === concept.id}
                  onClick={() => onConceptClick(concept)}
                  onTagChange={(tags) => onTagChange(concept.id, tags)}
                  onJumpToSource={() => onJumpToSource(concept)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {!isExtracting && filteredConcepts.length === 0 && filteredPearls.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-4xl mb-3">📚</div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              No concepts found
            </h3>
            <p className="text-sm text-gray-500 max-w-sm">
              {concepts.length > 0
                ? 'Try adjusting your filters to see more concepts.'
                : 'Concepts will appear here as you navigate through the document.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SurgeonStackPanel;
