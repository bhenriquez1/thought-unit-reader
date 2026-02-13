// lib/surgeonView2/index.ts
// Surgeon View 2.0 Library Exports

export * from './types';

export {
  generateSnippetHash,
  createSourceAnchor,
  findTextByAnchor,
  extractParagraph,
  getParagraphsWithIndices,
} from './anchoring';

export {
  clusterConcepts,
  detectPearls,
  PEARL_PATTERNS,
} from './clustering';
