// lib/examEngine/types.ts
// Universal Exam Engine — profile-driven types shared by every exam this app
// supports. DAT is the first profile (see profiles/datProfile.ts); MCAT/GRE/
// board-exam profiles plug into the same ExamProfile/EngineQuestion shapes
// without changing this file.

export type DifficultyLevel = "foundation" | "simulation" | "advanced" | "mastery";

export type QuestionType =
  | "recognition"
  | "decision"
  | "application"
  | "trap_training"
  | "recall";

export interface ExamSectionConfig {
  id: string;
  name: string;
  shortName: string;
  defaultQuestionCount: number;
  defaultTimeLimitMinutes: number;
  topics: string[];
}

export interface TopicBlueprintEntry {
  topic: string;
  section: string;
  weight: number; // 0–1, relative emphasis on the real exam
  skillsTested: string[];
  commonMisconceptions: string[];
}

export interface ExamTimingRules {
  totalTimeLimitMinutes: number;
  perSectionOverrides?: Record<string, number>;
  warningThresholdMinutes: number;
}

export interface ExamScoringRules {
  pointsPerQuestion: number;
  penalizeGuessing: boolean;
  scaledScoreRange?: { min: number; max: number };
}

export interface WeaknessAnalyticsConfig {
  minAttemptsForSignal: number;
  weakAccuracyThreshold: number; // percent below this => weak topic
  strongAccuracyThreshold: number; // percent above this => strong topic
}

/** A complete exam definition — DAT, and eventually MCAT/GRE/board profiles. */
export interface ExamProfile {
  id: string;
  examName: string;
  sections: ExamSectionConfig[];
  questionTypes: QuestionType[];
  difficultyLevels: DifficultyLevel[];
  timingRules: ExamTimingRules;
  scoringRules: ExamScoringRules;
  topicBlueprint: TopicBlueprintEntry[];
  weaknessAnalytics: WeaknessAnalyticsConfig;
}

/** Universal question shape — AI-generated, grounded in a user's own notes. */
export interface EngineQuestion {
  id: string;
  examProfileId: string;
  section: string;
  subject: string;
  unit: string;
  topic: string;
  subtopic?: string;
  concept: string;
  difficulty: DifficultyLevel;
  questionType: QuestionType;
  skillTested: string;
  misconceptionTested?: string;

  /** Grounding — which note/book/page this question was generated from. */
  sourceStudyModelId?: string;
  sourceBookId: string;
  sourcePageNumber?: number;
  /** IDs of CanonicalThoughtUnits this question was generated from.
   *  Enables "View Source in Reader" navigation. */
  sourceThoughtUnitIds?: string[];
  /** IDs of the shared Knowledge Graph nodes (lib/knowledge/) resolved for
   *  this question's source page — TestLab-Reader progress integration.
   *  Lets a wrong/uncertain answer feed back into the SAME Knowledge Node
   *  Reader and Recall already track, rather than a second, disconnected
   *  "weak topic" concept unique to TestLab. Populated on a best-effort
   *  basis: empty when no Knowledge Graph nodes exist yet for this page
   *  (e.g. the page was never actually opened in Reader). */
  sourceKnowledgeNodeIds?: string[];
  /** The RESOLVED, collision-resistant document identity (lib/insights/
   *  resolveDocumentIdentity.ts) that sourceKnowledgeNodeIds' nodes actually
   *  belong to — distinct from sourceBookId, which is a filename. This is
   *  what a Learning State write (lib/datApex/datLearningState.ts) must key
   *  on: recordLearningEvent's ownership guard compares against
   *  KnowledgeNodeProgress.documentId, which is stamped from this same
   *  resolved identity, not from sourceBookId. Populated on the same best-
   *  effort basis as sourceKnowledgeNodeIds — present exactly when that
   *  array is non-empty, since both come from the same resolved
   *  KnowledgeNode lookup. */
  sourceDocumentId?: string;
  /** Canonical page identity (`${documentId}::${pageNumber}::${textReady}`)
   *  this question was generated from — same buildPageTruthKey convention
   *  used everywhere else in the app. */
  pageTruthKey?: string;
  /** Verbatim excerpt(s) from the source concept text the server verified
   *  this question is actually grounded in — the X2 provenance/rejection
   *  gate's audit trail (see pages/api/exam-question-gen.ts). A question
   *  whose claimed quote does not appear in the source text is rejected
   *  before it ever reaches this array. */
  sourceEvidence?: string[];
  /** Version of the generation+grounding-rejection pipeline that produced
   *  this question — bump in pages/api/exam-question-gen.ts when the
   *  rejection algorithm changes. */
  generatorVersion?: number;

  stem: string;
  choices: string[];
  correctIndex: number;
  whyCorrect: string;
  /** One explanation per choice; the entry at correctIndex is unused. */
  whyWrong: string[];
  trapType?: string;

  createdAt: string;
}

export interface QuestionAttempt {
  id: string;
  questionId: string;
  examProfileId: string;
  bookId: string;
  /** Groups attempts from the same exam sitting, for improvement-over-time trends. */
  examAttemptId?: string;
  section: string;
  topic: string;
  difficulty: DifficultyLevel;
  questionType: QuestionType;
  correct: boolean;
  selectedIndex: number;
  timeSeconds: number;
  confidence?: 1 | 2 | 3 | 4 | 5;
  trapTriggered?: string;
  createdAt: string;
}

export interface TopicAccuracy {
  topic: string;
  section: string;
  correct: number;
  total: number;
  percent: number;
}

export interface DifficultyAccuracy {
  difficulty: DifficultyLevel;
  correct: number;
  total: number;
  percent: number;
}

export interface ErrorTypeBreakdown {
  questionType: QuestionType;
  trapType?: string;
  count: number;
}

export interface ConfidenceAccuracyPoint {
  confidence: 1 | 2 | 3 | 4 | 5;
  accuracy: number;
  count: number;
}

export interface WeaknessReport {
  bookId: string;
  examProfileId: string;
  generatedAt: string;
  topicAccuracy: TopicAccuracy[];
  difficultyAccuracy: DifficultyAccuracy[];
  errorTypeBreakdown: ErrorTypeBreakdown[];
  confidenceAccuracy: ConfidenceAccuracyPoint[];
  improvementOverTime: { sessionId: string; date: string; percent: number }[];
  weakestTopics: TopicAccuracy[];
  strongestTopics: TopicAccuracy[];
}

export interface StudyRecommendation {
  bookId: string;
  generatedAt: string;
  weakestTopics: string[];
  highestReturnTopic: string | null;
  readerPages: { bookId: string; pageNumber: number; topic: string }[];
  recallSetId: string | null;
  /** Podcast Lab is single-page only today; this links the weakest topic's
   *  source page in page_review mode, not a true cross-topic cram episode. */
  podcastDeepLink: { bookId: string; pageNumber: number; mode: "page_review" } | null;
  nextExamMode: DifficultyLevel;
  narrative: string;
}
