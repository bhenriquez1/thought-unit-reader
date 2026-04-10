// lib/apex/datApexTypes.ts
// DAT Apex Engine — core state and data types

export type ApexSection = "bio" | "gc" | "orgo" | "pat" | "rc" | "qr";

export type PracticeScore = {
  id: string;
  section: ApexSection;
  mode: "quick" | "mistake_review" | "section_test" | "full_sim";
  correct: number;
  total: number;
  percent: number;
  timeSeconds: number;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  createdAt: string;
};

export type DatProjection = {
  totalProjected: number;
  confidence: "low" | "medium" | "high";
  sectionProjected: Record<ApexSection, number>;
  basedOnSessions: number;
  updatedAt: string;
};

export type PatternReadiness = {
  patternId: string;
  section: ApexSection;
  readiness: number;        // 0–100
  recognition: number;
  decisionAccuracy: number;
  trapResistance: number;
  speed: number;
  lastSeenAt: string;
};

export type MasteryLevel = "unseen" | "learning" | "unstable" | "strong" | "mastered";

export type UserPattern = {
  id: string;
  section: ApexSection;
  name: string;
  trigger: string;
  decisionRule: string;
  commonTrap: string;
  masteryLevel: MasteryLevel;
  readiness: number;          // 0–100
  timesSeen: number;
  timesCorrect: number;
  timesMissed: number;
  avgTimeSeconds: number;
  updatedAt: string;
};

export type TrapRecord = {
  id: string;
  patternId?: string;
  section: ApexSection;
  trapType: string;
  description: string;
  timesTriggered: number;
  lastTriggeredAt: string;
  severity: "low" | "medium" | "high";
};

export type MissReason =
  | "pattern_miss"
  | "wrong_rule"
  | "knowledge_gap"
  | "trap_fell_for"
  | "rushed"
  | "careless";

export type MistakeRecord = {
  id: string;
  questionId: string;
  section: ApexSection;
  patternId?: string;
  userAnswer: string;
  correctAnswer: string;
  reasonMissed: MissReason;
  pdrm: {
    pattern: string;
    decisionRule: string;
    reason: string;
    miss: string;
  };
  createdAt: string;
};

export type StudySession = {
  id: string;
  mode: "quick" | "mistake_review" | "pattern_drill" | "section_test" | "full_sim";
  section: ApexSection | "mixed";
  startedAt: string;
  endedAt?: string;
  durationSeconds: number;
  questionsSeen: number;
  correct: number;
  total: number;
  patternsTouched: string[];
  trapsTriggered: string[];
};

export type PdrmAnalysis = {
  questionId: string;
  section: ApexSection;
  pattern: { id?: string; label: string; confidence: number };
  decisionRule: { label: string; confidence: number };
  reason: { explanation: string; evidence: string[] };
  miss: { trapType: string; whyMissed: string; preventionRule: string };
};

export type GeneratedQuestion = {
  id: string;
  section: ApexSection;
  patternId: string;
  difficulty: number;        // 1–10
  trapType?: string;
  question: string;
  choices: string[];
  answer: string;
  explanation: string;
  pdrm: { pattern: string; decisionRule: string; trap: string };
  createdAt: string;
  datPlus: boolean;
};

export type UserQuestionAttempt = {
  id: string;
  questionId: string;
  section: string;
  patternId: string;
  correct: boolean;
  selectedAnswer: string;
  timeSeconds: number;
  trapTriggered?: string;
  createdAt: string;
};

export type UserQuestionBank = {
  questions: GeneratedQuestion[];
  attempts: UserQuestionAttempt[];
};

export type PatternPressure = {
  highRisk: string[];
  unstable: string[];
  mastered: string[];
};

export type DatApexState = {
  sessions: StudySession[];
  scores: PracticeScore[];
  patterns: UserPattern[];
  patternReadiness: PatternReadiness[];
  mistakes: MistakeRecord[];
  traps: TrapRecord[];
  questionBank: UserQuestionBank;
  projection: DatProjection | null;
  currentRecommendation: {
    section: string;
    mode: string;
    targetPatterns: string[];
    reason: string;
  } | null;
  insights: string[];
};
