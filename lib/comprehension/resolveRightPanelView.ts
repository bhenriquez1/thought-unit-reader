import type { RightPanelState } from '@/state/rightPanelState';
import { sanitizeRenderList, sanitizeRenderText } from './sanitizeRenderText';
import { buildHighlightAnchors, type HighlightAnchor } from './buildHighlightAnchors';
const MIN_VALID_LENGTH = 120;

export type GroundedPayload = {
  pageNumber?: number;
  header?: string | null;
  priority?: {
    overview?: string | string[] | null;
    mainIdeas?: string[];
    whyItMatters?: string | string[] | null;
    remember?: string | string[] | null;
  };
  explain?: Record<string, unknown> | null;
  relations?: { edges?: Array<{ from: string; to: string; why?: string }> } | null;
  compare?: { contrasts?: Array<{ a: string; b: string; confusion?: string }> } | null;
  cards?: Array<{ id: string; text?: string | null; title?: string | null; claim?: string | null }>;
  paragraphUnits?: Array<{ id: string; text?: string | null }>;
};

export function resolveRightPanelView({
  state,
  groundedPagePayload,
}: {
  state: RightPanelState;
  groundedPagePayload: GroundedPayload | null;
}): {
  header: string;
  sections: Array<{ id: string; title: string; body: string | string[] }>;
  highlightAnchors: HighlightAnchor[];
  emptyState: string | null;
} {
  const payload = groundedPagePayload;
  const pageHeader = sanitizeRenderText(payload?.header ?? `Page ${state.activePageNumber}`);
  const highlightAnchors = buildHighlightAnchors({
    pageNumber: payload?.pageNumber,
    paragraphUnits: payload?.paragraphUnits,
    cards: payload?.cards ?? [],
  });

  if (!payload) {
    return {
      header: pageHeader,
      sections: [],
      highlightAnchors,
      emptyState: 'No grounded page payload is available yet for this page.',
    };
  }

  if (state.activeTab === 'priority') {
    const overview = sanitizeRenderText(payload.priority?.overview ?? payload.header ?? '');
    const mainIdeas = sanitizeRenderList(payload.priority?.mainIdeas ?? []);
    const whyItMatters = sanitizeRenderText(payload.priority?.whyItMatters ?? '');
    const remember = sanitizeRenderText(payload.priority?.remember ?? '');
    const resolvedText = [overview, ...mainIdeas, whyItMatters, remember].join(' ').trim();
    const isIncomplete = resolvedText.length > 0 && resolvedText.length < MIN_VALID_LENGTH;
    return {
      header: pageHeader,
      sections: [
        { id: 'overview', title: 'Page / Section Overview', body: overview },
        { id: 'main-ideas', title: 'Main Ideas', body: mainIdeas },
        { id: 'why', title: 'Why It Matters', body: whyItMatters },
        { id: 'remember', title: 'What To Remember', body: remember },
      ],
      highlightAnchors,
      emptyState: isIncomplete
        ? 'Grounded output is incomplete for this page; triggering fallback synthesis from available page text.'
        : (overview || mainIdeas.length ? null : 'No grounded priority output is available for this page yet.'),
    };
  }

  if (state.activeTab === 'relations') {
    const edges = payload.relations?.edges ?? [];
    return {
      header: pageHeader,
      sections: edges.map((edge, index) => ({
        id: `rel-${index}`,
        title: `${sanitizeRenderText(edge.from)} → ${sanitizeRenderText(edge.to)}`,
        body: sanitizeRenderText(edge.why ?? ''),
      })),
      highlightAnchors,
      emptyState: edges.length ? null : 'No strong same-page concept links were found for this page yet.',
    };
  }

  if (state.activeTab === 'compare') {
    const contrasts = payload.compare?.contrasts ?? [];
    return {
      header: pageHeader,
      sections: contrasts.map((entry, index) => ({
        id: `cmp-${index}`,
        title: `${sanitizeRenderText(entry.a)} vs ${sanitizeRenderText(entry.b)}`,
        body: sanitizeRenderText(entry.confusion ?? ''),
      })),
      highlightAnchors,
      emptyState: contrasts.length ? null : 'This page is mainly explanatory rather than contrastive.',
    };
  }

  return {
    header: pageHeader,
    sections: [],
    highlightAnchors,
    emptyState: null,
  };
}
