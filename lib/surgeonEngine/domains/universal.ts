// lib/surgeonEngine/domains/universal.ts
// Universal domain module — always active for any document.
// Adds generic high-yield tags and signal-based importance boosts.

import type { ParagraphUnit, AnchoredItem } from '../../page-intelligence/types';
import type { DomainModule, DomainContext } from './DomainModule';
import { registerDomainModule } from './DomainModule';

// Keywords that universally indicate high-yield content
const HIGH_YIELD_RE =
  /\b(most common|hallmark|classic|gold standard|first.?line|pathognomonic|must know|key|critical|important)\b/i;
const DEFINITION_TAG_RE =
  /\b(is defined as|refers to|is termed|is called|means that)\b/i;
const CONTRAST_TAG_RE =
  /\b(versus|vs\.?|in contrast|however|unlike|compared to|differentiate)\b/i;
const THRESHOLD_TAG_RE =
  /\b\d+\.?\d*\s*(mg|ml|mm|cm|%|mmHg|kg|g\/dL|mEq|IU|days?|weeks?)\b/i;

export const universal: DomainModule = {
  id: 'universal',
  label: 'Universal (always on)',

  isApplicable(_ctx: DomainContext): boolean {
    return true; // always active
  },

  enrichParagraph(p: ParagraphUnit): ParagraphUnit {
    const boosts: number[] = [];
    const extraTerms: string[] = [];

    if (HIGH_YIELD_RE.test(p.text)) boosts.push(8);
    if (DEFINITION_TAG_RE.test(p.text)) boosts.push(5);
    if (THRESHOLD_TAG_RE.test(p.text)) boosts.push(5);

    const totalBoost = boosts.reduce((a, b) => a + b, 0);
    if (totalBoost === 0) return p;

    return {
      ...p,
      importance: Math.min(100, p.importance + totalBoost),
      keyTerms: [...p.keyTerms, ...extraTerms],
    };
  },

  enrichItem(i: AnchoredItem): AnchoredItem {
    const extraTags: string[] = [];
    if (HIGH_YIELD_RE.test(i.content)) extraTags.push('high-yield');
    if (DEFINITION_TAG_RE.test(i.content)) extraTags.push('definition');
    if (CONTRAST_TAG_RE.test(i.content)) extraTags.push('contrast');
    if (THRESHOLD_TAG_RE.test(i.content)) extraTags.push('threshold');
    if (extraTags.length === 0) return i;
    return { ...i, tags: [...(i.tags ?? []), ...extraTags] };
  },
};

registerDomainModule(universal);
