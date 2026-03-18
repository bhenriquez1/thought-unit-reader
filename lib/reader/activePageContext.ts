import type { PageIntelligence, SourceRef } from '@/lib/page-intelligence';
import { buildPriority } from '@/lib/synthesis/buildPriority';
import { buildExplain } from '@/lib/synthesis/buildExplain';
import { buildRelations } from '@/lib/synthesis/buildRelations';
import { buildCompare } from '@/lib/synthesis/buildCompare';
import { buildInsights } from '@/lib/synthesis/buildInsights';
import { canSynthesizePage, getFallbackDisplayState } from '@/lib/synthesis/fallbackPolicy';
import { resolvePageHeading, sanitizeTitle } from '@/lib/page-intelligence/titleResolution';

export type ActivePageContext = {
  docId: string;
  pageNumber: number;
  extractionVersion: string;
  pageLabel: string;
  detectedSectionTitle: string | null;
  detectedSubsectionTitles: string[];
  nativeText: string;
  ocrText: string;
  mergedText: string;
  extractionConfidence: number;
  extractionMethod: 'native' | 'ocr' | 'hybrid' | 'failed';
  headingBlocks: string[];
  paragraphBlocks: string[];
  figureBlocks: string[];
  captionBlocks: string[];
  synthesis: {
    priority: ReturnType<typeof buildPriority> | null;
    explain: string | null;
    relations: string[];
    compare: string[];
    insights: string[];
  };
  sourceAnchors: SourceRef[];
  fallbackState: ReturnType<typeof getFallbackDisplayState> | null;
};

export function getPageContextCacheKey(docId: string, pageNumber: number, extractionVersion: string): string {
  return `${docId}:${pageNumber}:${extractionVersion}`;
}

export function buildActivePageContext(docId: string, pageIntelligence: PageIntelligence): ActivePageContext {
  const pageNumber = pageIntelligence.pageNumber;
  const headingBlocks = pageIntelligence.segments.filter((s) => s.kind === 'heading').map((s) => sanitizeTitle(s.text, '')).filter(Boolean);
  const paragraphBlocks = pageIntelligence.segments.filter((s) => s.kind === 'paragraph' || s.kind === 'list').map((s) => s.text);
  const figureBlocks = pageIntelligence.segments.filter((s) => /figure|fig\.?\s*\d+/i.test(s.text)).map((s) => s.text);
  const captionBlocks = pageIntelligence.segments.filter((s) => s.kind === 'caption').map((s) => s.text);
  const nativeText = pageIntelligence.segments.map((s) => s.text).join('\n\n');
  const mergedText = (pageIntelligence as any).mergedText || nativeText;
  const confidence = pageIntelligence.confidence || 0;
  const extractionMethod = pageIntelligence.extractionMethod || (pageIntelligence.source === 'mixed' ? 'hybrid' : pageIntelligence.source === 'native' ? 'native' : 'ocr');
  const shouldSynthesize = canSynthesizePage(confidence, mergedText);

  const resolvedSectionTitle = resolvePageHeading([
    headingBlocks[0],
    pageIntelligence.pageMemory?.sectionId,
    pageIntelligence.structureMap?.topic,
  ], 'Current Page');

  return {
    docId,
    pageNumber,
    extractionVersion: pageIntelligence.extractionVersion || 'v2',
    pageLabel: `Page ${pageNumber}`,
    detectedSectionTitle: resolvedSectionTitle,
    detectedSubsectionTitles: headingBlocks.slice(1, 5),
    nativeText: (pageIntelligence as any).nativeText || nativeText,
    ocrText: (pageIntelligence as any).ocrText || '',
    mergedText,
    extractionConfidence: confidence,
    extractionMethod,
    headingBlocks,
    paragraphBlocks,
    figureBlocks,
    captionBlocks,
    synthesis: shouldSynthesize
      ? {
          priority: buildPriority({ detectedSectionTitle: headingBlocks[0] || null, mergedText, headings: headingBlocks }),
          explain: buildExplain({ mergedText }),
          relations: buildRelations(pageIntelligence.relations.map((r) => `${r.from} ${r.type.replace(/_/g, ' ')} ${r.to}`)),
          compare: buildCompare(pageIntelligence.signals.filter((s) => s.type === 'contrast' || s.type === 'exception').map((s) => s.label)),
          insights: buildInsights(pageIntelligence.insights.map((i) => i.body)),
        }
      : {
          priority: null,
          explain: null,
          relations: ['No grounded relations found for this page yet.'],
          compare: ['No compare pair available for the current page cluster yet.'],
          insights: [],
        },
    sourceAnchors: pageIntelligence.tabResponses?.priority?.sourceAnchors || [],
    fallbackState: shouldSynthesize ? null : getFallbackDisplayState(),
  };
}
