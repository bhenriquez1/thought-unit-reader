export type InsightPageType =
  | "concept"
  | "cause_effect"
  | "process"
  | "comparison"
  | "decision"
  | "clinical_reasoning"
  | "narrative"
  | "formula"
  | "example"
  | "consequence"
  | "signal"
  | "definition"
  | "mixed";

export type ParagraphType = InsightPageType | "noise";

export type LogicChain = {
  id: string;
  if: string;
  then: string;
  because: string;
  next?: string;
  trap?: string;
  confidence: number;
  sourceParagraphIds: string[];
};

export type DecisionPath = {
  id: string;
  template: "clinical" | "operator" | "science" | "comparison";
  condition: string;
  interpretation: string;
  implication: string;
  nextMove: string;
  trap?: string;
  evidence: string[];
  confidence: number;
  sourceParagraphIds: string[];
};

export type EvidenceAnchor = {
  id: string;
  paragraphIndex: number;
  sentenceIndex?: number;
  text: string;
  startOffset?: number;
  endOffset?: number;
};

export type GuidedMode = "insight";

export type GuidedRole = "general" | "operator" | "expert";

export type GuidedDepth = "quick" | "standard" | "deep";

export type GuidedReadStep = {
  id: string;
  stepNumber: number;
  label: string;
  primaryText: string;
  secondaryText?: string;
  mode: GuidedMode;
  role: "general" | "operator" | "expert";
  evidence: EvidenceAnchor[];
  confidence: number;
};

export type OperatorCardKind =
  | "pattern"
  | "decision"
  | "application"
  | "mechanism"
  | "distinction"
  | "relation"
  | "trap";

export type OperatorCard = {
  id: string;
  kind: OperatorCardKind;
  title: string;
  primary: string;
  bullets: string[];
  severity?: "low" | "medium" | "high";
};

export type DecisionDrill = {
  caseCue: string;
  caseCueContext?: string;
  bestNextMove: string;
  bestNextMoveSteps: string[];
  why: string;
  wrongMove?: string;
  wrongMoveReason?: string;
  examTest?: string;
  confidence: number;
};

export type GuidedReadView = {
  pagePurpose: string;
  steps: GuidedReadStep[];
  cards?: OperatorCard[];
  drill?: DecisionDrill;
  supportTitle?: string;
  supportBullets?: string[];
};

export type StoryField =
  | "main_idea"
  | "mechanism"
  | "distinction"
  | "relation"
  | "application"
  | "trap";

export type StoryBlock = {
  id: string;
  field: StoryField;
  text: string;
  support: string[];
  evidence: string[];
  score: number;
};

export type PatternBlock = {
  trigger: string;
  context?: string;
  confidence: number;
};

export type DecisionBlock = {
  action: string;
  nextSteps: string[];
  avoid: string[];
  threshold?: string;
  confidence: number;
};

export type TrapBlock = {
  trap: string;
  whyWrong?: string;
  confusionWith?: string;
  consequence?: string;
  severity: "low" | "medium" | "high";
};

export type ExtractedSignals = {
  triggers: string[];
  actions: string[];
  reasons: string[];
  outcomes: string[];
  contrasts: string[];
  examples: string[];
};

export type ParagraphInsight = {
  id: string;
  paragraphIndex: number;
  rawText: string;
  cleanedText: string;
  paragraphType: ParagraphType;
  summary: string;
  coreSignals: string[];
  logicChains: LogicChain[];
  takeaways: string[];
  traps?: string[];
  applications?: string[];
  priorityScore: number;
  confidence: number;
};

export type PriorityBlock = {
  id: string;
  kind: "overview" | "logic_chain" | "takeaway" | "contrast" | "connection" | "application" | "dat_apex";
  title: string;
  content: string[] | LogicChain[];
  priority: number;
  collapsedByDefault: boolean;
};

export type DatApexInsight = {
  testedConcept: string;
  quickRule: string;
  trapWarnings: string[];
  likelyQuestionStem: string;
  answerLogic: string[];
};

export type PageInsightModel = {
  documentId?: string;
  pageNumber?: number;
  requestKey?: string;
  pageType: InsightPageType;
  pageSummary: string;
  topTakeaways: string[];
  logicChains: LogicChain[];
  decisionPaths: DecisionPath[];
  priorityBlocks: PriorityBlock[];
  hiddenBlocks: PriorityBlock[];
  paragraphInsights: ParagraphInsight[];
  scannedParagraphCount: number;
  pageStory?: import("@/lib/insights/buildPageStory").PageStory | null;
  pageStoryV2?: import("@/lib/insights/buildPageStoryV2").PageStoryV2 | null;
  datApex?: DatApexInsight;
};

// ===========================================================================
// Page-story v2 types
// All v2 types are additive — existing v1 types above are unchanged.
// ===========================================================================

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RawPageBlockKind =
  | "paragraph"
  | "heading"
  | "list_item"
  | "table_row"
  | "form_field"
  | "caption"
  | "diagram_label"
  | "unknown";

export type RawPageBlock = {
  id: string;
  kind: RawPageBlockKind;
  pageNumber: number;
  text: string;
  rawText: string;
  blockIndex: number;
  bbox?: BoundingBox;
  lineCount?: number;
  confidence?: number;
};

export type NormalizedPageBlock = {
  id: string;
  sourceId: string;
  kind: RawPageBlockKind;
  pageNumber: number;
  text: string;
  sentences: string[];
  blockIndex: number;
  bbox?: BoundingBox;
  isComplete: boolean;
  isLikelyNoise: boolean;
  score: number;
};

/**
 * v2 page classification.  Broader than PageContentClass (used by the existing
 * evaluation/gating layer) — both co-exist intentionally.
 */
