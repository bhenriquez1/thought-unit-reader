// lib/surgeonEngine/types.ts
// Surgeon-View PDRM: Dental/Medical-First Reasoning Platform
// All TypeScript types for the 5 core engines
// Evidence-spine architecture: all navigation flows through Evidence[]

// ============================================================================
// 0) Shared Primitives
// ============================================================================

export type ID = string;
export type DocId = string;
export type ChapterId = string;
export type PageIndex = number;      // 0-based internally
export type ISODate = string;        // "2026-02-14"
export type ISODateTime = string;    // "2026-02-14T19:14:00Z"

export type ExamDomain =
  | 'DENTAL'
  | 'MEDICAL'
  | 'PREMED'
  | 'PREDENT'
  | 'DAT'
  | 'MCAT'
  | 'NBDE'
  | 'USMLE'
  | 'GENERAL';

export type ConfidenceBand = 'AUTO' | 'REVIEW' | 'SUGGEST';

export type ReasonCode =
  | 'TOC_EXACT'
  | 'TOC_ALIAS'
  | 'SEMANTIC_HIGH'
  | 'KEYWORD_OVERLAP'
  | 'PAGE_DENSITY'
  | 'USER_TRAINED'
  | 'FALLBACK_EVIDENCE';

// ============================================================================
// EVIDENCE SPINE - The foundation for all navigation
// ============================================================================

/** Bounding box for highlight regions */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  pageIndex: PageIndex;
}

/**
 * Evidence is the primary anchor for all navigation.
 * Every extracted item MUST carry Evidence[] so "Go-to-page" is always correct.
 */
export interface Evidence {
  docId: DocId;
  chapterId?: ChapterId;
  pageIndex: PageIndex;
  quote?: string;           // short excerpt
  rects?: Rect[];           // optional highlight boxes
  source: 'toc' | 'heading' | 'body' | 'table' | 'figure' | 'user-selection';
  confidence: number;       // 0..1 for this specific evidence link
}

// ============================================================================
// EXPLAIN PLAN - Whiteboard-ready micro-lessons
// ============================================================================

export type ExplainStepKind =
  | 'definition'
  | 'diagram'
  | 'pathway'
  | 'compare'
  | 'mnemonic'
  | 'worked-example';

export interface ExplainStep {
  kind: ExplainStepKind;
  prompt: string;           // whiteboard-ready instruction
  expectedOutput: string;   // what the whiteboard should show
  keyTakeaways: string[];
}

export interface ExplainPlan {
  id: ID;
  title: string;
  learningObjective: string[];
  steps: ExplainStep[];
  evidence: Evidence[];
}

export type UnitKind =
  | 'definition'
  | 'classification'
  | 'mechanism'
  | 'presentation'
  | 'diagnosis'
  | 'management'
  | 'complication'
  | 'differential'
  | 'anatomy'
  | 'physiology'
  | 'procedure'
  | 'unknown';

// ============================================================================
// 1) Book Structure + Extracted Units
// ============================================================================

export interface BookMeta {
  bookId: ID;
  title: string;
  authors?: string[];
  domain: ExamDomain;
  totalPages?: number;
}

export interface TocNode {
  tocId: ID;
  bookId: ID;
  title: string;
  level: 1 | 2 | 3 | 4;
  parentId?: ID;
  order: number;
  pageStart?: number;
  pageEnd?: number;
  children?: TocNode[];
}

export interface ExtractedUnit {
  unitId: ID;
  bookId: ID;
  page: number;
  text: string;
  cleanText?: string;
  kind?: UnitKind;
  bbox?: { x: number; y: number; w: number; h: number };
  source?: 'selection' | 'viewport' | 'fallback';
  createdAt?: ISODateTime;
}

// ============================================================================
// 2) Syllabus Matching Engine
// ============================================================================

