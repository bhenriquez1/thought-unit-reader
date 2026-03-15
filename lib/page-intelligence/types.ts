// lib/page-intelligence/types.ts
// Canonical types for Page Intelligence system
// Page-aware clinical comprehension with OCR fallback

// ============================================================================
// Source and Text Types
// ============================================================================

export type PageSource = "native" | "ocr" | "mixed";

export interface PageText {
  pageNumber: number;
  text: string;
  source: PageSource;
  confidence?: number; // OCR confidence avg if available (0-100)
}

// ============================================================================
// Segment Types - Paragraph/Heading/List detection
// ============================================================================

export type SegmentKind = "heading" | "paragraph" | "list" | "caption" | "tableHint" | "math";

export interface Segment {
  id: string;
  pageNumber: number;
  kind: SegmentKind;
  text: string;
  bbox?: { x: number; y: number; w: number; h: number }; // optional bounding box
  /** 0–1 math density score; set by segmenter for math/mixed segments */
  mathDensity?: number;
  /** Pre-normalisation raw text for math segments */
  mathRaw?: string;
  /** True if the segment is a standalone display equation */
  isDisplayMath?: boolean;
}

// ============================================================================
// Signal Types - Pattern detection for clinical/exam content
// ============================================================================

export type SignalType =
  | "definition"
  | "contrast"
  | "cause_effect"
  | "list"
  | "risk_factor"
  | "diagnostic"
  | "treatment"
  | "exception"
  | "exam_keyword"
  | "numbers_thresholds";

export interface Signal {
  id: string;
  type: SignalType;
  evidenceSegmentIds: string[];
  score: number;
  label: string;
}

// ============================================================================
// Relation Types - Concept relationships extracted from text
// ============================================================================

export type RelationType =
  | "causes"
  | "leads_to"
  | "associated_with"
  | "is_a"
  | "part_of"
  | "contraindicated"
  | "indicates";

export interface Relation {
  id: string;
  type: RelationType;
  from: string; // concept string
  to: string;   // concept string
  evidenceSegmentIds: string[];
  score: number;
}

// ============================================================================
// Insight Types - High-yield exam content with DAT scoring
// ============================================================================

export type InsightTag =
  | "DAT"
  | "NBDE"
  | "MCAT"
  | "high-yield"
  | "must-know"
  | "definition"
  | "contrast"
  | "clinical"
  | "periodontium"
  | "anatomy"
  | "physiology"
  | "pathology"
  | "pharmacology"
  | "threshold"
  | "math";

export type InsightBadge = "DAT MUST KNOW" | "High yield" | "Worth learning" | "Low yield";

export interface Insight {
  id: string;
  title: string;
  body: string;
  score: number; // DAT/board relevance (0-100)
  badge: InsightBadge;
  tags: InsightTag[];
  evidenceSegmentIds: string[];
}

// ============================================================================
// Cluster Types - Topic groupings
// ============================================================================

export interface Cluster {
  id: string;
  label: string;
  keywords: string[];
  segmentIds: string[];
  score: number;
}

// ============================================================================
// Study Card Types - Auto-generated flashcards
// ============================================================================

export interface StudyCard {
  id: string;
  deck: string; // e.g. `${bookId}:page:${pageNumber}` or cluster id
  front: string;
  back: string;
  tags: InsightTag[];
  evidenceSegmentIds: string[];
  due?: string;
}

// ============================================================================
// Explain Types - Page-aware explanation
// ============================================================================

export interface ExplainResult {
  summary: string;
  bullets: string[];
  pitfalls: string[];
  mnemonics?: string[];
  domainStyle?: 'pharmacology' | 'periodontology' | 'biology' | 'clinical' | 'general';
}

// ============================================================================
// Paragraph Intelligence — role-classified units with source anchoring (PR3)
// ============================================================================

