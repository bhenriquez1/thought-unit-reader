// components/surgeonView2/SurgeonCockpit.tsx
// Expert View 2.1 - Minimal Layout with Evidence Spine
// Tabs: Priority | Explain | Compare | Insights (compact mode chips)
// Layout: Left rail (clusters) | Main (relations) | Right (comprehension tabs)

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useRelationshipStore } from '@/lib/relationshipSchema/store';
import { useNoteLabStore } from '@/lib/cognitiveEngine/noteLabStore';
import { useSurgeonEngineStore } from '@/lib/surgeonEngine/store';
import type { PatternCluster, Relation, PatternClusterKind, DecisionRule, RankedInsight } from '@/lib/relationshipSchema/types';
import ClusterRail from './ClusterRail';
import RelationPanel from './RelationPanel';
import PriorityFeedPanel from './PriorityFeedPanel';
import InsightOverlay from './InsightOverlay';
import CockpitHeader from './CockpitHeader';
import SmartSpeechControls from './SmartSpeechControls';
import DATDrillMode from '../apex/DATDrillMode';
import {
  isWebSpeechAvailable,
  generateInsightScript,
  scriptToPlainText,
  speakText,
  stopSpeech,
} from '@/lib/speechWhiteboard/smartSpeech';
import { enrichInsightsWithApex } from '@/lib/apex/patternLibrary';

