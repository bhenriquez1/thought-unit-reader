import type { Annotation } from '@/lib/stores/annotationStore';
import type { LearningCard, LearningCardType } from './model';

function inferCardType(annotation: Annotation): LearningCardType {
  const text = `${annotation.noteTitle || ''} ${annotation.noteContent || ''} ${annotation.selectedText}`.toLowerCase();
  if (annotation.pdrm?.mnemonic || /mnemonic|remember|hook/.test(text)) return 'trap';
  if (/formula|=|\+|\-|\*|\//.test(text)) return 'formula';
  if (/compared|versus|vs\b|unlike|contrast/.test(text)) return 'comparison';
  if (/example|for instance|case/.test(text)) return 'example';
  if (/apply|clinical|patient|scenario/.test(text)) return 'application';
  if (/because|therefore|leads to|causes|mechanism/.test(text)) return 'mechanism';
  if (/is a|defined as|definition/.test(text)) return 'definition';
  return 'core';
}

function recallPromptFromAnnotation(annotation: Annotation): string {
  const promptSeed = annotation.noteTitle || annotation.selectedText;
  return `How would you explain: ${promptSeed.slice(0, 90)}?`;
}

export function annotationsToLearningCards(annotations: Annotation[], documentId: string): LearningCard[] {
  return annotations
    .filter((annotation) => annotation.documentId === documentId)
    .map((annotation) => ({
      id: `learning_${annotation.id}`,
      documentId,
      page: annotation.pageIndex + 1,
      chapterId: annotation.chapterId,
      sectionId: annotation.topicId ?? null,
      paragraphId: annotation.thoughtUnitId,
      type: inferCardType(annotation),
      title: annotation.noteTitle || annotation.selectedText.slice(0, 80),
      body: annotation.noteContent || annotation.selectedText,
      whyItMatters: annotation.pdrm?.decisionRule || undefined,
      recallPrompt: recallPromptFromAnnotation(annotation),
      memoryHook: annotation.pdrm?.mnemonic,
      tags: annotation.tags,
      relations: [],
    }));
}
