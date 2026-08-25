// lib/examEngine/courseExamTypes.ts
// C6 (Phase 0 audit) — the roadmap's four Course Exam types (Chapter Quiz /
// Unit Exam / Midterm / Cumulative Final) differ from each other by how much
// material they cover and how exam-like they feel, not by a distinct
// question-generation pipeline or section taxonomy. Both of those knobs
// already exist and are fully generic: ExamScope (lib/examEngine/examScope.ts)
// picks the material, PracticeMode (lib/apex/bookCatalogue.ts) picks
// timed/untimed + feedback timing. This file is the mapping from "which
// type of course exam" onto those two existing, already-tested systems —
// deliberately not a new pipeline concept.
import type { ExamScope } from "@/lib/examEngine/examScope";
import type { PracticeMode } from "@/lib/apex/bookCatalogue";

export type CourseExamType = "chapter-quiz" | "unit-exam" | "midterm" | "cumulative-final";

export interface CourseExamTypeConfig {
  id: CourseExamType;
  icon: string;
  label: string;
  description: string;
  /** Which ExamScope this type suggests — the student can still change it
   *  afterward via the normal scope picker; this only sets the default. */
  scope: ExamScope;
  /** Which PracticeMode this type suggests — see bookCatalogue.ts's
   *  PRACTICE_MODES for what each id actually does (timed/untimed,
   *  feedback timing, default time limit). */
  practiceMode: PracticeMode;
  questionCount: number;
}

export const COURSE_EXAM_TYPES: CourseExamTypeConfig[] = [
  {
    id: "chapter-quiz",
    icon: "📄",
    label: "Chapter Quiz",
    description: "One chapter, untimed, instant feedback",
    scope: "selected-chapters",
    practiceMode: "practice",
    questionCount: 10,
  },
  {
    id: "unit-exam",
    icon: "📗",
    label: "Unit Exam",
    description: "A few chapters, timed, exam conditions",
    scope: "selected-chapters",
    practiceMode: "practice-exam",
    questionCount: 25,
  },
  {
    id: "midterm",
    icon: "📘",
    label: "Midterm",
    description: "Everything covered so far, timed",
    scope: "completed",
    practiceMode: "practice-exam",
    questionCount: 45,
  },
  {
    id: "cumulative-final",
    icon: "🎓",
    label: "Cumulative Final",
    description: "The whole book, full timed simulation",
    scope: "entire-book",
    practiceMode: "full-dat",
    questionCount: 70,
  },
];
