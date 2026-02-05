import { create } from 'zustand';
import { classifyPageText, extractConcepts, type ConceptOutput, type PageClassification } from '@/lib/universalExtractor';

interface ConceptStoreState {
  conceptsByPage: Record<number, ConceptOutput[]>;
  classificationByPage: Record<number, PageClassification>;
  extractForPage: (page: number, pageText: string) => void;
  clearPage: (page: number) => void;
}

export const useConceptStore = create<ConceptStoreState>((set) => ({
  conceptsByPage: {},
  classificationByPage: {},
  extractForPage: (page, pageText) => {
    const concepts = extractConcepts(pageText);
    const classification = classifyPageText(pageText);

    set((state) => ({
      conceptsByPage: {
        ...state.conceptsByPage,
        [page]: concepts
      },
      classificationByPage: {
        ...state.classificationByPage,
        [page]: classification
      }
    }));
  },
  clearPage: (page) => {
    set((state) => {
      const nextConcepts = { ...state.conceptsByPage };
      const nextClassifications = { ...state.classificationByPage };
      delete nextConcepts[page];
      delete nextClassifications[page];
      return {
        conceptsByPage: nextConcepts,
        classificationByPage: nextClassifications
      };
    });
  }
}));