// Expert View 2.1 tabs: minimal mode chips
type ComprehensionTab = 'priority' | 'explain' | 'compare' | 'insights';

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
    getRankedInsights,
    setDocId,
  } = useRelationshipStore();

  // Surgeon Engine Store
  const surgeonEngine = useSurgeonEngineStore();

  const [activeTab, setActiveTab] = useState<ComprehensionTab>('priority');
  const [selectedInsightId, setSelectedInsightId] = useState<string | undefined>();
  const [showInsightOverlay, setShowInsightOverlay] = useState(false);
  const [showDrillMode, setShowDrillMode] = useState(false);
  const [selectedInsightTarget, setSelectedInsightTarget] = useState<{
    type: 'relation' | 'cluster' | 'rule';
    id: string;
  } | null>(null);
  const [extractionStatus, setExtractionStatus] = useState<string>('');
  const hasAutoExtracted = useRef(false);
  const hasRunSurgeonEngines = useRef(false);

  // Set document ID on mount
  useEffect(() => {
    if (documentId) {
      setDocId(documentId);
      surgeonEngine.setBook(documentId, surgeonEngine.domain);
    }
  }, [documentId, setDocId]);

  // Run surgeon engines after extraction completes
  useEffect(() => {
    const relationCount = Object.keys(relations).length;
    if (relationCount > 0 && !isExtracting && !hasRunSurgeonEngines.current && pageTexts && pageTexts.size > 0) {
      hasRunSurgeonEngines.current = true;
      // Build ExtractedUnits from page texts for surgeon engines
      const units = Array.from(pageTexts.entries()).flatMap(([page, text]) => {
        // Split page text into paragraph-level units
        const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 20);
        return paragraphs.map((para, idx) => ({
          unitId: `u_${page}_${idx}`,
          bookId: documentId,
          page,
          text: para.trim(),
          cleanText: para.trim().toLowerCase(),
          source: 'viewport' as const,
          createdAt: new Date().toISOString(),
        }));
      });

      if (units.length > 0) {
        surgeonEngine.addUnits(units);
        surgeonEngine.runAllEngines();
      }
    }
  }, [relations, isExtracting, pageTexts, documentId]);

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

  // Get ranked insights with DAT Apex enrichment (memoized)
  const rankedInsights = useMemo(() => {
    const insights = getRankedInsights();
    return enrichInsightsWithApex(insights);
  }, [relations, clusters, rules, concepts, getRankedInsights]);

  // Filter insights for traps tab
  const trapInsights = useMemo(() => {
    return rankedInsights.filter(i => i.type === 'EXAM_TRAP' || i.trap);
  }, [rankedInsights]);

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

  // Handle ranked insight click
  const handleInsightClick = useCallback((insight: RankedInsight) => {
    setSelectedInsightId(insight.id);
    // If it's from a relation/cluster/rule, show the overlay
    setSelectedInsightTarget({ type: insight.sourceType, id: insight.sourceId });
    setShowInsightOverlay(true);
  }, []);

  // NoteLab store actions
  const { importFromInsight, markConfusing: noteLabMarkConfusing } = useNoteLabStore();

  // Insight action handlers - integrated with NoteLab
  const handleSaveToNoteLab = useCallback((insight: RankedInsight) => {
    importFromInsight({
      id: insight.id,
      title: insight.title,
      claim: insight.claim,
      whyItMatters: insight.whyItMatters,
      bucket: insight.bucket,
      sourceId: insight.sourceId,
      sourceType: insight.sourceType,
      evidence: insight.evidence,
      tags: insight.tags,
    });
  }, [importFromInsight]);

  const handleMarkConfusing = useCallback((insight: RankedInsight) => {
    // Save to NoteLab and mark as confusing
    const noteId = importFromInsight({
      id: insight.id,
      title: insight.title,
      claim: insight.claim,
      whyItMatters: insight.whyItMatters,
      bucket: insight.bucket,
      sourceId: insight.sourceId,
      sourceType: insight.sourceType,
      evidence: insight.evidence,
      tags: insight.tags,
    });
    noteLabMarkConfusing(noteId);
  }, [importFromInsight, noteLabMarkConfusing]);

  const handleMarkMastered = useCallback((insight: RankedInsight) => {
    // For now just log - mastery tracking will come later
    console.log('Mark mastered:', insight.id);
  }, []);

  const handleExplainOnWhiteboard = useCallback((insight: RankedInsight) => {
    // Will integrate with whiteboard in Smart Speech phase
    console.log('Explain on whiteboard:', insight.id);
  }, []);

  const handleReadThisCard = useCallback((insight: RankedInsight) => {
    if (!isWebSpeechAvailable()) {
      console.warn('Web Speech API not available');
      return;
    }

    // Stop any current speech
    stopSpeech();

    // Generate and speak the insight
    const script = generateInsightScript(insight, 'smart_high_yield', 'normal');
    const text = scriptToPlainText(script);

    speakText(text, {
      rate: 1.0,
      onEnd: () => {
        console.log('Finished reading:', insight.id);
      },
    });
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
        <div className="w-64 border-r border-gray-700 overflow-y-auto flex-shrink-0">
          <ClusterRail
            clusterGroups={cockpitData.clusterGroups}
            selectedClusterId={selectedClusterId}
            expertMode={expertModeEnabled}
            onSelectCluster={handleClusterClick}
            onClusterInsightClick={handleClusterInsightClick}
          />
        </div>

        {/* Column A: Relations (Structure) */}
        <div className="flex-1 overflow-y-auto border-r border-gray-700">
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

        {/* Column B: Comprehension Tabs */}
        <div className="w-96 flex flex-col flex-shrink-0">
          {/* Smart Speech Controls */}
          {rankedInsights.length > 0 && (
            <SmartSpeechControls
              insights={rankedInsights}
              onInsightStart={(insight) => setSelectedInsightId(insight.id)}
              className="m-2"
            />
          )}

          {/* Tab Bar - Expert View 2.1 Minimal Mode Chips */}
          <div className="flex border-b border-gray-700 bg-gray-800/50 px-2 py-1 gap-1">
            <ModeChip
              label="Priority"
              icon="📊"
              active={activeTab === 'priority'}
              onClick={() => setActiveTab('priority')}
              badge={rankedInsights.filter(i => i.bucket === 'CRITICAL').length || undefined}
            />
            <ModeChip
              label="Explain"
              icon="📝"
              active={activeTab === 'explain'}
              onClick={() => setActiveTab('explain')}
            />
            <ModeChip
              label="Compare"
              icon="⚖️"
              active={activeTab === 'compare'}
              onClick={() => setActiveTab('compare')}
            />
            <ModeChip
              label="Insights"
              icon="💡"
              active={activeTab === 'insights'}
              onClick={() => setActiveTab('insights')}
              badge={Object.keys(surgeonEngine.trapTags).length || undefined}
            />
          </div>

          {/* Tab Content - Expert View 2.1: ONE primary list per mode */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'priority' && (
              <PriorityFeedPanel
                insights={rankedInsights}
                selectedInsightId={selectedInsightId}
                onInsightClick={handleInsightClick}
                onSaveToNoteLab={handleSaveToNoteLab}
                onMarkConfusing={handleMarkConfusing}
                onMarkMastered={handleMarkMastered}
                onExplainOnWhiteboard={handleExplainOnWhiteboard}
                onReadThisCard={handleReadThisCard}
                onJumpToPage={onJumpToPage}
              />
            )}
            {activeTab === 'explain' && (
              <ExplainPlaceholder
                selectedInsightId={selectedInsightId}
                onSelectCard={() => setActiveTab('priority')}
              />
            )}
            {activeTab === 'compare' && (
              <ComparePlaceholder
                selectedInsightId={selectedInsightId}
                onSelectCard={() => setActiveTab('priority')}
              />
            )}
            {activeTab === 'insights' && (
              <InsightsPanel
                insights={rankedInsights}
                trapInsights={trapInsights}
                selectedInsightId={selectedInsightId}
                onInsightClick={handleInsightClick}
                onJumpToPage={onJumpToPage}
              />
            )}
          </div>
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

      {/* DAT Drill Mode Modal */}
      {showDrillMode && (
        <DATDrillMode
          insights={rankedInsights}
          onClose={() => setShowDrillMode(false)}
          onComplete={(results) => {
            console.log('Drill results:', results);
          }}
        />
      )}

      {/* Floating DAT Drill Button */}
      {rankedInsights.filter(i => i.bucket === 'CRITICAL' || i.bucket === 'HIGH_YIELD').length >= 3 && (
        <button
          onClick={() => setShowDrillMode(true)}
          className="fixed bottom-6 right-6 px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-full shadow-lg flex items-center gap-2 z-40"
          title="Start DAT Drill Mode"
        >
          <span className="text-xl">🎮</span>
          <span className="font-medium">DAT Drill</span>
        </button>
      )}
    </div>
  );
};