export type ParagraphRole =
  | 'definition'
  | 'mechanism'
  | 'clinical'
  | 'example'
  | 'step'
  | 'warning'
  | 'exam_trap'
  | 'formula'
  | 'summary';

export interface ParagraphSignals {
  hasNumbers: boolean;
  hasUnits: boolean;
  hasNegation: boolean;
  hasComparison: boolean;
  hasCausal: boolean;
  hasTemporal: boolean;
  hasClinicalTerms: boolean;
}

/** Dimensional sub-scores (0–100) for a paragraph — shown as chips in the UI */
export interface ParagraphSubScores {
  /** Definitions, key terms, "is defined as" patterns */
  conceptScore: number;
  /** Cause→effect, pathway, process verbs */
  mechanismScore: number;
  /** If/then, staging criteria, classification thresholds */
  decisionScore: number;
  /** Exceptions, negations, confusables, "most likely" */
  examTrapScore: number;
  /** Formulas, variables, units, equations */
  mathScore: number;
  /** Symptom→diagnosis→test→treatment chains */
  clinicalScore: number;
  /** Heading proximity, bullet lists, figure/table refs */
  structureScore: number;
}

/**
 * A ranked, role-classified paragraph unit anchored to exact char positions.
 * Used by all engine tabs for jump-to-source navigation.
 */
export interface ParagraphUnit {
  id: string;
  pageIndex: number;
  text: string;
  /** Character offset in page text where this paragraph starts */
  startChar: number;
  /** Character offset in page text where this paragraph ends */
  endChar: number;
  /** Optional bounding box if OCR provides coordinates */
  bbox?: { x: number; y: number; w: number; h: number };
  role: ParagraphRole;
  /** Importance 0–100 scored by role + clinical signals (weighted sub-score sum) */
  importance: number;
  keyTerms: string[];
  signals: ParagraphSignals;
  /** Dimensional sub-scores for visualization */
  subScores?: ParagraphSubScores;
  /** 3–5 human-readable labels explaining why this paragraph scored as it did */
  whyScoredSignals?: string[];
  /** Detected DAT trap types in this paragraph */
  trapTypes?: string[];
}

/**
 * Source anchor for any output item — enables click-to-focus in PDF.
 */
export interface SourceRef {
  pageIndex: number;
  pageNumberLabel?: string;
  paragraphId: string;
  /** Approximate vertical location within page (0–100) */
  yPct?: number;
  /** Logical PDF column */
  column?: 'left' | 'right' | 'full';
  /** Paragraph block index in reading order (1-based) */
  block?: number;
  startChar: number;
  endChar: number;
  /** Sentence-level character offsets (within paragraphText) for fine-grained highlight */
  sentenceStartChar?: number;
  sentenceEndChar?: number;
  /** Short representative quote ≤ 180 chars */
  quote: string;
  /** Verbatim exact quote for strict comparison */
  quoteText?: string;
  /** Simple hash of normalized quote for deduplication */
  quoteHash?: string;
  bbox?: { x: number; y: number; w: number; h: number };
  confidence: number; // 0..1
  /** Origin of the text — native PDF text layer vs OCR */
  textOrigin?: 'pdfText' | 'ocr';
  /** Extraction run identifier */
  runId?: string;
  /** Engine version string */
  engineVersion?: string;
}

/**
 * Generic output item from any engine, anchored to source material.
 */
export interface AnchoredItem<T = unknown> {
  id: string;
  kind:
    | 'high_yield'
    | 'mechanism'
    | 'exam_trap'
    | 'clinical_relevance'
    | 'insight'
    | 'relation'
    | 'compare'
    | 'explain'
    | 'math'
    | 'clinical_flow';
  title?: string;
  content: string;
  tags?: string[];
  source: SourceRef;
  payload?: T;
}

// ============================================================================
// Structure Map — 4-stage learning scaffold per page
// ============================================================================

export type StructureMapStage =
  | 'definition'
  | 'mechanism'
  | 'application'
  | 'clinical_relevance';

