import type { DisciplineType, PageType } from '@/types/comprehension';

function disciplineHint(discipline: DisciplineType): string {
  switch (discipline) {
    case 'mathematics': return 'Define notation, explain variable dependency, and connect equation/table/graph representations.';
    case 'history': return 'Emphasize chronology, cause/effect, motives, and significance.';
    case 'law': return 'Center rule, exception, test, and application to fact patterns.';
    case 'medical_clinical':
    case 'dental_clinical': return 'Use mechanism → indication/contraindication → clinical consequence framing.';
    case 'technical_procedural': return 'Explain sequence, why each step matters, and failure points.';
    default: return 'Explain the claim, mechanism, and why it matters before moving on.';
  }
}

export function buildExplain(context: { mergedText: string; discipline?: DisciplineType; pageType?: PageType }) {
  const text = (context.mergedText || '').trim();
  const lead = text.slice(0, 420);
  return [
    `What this means: ${lead}`,
    `How to reason about it (${context.pageType ?? 'unknown'}): ${disciplineHint(context.discipline ?? 'unknown')}`,
    'Common mistake: memorizing fragments without linking them to mechanism or application.',
  ].join('\n\n');
}
