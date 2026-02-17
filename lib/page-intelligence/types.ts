// lib/page-intelligence/types.ts
// Canonical types for Page Intelligence system
// Page-aware clinical comprehension with OCR fallback

// ============================================================================
// Source and Text Types
// ============================================================================

export type PageSource = "native" | "ocr";

export interface PageText {
  pageNumber: number;
  text: string;
  source: PageSource;
  confidence?: number; // OCR confidence avg if available (0-100)
}

// ============================================================================
// Segment Types - Paragraph/Heading/List detection
// ============================================================================

export type SegmentKind = "heading" | "paragraph" | "list" | "caption" | "tableHint";

export interface Segment {
  id: string;
  pageNumber: number;
  kind: SegmentKind;
  text: string;
  bbox?: { x: number; y: number; w: number; h: number }; // optional bounding box
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
  | "pharmacology";

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
