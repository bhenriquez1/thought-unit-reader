import type { PageType } from '@/types/comprehension';

function count(pattern: RegExp, text: string): number {
  const matches = text.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`));
  return matches?.length ?? 0;
}

export function classifyPageType(input: { mergedText?: string; headings?: string[] }): PageType {
  const text = `${(input.headings ?? []).join(' ')} ${(input.mergedText ?? '')}`.slice(0, 7000);
  if (!text.trim()) return 'unknown';

  const hasFormula = /[=∫∑√]|\bf\(x\)|\bdy\/dx\b|\d+\s*[+\-*/^]\s*\d+/i.test(text);
  const hasTimeline = /\b(19\d{2}|20\d{2}|century|timeline|before|after|subsequently|thereafter)\b/i.test(text);
  const hasCompare = /\b(vs\.?|versus|compared to|in contrast|whereas|difference between)\b/i.test(text);
  const hasProcedure = /\b(step\s*\d+|first,|second,|third,|procedure|protocol|algorithm)\b/i.test(text);
  const hasMechanism = /\b(leads to|results in|therefore|because|mechanism|pathway|cascade)\b/i.test(text);
  const hasEvidence = /\b(p-value|confidence interval|odds ratio|study|trial|sample size|results)\b/i.test(text);
  const hasCase = /\b(case|fact pattern|holding|application|scenario)\b/i.test(text);
  const hasDefinition = /\b(is defined as|refers to|means that|is called)\b/i.test(text);
  const hasAnatomy = /\b(anatomy|structure|layer|innervation|vascular|morpholog)\b/i.test(text);

  if (hasFormula) return 'formula_page';
  if (hasCompare) return 'comparison_page';
  if (hasTimeline) return 'timeline_causation_page';
  if (hasEvidence) return 'evidence_results_page';
  if (hasCase) return 'case_application_page';
  if (hasAnatomy) return 'anatomy_structure_page';
  if (hasProcedure) return 'procedure_page';
  if (hasMechanism) return 'mechanism_page';
  if (hasDefinition) return 'definition_page';

  const processCount = count(/\bthen|next|finally|after\b/gi, text);
  if (processCount >= 3) return 'process_page';

  return 'concept_overview';
}
