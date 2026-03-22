import type { DisciplineType, PageType } from '@/types/comprehension';
import type { TeachingBlock } from '@/lib/comprehension/teachingSignalRanker';

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

export function buildExplain(context: {
  mergedText: string;
  discipline?: DisciplineType;
  pageType?: PageType;
  teachingBlocks?: TeachingBlock[];
}) {
  const blockText = (context.teachingBlocks ?? []).map((block) => block.text).join(' ');
  const text = (blockText || context.mergedText || '').trim();
  const lead = text.slice(0, 420);
  const formulaLine = (context.teachingBlocks ?? []).find((block) => block.score.formulaBoost > 0)?.text ?? '';
  const formulaHint = formulaLine
    ? `Formula focus: ${formulaLine.slice(0, 160)}`
    : 'Formula focus: Identify symbols, what they represent, and how changing one variable changes the output.';

  return [
    `What this means: ${lead}`,
    `Mechanism / logic (${context.pageType ?? 'unknown'}): ${disciplineHint(context.discipline ?? 'unknown')}`,
    'Stepwise: identify the main object, map relationships, then apply the decision rule or comparison.',
    formulaHint,
    'Why it matters: this page gives the conceptual model you need before problem-solving.',
    'Common mistake: memorizing fragments without linking them to mechanism or application.',
  ].join('\n\n');
}
