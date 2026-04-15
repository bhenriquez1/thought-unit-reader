// lib/reading-graph/types.ts

export type PageContentClass =
  | "prose"
  | "mixed_visual"
  | "image_only"
  | "diagram_heavy"
  | "table_heavy"
  | "form_page"
  | "front_matter"
  | "copyright_frontmatter"
  | "sparse_text"
  | "ocr_fragile";

export type ReadingGraphStatus =
  | "idle"
  | "loading"
  | "ready"
  | "blocked"
  | "error";

export type BlockKind =
  | "heading"
  | "paragraph"
  | "list"
  | "table"
  | "figure"
  | "caption"
  | "equation"
  | "form"
  | "callout"
  | "unknown";

export type SentenceRole =
  | "main_signal"
  | "support"
  | "weak_support"
  | "mechanism"
  | "effect"
  | "consequence"
  | "rule"
  | "trap"
  | "contrast"
  | "definition"
  | "example"
  | "question"
  | "evidence"
  | "boundary"
  | "unknown";

export type NarrativeSectionKind =
  | "main_signal"
  | "rule"
  | "mechanism"
  | "effect"
  | "consequence"
  | "trap"
  | "boundary"
  | "compare"
  | "relation"
  | "apply"
  | "support_cluster";

export type HighlightPriority = "main" | "support" | "weak" | "warning";

export type TruthBlockReason =
  | "loading"
  | "stale_page"
  | "book_changed"
  | "page_hash_mismatch"
  | "image_only"
  | "diagram_heavy"
  | "table_heavy"
  | "form_page"
  | "front_matter"
  | "copyright_frontmatter"
  | "fragment_only"
  | "insufficient_prose"
  | "ocr_fragile"
  | "no_grounded_sentences"
  | "error";

export interface TextRange {
  startOffset: number;
  endOffset: number;
}

export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EvidenceAnchor {
  id: string;
  pageNumber: number;
  text: string;
  normalizedText: string;
  range?: TextRange;
  rects: PageRect[];
  confidence: number;
  sourceBlockId?: string;
  sourceSentenceId?: string;
}

export interface ReadingGraphMeta {
  documentId: string;
  documentVersion?: string;
  pageNumber: number;
  pageIndex: number;
  pageTextHash: string;
  requestKey: string;
  builtAt: string;
  parserVersion: string;
  source:
    | "native_pdf_text"
    | "ocr_text"
    | "mixed"
    | "semantic_reconstruction";
}

export interface PageTruth {
  isCurrentPage: boolean;
  isRenderable: boolean;
  blockReason?: TruthBlockReason;
  groundedSentenceCount: number;
  renderableSentenceCount: number;
  proseDensity: number;
  confidence: number;
}

export interface ReadingGraphHeading {
  id: string;
  text: string;
  normalizedText: string;
  level: number;
  pageNumber: number;
  blockId?: string;
  rects: PageRect[];
  score: number;
  inferred: boolean;
  inToc: boolean;
  parentHeadingId?: string;
  sectionPath: string[];
}

export interface ReadingGraphBlockMetadata {
  listStyle?: "bulleted" | "numbered";
  hasNumericDensity?: boolean;
  hasEquationDensity?: boolean;
  hasBoilerplateSignal?: boolean;
  estimatedColumns?: number;
}

export interface ReadingGraphBlock {
  id: string;
  kind: BlockKind;
  pageNumber: number;
  order: number;
  text: string;
  normalizedText: string;
  range?: TextRange;
  rects: PageRect[];
  headingId?: string;
  sectionPath: string[];
  sentenceIds: string[];
  confidence: number;
  metadata?: ReadingGraphBlockMetadata;
}

export interface ReadingGraphSentence {
  id: string;
  blockId: string;
  pageNumber: number;
  orderInBlock: number;
  orderOnPage: number;
  text: string;
  normalizedText: string;
  cleanedText: string;
  range?: TextRange;
  rects: PageRect[];
  headingId?: string;
  sectionPath: string[];

  role: SentenceRole;
  roleScore: number;

  salienceScore: number;
  supportScore: number;
  narrativeScore: number;
  highlightScore: number;

  isRenderable: boolean;
  isBoilerplate: boolean;
  isFragment: boolean;
  isQuestionLike: boolean;
  isDefinitionLike: boolean;
  isContrastLike: boolean;
  isMechanismLike: boolean;