export interface StructureMapNode {
  id: string;
  stage: StructureMapStage;
  label: string;
  text: string;
  sourceIds: string[];
  confidence: number;
}

export interface StructureMap {
  pageNumber: number;
  topic: string;
  nodes: StructureMapNode[];
  /** 0–1: fraction of the 4 stages detected */
  completeness: number;
}

// ============================================================================
// Insight Continuity — always-populated structured intelligence
// ============================================================================

export interface InsightContinuity {
  /** Dominant concept/theme */
  corePattern: string;
  /** How this connects to adjacent content */
  conceptualBridge: string;
  /** Clinical downstream application */
  clinicalConnection: string;
  /** Most common student misunderstanding */
  commonMisunderstanding: string;
  /** Data richness indicator */
  quality: 'rich' | 'minimal' | 'stub';
}

// ============================================================================
// Persistent Concept Graph + Page Memory Engine
// ============================================================================

export type GraphNodeType =
  | 'DocumentNode'
  | 'ChapterNode'
  | 'SectionNode'
  | 'SubsectionNode'
  | 'ParagraphNode'
  | 'FigureNode'
  | 'TableNode'
  | 'TermNode'
  | 'MechanismNode'
  | 'ClinicalConceptNode'
  | 'ComparisonNode'
  | 'QuestionNode'
  | 'UserNoteNode';

export type GraphEdgeType =
  | 'belongs_to'
  | 'defines'
  | 'explains'
  | 'contrasts_with'
  | 'depends_on'
  | 'leads_to'
  | 'illustrates'
  | 'appears_with'
  | 'summarized_by'
  | 'anchored_to'
  | 'mentioned_in';

export interface ConceptGraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  pageIndex: number;
  metadata?: Record<string, unknown>;
  updatedAt: number;
}

export interface ConceptGraphEdge {
  id: string;
  type: GraphEdgeType;
  fromId: string;
  toId: string;
  pageIndex: number;
  score: number;
  metadata?: Record<string, unknown>;
  updatedAt: number;
}

export interface ConceptGraph {
  docId: string;
  version: string;
  nodes: Record<string, ConceptGraphNode>;
  edges: Record<string, ConceptGraphEdge>;
  updatedAt: number;
}

export interface PageMemory {
  docId: string;
  pageIndex: number;
  fingerprint: string;
  headingCandidates: string[];
  visibleParagraphIds: string[];
  visibleFigureIds: string[];
  sectionId?: string;
  subsectionId?: string;
  dominantConceptIds: string[];
  updatedAt: number;
}

export type TabType = 'priority' | 'explain' | 'relations' | 'compare' | 'insights';

export type SourceAnchor = SourceRef;

export interface TabResponse {
  pageIndex: number;
  fingerprint: string;
  tab: TabType;
  title: string;
  sections: Array<{
    label: string;
    content: string | string[];
  }>;
  sourceAnchors: SourceAnchor[];
  relatedNodeIds: string[];
}

export interface TabPayloadContracts {
  priorityPayload: TabResponse;
  explainPayload: TabResponse;
  relationsPayload: TabResponse;
  comparePayload: TabResponse;
  insightsPayload: TabResponse;
}

// ============================================================================
// Page Intelligence - Full pipeline result
// ============================================================================

