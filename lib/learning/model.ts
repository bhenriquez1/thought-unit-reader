export type LearningCardType =
  | 'core'
  | 'definition'
  | 'mechanism'
  | 'formula'
  | 'trap'
  | 'example'
  | 'comparison'
  | 'application';

export type CardRelationType =
  | 'depends_on'
  | 'defines'
  | 'causes'
  | 'implies'
  | 'contrasts_with'
  | 'example_of'
  | 'applies_to'
  | 'commonly_confused_with'
  | 'part_of';

export type LearningCard = {
  id: string;
  documentId: string;
  page: number;
  chapterId?: string | null;
  sectionId?: string | null;
  paragraphId?: string | null;
  type: LearningCardType;
  title: string;
  body: string;
  whyItMatters?: string;
  recallPrompt?: string;
  memoryHook?: string;
  tags: string[];
  relations: Array<{
    targetId: string;
    relation: CardRelationType | string;
  }>;
};

export type ConnectionNode = {
  id: string;
  label: string;
  type: 'core' | 'supporting' | 'formula' | 'event' | 'rule' | 'finding' | 'comparison';
  page?: number;
};

export type ConnectionEdge = {
  id: string;
  source: string;
  target: string;
  relation:
    | 'depends_on'
    | 'defines'
    | 'causes'
    | 'implies'
    | 'contrasts_with'
    | 'example_of'
    | 'applies_to';
};