/** SyllabusUnit per spec - week/module/exam buckets */
export interface SyllabusUnit {
  id: ID;
  courseId?: ID;
  label: string;              // "Week 3", "Exam 1", "Module: Periodontium"
  date?: ISODate;             // ISO date
  topics: string[];
  requiredReadings?: string[];
  weight?: number;            // 0..1 importance from syllabus
}

/** BookAnchor for syllabus matching */
export interface BookAnchor {
  chapterId: ChapterId;
  title: string;
  pageStart?: PageIndex;
  pageEnd?: PageIndex;
  headings?: string[];
  keywords?: string[];
}

/** MatchResult with Evidence spine */
export interface MatchResult {
  syllabusUnitId: ID;
  anchor: BookAnchor;
  confidence: number;         // 0..1
  reasons: string[];
  evidence: Evidence[];       // pages/snippets supporting match
  status: 'mapped' | 'needs-review' | 'rejected';
}

export interface SyllabusItem {
  syllabusId: ID;
  courseId?: ID;
  title: string;
  description?: string;
  examDate?: ISODate;
  weekIndex?: number;
  keywords?: string[];
}

export interface MappingCandidate {
  tocId?: ID;
  pageRange?: { start: number; end: number };
  unitIds?: ID[];
  confidence: number;
  band: ConfidenceBand;
  reasonCodes: ReasonCode[];
  debug?: {
    semanticScore?: number;
    headingScore?: number;
    keywordScore?: number;
    pageDensity?: number;
    matchedHeading?: string;
  };
}

export interface SyllabusMappingResult {
  syllabusId: ID;
  bookId: ID;
  chosen?: MappingCandidate;
  candidates: MappingCandidate[];
  needsReview: boolean;
  updatedAt: ISODateTime;
}

export interface UserTrainingSignal {
  syllabusId: ID;
  bookId: ID;
  acceptedCandidate: MappingCandidate;
  rejectedCandidates?: MappingCandidate[];
  notes?: string;
  createdAt: ISODateTime;
}

// ============================================================================
// 3) Importance Engine
// ============================================================================

export type ImportanceLabel = 'HIGH_YIELD' | 'WORTH_KNOWING' | 'BACKGROUND';

export interface ImportanceSignals {
  // Clinical/exam features (0..1)
  hasDefinition?: number;
  hasClassification?: number;
  hasStagingGrading?: number;
  hasMechanism?: number;
  hasDiagnosticCriteria?: number;
  hasFirstLine?: number;
  hasContraindication?: number;
  hasDifferential?: number;
  hasRedFlags?: number;
  hasNumericThresholds?: number;
  // Structure features (0..1)
  tocBoost?: number;
  tableBoxBoost?: number;
  repetitionBoost?: number;
  // User features (0..1)
  syllabusBoost?: number;
  weaknessBoost?: number;
  recencyDecay?: number;
}

export interface ImportanceScore {
  unitId: ID;
  bookId: ID;
  page: number;
  score: number;
  label: ImportanceLabel;
  domain: ExamDomain;
  signals: ImportanceSignals;
  breakdown: {
    baseClinical: number;
    examBoost: number;
    structureBoost: number;
    personalBoost: number;
    redundancyPenalty: number;
  };
  updatedAt: ISODateTime;
}

/** ImportanceReason per spec - why something is important */
export type ImportanceReason =
  | 'definition'
  | 'clinical-pearl'
  | 'decision-rule'
  | 'exception'
  | 'common-trap'
  | 'high-frequency'
  | 'syllabus-weight'
  | 'table-figure'
  | 'workflow-node';

/** ImportanceItem with Evidence spine for navigation */
export interface ImportanceItem {
  id: ID;
  docId: DocId;
  chapterId?: ChapterId;
  title: string;
  score: number;              // normalized 0..100
  reasons: Array<{ kind: ImportanceReason; weight: number; note?: string }>;
  evidence: Evidence[];
  tags: string[];             // e.g. ["Perio", "Diagnosis", "Management"]
}

