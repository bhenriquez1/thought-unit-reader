export type PanelTab = "priority" | "explain" | "relations" | "compare" | "insights";

export type AudienceMode = "student" | "clinical" | "expert";
export type DepthMode = "standard" | "deep";
export type DensityMode = "condensed" | "expanded";

export type PageRole = "cover" | "contents" | "chapter_opener" | "section_opener" | "copyright_frontmatter" | "regular_teaching" | "table_formula" | "image_scan_heavy";

export type PageType =
  | "diagnostic"
  | "definition"
  | "mechanism"
  | "application"
  | "overview"
  | "comparison"
  | "clinical"
  | "formula"
  | "case"
  | "reference"
  | "mixed"
  | "unknown";

export interface FormulaCard {
  raw: string;
  normalized: string;
  speakable: string;
  meaning?: string;
  usage?: string;
  trap?: string;
}

export interface ActivePageContext {
  documentId: string;
  documentTitle?: string;
  pageNumber: number;
  totalPages: number;
  nearbyText?: string;
  activeTopicTitle?: string;
  activeTopicKind?: TocNode["kind"] | null;
  chapterTitle?: string | null;
  sectionTitle?: string | null;
  pageText: string;
  paragraphTexts: string[];
  formulas?: FormulaCard[];
}

export interface RightPanelState {
  activeTab: PanelTab;
  audience: AudienceMode;
  depth: DepthMode;
  density: DensityMode;
}

export interface TocNode {
  id: string;
  title: string;
  page: number;
  kind: "chapter" | "section" | "subsection" | "week" | "assignment" | "exam" | "deadline" | "policy" | "objective" | "topic" | "frontmatter";
  source?: "outline" | "structured" | "layout" | "contents" | "fallback" | "syllabus";
  confidence?: number;
  children?: TocNode[];
}


export type ParagraphKind =
  | "definition"
  | "mechanism"
  | "clinical"
  | "comparison"
  | "formula"
  | "application"
  | "reference"
  | "filler"
  | "unknown";

export interface ParagraphSignal {
  text: string;
  page: number;
  index: number;
  blockType: "heading" | "subheading" | "paragraph" | "bullet" | "tableRow" | "caption" | "reference" | "metadata";
  kind: ParagraphKind;
  yieldScore: number;
  definitionScore: number;
  mechanismScore: number;
  clinicalScore: number;
  comparisonScore: number;
  examScore: number;
  formulaScore: number;
  fillerPenalty: number;
  evidenceTerms: string[];
  suppress: boolean;
}

export interface PageSignals {
  questionCount: number;
  numberedItemCount: number;
  headingCount: number;
  formulaCount: number;
  equationLineCount: number;
  tableLikeRowCount: number;
  citationCount: number;
  bulletCount: number;
  hasDiagnosticWords: boolean;
  hasDefinitionWords: boolean;
  hasMechanismWords: boolean;
  hasComparisonWords: boolean;
  hasClinicalWords: boolean;
  hasCaseWords: boolean;
  hasReferenceWords: boolean;
  hasFormulaWords: boolean;
  hasOverviewWords: boolean;
  hasApplicationWords: boolean;
  uppercaseHeadingDensity: number;
  shortLineDensity: number;
  symbolDensity: number;
  numericDensity: number;
  nearbyHeading?: string;
  activeTopicTitle?: string;
  activeTopicKind?: string;
  documentTitle?: string;
  pageRole?: PageRole;
  paragraphSignals?: ParagraphSignal[];
  pageText: string;
  nearbyText: string;
}

export interface PageClassification {
  pageType: PageType;
  confidence: number;
  secondaryTypes: Array<{ type: PageType; confidence: number }>;
  reasons: string[];
}

export interface PriorityPayload {
  pageRole: string;
  primaryGoal: string;
  mainIdeas: string[];
  whyItMatters: string[];
  whatToRemember: string[];
}

export interface ExplainPayload {
  meaning: string;
  mechanism: string;
  stepwiseBreakdown: string[];
  application: string[];
}

export interface RelationsPayload {
  prerequisites: string[];
  currentLinks: string[];
  downstreamLinks: string[];
}

export interface ComparePayload {
  hasMeaningfulCompare: boolean;
  compareTitle?: string;
  leftLabel?: string;
  rightLabel?: string;
  similarities?: string[];
  differences?: string[];
  examTrap?: string;
  emptyState?: string;
}

export interface DatInsightPayload {
  testedConcepts: string[];
  likelyQuestionAngles: string[];
  commonTraps: string[];
  mustKnowTerms: string[];
  distinctionPairs: string[];
  fastRecall: string[];
  applicationCue?: string[];
}

export interface InsightsPayload {
  highYield: string[];
  traps: string[];
  hiddenConnections: string[];
  whatYouMayMiss: string[];
  dat?: DatInsightPayload;
}

export interface ResolvedPanelPayload {
  classification: PageClassification;
  priority: PriorityPayload;
  explain: ExplainPayload;
  relations: RelationsPayload;
  compare: ComparePayload;
  insights: InsightsPayload;
}
