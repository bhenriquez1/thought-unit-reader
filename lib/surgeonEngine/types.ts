// lib/surgeonEngine/types.ts
// Surgeon-View PDRM: Dental/Medical-First Reasoning Platform
// All TypeScript types for the 5 core engines

// ============================================================================
// 0) Shared Primitives
// ============================================================================

export type ID = string;
export type ISODate = string;       // "2026-02-14"
export type ISODateTime = string;   // "2026-02-14T19:14:00Z"

export type ExamDomain =
  | 'DENTAL'
  | 'MEDICAL'
  | 'PREMED'
  | 'PREDENT'
  | 'DAT'
  | 'MCAT'
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

// ============================================================================
// 4) DAT Trap Detection
// ============================================================================

export type TrapType =
  | 'LOOK_ALIKE'
  | 'REVERSAL'
  | 'THRESHOLD'
  | 'EXCEPTION'
  | 'NEGATION'
  | 'WORDING_TRICK';

export interface TrapTag {
  trapId: ID;
  unitId: ID;
  bookId: ID;
  type: TrapType;
  confidence: number;
  cue?: string;
  trapPrompt: string;
  separatorHint?: string;
  createdAt: ISODateTime;
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

export interface EvidenceRef {
  unitId: ID;
  page: number;
  quote?: string;
}

export interface Pattern {
  patternId: ID;
  bookId: ID;
  type: PatternType;
  trigger: string;
  interpretation: string;
  differential?: string[];
  ruleLinks?: ID[];
  evidence: EvidenceRef[];
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
  createdAt: ISODateTime;
}

// ============================================================================
// 7) Cross-Engine "Expert View Payload"
// ============================================================================

export interface ExpertViewPayload {
  bookId: ID;
  page: number;
  units: ExtractedUnit[];
  importance: Record<ID, ImportanceScore>;
  traps: Record<ID, TrapTag[]>;
  clusters: PatternCluster[];
  patterns: Record<ID, Pattern[]>;
  scaffold?: ClinicalScaffold;
}

// ============================================================================
// Store State
// ============================================================================

export interface SurgeonEngineState {
  bookId: ID;
  domain: ExamDomain;

  // Extracted units
  units: Record<ID, ExtractedUnit>;

  // Engine outputs
  importanceScores: Record<ID, ImportanceScore>;
  trapTags: Record<ID, TrapTag[]>;
  patterns: Record<ID, Pattern>;
  patternClusters: Record<ID, PatternCluster>;
  scaffolds: Record<ID, ClinicalScaffold>;

  // Syllabus
  syllabusItems: SyllabusItem[];
  syllabusResults: Record<ID, SyllabusMappingResult>;
  trainingSignals: UserTrainingSignal[];

  // TOC
  tocNodes: TocNode[];

  // UI state
  selectedClusterId?: ID;
  selectedUnitId?: ID;
  activeScaffoldId?: ID;

  // Processing
  isProcessing: boolean;
  processingStep?: string;
}
