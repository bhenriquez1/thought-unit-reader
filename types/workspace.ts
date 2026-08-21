export type WorkspaceMode = 'reader' | 'toc' | 'syllabus' | 'notelab' | 'study' | 'podcast' | 'studyguide' | 'studyplan';

/**
 * Determines how the Reader, Whiteboard, and AI responses are framed.
 * Adult learner profiles only — Elena Mode is a separate dedicated product experience,
 * not a rendering variant of the adult platform.
 */
export type LearningProfile =
  | 'standard'
  | 'dental'
  | 'medical'
  | 'surgeon'
  | 'dat';

export const LEARNING_PROFILE_LABELS: Record<LearningProfile, string> = {
  standard: 'Standard',
  dental:   'Dental',
  medical:  'Medical',
  surgeon:  'Surgeon',
  dat:      'DAT',
};

export type ReaderPanelState = {
  workspaceMode: WorkspaceMode;
  documentId: string | null;
  documentTitle: string | null;
  activePage: number;
  activeChapterId?: string | null;
  activeSectionId?: string | null;
  activeTab: 'priority' | 'explain' | 'relations' | 'compare' | 'insights';
  audienceMode: 'polish' | 'student' | 'clinical' | 'expert';
  depthMode: 'minimal' | 'standard' | 'deep';
  densityMode: 'condensed' | 'expanded';
  deeperReasoning: boolean;
  syncHighlights: boolean;
  selectedParagraphId?: string | null;
  extractedPageKey: string | null;
};

export type NoteLabMode = 'cards' | 'map' | 'notebook';

export type NoteLabState = {
  documentId: string;
  scope: 'page' | 'section' | 'chapter' | 'document' | 'saved';
  mode: NoteLabMode;
  selectedCardId?: string | null;
  selectedClusterId?: string | null;
  searchQuery: string;
  filters: {
    types: string[];
    tags: string[];
    weakOnly: boolean;
    savedOnly: boolean;
  };
};

export type LearningCard = {
  id: string;
  documentId: string;
  page: number;
  chapterId?: string | null;
  sectionId?: string | null;
  paragraphId?: string | null;
  type: 'core' | 'definition' | 'mechanism' | 'formula' | 'trap' | 'example' | 'comparison' | 'application' | 'timeline' | 'rule' | 'case' | 'finding';
  title: string;
  body: string;
  whyItMatters?: string;
  recallPrompt?: string;
  tags: string[];
  relations: Array<{
    targetId: string;
    relation: 'depends_on' | 'causes' | 'contrasts_with' | 'defines' | 'example_of' | 'applies_to' | 'supports';
  }>;
};

export type StudyLauncherState = {
  documentId: string;
  source: 'notelab' | 'reader' | 'saved';
  scope: 'page' | 'section' | 'chapter' | 'document' | 'weak';
  availableCounts: {
    quickRecall: number;
    connectionRecall: number;
    compare: number;
    application: number;
    formula: number;
  };
};
