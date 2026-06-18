import React, { useState } from "react";
import type { ChapterLike, ChapterProgress, CourseProgress, NextTopicRecommendation } from "@/lib/syllabus/chapterProgress";
import { STATUS_LABEL, STATUS_CLASS } from "./chapterStatusStyles";

const ANCHOR_TYPE_LABEL: Record<string, string> = {
  coreIdea: "Core Idea",
  definition: "Definition",
  mechanism: "Mechanism",
  exampleEvidence: "Example",
  keyDetail: "Key Detail",
  confusionTrap: "Confusion Trap",
  datFact: "DAT Fact",
};

interface ChapterDashboardProps {
  chapters: Array<{ chapter: ChapterLike; progress: ChapterProgress }>;
  course: CourseProgress;
  onJumpToChapter: (page: number) => void;
  weakAreas?: string[];
  nextTopic?: NextTopicRecommendation | null;
  prerequisiteChain?: string[];
}

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

export default function ChapterDashboard({ chapters, course, onJumpToChapter, weakAreas = [], nextTopic, prerequisiteChain = [] }: ChapterDashboardProps) {
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null);
  if (!chapters.length) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3" data-testid="chapter-dashboard">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Book Progress</div>
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

      {nextTopic && (
        <button
          onClick={() => onJumpToChapter(nextTopic.page)}
          className="mb-2 w-full rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-left hover:bg-blue-500/15"
          data-testid="next-recommended-topic"
        >
          <div className="text-[9px] font-bold uppercase tracking-widest text-blue-300">Next Recommended Topic</div>
          <div className="text-sm font-medium text-white">{nextTopic.chapterTitle}</div>
          <div className="text-[10px] text-blue-200">Page {nextTopic.page} — {nextTopic.reason}</div>
        </button>
      )}

      {weakAreas.length > 0 && (
        <div className="mb-2 rounded-lg border border-orange-800/40 bg-orange-950/30 px-3 py-2" data-testid="weak-areas">
          <div className="text-[9px] font-bold uppercase tracking-widest text-orange-300">Weak Areas</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {weakAreas.map((wa, i) => (
              <span key={i} className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-orange-900/40 text-orange-200 border border-orange-700/40">
                {wa}
              </span>
            ))}
          </div>
        </div>
      )}

      {prerequisiteChain.length > 1 && (
        <div className="mb-3 rounded-lg border border-white/5 bg-slate-800/40 px-3 py-2" data-testid="prerequisite-chain">
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Prerequisite Chain</div>
          <div className="mt-1 truncate text-[11px] text-slate-300">{prerequisiteChain.join(" → ")}</div>
        </div>
      )}

      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {chapters.map(({ chapter, progress }) => {
          const isCurrent = chapter.id === course.currentChapterId;
          const startPage = chapter.pageRanges[0]?.start ?? 1;
          const isExpanded = expandedChapterId === chapter.id;
          return (
            <div
              key={chapter.id}
              className={`w-full rounded-lg border px-3 py-2 transition-colors ${
                isCurrent
                  ? "border-indigo-400/50 bg-indigo-900/30"
                  : "border-white/5 bg-slate-800/60"
              }`}
            >
              <button onClick={() => onJumpToChapter(startPage)} className="w-full text-left hover:opacity-90">
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
              {progress.weakTopics.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {progress.weakTopics.map((wt, wi) => (
                    <span key={wi} className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-orange-950/40 text-orange-300 border border-orange-800/40">
                      ⚠ {wt}
                    </span>
                  ))}
                </div>
              )}
              {progress.thoughtUnitCount > 0 && (
                <div className="mt-1.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); setExpandedChapterId(isExpanded ? null : chapter.id); }}
                    className="text-[10px] text-indigo-300 hover:text-indigo-200 font-medium"
                  >
                    {isExpanded ? "▾" : "▸"} {progress.thoughtUnitCount} thought unit{progress.thoughtUnitCount === 1 ? "" : "s"}
                  </button>
                  {isExpanded && (
                    <div className="mt-1.5 flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
                      {progress.thoughtUnits.map((tu) => (
                        <button
                          key={tu.id}
                          onClick={(e) => { e.stopPropagation(); onJumpToChapter(tu.page); }}
                          className="text-left rounded border border-white/5 bg-slate-900/60 px-2 py-1 hover:border-indigo-400/40"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[9px] uppercase tracking-wide text-indigo-400">{ANCHOR_TYPE_LABEL[tu.anchorType] ?? tu.anchorType}</span>
                            <span className="text-[9px] text-slate-500">p.{tu.page}</span>
                          </div>
                          <div className="text-[10px] text-slate-300 truncate">{tu.text}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
