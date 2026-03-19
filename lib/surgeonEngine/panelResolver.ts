import type { ActivePageContext } from './activePageContext';
import type { PageIntelligence, TabResponse } from '@/lib/page-intelligence';

export function resolvePanelTitle(pageIntelligence: PageIntelligence | null | undefined, chapterTitle?: string | null): string {
  const sectionHeading = pageIntelligence?.segments?.find((segment) => segment.kind === 'heading')?.text?.trim();
  const chapterHeading = chapterTitle?.trim();
  if (sectionHeading) return sectionHeading;
  if (chapterHeading) return chapterHeading;
  if ((pageIntelligence?.confidence ?? 0) < 0.3) return 'Low-confidence page extraction';
  return 'Current Page';
}

export function resolveTabPayload(
  context: ActivePageContext,
  pageIntelligence: PageIntelligence | null | undefined,
): TabResponse | undefined {
  if (!pageIntelligence) return undefined;
  if (context.tab === 'priority') return pageIntelligence.tabPayloads?.priorityPayload ?? pageIntelligence.tabResponses?.priority;
  if (context.tab === 'explain') return pageIntelligence.tabPayloads?.explainPayload ?? pageIntelligence.tabResponses?.explain;
  if (context.tab === 'relations') return pageIntelligence.tabPayloads?.relationsPayload ?? pageIntelligence.tabResponses?.relations;
  if (context.tab === 'compare') return pageIntelligence.tabPayloads?.comparePayload ?? pageIntelligence.tabResponses?.compare;
  return pageIntelligence.tabPayloads?.insightsPayload ?? pageIntelligence.tabResponses?.insights;
}

export function shouldShowDeeperReasoning(context: ActivePageContext): boolean {
  return context.deeperReasoning && !context.essentialMode;
}
