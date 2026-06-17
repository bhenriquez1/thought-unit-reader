import React from "react";
import type { ChapterLike, ChapterProgress, ChapterStatus, CourseProgress } from "@/lib/syllabus/chapterProgress";

interface ChapterDashboardProps {
  chapters: Array<{ chapter: ChapterLike; progress: ChapterProgress }>;
  course: CourseProgress;
  onJumpToChapter: (page: number) => void;
}

const STATUS_LABEL: Record<ChapterStatus, string> = {
  not_started: "Not Started",
  reading: "Reading",
  reviewing: "Reviewing",
  mastered: "Mastered",
  needs_review: "Needs Review",
  weak_area: "Weak Area",
};

const STATUS_CLASS: Record<ChapterStatus, string> = {
  not_started: "bg-slate-600/60 text-slate-300",
  reading: "bg-indigo-500/40 text-indigo-200",
  reviewing: "bg-sky-500/40 text-sky-200",
  mastered: "bg-emerald-500/40 text-emerald-200",
  needs_review: "bg-amber-500/40 text-amber-200",
  weak_area: "bg-rose-500/40 text-rose-200",
};

function MetricBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[10px] uppercase tracking-wide text-slate-400">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-slate-700/60">
        <div className="h-1.5 rounded-full bg-indigo-400" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-[10px] text-slate-300">{pct}%</span>
    </div>
  );
}

export default function ChapterDashboard({ chapters, course, onJumpToChapter }: ChapterDashboardProps) {
  if (!chapters.length) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3" data-testid="chapter-dashboard">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Course Dashboard</div>
        <div className="text-[11px] text-slate-400">
          {course.completedChapters}/{course.totalChapters} chapters mastered · ~{course.estimatedRemainingMinutes}min remaining
        </div>
      </div>

      <div className="mb-3 grid grid-cols-4 gap-2">
        <MetricBar label="Read" pct={course.overallReadPct} />
        <MetricBar label="Understand" pct={course.overallUnderstandPct} />
        <MetricBar label="Recall" pct={course.overallRecallPct} />
        <MetricBar label="Mastery" pct={course.overallMasteryPct} />
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {chapters.map(({ chapter, progress }) => {
          const isCurrent = chapter.id === course.currentChapterId;
          const startPage = chapter.pageRanges[0]?.start ?? 1;
          return (
            <button
              key={chapter.id}
              onClick={() => onJumpToChapter(startPage)}
              className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                isCurrent
                  ? "border-indigo-400/50 bg-indigo-900/30 hover:bg-indigo-900/50"
                  : "border-white/5 bg-slate-800/60 hover:bg-slate-700/60"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-white">{progress.title}</span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${STATUS_CLASS[progress.status]}`}>
                  {STATUS_LABEL[progress.status]}
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
                <MetricBar label="Read" pct={progress.readPct} />
                <MetricBar label="Understand" pct={progress.understandPct} />
                <MetricBar label="Recall" pct={progress.recallPct} />
                <MetricBar label="Mastery" pct={progress.masteryPct} />
              </div>
              <div className="mt-1.5 flex gap-3 text-[10px] text-slate-400">
                <span>{progress.recallReviewedCount}/{progress.recallCardCount} cards reviewed</span>
                <span>{progress.noteCount} notes</span>
                <span>{progress.studyGuideCount} study guides</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
