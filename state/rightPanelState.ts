export type RightPanelTab = 'priority' | 'explain' | 'relations' | 'compare' | 'insights';

export type RightPanelState = {
  activeDocumentId: string;
  activePageNumber: number;
  activeSectionId: string | null;
  activeTab: RightPanelTab;
  audienceMode: 'polish' | 'student' | 'clinical' | 'expert';
  depthMode: 'minimal' | 'standard' | 'deep';
  densityMode: 'condensed' | 'expanded';
  deeperReasoningEnabled: boolean;
  syncHighlightsEnabled: boolean;
  activeCardId: string | null;
  currentPageVersion: string;
};

export const DEFAULT_RIGHT_PANEL_STATE: RightPanelState = {
  activeDocumentId: '',
  activePageNumber: 1,
  activeSectionId: null,
  activeTab: 'priority',
  audienceMode: 'student',
  depthMode: 'standard',
  densityMode: 'condensed',
  deeperReasoningEnabled: false,
  syncHighlightsEnabled: false,
  activeCardId: null,
  currentPageVersion: 'doc:none|page:1|section:none',
};

export function buildCurrentPageVersion(documentId: string, pageNumber: number, sectionId: string | null): string {
  return `doc:${documentId || 'none'}|page:${Math.max(1, pageNumber)}|section:${sectionId ?? 'none'}`;
}
