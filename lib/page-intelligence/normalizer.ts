// lib/page-intelligence/normalizer.ts
// Cleanup + quality pass before synthesis so downstream engines see stable prose.

import type { Segment } from './types';

export type PageDomain = 'pharmacology' | 'periodontology' | 'biology' | 'clinical' | 'general';

export interface FigureContext {
  captions: string[];
  relevant: boolean;
}

export interface NormalizationReport {
  removedHeaderFooterLines: number;
  removedPageNoiseLines: number;
  repairedLineWraps: number;
  dehyphenatedWords: number;
  removedMalformedLines: number;
  figureCaptionsDetected: number;
  lowQuality: boolean;
}

export interface NormalizedPageText {
  text: string;
  domain: PageDomain;
  figureContext: FigureContext;
  report: NormalizationReport;
}

const DOMAIN_KEYWORDS: Record<PageDomain, RegExp[]> = {
  pharmacology: [
    /\b(drug|agonist|antagonist|receptor|half-life|bioavailability|clearance|metabolism|adverse effect|dose|therapeutic)\b/gi,
  ],
  periodontology: [
    /\b(gingiva|periodontal|periodontium|pocket depth|clinical attachment|cementum|alveolar bone|plaque|calculus)\b/gi,
  ],
  biology: [
    /\b(cell|organelle|enzyme|metabolism|transcription|translation|genetics|mitosis|meiosis|homeostasis)\b/gi,
  ],
  clinical: [
    /\b(patient|diagnosis|treatment|management|symptom|prognosis|contraindicated|therapy)\b/gi,
  ],
  general: [],
};

const HEADER_FOOTER_RE = /^\s*(chapter\s+\d+|page\s+\d+|\d+\s*\/\s*\d+|\d+)\s*$/i;
const MALFORMED_RE = /([^\w\s.,;:()\-/%]|_){6,}/;
const CAPTION_RE = /^\s*(figure|fig\.?|table|chart|diagram|graph|image)\s*\d*[\.:\-]?\s*/i;

function scoreDomain(text: string): PageDomain {
  const domainScores: Array<[PageDomain, number]> = (Object.keys(DOMAIN_KEYWORDS) as PageDomain[])
    .filter((d) => d !== 'general')
    .map((domain) => {
      const score = DOMAIN_KEYWORDS[domain].reduce((sum, pattern) => {
        const matches = text.match(pattern);
        return sum + (matches?.length ?? 0);
      }, 0);
      return [domain, score];
    });

  domainScores.sort((a, b) => b[1] - a[1]);
  if (!domainScores.length || domainScores[0][1] < 2) return 'general';
  return domainScores[0][0];
}

function dehyphenateLineBreaks(text: string): { text: string; count: number } {
  let count = 0;
  const merged = text.replace(/([A-Za-z]{2,})-\n([a-z]{2,})/g, (_m, left, right) => {
    count += 1;
    return `${left}${right}`;
  });
  return { text: merged, count };
}

function repairLineWraps(text: string): { text: string; count: number } {
  let count = 0;
  const repaired = text.replace(/([^\n\.!?:])\n(?=[a-z(])/g, (_m, left) => {
    count += 1;
    return `${left} `;
  });
  return { text: repaired, count };
}

function extractFigureContext(lines: string[]): FigureContext {
  const captions = lines
    .filter((line) => CAPTION_RE.test(line.trim()))
    .map((line) => line.trim().replace(/\s+/g, ' '));
  const relevant = captions.some((caption) => caption.length > 18);
  return { captions, relevant };
}

export function normalizePageText(rawText: string): NormalizedPageText {
  const initialLines = rawText.split('\n');

  let removedHeaderFooterLines = 0;
  let removedPageNoiseLines = 0;
  let removedMalformedLines = 0;

  const cleanedLines = initialLines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;

    if (HEADER_FOOTER_RE.test(trimmed)) {
      removedHeaderFooterLines += 1;
      return false;
    }

    if (/^(copyright|all rights reserved|www\.|http[s]?:\/\/)/i.test(trimmed)) {
      removedPageNoiseLines += 1;
      return false;
    }

    if (MALFORMED_RE.test(trimmed)) {
      removedMalformedLines += 1;
      return false;
    }

    return true;
  });

  const figureContext = extractFigureContext(cleanedLines);

  const lineText = cleanedLines.join('\n');
  const dehyphenated = dehyphenateLineBreaks(lineText);
  const lineWrapRepair = repairLineWraps(dehyphenated.text);

  const text = lineWrapRepair.text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  const domain = scoreDomain(text);

  const lowQuality =
    text.length < 60 ||
    removedMalformedLines >= 3 ||
    (dehyphenated.count >= 5 && text.length < 180);

  return {
    text,
    domain,
    figureContext,
    report: {
      removedHeaderFooterLines,
      removedPageNoiseLines,
      repairedLineWraps: lineWrapRepair.count,
      dehyphenatedWords: dehyphenated.count,
      removedMalformedLines,
      figureCaptionsDetected: figureContext.captions.length,
      lowQuality,
    },
  };
}

function segmentTermSet(segment: Segment): Set<string> {
  return new Set((segment.text.toLowerCase().match(/[a-z]{4,}/g) ?? []).slice(0, 40));
}

export function filterSegmentsByPageRelevance(segments: Segment[]): Segment[] {
  const heading = segments.find((s) => s.kind === 'heading')?.text ?? '';
  const headingTerms = new Set(heading.toLowerCase().match(/[a-z]{4,}/g) ?? []);

  if (headingTerms.size === 0) {
    return segments.filter((s) => s.kind !== 'caption' || s.text.length > 30);
  }

  return segments.filter((segment) => {
    if (segment.kind === 'heading') return true;
    if (segment.kind === 'caption') {
      return /\b(shows?|illustrates?|demonstrates?)\b/i.test(segment.text);
    }

    const terms = segmentTermSet(segment);
    const overlap = Array.from(terms).filter((t) => headingTerms.has(t)).length;
    const overlapRatio = overlap / Math.max(1, Math.min(headingTerms.size, 6));
    return overlapRatio >= 0.16 || segment.kind === 'list';
  });
}
