// lib/cognitive/types.ts
// Expert View 2.1 - Core Types for Cognitive Engines
// Page-aware extraction, priority, insights, flashcards, notes

// ============================================================================
// 0) Shared Primitives
// ============================================================================

export type DocId = string;
export type PageIndex = number; // 0-based
export type ChapterId = string;
export type TocNodeId = string;
export type SyllabusItemId = string;
export type CardId = string;

export type CardKind =
  | 'definition'
  | 'pattern'
  | 'decision'
  | 'rule'
  | 'exception'
  | 'mnemonic'
  | 'trap'
  | 'summary';

export type ExamType = 'DAT' | 'NBDE' | 'USMLE' | 'MCAT' | 'GENERIC';

// ============================================================================
// Evidence Spine - Page-aware anchoring for all navigation
// ============================================================================

export interface EvidenceSpan {
  docId: DocId;
  pageIndex: PageIndex;
  text: string;
  startChar?: number;
  endChar?: number;
  bbox?: { x: number; y: number; w: number; h: number }; // optional if available
}

// ============================================================================
// Page Context - Single Source of Truth for Current Position
// ============================================================================

export interface PageContext {
  docId: DocId;
  pageIndex: PageIndex;
  totalPages: number;
  tocPath?: { chapterId?: ChapterId; tocNodeId?: TocNodeId; title?: string };
  confidence: number; // 0-1 match quality for tocPath
  updatedAt: number;
}

// ============================================================================
// Knowledge Cards - Extracted concepts with page refs
// ============================================================================

export interface KnowledgeCard {
  id: CardId;
  docId: DocId;
  kind: CardKind;
  title: string;
  summary: string; // 1-2 lines
  tags: string[];
  evidence: EvidenceSpan[];
  relatedCardIds: CardId[];
  chapterId?: ChapterId;
  pageRefs: PageIndex[]; // convenience
  scores?: {
    importance?: number; // 0-100
    datSignal?: number;  // 0-100
    syllabus?: number;   // 0-100
    weakness?: number;   // 0-100
    confidence?: number; // 0-100 extraction confidence
  };
}

// ============================================================================
// Syllabus Types
// ============================================================================

export interface SyllabusItem {
  id: SyllabusItemId;
  courseId?: string;
  examType?: ExamType;
  title: string;
  description?: string;
  dueDate?: string; // ISO
  weight?: number; // 0-1
}

export interface SyllabusMatch {
  syllabusItemId: SyllabusItemId;
  docId: DocId;
  tocNodeIds: TocNodeId[];
  pageRanges: Array<{ start: PageIndex; end: PageIndex }>;
  confidence: number; // 0-1
  evidence: EvidenceSpan[];
}

// ============================================================================
// Importance Engine Types
// ============================================================================

export interface ImportanceExplanation {
  importanceScore: number; // 0-100
  reasons: Array<{ label: string; weight: number; detail: string }>;
}

export interface ImportanceEngine {
  scoreCard(card: KnowledgeCard, ctx: {
    page: PageContext;
    matches: SyllabusMatch[];
    examType: ExamType;
    userWeakness?: Record<CardId, number>; // 0-1
  }): { score: number; explanation: ImportanceExplanation };
}

// ============================================================================
// DAT Apex / Trap Detection Types
// ============================================================================

export type TrapKind =
  | 'exception'
  | 'threshold'
  | 'confusable'
  | 'negation'
  | 'units'
  | 'lookalike';

export interface TrapSignal {
  kind: TrapKind;
  label: string;
  detail: string;
  evidence: EvidenceSpan[];
  severity: number; // 0-100
}

export interface DifferentialTable {
  title: string;
  rows: Array<{ feature: string; columns: Record<string, string> }>; // columns keyed by concept name
  evidence?: EvidenceSpan[];
}

export interface DatApexEngine {
  scoreCard(card: KnowledgeCard, ctx: { examType: ExamType }): { datSignal: number; traps: TrapSignal[] };
  buildDifferential(card: KnowledgeCard, neighbors: KnowledgeCard[]): DifferentialTable;
}

// ============================================================================
// Clinical Reasoning Types
// ============================================================================

export interface ReasoningNode {
  id: string;
  type: 'problem' | 'finding' | 'mechanism' | 'dx' | 'tx' | 'contraindication' | 'risk' | 'exception';
  text: string;
  cardIds: CardId[];
  evidence: EvidenceSpan[];
}