export type PageClass =
  | "narrative_text"
  | "clinical_prose"
  | "form_checklist"
  | "table_structured"
  | "diagram_caption"
  | "mixed_layout"
  | "frontmatter"
  | "image_only"
  | "sparse_text";

/**
 * v2 paragraph role — richer than the simpler ParagraphRole in paragraphRoleMap.ts.
 * Adds mechanism, support_distinction, bottom_line, background.
 */
export type ParagraphRoleV2 =
  | "primary_signal"
  | "decision_rule"
  | "mechanism"
  | "support_explanation"
  | "support_relation"
  | "support_distinction"
  | "trap_warning"
  | "bottom_line"
  | "background";

export type ParagraphRoleAssignment = {
  blockId: string;
  role: ParagraphRoleV2;
  score: number;
  reasons: string[];
};

export type StoryEvidenceV2 = {
  blockId: string;
  text: string;
  paragraphIndex: number;
  score: number;
  bbox?: BoundingBox;
};

export type StoryBlockKindV2 =
  | "signal"
  | "rule"
  | "mechanism"
  | "action"
  | "trap"
  | "bottom_line";

export type StoryBlockV2 = {
  id: string;
  kind: StoryBlockKindV2;
  title: string;
  /** Must be a complete sentence — never a fragment. */
  text: string;
  /** Complete sentences only. */
  support: string[];
  evidence: StoryEvidenceV2[];
  confidence: number;
};

export type HighlightSemanticKind = "signal" | "mechanism" | "support" | "trap";

export type HighlightPriority = "main" | "support" | "weak";

export type StoryHighlight = {
  blockId: string;
  priority: HighlightPriority;
  semanticKind: HighlightSemanticKind;
};

// ===========================================================================
// Page-story v3 types — human-reader simulation layer
// ===========================================================================

export type ReadingPriority =
  | "read_first"
  | "read_second"
  | "read_later"
  | "optional"
  | "warning";

export type ReaderIntent =
  | "orient"
  | "learn_core"
  | "apply_rule"
  | "notice_exception"
  | "store_support"
  | "skip_for_now";

/** Cognitive reading mode — distinct from structural PageClass */
export type PageReadingMode =
  | "concept_page"
  | "clinical_page"
  | "form_page"
  | "diagram_page"
  | "narrative_page"
  | "reference_page";

export type ParagraphNoteKind =
  | "important"
  | "support"
  | "additional"
  | "warning";

export type ParagraphSalienceV3 = {
  blockId: string;
  salience: number;
  novelty: number;
  ruleDensity: number;
  warningDensity: number;
  supportDensity: number;
  headingBoost: number;
  structuralBoost: number;
};

export type ParagraphRoleAssignmentV3 = {
  blockId: string;
  pageNumber: number;
  role: ParagraphRoleV2;
  roleScore: number;
  readingPriority: ReadingPriority;
  readerIntent: ReaderIntent;
  salience: ParagraphSalienceV3;
};

export type ParagraphNoteV3 = {
  id: string;
  sourceBlockId: string;
  paragraphIndex: number;
  pageNumber: number;
  kind: ParagraphNoteKind;
  priority: ReadingPriority;
  intent: ReaderIntent;
  originalText: string;
  summarySentence: string;
  whyItMatters?: string;
  actionNote?: string;
  warningNote?: string;
  operatorLabel?: string;
  confidence: number;
};

export type ReadingStepV3 = {
  id: string;
  label: string;
  sourceBlockId: string;
  paragraphIndex: number;
  priority: ReadingPriority;
  note: string;
};

export type PageBriefStatusV3 =
  | "reading"
  | "ready"
  | "weak"
  | "non_body_page";

export type PageBriefV3 = {
  pageBottomLine: string;
  pagePurpose: string;
  currentPageStatus: PageBriefStatusV3;
};

export type HighlightSemanticKindV3 =
  | "important"
  | "support"
  | "additional"
  | "warning";

export type HighlightPriorityV3 =
  | "main"
  | "support"
  | "weak";

export type HighlightPlanItemV3 = {
  id: string;
  blockId: string;
  pageNumber: number;
  semanticKind: HighlightSemanticKindV3;
  priority: HighlightPriorityV3;
};

export type StoryBlockKindV3 =
  | "signal"
  | "rule"
  | "mechanism"
  | "action"
  | "trap"
  | "bottom_line";

export type StoryEvidenceV3 = {
  blockId: string;
  pageNumber: number;
  sentence: string;
};

export type StoryBlockV3 = {
  id: string;
  kind: StoryBlockKindV3;
  pageNumber: number;
  sourceBlockId: string;
  text: string;
  support: string[];
  evidence: StoryEvidenceV3[];
};

export type BuildPageStoryV3Input = {
  truthKey: string;
  documentId: string;
  pageNumber: number;
  pageText: string;
  layoutBlocks?: RawPageBlock[];
};

export type PageStoryV3 = {
  truthKey: string;
  documentId: string;
  pageNumber: number;
  pageClass: PageClass;
  readingMode: PageReadingMode;
  brief: PageBriefV3;
  paragraphRoleAssignments: ParagraphRoleAssignmentV3[];
  paragraphNotes: ParagraphNoteV3[];
  readingPath: ReadingStepV3[];
  signalBlock:     StoryBlockV3 | null;
  ruleBlock:       StoryBlockV3 | null;
  mechanismBlock:  StoryBlockV3 | null;
  actionBlock:     StoryBlockV3 | null;
  trapBlock:       StoryBlockV3 | null;
  bottomLineBlock: StoryBlockV3 | null;
  highlightPlan: HighlightPlanItemV3[];
};
