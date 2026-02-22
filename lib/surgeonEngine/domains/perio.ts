// lib/surgeonEngine/domains/perio.ts
// Periodontics domain module — activates for perio textbooks.
// Tags gingivitis, periodontitis, CAL, BOP, PPD, plaque, calculus, etc.

import type { ParagraphUnit, AnchoredItem } from '../../page-intelligence/types';
import type { DomainModule, DomainContext } from './DomainModule';
import { registerDomainModule } from './DomainModule';

// ============================================================================
// Domain detection
// ============================================================================

const PERIO_KEYWORDS = [
  'gingivitis', 'periodontitis', 'cal', 'bop', 'ppd', 'plaque', 'calculus',
  'furcation', 'alveolar bone', 'gingival', 'sulcus', 'pocket depth',
  'attachment loss', 'bone loss', 'periodontal', 'scaling', 'root planing',
  'osseointegration', 'implant', 'perio',
];

const PERIO_TITLE_RE = /periodon|periodont|perio textbook|gingival disease/i;
const PERIO_KEYWORD_RE = new RegExp(
  `\\b(${PERIO_KEYWORDS.slice(0, 8).join('|')})\\b`,
  'i',
);

// ============================================================================
// Content tagging
// ============================================================================

const CLINICAL_PARAM_RE = /\b(ppd|cal|bop|probe|pocket depth|attachment level|bone level)\b/i;
const BACTERIA_RE = /\b(p\.? gingivalis|aa|actinomyces|treponema|fusobacterium|spirochete|gram.negative)\b/i;
const TREATMENT_RE = /\b(srp|scaling|root planing|debridement|flap surgery|osseous|grafting|regeneration)\b/i;
const CLASSIFICATION_RE = /\b(stage|grade|generalized|localized|aggressive|chronic|necrotizing)\b/i;

export const perio: DomainModule = {
  id: 'perio',
  label: 'Periodontics',

  isApplicable(ctx: DomainContext): boolean {
    if (ctx.title && PERIO_TITLE_RE.test(ctx.title)) return true;
    const allText = [...(ctx.toc ?? []), ...(ctx.keywords ?? [])].join(' ');
    return PERIO_KEYWORD_RE.test(allText);
  },

  enrichParagraph(p: ParagraphUnit): ParagraphUnit {
    const text = p.text;
    let boost = 0;
    const extraTerms: string[] = [];

    if (CLINICAL_PARAM_RE.test(text)) { boost += 12; extraTerms.push('clinical-parameter'); }
    if (BACTERIA_RE.test(text)) { boost += 10; extraTerms.push('pathogen'); }
    if (TREATMENT_RE.test(text)) { boost += 8; extraTerms.push('treatment'); }
    if (CLASSIFICATION_RE.test(text)) { boost += 7; extraTerms.push('classification'); }

    if (boost === 0) return p;
    return {
      ...p,
      importance: Math.min(100, p.importance + boost),
      keyTerms: [...p.keyTerms, ...extraTerms],
    };
  },

  enrichItem(i: AnchoredItem): AnchoredItem {
    const tags: string[] = [];
    const text = i.content;
    if (CLINICAL_PARAM_RE.test(text)) tags.push('perio', 'clinical-parameter', 'high-yield');
    if (BACTERIA_RE.test(text)) tags.push('perio', 'microbiology');
    if (TREATMENT_RE.test(text)) tags.push('perio', 'treatment');
    if (CLASSIFICATION_RE.test(text)) tags.push('perio', 'classification');
    if (tags.length === 0) return i;
    return { ...i, tags: [...(i.tags ?? []), ...tags] };
  },
};

registerDomainModule(perio);
