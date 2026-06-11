// lib/studyplan/types.ts
// Diagnostic-driven Study Plan Lab — separate from the syllabus planner.
// Flow: generate a diagnostic from the active book → score it → derive weak
// topics → build a study plan that links back to NoteLab/RecallLab/StudyGuideLab.

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
