// lib/engines/types.ts
// Core types for extraction, insights, explain, study, and reasoning engines
// Page-aware architecture with evidence spine

// ============================================================================
// Shared Primitives
// ============================================================================

export type DocID = string;
export type PageIndex = number;
export type ChapterID = string;

// ============================================================================
// Evidence Reference - Anchors all insights to source material
// ============================================================================

export type EvidenceRef = {
  docId: DocID;
  pageIndex?: PageIndex;
  chapterId?: ChapterID;
  snippet: string;
  bbox?: { x: number; y: number; w: number; h: number }; // optional if we have coords
};

// ============================================================================
// Tags - Categorization for DAT/MED/DENT exam targeting
// ============================================================================

export type Tag =
  | "DENT"
  | "MED"
  | "DAT"
  | "NBDE"
  | "MCAT"
  | "HIGH_YIELD"
  | "TRAP"
  | "DEFINITION"
  | "DIAGNOSIS"
  | "TREATMENT"
  | "RISK"
  | "EXCEPTION";

// ============================================================================
// Extraction Types - Page and Chapter level
// ============================================================================

export type ExtractionMode = "PAGE" | "CHAPTER";

export type PageExtractionResult = {
  docId: DocID;
  pageIndex: PageIndex;
  extractedAt: number;
  mode: "PAGE";
  text: string;
  evidence: EvidenceRef[];
};

export type ChapterExtractionResult = {
  docId: DocID;
  chapterId: ChapterID;
  extractedAt: number;
  mode: "CHAPTER";
  text: string;
  evidence: EvidenceRef[];
};

export type ExtractionResult = PageExtractionResult | ChapterExtractionResult;

// ============================================================================
// Relation Graph Types - Clinical reasoning flow
// ============================================================================

export type RelationEdgeType =
  | "CAUSES"
  | "ASSOCIATED_WITH"
  | "DIAGNOSED_BY"
  | "TREATED_WITH"
  | "CONTRAINDICATED"
  | "LEADS_TO"
  | "RISK_FOR"
  | "EXCEPTION_TO";

export type RelationNodeType =
  | "CONCEPT"
  | "SYMPTOM"
  | "FINDING"
  | "TEST"
  | "DIAGNOSIS"
  | "TREATMENT"
  | "RISK"
  | "EXCEPTION";

export type RelationNode = {
  id: string;
  type: RelationNodeType;
  label: string;
  tags?: Tag[];
};

export type RelationEdge = {
  id: string;
  from: string;
  to: string;
  type: RelationEdgeType;
  evidence: EvidenceRef[];
  confidence: number; // 0..1
};

export type RelationsGraph = {
  docId: DocID;
  scope: { mode: ExtractionMode; pageIndex?: PageIndex; chapterId?: ChapterID };
  nodes: RelationNode[];
  edges: RelationEdge[];
};

// ============================================================================
// Insights Types - What Matters + What You May Be Missing
// ============================================================================

export type InsightItem = {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string;
  tags: Tag[];
  confidence: number;
  evidence: EvidenceRef[];
};

export type InsightsResult = {
  docId: DocID;
  scope: { mode: ExtractionMode; pageIndex?: PageIndex; chapterId?: ChapterID };
  generatedAt: number;
  whatMatters: InsightItem[];
  whatMissing: InsightItem[]; // MVP: generated "missing nodes" suggestions
};

// ============================================================================
// Explain Payload - Whiteboard-ready micro-lessons
// ============================================================================

export type ExplainPayload = {
  docId: DocID;
  scope: { mode: ExtractionMode; pageIndex?: PageIndex; chapterId?: ChapterID };
  title: string;
  steps: string[];
  drawInstructions: string[];
  examQuestions: { q: string; a: string }[];
  mnemonic?: string;
  evidence: EvidenceRef[];
};

// ============================================================================
// Study Card Types - SRS flashcards from insights
// ============================================================================

export type StudyCard = {
  id: string;
  docId: DocID;
  createdAt: number;
  source: { mode: ExtractionMode; pageIndex?: PageIndex; chapterId?: ChapterID };
  tags: Tag[];
  front: string;
  back: string;
  evidence: EvidenceRef[];
  srs: { intervalDays: number; ease: number; dueAt: number; reps: number };
};

// ============================================================================
// Reasoning Flow Types - Clinical reasoning chain with gap detection
// ============================================================================

export type ReasoningFlow = {
  docId: DocID;
  scope: { mode: ExtractionMode; pageIndex?: PageIndex; chapterId?: ChapterID };
  nodes: RelationNode[];
  edges: RelationEdge[];
  missingNodeSuggestions: string[];
};

// ============================================================================
// Expected clinical reasoning structure for gap detection
// ============================================================================

export const EXPECTED_REASONING_STRUCTURE: Record<RelationNodeType, RelationNodeType[]> = {
  CONCEPT: ["SYMPTOM", "FINDING", "DIAGNOSIS"],
  SYMPTOM: ["FINDING", "TEST", "DIAGNOSIS"],
  FINDING: ["TEST", "DIAGNOSIS", "TREATMENT"],
  TEST: ["DIAGNOSIS", "FINDING"],
  DIAGNOSIS: ["TREATMENT", "RISK", "EXCEPTION"],
  TREATMENT: ["RISK", "EXCEPTION", "DIAGNOSIS"],
  RISK: ["TREATMENT", "EXCEPTION"],
  EXCEPTION: ["TREATMENT", "DIAGNOSIS"],
};

// ============================================================================
// Helper type guards
// ============================================================================

export function isPageExtraction(result: ExtractionResult): result is PageExtractionResult {
  return result.mode === "PAGE";
}

export function isChapterExtraction(result: ExtractionResult): result is ChapterExtractionResult {
  return result.mode === "CHAPTER";
}

// ============================================================================
// Storage keys for IndexedDB
// ============================================================================

export const EXTRACTION_STORE_KEYS = {
  pageExtraction: (docId: DocID, pageIndex: PageIndex) => `extraction:page:${docId}:${pageIndex}`,
  chapterExtraction: (docId: DocID, chapterId: ChapterID) => `extraction:chapter:${docId}:${chapterId}`,
  insights: (docId: DocID, scope: string) => `insights:${docId}:${scope}`,
  studyCards: (docId: DocID) => `studycards:${docId}`,
  reasoningFlow: (docId: DocID, scope: string) => `reasoning:${docId}:${scope}`,
} as const;