export interface PageIntelligence {
  pageNumber: number;
  source: PageSource;
  confidence?: number;
  segments: Segment[];
  signals: Signal[];
  relations: Relation[];
  clusters: Cluster[];
  insights: Insight[];
  explain: ExplainResult;
  cards: StudyCard[];
  /** Ranked, role-classified paragraphs with source anchoring (PR3) */
  paragraphUnits?: ParagraphUnit[];
  /** 4-stage learning scaffold: Definition → Mechanism → Application → Clinical */
  structureMap?: StructureMap;
  /** Always-populated structured intelligence (never empty) */
  continuity?: InsightContinuity;
  /** Grounding snapshot for current page; required for mode-specific query outputs */
  pageMemory?: PageMemory;
  /** Persistent per-document graph snapshot after integrating this page */
  conceptGraph?: ConceptGraph;
  /** Mode-specific, page-grounded responses consumed by right-panel tabs */
  tabResponses?: Record<TabType, TabResponse>;
  /** Strict mode payload contracts so each tab can render independent query output */
  tabPayloads?: TabPayloadContracts;
  /** Detected dominant domain on this page */
  domain?: 'pharmacology' | 'periodontology' | 'biology' | 'clinical' | 'general';
  /** Pre-synthesis cleanup diagnostics */
  normalization?: {
    dehyphenatedWords: number;
    repairedLineWraps: number;
    figureCaptionsDetected: number;
    lowQuality: boolean;
  };
  extractedAt: number;
}

// ============================================================================
// OCR Cache Types
// ============================================================================

export interface OCRCacheEntry {
  docId: string;
  pageNumber: number;
  text: string;
  confidence: number;
  extractedAt: number;
}

// ============================================================================
// Build Options
// ============================================================================

export interface BuildPageIntelligenceOptions {
  pageNumber: number;
  getNativeText: () => Promise<string>;
  getPageImageDataUrl: () => Promise<string>;
  docId?: string;
  options?: {
    ocrEnabled?: boolean;
    datScoring?: boolean;
    minTextLength?: number;
  };
}

// ============================================================================
// DAT Scoring Feature Weights
// ============================================================================

export const DAT_SCORING_WEIGHTS = {
  // Exam keywords (+12 each, max 24)
  examKeywords: {
    weight: 12,
    maxPoints: 24,
    patterns: [
      "most common", "primary", "key", "important", "high-yield", "classic", "hallmark",
      "remember", "note", "major", "main", "first-line", "gold standard"
    ]
  },
  // Definitions (+18)
  definitions: {
    weight: 18,
    patterns: ["defined as", "refers to", "is termed", "is called", "means"]
  },
  // Lists (+12)
  lists: {
    weight: 12,
    patterns: ["includes", "consists of", "characterized by"]
  },
  // Cause→Effect (+16)
  causeEffect: {
    weight: 16,
    patterns: ["leads to", "results in", "causes", "due to", "because of", "resulting from"]
  },
  // Clinical actionability (+14)
  clinicalAction: {
    weight: 14,
    patterns: ["diagnos", "treatment", "management", "therap", "prescribe", "administer"]
  },
  // Numbers/thresholds (+10)
  numbers: {
    weight: 10,
    // Detected via regex for numbers with units
  },
  // Contrast/Exceptions (+10)
  contrast: {
    weight: 10,
    patterns: ["however", "except", "contraindicated", "unlike", "in contrast"]
  },
  // Heading proximity (+8)
  headingProximity: {
    weight: 8
  },
  // Repetition (+0 to +10)
  repetition: {
    maxWeight: 10
  },
  // OCR low confidence penalty (-10 if confidence < 35)
  lowOCRPenalty: {
    weight: -10,
    threshold: 35
  }
} as const;

// Badge thresholds
export const INSIGHT_BADGE_THRESHOLDS = {
  mustKnow: 80,    // 80-100: "DAT MUST KNOW"
  highYield: 60,   // 60-79: "High yield"
  worthLearning: 40 // 40-59: "Worth learning"
  // < 40: "Low yield"
} as const;

// ============================================================================
// Helper functions
// ============================================================================

export function getInsightBadge(score: number): InsightBadge {
  if (score >= INSIGHT_BADGE_THRESHOLDS.mustKnow) return "DAT MUST KNOW";
  if (score >= INSIGHT_BADGE_THRESHOLDS.highYield) return "High yield";
  if (score >= INSIGHT_BADGE_THRESHOLDS.worthLearning) return "Worth learning";
  return "Low yield";
}

export function generateId(prefix: string = 'pi'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
