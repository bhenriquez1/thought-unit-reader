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

  const title = kind === "midterm"
    ? `Midterm Review — ${chapters.length} Chapter${chapters.length === 1 ? "" : "s"}`
    : `Final Exam Review — ${chapters.length} Chapter${chapters.length === 1 ? "" : "s"}`;

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
    weakChapterTitles,
    strongChapterTitles,
    blocks,
    createdAt: Date.now(),
  };
}
