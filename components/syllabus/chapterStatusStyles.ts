import type { ChapterStatus } from "@/lib/syllabus/chapterProgress";

export const STATUS_LABEL: Record<ChapterStatus, string> = {
  not_started: "Not Started",
  reading: "Reading",
  reviewing: "Reviewing",
  mastered: "Mastered",
  needs_review: "Needs Review",
  weak_area: "Weak Area",
};

export const STATUS_CLASS: Record<ChapterStatus, string> = {
  not_started: "bg-slate-600/60 text-slate-300",
  reading: "bg-indigo-500/40 text-indigo-200",
  reviewing: "bg-sky-500/40 text-sky-200",
  mastered: "bg-emerald-500/40 text-emerald-200",
  needs_review: "bg-amber-500/40 text-amber-200",
  weak_area: "bg-rose-500/40 text-rose-200",
};
