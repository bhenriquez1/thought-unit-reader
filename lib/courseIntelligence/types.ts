// lib/courseIntelligence/types.ts
// Course Intelligence Types
// Curriculum alignment + planning + exam targeting

// ============================================================================
// Syllabus Block Types
// ============================================================================

export type SyllabusBlockType =
  | 'week'
  | 'module'
  | 'lecture'
  | 'exam'
  | 'quiz'
  | 'assignment'
  | 'lab'
  | 'reading'
  | 'topic'
  | 'deliverable';

export interface SyllabusBlock {
  id: string;
  type: SyllabusBlockType;
  title: string;
  dateRange?: DateRange;
  dueDate?: string;
  rawText: string;
  extractedEntities: {
    chapters: number[];
    pages: PageRange[];
    keywords: string[];
    topics: string[];
  };
  parentId?: string;  // For nested structure
  children: string[]; // Child block IDs
}

export interface DateRange {
  start: string;  // ISO date
  end: string;
}

export interface PageRange {
  start: number;
  end: number;
}

export interface TOCEntry {
  id: string;
  title: string;
  level: number;
  pageRange?: PageRange;
  chapterTitle?: string;
  keywords: string[];
}

// ============================================================================
// Objective Mapping (Syllabus → TOC)
// ============================================================================

export type MappingStatus =
  | 'auto_accepted'    // High confidence, auto-matched
  | 'suggested_review' // Medium confidence, review suggested
  | 'needs_review'     // Low confidence, manual correction required
  | 'gold'             // User verified/corrected
  | 'rejected';        // User rejected match

export interface ObjectiveMapping {
  id: string;
  objectiveId: string;        // SyllabusBlock ID
  tocId: string;              // TOC section ID

  // Scoring
  confidenceScore: number;    // 0-1
  textScore: number;          // TF-IDF/BM25 similarity
  embedScore: number;         // Embedding similarity
  structScore: number;        // Structural cue match

  // Status
  status: MappingStatus;
  reasons: string[];          // Why this match was made

  // Audit
  createdAt: number;
  updatedAt?: number;
  userId?: string;            // If manually corrected
}

export interface ClusterMapping {
  objectiveId: string;
  clusterId: string;
  similarity: number;
  examProximityWeight: number;
  pageOverlap: boolean;
}

// ============================================================================
// Coverage Graph
// ============================================================================

export interface CoverageNode {
  id: string;
  type: 'objective' | 'toc' | 'cluster';
  title: string;
  children: CoverageNode[];

  // Mapping info
  mappingConfidence?: number;
  mappingStatus?: MappingStatus;

  // Mastery info
  masteryScore?: number;
  lastStudied?: number;

  // Priority
  isHighYield: boolean;
  examRelevance: number;      // 0-1

  // Page info
  pageRange?: PageRange;
}

export interface CoverageGraph {
  roots: CoverageNode[];

  // Summary stats
  coveragePercent: number;
  weakClustersCount: number;
  dueSoonCount: number;
  lowConfidenceCount: number;

  // Filters applied
  examId?: string;
  highYieldOnly: boolean;
}

// ============================================================================
// Action Plan
// ============================================================================

export type PlanBlockType = 'reading' | 'reasoning' | 'drill';

export interface StudyPlan {
  id: string;
  examId?: string;
  documentId: string;

  // Plan state
  planLocked: boolean;
  generatedAt: number;
  lockedAt?: number;

  // Time budget
  timeBudget: TimeBudget;

  // Plan blocks
  todayBlocks: PlanBlock[];
  weekBlocks: PlanBlock[];
  examBlocks: PlanBlock[];

  // Weakness analysis
  weakClusters: WeakCluster[];
}

export interface TimeBudget {
  reading: number;     // Minutes
  reasoning: number;
  drills: number;
  total: number;
}

export interface PlanBlock {
  id: string;
  type: PlanBlockType;
  title: string;
  description: string;

  // Duration
  estimatedMinutes: number;

  // Content references
  pageRange?: PageRange;
  sectionIds: string[];
  clusterIds: string[];
  conceptIds: string[];

  // Progress
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  completedAt?: number;

  // Actions
  canPlay: boolean;       // Speech playback
  canExplain: boolean;    // Whiteboard explain
}

