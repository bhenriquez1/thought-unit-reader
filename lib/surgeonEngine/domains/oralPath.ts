// lib/surgeonEngine/domains/oralPath.ts
// Oral Pathology domain module — activates for dental/oral path textbooks.
// Tags dysplasia, carcinoma, lesion types, etc. for exam-targeted highlighting.

import type { ParagraphUnit, AnchoredItem } from '../../page-intelligence/types';
import type { DomainModule, DomainContext } from './DomainModule';
import { registerDomainModule } from './DomainModule';

// ============================================================================
// Domain detection
// ============================================================================

const ORAL_PATH_KEYWORDS = [
  'dysplasia', 'carcinoma', 'leukoplakia', 'erythroplakia', 'ulcer',
  'vesicle', 'bulla', 'papule', 'macule', 'plaque', 'erosion',
  'squamous cell', 'ameloblast', 'odontogenic', 'basal cell',
  'periapical', 'pericoronitis', 'granuloma', 'cyst', 'salivary',
  'oral submucous fibrosis', 'lichen planus', 'pemphigus', 'pemphigoid',
];

const ORAL_PATH_TITLE_RE =
  /oral path|head and neck|oral medicine|oral histology|oral mucos/i;
const ORAL_PATH_KEYWORD_RE = new RegExp(
  `\\b(${ORAL_PATH_KEYWORDS.slice(0, 10).join('|')})\\b`,
  'i',
);

// ============================================================================
// Content tagging
// ============================================================================

const MALIGNANT_RE = /\b(carcinoma|malignant|metastat|invasive|scc|squamous cell carcinoma)\b/i;
const PREMALIGNANT_RE = /\b(dysplasia|premalignant|potentially malignant|leukoplakia|erythroplakia)\b/i;
const LESION_TYPE_RE = /\b(vesicle|bulla|ulcer|erosion|plaque|macule|papule|nodule|cyst)\b/i;
const PATHOGEN_RE = /\b(hpv|hsv|candida|strep|staph|epstein.barr|ebv|cmv|bacterial)\b/i;

export const oralPath: DomainModule = {
  id: 'oral-path',
  label: 'Oral Pathology',

  isApplicable(ctx: DomainContext): boolean {
    if (ctx.title && ORAL_PATH_TITLE_RE.test(ctx.title)) return true;
    const allText = [...(ctx.toc ?? []), ...(ctx.keywords ?? [])].join(' ');
    return ORAL_PATH_KEYWORD_RE.test(allText);
  },

  enrichParagraph(p: ParagraphUnit): ParagraphUnit {
    const text = p.text;
    let boost = 0;
    const extraTerms: string[] = [];

    if (MALIGNANT_RE.test(text)) { boost += 15; extraTerms.push('malignant'); }
    if (PREMALIGNANT_RE.test(text)) { boost += 12; extraTerms.push('premalignant'); }
    if (LESION_TYPE_RE.test(text)) { boost += 6; }
    if (PATHOGEN_RE.test(text)) { boost += 5; }

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
    if (MALIGNANT_RE.test(text)) tags.push('oral-path', 'malignant', 'high-yield');
    if (PREMALIGNANT_RE.test(text)) tags.push('oral-path', 'premalignant');
    if (LESION_TYPE_RE.test(text)) tags.push('oral-path', 'lesion');
    if (PATHOGEN_RE.test(text)) tags.push('oral-path', 'pathogen');
    if (tags.length === 0) return i;
    return { ...i, tags: [...(i.tags ?? []), ...tags] };
  },
};

registerDomainModule(oralPath);
