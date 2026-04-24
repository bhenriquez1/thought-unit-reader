import type { ReaderPanelState as WorkspaceReaderPanelState, WorkspaceMode } from '@/types/workspace';

export type RightPanelTab = 'priority' | 'explain' | 'relations' | 'compare' | 'insights';

export type RightPanelState = WorkspaceReaderPanelState & {
  activeDocumentId: string;
  activePageNumber: number;
  deeperReasoningEnabled: boolean;
  syncHighlightsEnabled: boolean;
  activeCardId: string | null;
  currentPageVersion: string;
};

export const DEFAULT_RIGHT_PANEL_STATE: RightPanelState = {
  workspaceMode: 'reader',
  documentId: null,
  documentTitle: null,
  activePage: 1,
  activeChapterId: null,
  activeSectionId: null,
  activeTab: 'priority',
  audienceMode: 'student',
  depthMode: 'standard',
  densityMode: 'condensed',
  deeperReasoning: false,
  syncHighlights: false,
  selectedParagraphId: null,
  extractedPageKey: null,
  activeDocumentId: '',
  activePageNumber: 1,
  deeperReasoningEnabled: false,
  syncHighlightsEnabled: false,
  activeCardId: null,
  currentPageVersion: 'none:1:none',
};

export function buildCurrentPageVersion(documentId: string, pageNumber: number, sectionId: string | null): string {
  return `${documentId || 'none'}:${Math.max(1, pageNumber)}:${sectionId ?? 'none'}`;
}

export function toWorkspaceMode(mode: string): WorkspaceMode {
  if (mode === 'toc' || mode === 'notelab' || mode === 'study') return mode;
  return 'reader';
}