export interface WeakCluster {
  clusterId: string;
  clusterName: string;
  weakness: 'recognition' | 'application' | 'reasoning';
  masteryScore: number;
  examRelevance: number;
  recommendedAction: string;
  estimatedScoreLoss: number;  // Points at risk
}

// ============================================================================
// Timeline Types
// ============================================================================

export type TimelineItemType = 'week' | 'exam' | 'deliverable' | 'today';

export interface TimelineItem {
  id: string;
  type: TimelineItemType;
  title: string;
  dateRange?: DateRange;
  dueDate?: string;

  // Content
  objectives: string[];      // SyllabusBlock IDs
  mappedTocSections: string[];
  mappedClusters: string[];

  // Status
  isOverdue: boolean;
  isCurrent: boolean;
  isUpcoming: boolean;
  daysUntil?: number;

  // Progress
  progressPercent: number;
  masteryAvg: number;
}

// ============================================================================
// Course Intelligence State
// ============================================================================

export type SyllabusStatus =
  | 'none'
  | 'uploading'
  | 'parsing'
  | 'parsed'
  | 'mapping'
  | 'mapped'
  | 'needs_review';

export interface CourseIntelligenceState {
  // Document
  documentId: string;
  documentTitle: string;

  // Syllabus
  syllabusStatus: SyllabusStatus;
  syllabusBlocks: SyllabusBlock[];
  lastSyncAt?: number;

  // Mappings
  objectiveMappings: ObjectiveMapping[];
  clusterMappings: ClusterMapping[];
  lowConfidenceMappings: ObjectiveMapping[];

  // Exams
  exams: Exam[];
  selectedExamId?: string;

  // Coverage
  coverageGraph: CoverageGraph | null;

  // Plan
  studyPlan: StudyPlan | null;

  // Timeline
  timeline: TimelineItem[];
  selectedTimelineItemId?: string;

  // UI State
  examModeEnabled: boolean;
  highYieldOnly: boolean;
  explainerModeEnabled: boolean;  // Exam Week Explainer

  // Loading states
  isLoading: boolean;
  error?: string;
}

export interface Exam {
  id: string;
  title: string;
  date: string;
  syllabusBlockId?: string;
  coveredObjectiveIds: string[];
  isPast: boolean;
  daysUntil: number;
}

// ============================================================================
// Matching Config
// ============================================================================

export interface MatchingConfig {
  // Weights
  textWeight: number;       // Default 0.35
  embedWeight: number;      // Default 0.45
  structWeight: number;     // Default 0.20

  // Thresholds
  autoAcceptThreshold: number;    // Default 0.72
  reviewThreshold: number;        // Default 0.55

  // Behavior
  useEmbeddings: boolean;
  boostChapterMatches: boolean;
  boostPageMatches: boolean;
}

export const DEFAULT_MATCHING_CONFIG: MatchingConfig = {
  textWeight: 0.35,
  embedWeight: 0.45,
  structWeight: 0.20,
  autoAcceptThreshold: 0.72,
  reviewThreshold: 0.55,
  useEmbeddings: true,
  boostChapterMatches: true,
  boostPageMatches: true,
};

// ============================================================================
// Exam Week Explainer Mode Types
// ============================================================================

export interface ExplainerSession {
  id: string;
  examId: string;
  startedAt: number;

  // Current state
  currentBlockId: string;
  currentMode: 'reading' | 'explaining' | 'prompting' | 'feedback';

  // Speech state
  speechPlaying: boolean;
  speechPaused: boolean;
  pauseReason?: 'formula' | 'diagram' | 'section' | 'user';

  // Whiteboard state
  whiteboardActive: boolean;
  currentExplanation?: WhiteboardExplanation;

  // Progress
  blocksCompleted: number;
  totalBlocks: number;
  reasoningPromptsAnswered: number;
}

export interface WhiteboardExplanation {
  conceptId: string;
  steps: ExplanationStep[];
  reasoningPrompt: ReasoningPrompt;
}

export interface ExplanationStep {
  stepNumber: number;
  content: string;
  type: 'text' | 'formula' | 'diagram' | 'arrow';
  linkedConceptIds: string[];
}

export interface ReasoningPrompt {
  question: string;
  expectedInsights: string[];
  relatedDecisionLogic?: string;
}

export interface ExplainerFeedback {
  correct: string[];
  missing: string[];
  improvedReasoning: string;
  decisionRuleSuggestion?: string;
}
