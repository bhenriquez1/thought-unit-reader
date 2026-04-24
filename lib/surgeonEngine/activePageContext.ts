export type ActivePageContext = {
  documentId: string | null;
  pageNumber: number;
  sectionId: string | null;
  tab: 'priority' | 'explain' | 'relations' | 'compare' | 'insights';
  audienceMode: 'polish' | 'student' | 'clinical' | 'expert';
  depthMode: 'minimal' | 'standard' | 'deep';
  densityMode: 'condensed' | 'expanded';
  essentialMode: boolean;
  deeperReasoning: boolean;
};

export const DEFAULT_ACTIVE_PAGE_CONTEXT: ActivePageContext = {
  documentId: null,
  pageNumber: 1,
  sectionId: null,
  tab: 'priority',
  audienceMode: 'student',
  depthMode: 'standard',
  densityMode: 'condensed',
  essentialMode: true,
  deeperReasoning: false,
};

export function buildActivePageContext(input: Partial<ActivePageContext>): ActivePageContext {
  return {
    ...DEFAULT_ACTIVE_PAGE_CONTEXT,
    ...input,
  };
}

export function getActivePageContextKey(context: ActivePageContext): string {
  return [
    context.documentId ?? 'none',
    context.pageNumber,
    context.sectionId ?? 'none',
    context.tab,
    context.audienceMode,
    context.depthMode,
    context.densityMode,
    context.essentialMode ? 'essential' : 'full',
    context.deeperReasoning ? 'deep' : 'standard',
  ].join(':');
}
