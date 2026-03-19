import type { DisciplineType, PageType } from '@/types/comprehension';
import type { GroundedConcept } from '@/types/comprehension';

const DISCIPLINE_PREFIX: Record<DisciplineType, string> = {
  medical_clinical: 'Clinical focus',
  dental_clinical: 'Dental focus',
  biology: 'Biology focus',
  chemistry: 'Chemistry focus',
  physics: 'Physics focus',
  mathematics: 'Math focus',
  history: 'History focus',
  law: 'Law focus',
  philosophy: 'Philosophy focus',
  general_academic: 'Academic focus',
  technical_procedural: 'Procedure focus',
  unknown: 'Page focus',
};

export function buildPriority(context: {
  detectedSectionTitle: string | null;
  mergedText: string;
  headings: string[];
  discipline?: DisciplineType;
  pageType?: PageType;
  groundedConcepts?: GroundedConcept[];
}) {
  const sentences = (context.mergedText || '').split(/(?<=[.!?])\s+/).filter(Boolean);
  const concepts = (context.groundedConcepts ?? []).slice(0, 4).map((c) => c.label);
  const coreSentence = sentences[0] || 'This page develops one core teaching objective.';

  return {
    currentPageFocus: context.detectedSectionTitle || context.headings[0] || 'Current page focus',
    pagePurpose: `${DISCIPLINE_PREFIX[context.discipline ?? 'unknown']}: ${coreSentence}`,
    pageType: context.pageType ?? 'unknown',
    topPriorities: [
      ...sentences.slice(0, 3),
      ...(concepts.length ? [`Key concepts: ${concepts.join(', ')}.`] : []),
    ].slice(0, 4),
    whyTheseMatter: sentences[4] || 'Retain these ideas before moving on; later sections depend on this page-level foundation.',
    retentionChecklist: [
      'What is this page trying to teach?',
      'Which concept matters most?',
      'What should you retain before the next page?',
    ],
  };
}
