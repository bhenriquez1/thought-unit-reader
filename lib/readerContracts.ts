export type PanelTab = "priority" | "explain" | "relations" | "compare" | "insights";

export type AudienceMode = "student" | "clinical" | "expert";
export type DepthMode = "standard" | "deep";
export type DensityMode = "condensed" | "expanded";

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
  kind: "chapter" | "section" | "subsection" | "week" | "assignment" | "frontmatter";
  source?: "auto" | "fallback";
  children?: TocNode[];
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

export interface InsightsPayload {
  highYield: string[];
  traps: string[];
  hiddenConnections: string[];
  whatYouMayMiss: string[];
}

export interface ResolvedPanelPayload {
  classification: PageClassification;
  priority: PriorityPayload;
  explain: ExplainPayload;
  relations: RelationsPayload;
  compare: ComparePayload;
  insights: InsightsPayload;
}
