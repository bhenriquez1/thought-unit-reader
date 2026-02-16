// components/surgeonView2/SurgeonCockpit.tsx
// Expert View 2.1 - Minimal Layout with Evidence Spine
// Page-aware extraction defaults to current page context
// Tabs: Priority | Explain | Compare | Insights (compact mode chips)
// Layout: Left rail (clusters) | Main (relations) | Right (comprehension tabs)

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useRelationshipStore } from '@/lib/relationshipSchema/store';
import { useNoteLabStore } from '@/lib/cognitiveEngine/noteLabStore';
import { useSurgeonEngineStore } from '@/lib/surgeonEngine/store';
import { useExpertViewStore } from '@/lib/cognitive/expertViewStore';
import { usePageContextStore } from '@/lib/cognitive/pageContextStore';
import type {
  ReasoningChain,
} from '@/lib/cognitive/types';
import type { PatternCluster, Relation, DecisionRule, RankedInsight } from '@/lib/relationshipSchema/types';
import {
  extractPage,
  generateInsights,
  generateExplain,
  generateCardsFromInsights,
  buildReasoningFlow,
  type PageExtractionResult,
  type InsightsResult,
  type ExplainPayload,
  type StudyCard,
  type ReasoningFlow,
} from '@/lib/engines';
import ClusterRail from './ClusterRail';
import RelationPanel from './RelationPanel';
import PriorityFeedPanel from './PriorityFeedPanel';
import InsightOverlay from './InsightOverlay';
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

// Expert View 2.1 tabs
type ComprehensionTab = 'priority' | 'explain' | 'compare' | 'insights';

interface SurgeonCockpitProps {
  documentId: string;
  documentTitle: string;
  totalPages?: number;
  currentPage?: number;
  onJumpToPage: (page: number) => void;
  pageTexts?: Map<number, string>;
  onExtractPage?: (pageIndex: number) => Promise<void>;
}