export interface ReasoningChain {
  docId: DocId;
  pageIndex: PageIndex;
  nodes: ReasoningNode[];
  edges: Array<{ from: string; to: string; label: 'supports' | 'leads_to' | 'contra' | 'exception_of' }>;
  missing: Array<{ expectedType: ReasoningNode['type']; suggestionCardIds: CardId[]; detail: string }>;
}

export interface ClinicalReasoningEngine {
  buildChain(cards: KnowledgeCard[], ctx: PageContext): ReasoningChain;
}

// ============================================================================
// Smart Speech / Exam Emphasis Types
// ============================================================================

export interface SpeechChunk {
  id: string;
  pageIndex: PageIndex;
  text: string;
  kind: 'normal' | 'definition' | 'threshold' | 'exception' | 'trap';
  evidence?: EvidenceSpan[];
}

export interface ExamEmphasisPlan {
  docId: DocId;
  examType: ExamType;
  chunks: SpeechChunk[];
  pauses: Array<{ chunkId: string; reason: 'definition' | 'threshold' | 'exception' | 'prompt' }>;
  highlights: Array<{ chunkId: string; evidence: EvidenceSpan[] }>;
  prompts: Array<{ chunkId: string; prompt: string }>; // for whiteboard micro-lessons
}

export interface SmartSpeechEngine {
  planFromPage(docId: DocId, pageIndex: PageIndex, cards: KnowledgeCard[], examType: ExamType): ExamEmphasisPlan;
}

// ============================================================================
// Expert View Payload Types
// ============================================================================

export interface ExpertViewCard {
  card: KnowledgeCard;
  importanceScore: number;
  importanceExplanation: ImportanceExplanation;
  traps: TrapSignal[];
  datSignal?: number;
}

export interface ExpertViewPayload {
  docId: DocId;
  pageContext: PageContext;
  cards: ExpertViewCard[];
  differential?: DifferentialTable;
  reasoningChain?: ReasoningChain;
  syllabusMatches: SyllabusMatch[];
}

// ============================================================================
// NoteLab 2.0 Types - PDRM Atoms
// ============================================================================

export type PDRMAtomType = 'pattern' | 'decision' | 'rule' | 'mnemonic' | 'trap' | 'evidence';

export interface PDRMAtom {
  id: string;
  type: PDRMAtomType;
  title: string;
  content: string;
  evidence: EvidenceSpan[];
  syllabusLinks: SyllabusItemId[];
  relatedAtomIds: string[];
  cardId?: CardId;
  createdAt: number;
  updatedAt: number;
}

export interface NoteLabNote {
  id: string;
  atoms: PDRMAtom[];
  chapterId?: ChapterId;
  pageIndex?: PageIndex;
  tags: string[];
  flashcardIds: string[];
  examEmphasisQueue: boolean;
  studyPlanDate?: string; // ISO date
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Study Dashboard Types
// ============================================================================

export interface StudyCard {
  cardId: CardId;
  dueDate: string; // ISO
  repetition: number;
  easeFactor: number;
  interval: number; // days
  lastReview?: string;
  nextReview: string;
  score?: number; // last review score
}

export interface StudyQueue {
  due: StudyCard[]; // cards due today
  weak: StudyCard[]; // low score / failed recently
  examEmphasis: StudyCard[]; // high importance + syllabus critical
}

export interface NextBestAction {
  type: 'review_due' | 'explain_weak' | 'read_high_yield';
  label: string;
  cardIds: CardId[];
  count: number;
}

export interface StudyDashboardState {
  queue: StudyQueue;
  pinnedChapterIds: ChapterId[];
  pinnedSyllabusIds: SyllabusItemId[];
  mode: 'auto' | 'manual';
  examDate?: string; // ISO
  nextBestActions: NextBestAction[];
}

// ============================================================================
// TOC Types for Syllabus Matching
// ============================================================================

export interface TocNode {
  id: TocNodeId;
  title: string;
  level: number;
  pageStart: PageIndex;
  pageEnd?: PageIndex;
  parentId?: TocNodeId;
  children?: TocNode[];
}

// ============================================================================
// Extraction Context Types
// ============================================================================

export type ExtractionMode = 'current_page' | 'current_chapter' | 'full_document';

export interface ExtractionContext {
  mode: ExtractionMode;
  pageContext: PageContext;
  chapterRange?: { start: PageIndex; end: PageIndex };
}

// ============================================================================
// UI Filter Types
// ============================================================================

export type CardFilterKind = 'all' | 'process' | 'causal' | 'diagnostic' | 'risk' | 'exception';

export interface ExpertViewFilters {
  kindFilter: CardFilterKind;
  minConfidence: number; // 0-1
  showTrapsOnly: boolean;
  datApexEnabled: boolean;
}