// ============================================================================
// 4) DAT Trap Detection
// ============================================================================

export type TrapType =
  | 'LOOK_ALIKE'
  | 'REVERSAL'
  | 'THRESHOLD'
  | 'EXCEPTION'
  | 'NEGATION'
  | 'WORDING_TRICK'
  | 'ABSOLUTE_QUALIFIER'
  | 'CLASSIFICATION_BOUNDARY';

/** Extended trap kinds per spec */
export type TrapKind =
  | 'except-least-most'
  | 'look-alike'
  | 'reversed-causality'
  | 'absolute-words'
  | 'timing-confusion'
  | 'unit-conversion'
  | 'negative-stem';

export interface TrapTag {
  trapId: ID;
  unitId: ID;
  bookId: ID;
  type: TrapType;
  kind?: TrapKind;              // Extended classification
  confidence: number;
  cue?: string;
  trapPrompt: string;
  separatorHint?: string;
  createdAt: ISODateTime;
}

/** TrapSignal with Evidence spine for navigation */
export interface TrapSignal {
  id: ID;
  kind: TrapKind;
  triggerText: string;
  whyItTraps: string;
  fixStrategy: string;          // how to avoid it
  evidence: Evidence[];
  exam: ExamDomain;
}

// ============================================================================
// 5) Pattern Recognition Engine
// ============================================================================

export type PatternType =
  | 'PRESENTATION'
  | 'MECHANISM'
  | 'DIAGNOSTIC_PATHWAY'
  | 'TREATMENT_PATHWAY'
  | 'RISK_PATTERN'
  | 'ANATOMY_FUNCTION'
  | 'DEFINITIONAL_SCHEMA';

/** Extended pattern kinds per spec */
export type PatternKind =
  | 'diagnostic-pattern'
  | 'treatment-pattern'
  | 'anatomy-structure'
  | 'microbio-association'
  | 'pharm-mechanism'
  | 'differential'
  | 'contraindication'
  | 'complication';

export interface EvidenceRef {
  unitId: ID;
  page: number;
  quote?: string;
}

export interface Pattern {
  patternId: ID;
  bookId: ID;
  type: PatternType;
  kind?: PatternKind;           // Extended classification
  trigger: string;
  interpretation: string;
  differential?: string[];
  ruleLinks?: ID[];
  evidence: EvidenceRef[];
  evidenceSpine?: Evidence[];   // NEW: Evidence spine for navigation
  highYield?: boolean;
  related?: ID[];               // pattern ids
  confidence: number;
  createdAt: ISODateTime;
}

export interface PatternCluster {
  clusterId: ID;
  bookId: ID;
  name: string;
  types: PatternType[];
  patternIds: ID[];
  anchorUnitIds: ID[];
  pageRange?: { start: number; end: number };
  importanceScore?: number;
  createdAt: ISODateTime;
}

// ============================================================================
// 6) Clinical Reasoning Flow (Surgeon-View Scaffold)
// ============================================================================

export interface ClinicalScaffold {
  scaffoldId: ID;
  bookId: ID;
  from: { clusterId?: ID; unitId?: ID; page?: number };
  observe: string[];
  hypothesize: { label: string; rationale?: string; confidence: number }[];
  test: string[];
  decide: string[];
  act: string[];
  verify: string[];
  references: EvidenceRef[];
  evidence: Evidence[];        // NEW: Evidence spine for navigation
  createdAt: ISODateTime;
}

// ============================================================================
// Clinical Reasoning Flow (Graph-based, for Insights mode)
// ============================================================================

export type ClinicalNodeType =
  | 'chief-complaint'
  | 'finding'
  | 'risk-factor'
  | 'differential'
  | 'test'
  | 'diagnosis'
  | 'treatment'
  | 'complication'
  | 'follow-up';

