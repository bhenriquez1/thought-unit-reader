// lib/studyplan/types.ts
// Study Plan Lab has two plan flavors:
//   1. Diagnostic-driven (DiagnosticAttempt -> StudyPlanRecord): generate a
//      diagnostic from the active book, score it, derive weak topics, build
//      a study plan linking back to NoteLab/RecallLab/StudyGuideLab.
//   2. Chapter-driven (ChapterStudyPlan): read Read/Understand/Recall/Mastery
//      % straight from the Syllabus tab's chapter-progress engine
//      (lib/syllabus/chapterProgress.ts) and turn the gaps for one chapter
//      into the same actionable block/action shape, no quiz required.

export interface DiagnosticQuestion {
  id: string;
  question: string;
  options: string[];       // exactly 4 options
  correctIndex: number;     // 0-3
  topic: string;            // weak-topic grouping label, e.g. "Enzyme Kinetics"
  page?: number;            // best-guess source page in the active book
  explanation: string;
}

export interface DiagnosticAnswer {
  questionId: string;
  selectedIndex: number | null;
  correct: boolean;
}

export interface WeakTopic {
  topic: string;
  missed: number;
  total: number;
  pages: number[];
}

export interface DiagnosticAttempt {
  id: string;
  bookId: string;
  bookTitle?: string;
  chapterTitle?: string;
  createdAt: number;
  questions: DiagnosticQuestion[];
  answers: DiagnosticAnswer[];
  scorePct: number;
  weakTopics: WeakTopic[];
}

export type StudyPlanActionType =
  | "read_page"
  | "review_note"
  | "review_recall"
  | "review_guide"
  | "practice";

export interface StudyPlanAction {
  type: StudyPlanActionType;
  label: string;
  page?: number;
  refId?: string; // UltraNote id / RecallSet id / StudyGuideRecord id
}

export interface StudyPlanBlock {
  id: string;
  title: string;       // e.g. "Day 1 — Enzyme Kinetics"
  topic: string;
  pages: number[];
  actions: StudyPlanAction[];
  estimatedMinutes: number;
}

export interface StudyPlanRecord {
  id: string;
  bookId: string;
  bookTitle?: string;
  createdAt: number;
  diagnosticId: string;
  weakTopics: WeakTopic[];
  blocks: StudyPlanBlock[];
}

export interface ChapterStudyPlan {
  id: string;
  bookId: string;
  chapterId: string;
  chapterTitle: string;
  readPct: number;
  understandPct: number;
  recallPct: number;
  masteryPct: number;
  blocks: StudyPlanBlock[];
  createdAt: number;
}

export interface UnitStudyPlan {
  id: string;
  bookId: string;
  chapterIds: string[];
  title: string; // e.g. "Chapter 1 → Chapter 5"
  unitReadPct: number;
  unitUnderstandPct: number;
  unitRecallPct: number;
  unitMasteryPct: number;
  blocks: StudyPlanBlock[]; // one per chapter (daily objectives) + a trailing review block
  createdAt: number;
}
