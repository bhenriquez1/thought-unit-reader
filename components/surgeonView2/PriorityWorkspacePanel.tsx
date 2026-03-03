// components/surgeonView2/PriorityWorkspacePanel.tsx
// Unified Priority Workspace - Expert View 2.1 redesign
// Combines priority feed with action buttons (Explain, Make Card, Send to NoteLab)

import React from 'react';
import type { RankedInsight } from '@/lib/relationshipSchema/types';
import type { PageIntelligence, SourceRef } from '@/lib/page-intelligence';
import PriorityComprehensionPanel from './PriorityComprehensionPanel';

interface PriorityWorkspacePanelProps {
  insights: RankedInsight[];
  pageIntelligence?: PageIntelligence | null;
  selectedCardId?: string | null;
  onJumpToPage?: (page: number) => void;
  onExplain?: (insight: RankedInsight) => void;
  onMakeCard?: (insight: RankedInsight) => void;
  onSendToNoteLab?: (insight: RankedInsight) => void;
  isExtracting?: boolean;
  onHighlightParagraph?: (text: string) => void;
  /** Jump to source in PDF — from SourceAnchor "Jump to source" button */
  onJumpToSource?: (ref: SourceRef) => void;
  /** Font-size scale for insight cards (from insightsPanelStore) */
  insightScale?: number;
  /** Sync: scroll active card into view when this id changes */
  syncEnabled?: boolean;
  /** Deep Analysis Mode: show all paragraph units + structure map */
  deepAnalysisMode?: boolean;
}

export const PriorityWorkspacePanel: React.FC<PriorityWorkspacePanelProps> = ({
  insights,
  pageIntelligence,
  selectedCardId,
  onJumpToPage,
  onExplain,
  onSendToNoteLab,
  onHighlightParagraph,
  onJumpToSource,
  insightScale,
  syncEnabled,
  deepAnalysisMode,
  isExtracting,
}) => {
  return (
    <PriorityComprehensionPanel
      rankedInsights={insights}
      pageIntelligence={pageIntelligence}
      onInsightClick={onExplain}
      onJumpToPage={onJumpToPage}
      onSaveToNoteLab={onSendToNoteLab}
      onHighlightParagraph={onHighlightParagraph}
      onJumpToSource={onJumpToSource}
      insightScale={insightScale}
      activeItemId={selectedCardId}
      syncEnabled={syncEnabled}
      deepAnalysisMode={deepAnalysisMode}
      isExtracting={isExtracting}
    />
  );
};

export default PriorityWorkspacePanel;
