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
  datApex?: DatApexInsight;
};