// Mode Chip Component - Expert View 2.1 minimal compact mode selector
const ModeChip: React.FC<{
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}> = ({ label, icon, active, onClick, badge }) => (
  <button
    onClick={onClick}
    className={`
      px-2.5 py-1 text-xs font-medium rounded-full transition-all relative
      flex items-center gap-1
      ${active
        ? 'bg-teal-500/20 text-teal-400 border border-teal-500/40'
        : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/50 border border-transparent'
      }
    `}
  >
    <span>{icon}</span>
    <span>{label}</span>
    {badge !== undefined && badge > 0 && (
      <span className="ml-0.5 px-1 py-0 text-[9px] font-bold bg-red-500 text-white rounded-full min-w-[14px] text-center">
        {badge}
      </span>
    )}
  </button>
);

// Explain Placeholder - shows CTA when no card selected
const ExplainPlaceholder: React.FC<{
  selectedInsightId?: string;
  onSelectCard: () => void;
}> = ({ selectedInsightId, onSelectCard }) => (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
    <span className="text-4xl mb-3">📝</span>
    <h3 className="text-sm font-medium text-gray-300 mb-1">Explain Mode</h3>
    <p className="text-xs text-gray-500 mb-4 max-w-[200px]">
      Generates whiteboard-ready micro-lessons from selected cards.
    </p>
    {!selectedInsightId && (
      <button
        onClick={onSelectCard}
        className="px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors"
      >
        Select a card to generate Explain
      </button>
    )}
  </div>
);

// Compare Placeholder - shows differential tables for selected cards
const ComparePlaceholder: React.FC<{
  selectedInsightId?: string;
  onSelectCard: () => void;
}> = ({ selectedInsightId, onSelectCard }) => (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
    <span className="text-4xl mb-3">⚖️</span>
    <h3 className="text-sm font-medium text-gray-300 mb-1">Compare Mode</h3>
    <p className="text-xs text-gray-500 mb-4 max-w-[200px]">
      Shows differential tables: gingivitis vs periodontitis, pulpitis vs apical periodontitis, etc.
    </p>
    {!selectedInsightId && (
      <button
        onClick={onSelectCard}
        className="px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors"
      >
        Select a card to generate Compare
      </button>
    )}
  </div>
);

// Insights Panel - "what matters + what you're missing"
const InsightsPanel: React.FC<{
  insights: RankedInsight[];
  trapInsights: RankedInsight[];
  selectedInsightId?: string;
  onInsightClick: (insight: RankedInsight) => void;
  onJumpToPage: (page: number) => void;
}> = ({ insights, trapInsights, selectedInsightId, onInsightClick, onJumpToPage }) => {
  const highYield = insights.filter(i => i.bucket === 'CRITICAL' || i.bucket === 'HIGH_YIELD');
  const traps = trapInsights.slice(0, 5);

  return (
    <div className="p-3 space-y-4">
      {/* High-Yield List */}
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
          <span>💎</span> What Matters
        </h3>
        {highYield.length > 0 ? (
          <div className="space-y-1.5">
            {highYield.slice(0, 8).map(insight => (
              <button
                key={insight.id}
                onClick={() => onInsightClick(insight)}
                className={`
                  w-full text-left px-2.5 py-2 rounded-lg border transition-colors text-xs
                  ${selectedInsightId === insight.id
                    ? 'bg-teal-500/20 border-teal-500/40 text-teal-300'
                    : 'bg-gray-800/50 border-gray-700 text-gray-300 hover:border-gray-600'
                  }
                `}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="line-clamp-2">{insight.title}</span>
                  {insight.evidence?.[0]?.page !== undefined && (
                    <span
                      onClick={(e) => { e.stopPropagation(); onJumpToPage(insight.evidence![0].page); }}
                      className="text-[10px] text-teal-400 hover:text-teal-300 flex-shrink-0"
                    >
                      p.{insight.evidence[0].page}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 italic">Extract content to see high-yield items</p>
        )}
      </section>

      {/* Traps */}
      {traps.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
            <span>⚠️</span> Watch Out
          </h3>
          <div className="space-y-1.5">
            {traps.map(trap => (
              <button
                key={trap.id}
                onClick={() => onInsightClick(trap)}
                className="w-full text-left px-2.5 py-2 rounded-lg border border-amber-700/40 bg-amber-900/20 text-amber-200 text-xs hover:border-amber-600/40 transition-colors"
              >
                <span className="line-clamp-2">{trap.title}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Missing nodes hint */}
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
          <span>🔍</span> What You May Be Missing
        </h3>
        <p className="text-xs text-gray-500 italic">
          Clinical flow analysis coming soon: shows missing nodes in your reasoning chain.
        </p>
      </section>
    </div>
  );
};

export default SurgeonCockpit;