  anchorIds: string[];
  relatedSentenceIds: string[];
}

export interface SupportNeighborhood {
  id: string;
  anchorSentenceId: string;
  pageNumber: number;

  headingId?: string;
  sectionPath: string[];

  primarySentenceIds: string[];
  supportingSentenceIds: string[];
  weakSentenceIds: string[];

  combinedText: string;
  summaryText: string;

  roleBias:
    | "main_signal"
    | "rule"
    | "mechanism"
    | "effect"
    | "consequence"
    | "trap"
    | "compare"
    | "relation"
    | "apply";

  score: number;
  confidence: number;
}

export interface NarrativeSection {
  id: string;
  kind: NarrativeSectionKind;
  order: number;
  title: string;

  anchorSentenceId: string;
  neighborhoodId?: string;

  primaryText: string;
  supportingText: string[];
  weakSupportText: string[];

  sentenceIds: string[];
  evidenceAnchorIds: string[];

  score: number;
  confidence: number;
}

export interface NarrativePageView {
  pageSummary: string;
  storyTitle: string;

  sections: NarrativeSection[];

  mainSignal?: NarrativeSection;
  rule?: NarrativeSection;
  mechanism?: NarrativeSection;
  effect?: NarrativeSection;
  consequence?: NarrativeSection;
  trap?: NarrativeSection;
}

export interface PriorityHighlight {
  id: string;
  priority: HighlightPriority;
  pageNumber: number;

  sentenceId?: string;
  blockId?: string;
  neighborhoodId?: string;

  text: string;
  normalizedText: string;
  rects: PageRect[];

  score: number;
  confidence: number;

  sectionPath: string[];
  kind:
    | "main_signal"
    | "rule"
    | "support"
    | "weak_support"
    | "warning"
    | "definition"
    | "mechanism"
    | "contrast";
}

export interface PriorityHighlightSet {
  main: PriorityHighlight[];
  support: PriorityHighlight[];
  weak: PriorityHighlight[];
  warning: PriorityHighlight[];
  all: PriorityHighlight[];
}

export interface ShadowRecallPrompt {
  id: string;
  kind:
    | "key_concept"
    | "mechanism"
    | "distinction"
    | "testable_rule"
    | "trap"
    | "application";
  prompt: string;
  expectedSentenceIds: string[];
  expectedAnswer: string;
  rubric: string[];
}

export interface ShadowRecallAnswerKey {
  keyConcept: string;
  mechanism?: string;
  distinction?: string;
  testableRule?: string;
  trap?: string;
}

export interface ShadowRecallModel {
  pageLabel: string;
  sectionLabel?: string;
  prompts: ShadowRecallPrompt[];
  answerKey: ShadowRecallAnswerKey;
  fastRecallCues: string[];
}

export interface GroundedSupportView {
  mainIdea: string;
  support: string[];
  weakSupport: string[];
  evidenceAnchorIds: string[];
}

export interface TocPageAnchor {
  id: string;
  pageNumber: number;
  headingId?: string;
  label: string;
  inferred: boolean;
  confidence: number;
}

export interface ReadingGraphDiagnostics {
  rawTextLength: number;
  cleanedTextLength: number;
  headingCount: number;
  blockCount: number;
  sentenceCount: number;
  renderableSentenceCount: number;
  boilerplateSentenceCount: number;
  fragmentSentenceCount: number;
  neighborhoodCount: number;
  highlightCount: number;
  notes: string[];
}

export interface PageReadingGraph {
  schemaVersion: "1.0.0";

  meta: ReadingGraphMeta;
  status: ReadingGraphStatus;

  pageClass: PageContentClass;
  truth: PageTruth;

  headings: ReadingGraphHeading[];
  blocks: ReadingGraphBlock[];
  sentences: ReadingGraphSentence[];
  anchors: EvidenceAnchor[];

  supportNeighborhoods: SupportNeighborhood[];

  narrative: NarrativePageView;
  groundedSupport?: GroundedSupportView;
  shadowRecall?: ShadowRecallModel;

  priorityHighlights: PriorityHighlightSet;
  tocAnchors: TocPageAnchor[];

  diagnostics?: ReadingGraphDiagnostics;
  errors?: string[];
}
