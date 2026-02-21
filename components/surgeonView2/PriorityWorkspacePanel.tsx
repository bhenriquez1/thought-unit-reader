// components/surgeonView2/PriorityWorkspacePanel.tsx
// Unified Priority Workspace - Expert View 2.1 redesign
// Combines priority feed with action buttons (Explain, Make Card, Send to NoteLab)

import React from 'react';
import type { RankedInsight } from '@/lib/relationshipSchema/types';
import type { InsightsResult, PageExtractionResult, ReasoningFlow } from '@/lib/engines';
import type { PageIntelligence } from '@/lib/page-intelligence';
import PriorityComprehensionPanel from './PriorityComprehensionPanel';

interface PriorityWorkspacePanelProps {
  insights: RankedInsight[];
  pageIntelligence?: PageIntelligence | null;
  pageInsights?: InsightsResult | null;
  pageReasoning?: ReasoningFlow | null;
  pageExtraction?: PageExtractionResult | null;
  selectedCardId?: string | null;
  onJumpToPage?: (page: number) => void;
  onExplain?: (insight: RankedInsight) => void;
  onMakeCard?: (insight: RankedInsight) => void;
  onSendToNoteLab?: (insight: RankedInsight) => void;
  isExtracting?: boolean;
  onHighlightParagraph?: (text: string) => void;
}

export const PriorityWorkspacePanel: React.FC<PriorityWorkspacePanelProps> = ({
  insights,
  pageIntelligence,
  pageInsights,
  pageReasoning,
  pageExtraction,
  onJumpToPage,
  onExplain,
  onMakeCard,
  onSendToNoteLab,
  onHighlightParagraph,
}) => {
  return (
    <PriorityComprehensionPanel
      rankedInsights={insights}
      pageIntelligence={pageIntelligence}
      pageInsights={pageInsights}
      pageReasoning={pageReasoning}
      pageExtraction={pageExtraction}
      onInsightClick={onExplain}
      onJumpToPage={onJumpToPage}
      onSaveToNoteLab={onSendToNoteLab}
      onHighlightParagraph={onHighlightParagraph}
    />
  );
};

export default PriorityWorkspacePanel;