export const SurgeonCockpit: React.FC<SurgeonCockpitProps> = ({
  documentId,
  documentTitle,
  totalPages = 0,
  currentPage = 0,
  onJumpToPage,
  pageTexts,
  onExtractPage,
}) => {
  // Relationship store
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
    isExtracting: isRelationExtracting,
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

  // Expert View 2.1 store for page tracking
  const expertView = useExpertViewStore();
  const pageContext = usePageContextStore();

  // Surgeon Engine Store
  const surgeonEngine = useSurgeonEngineStore();

  // Local state
  const [activeTab, setActiveTab] = useState<ComprehensionTab>('priority');
  const [selectedCardId, setSelectedCardId] = useState<string | undefined>();
  const [showInsightOverlay, setShowInsightOverlay] = useState(false);
  const [showDrillMode, setShowDrillMode] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedInsightTarget, setSelectedInsightTarget] = useState<{
    type: 'relation' | 'cluster' | 'rule';
    id: string;
  } | null>(null);
  const [extractionStatus, setExtractionStatus] = useState<string>('');
  const hasAutoExtracted = useRef(false);
  const hasRunSurgeonEngines = useRef(false);

  // Page-aware extraction state (new engines)
  const [pageExtraction, setPageExtraction] = useState<PageExtractionResult | null>(null);
  const [pageInsights, setPageInsights] = useState<InsightsResult | null>(null);
  const [pageExplain, setPageExplain] = useState<ExplainPayload | null>(null);
  const [pageReasoning, setPageReasoning] = useState<ReasoningFlow | null>(null);
  const [generatedStudyCards, setGeneratedStudyCards] = useState<StudyCard[]>([]);

  // Sync document context on mount
  useEffect(() => {
    if (documentId) {
      setDocId(documentId);
      surgeonEngine.setBook(documentId, surgeonEngine.domain);
      expertView.setDocument(documentId, documentTitle, totalPages);
      pageContext.setDocument(documentId, totalPages);
    }
  }, [documentId, documentTitle, totalPages]);

  // Update page context when page changes
  useEffect(() => {
    if (currentPage !== undefined) {
      pageContext.setPage(currentPage);
      expertView.setPage(currentPage);
      surgeonEngine.setPageContext(currentPage);
    }
  }, [currentPage]);

  // Run surgeon engines after extraction completes
  useEffect(() => {
    const relationCount = Object.keys(relations).length;
    if (relationCount > 0 && !isRelationExtracting && !hasRunSurgeonEngines.current && pageTexts && pageTexts.size > 0) {
      hasRunSurgeonEngines.current = true;
      const units = Array.from(pageTexts.entries()).flatMap(([page, text]) => {
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
  }, [relations, isRelationExtracting, pageTexts, documentId]);

  // Computed data
  const cockpitData = getCockpitViewData();
  const selectedCluster = selectedClusterId ? clusters[selectedClusterId] : null;

  // Get ranked insights
  const rankedInsights = useMemo(() => {
    const insights = getRankedInsights();
    return enrichInsightsWithApex(insights);
  }, [relations, clusters, rules, concepts, getRankedInsights]);

  // Get trap insights
  const trapInsights = useMemo(() => {
    return rankedInsights.filter(i => i.type === 'EXAM_TRAP' || i.trap);
  }, [rankedInsights]);

  // Page context info
  const pageCtx = pageContext.getPageContext();
  const chapterTitle = pageCtx.tocPath?.title || 'Unknown Chapter';
  const confidencePercent = Math.round(pageCtx.confidence * 100);

  // Handle extract current page - uses new extraction engine with IndexedDB storage
  const handleExtractCurrentPage = useCallback(async () => {
    if (!pageTexts || !pageTexts.has(currentPage)) {
      setExtractionStatus('No text available for current page');
      return;
    }

    const text = pageTexts.get(currentPage);
    if (!text || text.trim().length < 50) {
      setExtractionStatus('Page has insufficient text');
      return;
    }

    setExtractionStatus('Extracting page...');

    try {
      // Step 1: Extract page using new engine (stores in IndexedDB)
      const extraction = await extractPage({
        docId: documentId,
        pageIndex: currentPage,
        text,
      });
      setPageExtraction(extraction);
      setExtractionStatus('Generating insights...');

      // Step 2: Generate insights from extraction
      const insights = await generateInsights(extraction);
      setPageInsights(insights);
      setExtractionStatus('Building reasoning flow...');

      // Step 3: Build reasoning flow (clinical reasoning chain)
      const reasoning = await buildReasoningFlow(extraction);
      setPageReasoning(reasoning);

      // Step 4: Also run legacy extraction for relationship store
      await extractFromMultiplePages([{ pageIndex: currentPage, text }]);

      setExtractionStatus('');
    } catch (error) {
      setExtractionStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [pageTexts, currentPage, documentId, extractFromMultiplePages]);

  // Handle extract chapter
  const handleExtractChapter = useCallback(async () => {
    const chapterRange = pageContext.getChapterRange(currentPage);
    if (!chapterRange || !pageTexts) {
      setExtractionStatus('No chapter range available');
      return;
    }

    const pages: Array<{ pageIndex: number; text: string }> = [];
    for (let p = chapterRange.start; p <= chapterRange.end; p++) {
      const text = pageTexts.get(p);
      if (text && text.trim().length > 50) {
        pages.push({ pageIndex: p, text });
      }
    }

    if (pages.length === 0) {
      setExtractionStatus('No extractable pages in chapter');
      return;
    }

    setExtractionStatus(`Extracting ${pages.length} pages...`);

    try {
      await extractFromMultiplePages(pages);
      setExtractionStatus('');
    } catch (error) {
      setExtractionStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [pageTexts, currentPage, pageContext, extractFromMultiplePages]);

  // Handle card selection
  const handleCardClick = useCallback((insight: RankedInsight) => {
    setSelectedCardId(insight.id);
    setSelectedInsightTarget({ type: insight.sourceType, id: insight.sourceId });
    setShowInsightOverlay(true);
  }, []);

  // NoteLab actions
  const { importFromInsight, markConfusing: noteLabMarkConfusing } = useNoteLabStore();

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

  const handleReadCard = useCallback((insight: RankedInsight) => {
    if (!isWebSpeechAvailable()) return;
    stopSpeech();
    const script = generateInsightScript(insight, 'smart_high_yield', 'normal');
    const text = scriptToPlainText(script);
    speakText(text, { rate: 1.0 });
  }, []);

  // Handle generate explain for current page
  const handleGenerateExplain = useCallback(async () => {
    if (!pageExtraction) return;

    try {
      const explain = await generateExplain({
        extraction: pageExtraction,
        insights: pageInsights || undefined,
      });
      setPageExplain(explain);
    } catch (error) {
      console.error('Failed to generate explain:', error);
    }
  }, [pageExtraction, pageInsights]);

  // Handle generate study cards from insights
  const handleGenerateStudyCards = useCallback(async () => {
    if (!pageInsights) return;

    try {
      const cards = await generateCardsFromInsights({
        insights: pageInsights,
        includeWhatMissing: false,
      });
      setGeneratedStudyCards(cards);
    } catch (error) {
      console.error('Failed to generate study cards:', error);
    }
  }, [pageInsights]);

  // Get active relations
  const activeRelations = selectedClusterId
    ? getRelationsForCluster(selectedClusterId)
    : Object.values(relations).filter(r => r.confidence >= filterByConfidence);

  const chains = selectedClusterId ? getChainsFromCluster(selectedClusterId) : [];

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Expert View 2.1 Header - Minimal */}
      <header className="flex items-center gap-3 px-4 py-2 bg-gray-800 border-b border-gray-700">
        {/* Document Title */}
        <h1 className="text-sm font-medium text-gray-200 truncate max-w-[200px]" title={documentTitle}>
          {documentTitle}
        </h1>

        {/* Separator */}
        <span className="text-gray-600">|</span>

        {/* Current Chapter */}
        <span className="text-xs text-gray-400 truncate max-w-[180px]" title={chapterTitle}>
          {chapterTitle}
        </span>

        {/* Page Number */}
        <span className="text-xs text-gray-500">
          p.{currentPage + 1}/{totalPages}
        </span>

        {/* Confidence Pill */}
        <span
          className={`
            px-2 py-0.5 text-[10px] font-medium rounded-full
            ${confidencePercent >= 80 ? 'bg-green-500/20 text-green-400' :
              confidencePercent >= 50 ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-gray-500/20 text-gray-400'}
          `}
        >
          {confidencePercent}%
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* DAT Apex Toggle */}
        <button
          onClick={() => expertView.toggleDatApex()}
          className={`
            px-2 py-1 text-[10px] font-medium rounded
            ${expertView.datApexEnabled
              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40'
              : 'bg-gray-700 text-gray-400 border border-gray-600'}
          `}
        >
          DAT Apex
        </button>

        {/* Extract Buttons */}
        <div className="flex gap-1">
          <button
            onClick={handleExtractCurrentPage}
            disabled={isRelationExtracting}
            className="px-2.5 py-1 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Extract Page
          </button>
          <button
            onClick={handleExtractChapter}
            disabled={isRelationExtracting}
            className="px-2.5 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Extract Chapter
          </button>
        </div>

        {/* Advanced Filters Toggle */}
        <button
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          className={`
            px-2 py-1 text-[10px] rounded
            ${showAdvancedFilters ? 'bg-gray-700 text-gray-300' : 'text-gray-500 hover:text-gray-400'}
          `}
        >
          Filters {showAdvancedFilters ? '▲' : '▼'}
        </button>
      </header>

      {/* Status Banner */}
      {(extractionStatus || extractionError) && (
        <div className={`px-4 py-1.5 text-xs ${extractionError ? 'bg-red-900/50 text-red-300' : 'bg-blue-900/50 text-blue-300'}`}>
          {extractionError || extractionStatus}
        </div>
      )}

      {/* Advanced Filters (collapsed by default) */}
      {showAdvancedFilters && (
        <div className="px-4 py-2 bg-gray-800/50 border-b border-gray-700 flex items-center gap-4">
          <label className="text-[10px] text-gray-400 flex items-center gap-2">
            Kind:
            <select
              value={filterByKind || 'all'}
              onChange={(e) => setFilterByKind(e.target.value as typeof filterByKind)}
              className="bg-gray-700 text-gray-300 text-[10px] px-2 py-0.5 rounded border border-gray-600"
            >
              <option value="all">All</option>
              <option value="process">Process</option>
              <option value="causal">Causal</option>
              <option value="diagnostic">Diagnostic</option>
              <option value="risk">Risk</option>
              <option value="exception">Exception</option>
            </select>
          </label>
          <label className="text-[10px] text-gray-400 flex items-center gap-2">
            Min Confidence:
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={filterByConfidence}
              onChange={(e) => setFilterByConfidence(parseFloat(e.target.value))}
              className="w-20"
            />
            <span className="text-gray-500">{Math.round(filterByConfidence * 100)}%</span>
          </label>
          <button
            onClick={toggleExpertMode}
            className={`text-[10px] px-2 py-0.5 rounded ${expertModeEnabled ? 'bg-teal-500/20 text-teal-400' : 'bg-gray-700 text-gray-400'}`}
          >
            Expert Mode
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Rail: Cluster List */}
        <div className="w-56 border-r border-gray-700 overflow-y-auto flex-shrink-0 bg-gray-850">
          <ClusterRail
            clusterGroups={cockpitData.clusterGroups}
            selectedClusterId={selectedClusterId}
            expertMode={expertModeEnabled}
            onSelectCluster={(cluster) => selectCluster(cluster.id)}
            onClusterInsightClick={(cluster) => {
              setSelectedInsightTarget({ type: 'cluster', id: cluster.id });
              setShowInsightOverlay(true);
            }}
          />
        </div>

        {/* Center: Relations */}
        <div className="flex-1 overflow-y-auto border-r border-gray-700">
          <RelationPanel
            relations={activeRelations}
            concepts={concepts}
            chains={chains}
            selectedRelationId={selectedRelationId}
            selectedCluster={selectedCluster}
            expertMode={expertModeEnabled}
            onRelationClick={(relation) => {
              selectRelation(relation.id);
              setSelectedInsightTarget({ type: 'relation', id: relation.id });
              setShowInsightOverlay(true);
            }}
            onJumpToPage={onJumpToPage}
          />
        </div>

        {/* Right Panel: Expert View Tabs */}
        <div className="w-80 flex flex-col flex-shrink-0 bg-gray-850">
          {/* Smart Speech Controls */}
          {rankedInsights.length > 0 && (
            <SmartSpeechControls
              insights={rankedInsights}
              onInsightStart={(insight) => setSelectedCardId(insight.id)}
              className="m-2"
            />
          )}

          {/* Tab Bar - Expert View 2.1 Mode Chips */}
          <div className="flex border-b border-gray-700 bg-gray-800/50 px-2 py-1 gap-1">
            <ModeChip
              label="Priority"
              active={activeTab === 'priority'}
              onClick={() => setActiveTab('priority')}
              badge={rankedInsights.filter(i => i.bucket === 'CRITICAL').length || undefined}
            />
            <ModeChip
              label="Explain"
              active={activeTab === 'explain'}
              onClick={() => setActiveTab('explain')}
            />
            <ModeChip
              label="Compare"
              active={activeTab === 'compare'}
              onClick={() => setActiveTab('compare')}
            />
            <ModeChip
              label="Insights"
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
                selectedInsightId={selectedCardId}
                onInsightClick={handleCardClick}
                onSaveToNoteLab={handleSaveToNoteLab}
                onMarkConfusing={handleMarkConfusing}
                onMarkMastered={() => {}}
                onExplainOnWhiteboard={() => setActiveTab('explain')}
                onReadThisCard={handleReadCard}
                onJumpToPage={onJumpToPage}
              />
            )}
            {activeTab === 'explain' && (
              <ExplainTab
                selectedCardId={selectedCardId}
                insights={rankedInsights}
                onSelectCard={() => setActiveTab('priority')}
                pageExtraction={pageExtraction}
                pageInsights={pageInsights}
                pageExplain={pageExplain}
                onGenerateExplain={handleGenerateExplain}
              />
            )}
            {activeTab === 'compare' && (
              <CompareTab
                selectedCardId={selectedCardId}
                insights={rankedInsights}
                onSelectCard={() => setActiveTab('priority')}
              />
            )}
            {activeTab === 'insights' && (
              <InsightsTab
                insights={rankedInsights}
                trapInsights={trapInsights}
                selectedCardId={selectedCardId}
                onCardClick={handleCardClick}
                onJumpToPage={onJumpToPage}
                reasoningChain={expertView.getReasoningChain()}
                pageInsights={pageInsights}
                pageReasoning={pageReasoning}
                onGenerateStudyCards={handleGenerateStudyCards}
                generatedStudyCards={generatedStudyCards}
              />
            )}
          </div>
        </div>
      </div>

      {/* Insight Overlay */}
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

      {/* DAT Drill Mode */}
      {showDrillMode && (
        <DATDrillMode
          insights={rankedInsights}
          onClose={() => setShowDrillMode(false)}
          onComplete={() => {}}
        />
      )}

      {/* Floating DAT Drill Button */}
      {rankedInsights.filter(i => i.bucket === 'CRITICAL' || i.bucket === 'HIGH_YIELD').length >= 3 && (
        <button
          onClick={() => setShowDrillMode(true)}
          className="fixed bottom-6 right-6 px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-full shadow-lg flex items-center gap-2 z-40"
        >
          <span className="text-xl">🎯</span>
          <span className="font-medium text-sm">DAT Drill</span>
        </button>
      )}
    </div>
  );
};

// Mode Chip Component - Expert View 2.1 compact mode selector
const ModeChip: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}> = ({ label, active, onClick, badge }) => (
  <button
    onClick={onClick}
    className={`
      flex-1 px-2 py-1.5 text-[11px] font-medium rounded transition-all relative
      ${active
        ? 'bg-teal-500/20 text-teal-400 border border-teal-500/40'
        : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/50 border border-transparent'
      }
    `}
  >
    {label}
    {badge !== undefined && badge > 0 && (
      <span className="absolute -top-1 -right-1 px-1 py-0 text-[9px] font-bold bg-red-500 text-white rounded-full min-w-[14px] text-center">
        {badge}
      </span>
    )}
  </button>
);

// Explain Tab - Whiteboard-ready micro-lessons (page-aware)
const ExplainTab: React.FC<{
  selectedCardId?: string;
  insights: RankedInsight[];
  onSelectCard: () => void;
  pageExtraction?: PageExtractionResult | null;
  pageInsights?: InsightsResult | null;
  pageExplain?: ExplainPayload | null;
  onGenerateExplain?: () => Promise<void>;
}> = ({ selectedCardId, insights, onSelectCard, pageExtraction, pageInsights, pageExplain, onGenerateExplain }) => {
  const selected = insights.find(i => i.id === selectedCardId);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateExplain = useCallback(async () => {
    if (!onGenerateExplain) return;
    setIsGenerating(true);
    try {
      await onGenerateExplain();
    } finally {
      setIsGenerating(false);
    }
  }, [onGenerateExplain]);

  // Page-aware explain: show "Explain this page" when extraction exists
  if (pageExplain) {
    return (
      <div className="p-3 space-y-4 overflow-y-auto">
        <div className="bg-gray-800 rounded-lg p-3 border border-teal-500/40">
          <h3 className="text-xs font-semibold text-teal-400 mb-3">{pageExplain.title}</h3>

          {/* Steps */}
          <div className="space-y-2 mb-4">
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase">Key Steps</h4>
            <div className="space-y-1.5">
              {pageExplain.steps.map((step, idx) => (
                <div key={idx} className="flex gap-2 text-xs">
                  <span className="text-teal-500 font-semibold">{idx + 1}.</span>
                  <span className="text-gray-300">{step}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Draw Instructions */}
          <div className="space-y-2 mb-4">
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase">Whiteboard Instructions</h4>
            <div className="bg-gray-900 rounded p-2 space-y-1">
              {pageExplain.drawInstructions.map((instruction, idx) => (
                <p key={idx} className="text-xs text-gray-200">• {instruction}</p>
              ))}
            </div>
          </div>

          {/* Exam Questions */}
          {pageExplain.examQuestions.length > 0 && (
            <div className="space-y-2 mb-4">
              <h4 className="text-[10px] font-semibold text-gray-400 uppercase">Exam Questions</h4>
              <div className="space-y-2">
                {pageExplain.examQuestions.map((eq, idx) => (
                  <div key={idx} className="bg-gray-900/50 rounded p-2 border border-gray-700">
                    <p className="text-xs text-purple-300 font-medium mb-1">Q: {eq.q}</p>
                    <p className="text-[10px] text-gray-400">A: {eq.a}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mnemonic */}
          {pageExplain.mnemonic && (
            <div className="bg-amber-900/20 border border-amber-700/40 rounded p-2 mb-3">
              <p className="text-xs text-amber-300">💡 {pageExplain.mnemonic}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button className="flex-1 px-2 py-1.5 text-[10px] bg-teal-600 hover:bg-teal-500 text-white rounded">
              Copy to Clipboard
            </button>
            <button className="flex-1 px-2 py-1.5 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded">
              Explain on Whiteboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show "Explain this page" CTA when extraction exists but no explain yet
  if (pageExtraction && !pageExplain) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <span className="text-3xl mb-3">📝</span>
        <h3 className="text-sm font-medium text-gray-300 mb-1">Page Extracted</h3>
        <p className="text-xs text-gray-500 mb-4 max-w-[180px]">
          Generate a whiteboard-ready micro-lesson for this page.
        </p>
        <button
          onClick={handleGenerateExplain}
          disabled={isGenerating}
          className="px-4 py-2 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded-lg disabled:opacity-50"
        >
          {isGenerating ? 'Generating...' : 'Explain This Page'}
        </button>
      </div>
    );
  }

  // Fall back to card-based explain
  if (!selected) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <span className="text-3xl mb-3">📝</span>
        <h3 className="text-sm font-medium text-gray-300 mb-1">Explain Mode</h3>
        <p className="text-xs text-gray-500 mb-4 max-w-[180px]">
          Extract a page first, then generate whiteboard-ready micro-lessons.
        </p>
        <button
          onClick={onSelectCard}
          className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg"
        >
          Or select a card
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4">
      <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
        <h3 className="text-xs font-semibold text-teal-400 mb-2">{selected.title}</h3>
        <p className="text-xs text-gray-300 mb-3">{selected.claim}</p>

        <div className="space-y-2">
          <h4 className="text-[10px] font-semibold text-gray-400 uppercase">Whiteboard Prompt</h4>
          <div className="bg-gray-900 rounded p-2 text-xs text-gray-200 font-mono">
            Draw a diagram showing: {selected.title}
            <br />
            <br />
            Key points to include:
            <br />
            • {selected.whyItMatters}
            <br />
            • Show relationships to related concepts
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button className="flex-1 px-2 py-1.5 text-[10px] bg-teal-600 hover:bg-teal-500 text-white rounded">
            Copy Prompt
          </button>
          <button className="flex-1 px-2 py-1.5 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded">
            Generate Diagram
          </button>
        </div>
      </div>

      <div className="text-[10px] text-gray-500 italic">
        Pro tip: Use the prompt with Ninja Nerd-style whiteboard explanations
      </div>
    </div>
  );
};

// Compare Tab - Differential tables
const CompareTab: React.FC<{
  selectedCardId?: string;
  insights: RankedInsight[];
  onSelectCard: () => void;
}> = ({ selectedCardId, insights, onSelectCard }) => {
  const selected = insights.find(i => i.id === selectedCardId);

  // Find confusable pairs
  const confusables = useMemo(() => {
    return insights.filter(i =>
      i.type === 'EXAM_TRAP' ||
      (i.trap && i.trap.toLowerCase().includes('look-alike')) ||
      (i.claim || '').toLowerCase().includes(' vs ')
    ).slice(0, 3);
  }, [insights]);

  if (!selected && confusables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <span className="text-3xl mb-3">⚖️</span>
        <h3 className="text-sm font-medium text-gray-300 mb-1">Compare Mode</h3>
        <p className="text-xs text-gray-500 mb-4 max-w-[180px]">
          Shows differential tables: A vs B vs C with discriminating features.
        </p>
        <button
          onClick={onSelectCard}
          className="px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded-lg"
        >
          Select a card to compare
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4">
      {selected && (
        <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
          <h3 className="text-xs font-semibold text-gray-300 mb-2">
            Comparing: {selected.title}
          </h3>

          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="p-1.5 border-b border-gray-700">Feature</th>
                <th className="p-1.5 border-b border-gray-700">{selected.title}</th>
                <th className="p-1.5 border-b border-gray-700 text-gray-500">Similar</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              <tr>
                <td className="p-1.5 border-b border-gray-700/50 text-gray-400">Definition</td>
                <td className="p-1.5 border-b border-gray-700/50">{selected.claim?.slice(0, 40) || '-'}</td>
                <td className="p-1.5 border-b border-gray-700/50 text-gray-500">-</td>
              </tr>
              <tr>
                <td className="p-1.5 border-b border-gray-700/50 text-gray-400">Key Finding</td>
                <td className="p-1.5 border-b border-gray-700/50">-</td>
                <td className="p-1.5 border-b border-gray-700/50 text-gray-500">-</td>
              </tr>
              <tr>
                <td className="p-1.5 text-gray-400">Differentiator</td>
                <td className="p-1.5">{selected.whyItMatters?.slice(0, 40) || '-'}</td>
                <td className="p-1.5 text-gray-500">-</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {confusables.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold text-gray-400 uppercase mb-2">
            Common Confusions on This Page
          </h3>
          <div className="space-y-1.5">
            {confusables.map(c => (
              <div key={c.id} className="bg-amber-900/20 border border-amber-700/40 rounded p-2 text-xs text-amber-200">
                {c.title}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Insights Tab - What matters + What you're missing + Study card generation
const InsightsTab: React.FC<{
  insights: RankedInsight[];
  trapInsights: RankedInsight[];
  selectedCardId?: string;
  onCardClick: (insight: RankedInsight) => void;
  onJumpToPage: (page: number) => void;
  reasoningChain?: ReasoningChain;
  pageInsights?: InsightsResult | null;
  pageReasoning?: ReasoningFlow | null;
  onGenerateStudyCards?: () => Promise<void>;
  generatedStudyCards?: StudyCard[];
}> = ({
  insights,
  trapInsights,
  selectedCardId,
  onCardClick,
  onJumpToPage,
  reasoningChain,
  pageInsights,
  pageReasoning,
  onGenerateStudyCards,
  generatedStudyCards,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const highYield = insights.filter(i => i.bucket === 'CRITICAL' || i.bucket === 'HIGH_YIELD');
  const traps = trapInsights.slice(0, 5);

  const handleGenerateCards = useCallback(async () => {
    if (!onGenerateStudyCards) return;
    setIsGenerating(true);
    try {
      await onGenerateStudyCards();
    } finally {
      setIsGenerating(false);
    }
  }, [onGenerateStudyCards]);

  // Use page insights if available, otherwise fall back to ranked insights
  const whatMattersItems = pageInsights?.whatMatters || [];
  const whatMissingItems = pageInsights?.whatMissing || [];
  const missingFromReasoning = pageReasoning?.missingNodeSuggestions || reasoningChain?.missing?.map(m => m.detail) || [];

  return (
    <div className="p-3 space-y-4 overflow-y-auto">
      {/* What Matters - from new insights engine */}
      <section>
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
          <span>💎</span> What Matters
        </h3>
        {whatMattersItems.length > 0 ? (
          <div className="space-y-1.5">
            {whatMattersItems.slice(0, 8).map(item => (
              <div
                key={item.id}
                className="bg-gray-800/50 border border-gray-700 rounded-lg p-2.5 text-xs hover:border-teal-500/40 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-medium text-teal-300">{item.title}</span>
                  <div className="flex gap-1 flex-shrink-0">
                    {item.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="px-1 py-0.5 text-[9px] bg-gray-700 text-gray-400 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="text-gray-400 line-clamp-2 mb-1">{item.summary}</p>
                <p className="text-[10px] text-gray-500 italic">{item.whyItMatters}</p>
              </div>
            ))}
          </div>
        ) : highYield.length > 0 ? (
          <div className="space-y-1.5">
            {highYield.slice(0, 6).map(insight => (
              <button
                key={insight.id}
                onClick={() => onCardClick(insight)}
                className={`
                  w-full text-left px-2.5 py-2 rounded-lg border transition-colors text-xs
                  ${selectedCardId === insight.id
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
                      p.{insight.evidence[0].page + 1}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 italic">Extract content to see high-yield items</p>
        )}

        {/* Generate Study Cards button */}
        {(whatMattersItems.length > 0 || highYield.length > 0) && onGenerateStudyCards && (
          <button
            onClick={handleGenerateCards}
            disabled={isGenerating}
            className="mt-3 w-full px-3 py-2 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span>📚</span>
            {isGenerating ? 'Generating...' : 'Generate Study Cards from What Matters'}
          </button>
        )}

        {/* Show generated cards count */}
        {generatedStudyCards && generatedStudyCards.length > 0 && (
          <div className="mt-2 px-2 py-1.5 bg-purple-900/20 border border-purple-700/40 rounded text-xs text-purple-300">
            ✓ {generatedStudyCards.length} study cards generated
          </div>
        )}
      </section>

      {/* Traps / Watch Out */}
      {traps.length > 0 && (
        <section>
          <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
            <span>⚠️</span> Watch Out
          </h3>
          <div className="space-y-1.5">
            {traps.map(trap => (
              <button
                key={trap.id}
                onClick={() => onCardClick(trap)}
                className="w-full text-left px-2.5 py-2 rounded-lg border border-amber-700/40 bg-amber-900/20 text-amber-200 text-xs hover:border-amber-600/40"
              >
                <span className="line-clamp-2">{trap.title}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* What You May Be Missing - from reasoning flow */}
      <section>
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
          <span>🔍</span> What You May Be Missing
        </h3>
        {whatMissingItems.length > 0 ? (
          <div className="space-y-1.5">
            {whatMissingItems.map(item => (
              <div key={item.id} className="bg-gray-800/50 border border-gray-700 rounded p-2 text-xs">
                <span className="text-amber-400 font-medium">{item.title}:</span>
                <span className="text-gray-400 ml-1">{item.summary}</span>
              </div>
            ))}
          </div>
        ) : missingFromReasoning.length > 0 ? (
          <div className="space-y-1.5">
            {missingFromReasoning.slice(0, 5).map((suggestion, idx) => (
              <div key={idx} className="bg-gray-800/50 border border-gray-700 rounded p-2 text-xs">
                <span className="text-gray-400">{suggestion}</span>
              </div>
            ))}
          </div>
        ) : reasoningChain?.missing && reasoningChain.missing.length > 0 ? (
          <div className="space-y-1.5">
            {reasoningChain.missing.map((missing, idx) => (
              <div key={idx} className="bg-gray-800/50 border border-gray-700 rounded p-2 text-xs">
                <span className="text-amber-400 font-medium">{missing.expectedType}:</span>
                <span className="text-gray-400 ml-1">{missing.detail}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 italic">
            Extract content to see what concepts may be missing.
          </p>
        )}
      </section>
    </div>
  );
};

export default SurgeonCockpit;
