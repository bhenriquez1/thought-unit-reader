import type { DisciplineType, PageType } from '@/types/comprehension';
import type { GroundedConcept } from '@/types/comprehension';
import type { TeachingBlock } from '@/lib/comprehension/teachingSignalRanker';

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
  teachingBlocks?: TeachingBlock[];
}) {
  const preferredText = (context.teachingBlocks ?? []).map((b) => b.text).join(' ');
  const sentences = (preferredText || context.mergedText || '').split(/(?<=[.!?])\s+/).filter(Boolean);
  const concepts = (context.groundedConcepts ?? []).slice(0, 4).map((c) => c.label);
  const coreSentence = sentences[0] || 'This page teaches one core concept that supports downstream understanding.';
  const points = [
    ...sentences.slice(0, 5),
    ...(concepts.length ? [`Key concepts: ${concepts.join(', ')}.`] : []),
  ]
    .filter((line) => line.length > 20)
    .slice(0, 5);

  return {
    pageFocus: context.detectedSectionTitle || context.headings[0] || 'Current page focus',
    coreIdea: coreSentence,
    pagePurpose: `${DISCIPLINE_PREFIX[context.discipline ?? 'unknown']}: ${coreSentence}`,
    pageType: context.pageType ?? 'unknown',
    keyTeachingPoints: points,
    topPriorities: points,
    whyItMatters: sentences[5] || 'This page sets up decisions, mechanisms, or rules used later in the chapter.',
    whyTheseMatter: sentences[5] || 'Retain these ideas before moving on; later sections depend on this page-level foundation.',
    whatToRetain: [
      'Main claim or definition',
      'Mechanism / relationship that drives outcomes',
      'One decision rule, formula, or contrast you can apply',
    ],
    retentionChecklist: [
      'What is this page trying to teach?',
      'Which concept matters most?',
      'What should you retain before the next page?',
    ],
  };
}
