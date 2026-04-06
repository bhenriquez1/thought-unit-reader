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

export type GuidedMode = "insight" | "explain" | "compare" | "relation" | "apply" | "apply_test";

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

export type GuidedReadView = {
  pagePurpose: string;
  steps: GuidedReadStep[];
  supportTitle?: string;
  supportBullets?: string[];
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
