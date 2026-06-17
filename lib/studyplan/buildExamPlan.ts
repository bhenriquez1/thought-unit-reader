// lib/studyplan/buildExamPlan.ts
// Exam Prep plans (Midterm / Final): same chapter-progress data and block
// shape as the Unit Plan, but ordered weakest-mastery-first (so the chapter
// you're least ready for is the first thing you study) and annotated with
// which chapters are already strong vs. still weak. Which chapters to pass
// in (covered-so-far for Midterm, the whole syllabus for Final) is decided
// by the caller — this just builds the plan from whatever entries it's given.

import { computeCourseProgress, type ChapterLike, type ChapterProgress } from "@/lib/syllabus/chapterProgress";
import type { UltraNote } from "@/lib/notelab/ultraNoteStore";
import type { RecallSet } from "@/lib/recalllab/recallStore";
import type { StudyGuideRecord } from "@/lib/studyguide/types";
import { buildChapterBlock } from "./buildChapterPlan";
import type { ExamPlanKind, ExamStudyPlan, StudyPlanBlock } from "./types";

export interface ExamPlanInputs {
  visitedPages: Set<number>;
  notes: UltraNote[];
  recallSets: RecallSet[];
  studyGuides: StudyGuideRecord[];
}

const STRONG_MASTERY_THRESHOLD = 70;
const WEAK_MASTERY_THRESHOLD = 40;
const READY_THRESHOLD = 75;
const ALMOST_READY_THRESHOLD = 50;

// "Am I ready for the exam?" — weighted toward recall over raw mastery,
// since a chapter can look read-and-understood but still fall apart under
// timed recall, which is what the exam actually tests.
function computeReadiness(examMasteryPct: number, examRecallPct: number): { pct: number; label: "Ready" | "Almost Ready" | "Not Ready" } {
  const pct = Math.round(examMasteryPct * 0.4 + examRecallPct * 0.6);
  const label = pct >= READY_THRESHOLD ? "Ready" : pct >= ALMOST_READY_THRESHOLD ? "Almost Ready" : "Not Ready";
  return { pct, label };
}

export function buildExamPlan(
  bookId: string,
  kind: ExamPlanKind,
  entries: Array<{ chapter: ChapterLike; progress: ChapterProgress }>,
  inputs: ExamPlanInputs
): ExamStudyPlan {
  const sorted = [...entries].sort((a, b) => a.progress.masteryPct - b.progress.masteryPct);
  const chapters = sorted.map((e) => e.chapter);
  const progressList = sorted.map((e) => e.progress);
  const course = computeCourseProgress(chapters, progressList);

  const blocks: StudyPlanBlock[] = sorted.map(({ chapter, progress }, i) => {
    const block = buildChapterBlock(chapter, progress, inputs);
    return { ...block, id: `ep-${chapter.id}`, title: `Priority ${i + 1} — ${chapter.title} (Mastery ${progress.masteryPct}%)` };
  });

  const weakChapterTitles = sorted.filter(({ progress }) => progress.masteryPct < WEAK_MASTERY_THRESHOLD).map(({ chapter }) => chapter.title);
  const strongChapterTitles = sorted.filter(({ progress }) => progress.masteryPct >= STRONG_MASTERY_THRESHOLD).map(({ chapter }) => chapter.title);

  if (kind === "dat") {
    // DAT-style prep is exam-format practice, not just content review: add a
    // trailing timed-practice block that drills weak chapters under exam
    // conditions instead of just re-reading them.
    const practiceTargets = weakChapterTitles.length > 0 ? weakChapterTitles : chapters.map((c) => c.title);
    blocks.push({
      id: `ep-${bookId}-dat-timed-practice`,
      title: "Timed DAT-Style Practice Block",
      topic: "Timed Practice",
      pages: [],
      actions: [
        ...practiceTargets.slice(0, 5).map((title) => ({
          type: "practice" as const,
          label: `Timed mixed-question drill: "${title}" (simulate DAT pacing)`,
        })),
        { type: "practice" as const, label: "Full-length timed practice section covering all chapters above" },
      ],
      estimatedMinutes: 45 + practiceTargets.length * 10,
    });
  }

  const title = kind === "midterm"
    ? `Midterm Review — ${chapters.length} Chapter${chapters.length === 1 ? "" : "s"}`
    : kind === "dat"
    ? `DAT-Style Exam Prep — ${chapters.length} Chapter${chapters.length === 1 ? "" : "s"}`
    : `Final Exam Review — ${chapters.length} Chapter${chapters.length === 1 ? "" : "s"}`;

  const readiness = computeReadiness(course.overallMasteryPct, course.overallRecallPct);

  return {
    id: `ep-${bookId}-${kind}-${Date.now()}`,
    bookId,
    kind,
    chapterIds: chapters.map((c) => c.id),
    title,
    examReadPct: course.overallReadPct,
    examUnderstandPct: course.overallUnderstandPct,
    examRecallPct: course.overallRecallPct,
    examMasteryPct: course.overallMasteryPct,
    examReadinessPct: readiness.pct,
    examReadinessLabel: readiness.label,
    weakChapterTitles,
    strongChapterTitles,
    blocks,
    createdAt: Date.now(),
  };
}
