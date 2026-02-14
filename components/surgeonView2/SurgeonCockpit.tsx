// components/surgeonView2/SurgeonCockpit.tsx
// Surgeon View 2.0 - Relationship-First Cockpit
// Layout: Left rail (clusters) | Main (relations) | Right overlay (insights)

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useRelationshipStore } from '@/lib/relationshipSchema/store';
import type { PatternCluster, Relation, PatternClusterKind, DecisionRule } from '@/lib/relationshipSchema/types';
import ClusterRail from './ClusterRail';
import RelationPanel from './RelationPanel';
import InsightOverlay from './InsightOverlay';
import CockpitHeader from './CockpitHeader';

interface SurgeonCockpitProps {
  documentId: string;
  documentTitle: string;
  onJumpToPage: (page: number) => void;
  pageTexts?: Map<number, string>;
}

export const SurgeonCockpit: React.FC<SurgeonCockpitProps> = ({
  documentId,
  documentTitle,
  onJumpToPage,
  pageTexts,
}) => {
  const {
    concepts,
    relations,
    clusters,
    rules,
    selectedClusterId,
    selectedRelationId,
    expertModeEnabled,
    filterByKind,
    filterByConfidence,
    isExtracting,
    extractionProgress,
    extractionError,
    extractFromMultiplePages,
    selectCluster,
    selectRelation,
    toggleExpertMode,
    setFilterByKind,
    setFilterByConfidence,
    getCockpitViewData,
    getRelationsForCluster,
    getChainsFromCluster,
    setDocId,
  } = useRelationshipStore();

  const [showInsightOverlay, setShowInsightOverlay] = useState(false);
  const [selectedInsightTarget, setSelectedInsightTarget] = useState<{
    type: 'relation' | 'cluster' | 'rule';
    id: string;
  } | null>(null);
  const [extractionStatus, setExtractionStatus] = useState<string>('');
  const hasAutoExtracted = useRef(false);

  // Set document ID on mount
  useEffect(() => {
    if (documentId) {
      setDocId(documentId);
    }
  }, [documentId, setDocId]);

  // Auto-extract on first load if we have pages and no relations yet
  useEffect(() => {
    if (
      pageTexts &&
      pageTexts.size > 0 &&
      Object.keys(relations).length === 0 &&
      !isExtracting &&
      !hasAutoExtracted.current
    ) {
      hasAutoExtracted.current = true;
      console.log('🔬 Cockpit: Auto-extracting from', pageTexts.size, 'pages');
      handleExtract();
    }
  }, [pageTexts, relations, isExtracting]);

  // Computed data
  const cockpitData = getCockpitViewData();
  const selectedCluster = selectedClusterId ? clusters[selectedClusterId] : null;
  const selectedRelation = selectedRelationId ? relations[selectedRelationId] : null;

  // Get relations for selected cluster
  const activeRelations = selectedClusterId
    ? getRelationsForCluster(selectedClusterId)
    : Object.values(relations).filter(r => r.confidence >= filterByConfidence);

  // Get chains for selected cluster
  const chains = selectedClusterId
    ? getChainsFromCluster(selectedClusterId)
    : [];

  // Handle extraction with detailed logging
  const handleExtract = useCallback(async () => {
    if (!pageTexts || pageTexts.size === 0) {
      console.warn('🔬 Cockpit: No pageTexts available for extraction');
      setExtractionStatus('No page text available');
      return;
    }

    // Log what we're extracting
    const pages = Array.from(pageTexts.entries()).map(([pageIndex, text]) => ({
      pageIndex,
      text,
    }));

    console.log('🔬 Cockpit: Starting extraction');
    console.log('🔬 Cockpit: Pages to extract:', pages.length);
    console.log('🔬 Cockpit: Text lengths:', pages.map(p => `p${p.pageIndex}:${p.text.length}chars`).join(', '));

    // Check if any page has actual text
    const pagesWithText = pages.filter(p => p.text.trim().length > 50);
    if (pagesWithText.length === 0) {
      console.warn('🔬 Cockpit: All pages have insufficient text');
      setExtractionStatus('Pages have no extractable text');
      return;
    }

    setExtractionStatus(`Extracting from ${pagesWithText.length} pages...`);

    try {
      await extractFromMultiplePages(pagesWithText);
      setExtractionStatus('');
      console.log('🔬 Cockpit: Extraction complete');
    } catch (error) {
      console.error('🔬 Cockpit: Extraction failed:', error);
      setExtractionStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [pageTexts, extractFromMultiplePages]);

  // Handle relation click - open insight overlay
  const handleRelationClick = useCallback((relation: Relation) => {
    selectRelation(relation.id);
    setSelectedInsightTarget({ type: 'relation', id: relation.id });
    setShowInsightOverlay(true);
  }, [selectRelation]);

  // Handle cluster click
  const handleClusterClick = useCallback((cluster: PatternCluster) => {
    selectCluster(cluster.id);
  }, [selectCluster]);

  // Handle cluster insight click
  const handleClusterInsightClick = useCallback((cluster: PatternCluster) => {
    setSelectedInsightTarget({ type: 'cluster', id: cluster.id });
    setShowInsightOverlay(true);
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Header */}
      <CockpitHeader
        documentTitle={documentTitle}
        expertModeEnabled={expertModeEnabled}
        filterByKind={filterByKind}
        filterByConfidence={filterByConfidence}
        isExtracting={isExtracting}
        extractionProgress={extractionProgress}
        stats={{
          concepts: cockpitData.totalConcepts,
          relations: cockpitData.totalRelations,
          clusters: cockpitData.totalClusters,
          rules: cockpitData.totalRules,
          avgConfidence: cockpitData.avgConfidence,
        }}
        onToggleExpertMode={toggleExpertMode}
        onFilterByKind={setFilterByKind}
        onFilterByConfidence={setFilterByConfidence}
        onExtract={handleExtract}
        canExtract={!!pageTexts && pageTexts.size > 0}
      />

      {/* Status/Error Banner */}
      {(extractionStatus || extractionError) && (
        <div className={`px-4 py-2 text-sm ${extractionError ? 'bg-red-900/50 text-red-300' : 'bg-blue-900/50 text-blue-300'}`}>
          {extractionError || extractionStatus}
        </div>
      )}

      {/* Debug info (dev mode) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="px-4 py-1 bg-gray-800 text-xs text-gray-500 flex gap-4">
          <span>Pages: {pageTexts?.size || 0}</span>
          <span>Relations: {Object.keys(relations).length}</span>
          <span>Clusters: {Object.keys(clusters).length}</span>
          <span>Extracting: {isExtracting ? 'Yes' : 'No'}</span>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Rail: Cluster List */}
        <div className="w-72 border-r border-gray-700 overflow-y-auto">
          <ClusterRail
            clusterGroups={cockpitData.clusterGroups}
            selectedClusterId={selectedClusterId}
            expertMode={expertModeEnabled}
            onSelectCluster={handleClusterClick}
            onClusterInsightClick={handleClusterInsightClick}
          />
        </div>

        {/* Main Panel: Relations */}
        <div className="flex-1 overflow-y-auto">
          <RelationPanel
            relations={activeRelations}
            concepts={concepts}
            chains={chains}
            selectedRelationId={selectedRelationId}
            selectedCluster={selectedCluster}
            expertMode={expertModeEnabled}
            onRelationClick={handleRelationClick}
            onJumpToPage={onJumpToPage}
          />
        </div>
      </div>

      {/* Right Overlay: Insight Panel (appears on click) */}
      {showInsightOverlay && selectedInsightTarget && (
        <InsightOverlay
          targetType={selectedInsightTarget.type}
          targetId={selectedInsightTarget.id}
          relation={selectedInsightTarget.type === 'relation' ? relations[selectedInsightTarget.id] : undefined}
          cluster={selectedInsightTarget.type === 'cluster' ? clusters[selectedInsightTarget.id] : undefined}
          rule={selectedInsightTarget.type === 'rule' ? rules[selectedInsightTarget.id] : undefined}
          concepts={concepts}
          relations={relations}
          clusters={clusters}
          onClose={() => {
            setShowInsightOverlay(false);
            setSelectedInsightTarget(null);
          }}
          onJumpToPage={onJumpToPage}
        />
      )}
    </div>
  );
};

export default SurgeonCockpit;