export interface ClinicalNode {
  id: ID;
  type: ClinicalNodeType;
  label: string;
  details?: string[];
  evidence: Evidence[];
}

export type ClinicalEdgeRelation =
  | 'supports'
  | 'rules-out'
  | 'requires'
  | 'leads-to'
  | 'contraindicates';

export interface ClinicalEdge {
  from: ID;
  to: ID;
  relation: ClinicalEdgeRelation;
  note?: string;
}

export interface ClinicalFlow {
  id: ID;
  title: string;
  nodes: ClinicalNode[];
  edges: ClinicalEdge[];
  /** Missing nodes for "what you're missing" guidance */
  missing?: Array<{ expectedType: ClinicalNodeType; hint: string }>;
}

// ============================================================================
// Smart Speech / Exam Emphasis
// ============================================================================

export type SpeechMode = 'normal' | 'exam-emphasis' | 'slow-comprehension';

export interface SpeechCue {
  id: ID;
  mode: SpeechMode;
  startMs: number;
  endMs: number;
  text: string;
  emphasis: 'none' | 'light' | 'strong';
  highlightAnchors?: Evidence[];   // where to highlight while speaking
  pauseAfter?: number;             // ms
}

// ============================================================================
// 7) Cross-Engine "Expert View Payload"
// ============================================================================

export interface ExpertViewPayload {
  bookId: ID;
  page: PageIndex;
  chapterId?: ChapterId;
  units: ExtractedUnit[];
  importance: Record<ID, ImportanceScore>;
  importanceItems: ImportanceItem[];    // For ranked display
  traps: Record<ID, TrapTag[]>;
  trapSignals: TrapSignal[];            // Evidence-based traps
  clusters: PatternCluster[];
  patterns: Record<ID, Pattern[]>;
  scaffold?: ClinicalScaffold;
  clinicalFlow?: ClinicalFlow;          // Graph-based reasoning
  explainPlan?: ExplainPlan;            // Whiteboard-ready
}

// ============================================================================
// Store State
// ============================================================================

export interface SurgeonEngineState {
  bookId: ID;
  domain: ExamDomain;

  // Page context - single source of truth
  currentPageIndex: PageIndex;
  currentChapterId?: ChapterId;
  currentSelection?: string;

  // Extracted units
  units: Record<ID, ExtractedUnit>;

  // Engine outputs - Evidence spine based
  importanceScores: Record<ID, ImportanceScore>;
  importanceItems: ImportanceItem[];           // Ranked list with Evidence[]
  trapTags: Record<ID, TrapTag[]>;
  trapSignals: TrapSignal[];                   // Evidence-based traps
  patterns: Record<ID, Pattern>;
  patternClusters: Record<ID, PatternCluster>;
  scaffolds: Record<ID, ClinicalScaffold>;
  clinicalFlows: Record<ID, ClinicalFlow>;     // Graph-based reasoning

  // Syllabus
  syllabusItems: SyllabusItem[];
  syllabusUnits: SyllabusUnit[];               // Parsed syllabus
  syllabusResults: Record<ID, SyllabusMappingResult>;
  matchResults: MatchResult[];                 // Evidence-based matches
  trainingSignals: UserTrainingSignal[];

  // TOC
  tocNodes: TocNode[];

  // Explain/Whiteboard
  explainPlans: Record<ID, ExplainPlan>;
  activeExplainPlanId?: ID;

  // UI state
  selectedClusterId?: ID;
  selectedUnitId?: ID;
  activeScaffoldId?: ID;
  activeMode: 'priority' | 'explain' | 'compare' | 'insights';

  // Processing
  isProcessing: boolean;
  processingStep?: string;
}

// ============================================================================
// PR3: Re-export source-anchoring types from page-intelligence for consumers
// ============================================================================

export type {
  SourceRef,
  AnchoredItem,
  ParagraphUnit,
  ParagraphRole,
  ParagraphSignals,
} from '../page-intelligence/types';
