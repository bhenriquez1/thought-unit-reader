export type PanelTab = "priority" | "explain" | "relations" | "compare" | "insights";

export type AudienceMode = "student" | "clinical" | "expert";
export type DepthMode = "standard" | "deep";
export type DensityMode = "condensed" | "expanded";

export interface ActivePageContext {
  documentId: string;
  documentTitle?: string;
  pageNumber: number;
  totalPages: number;
  chapterTitle?: string | null;
  sectionTitle?: string | null;
  pageText: string;
  paragraphTexts: string[];
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
  children?: TocNode[];
}

export interface PriorityPayload {
  title: string;
  meaning: string;
  mainIdeas: string[];
  whyItMatters: string;
  whatToRemember: string[];
  supportingQuote?: string;
}

export interface ExplainPayload {
  title: string;
  whatThisMeans: string;
  mechanism: string;
  stepwise: string[];
  application: string[];
}

export interface RelationsPayload {
  title: string;
  prerequisites: string[];
  currentLinks: string[];
  downstreamLinks: string[];
}

export interface ComparePayload {
  title: string;
  comparePairs: Array<{
    left: string;
    right: string;
    distinction: string;
  }>;
  emptyReason?: string;
}

export interface InsightsPayload {
  title: string;
  highYield: string[];
  traps: string[];
  hiddenConnections: string[];
}

export interface ResolvedPanelPayload {
  priority: PriorityPayload;
  explain: ExplainPayload;
  relations: RelationsPayload;
  compare: ComparePayload;
  insights: InsightsPayload;
}
