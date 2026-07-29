"use client";

// components/reader/PageGoalBanner.tsx
// The "Today's Mission" banner shown at the top of the left panel.
// Tells the student what to understand before leaving this page.

import React, { useState } from "react";
import type { AdaptiveMission, LearnerState } from "@/lib/adaptiveGuide/adaptiveGuideEngine";

interface PageGoalBannerProps {
  mission: AdaptiveMission;
  learnerState: LearnerState;
  /** Whether the student has marked this page complete */
  completed?: boolean;
  onMarkComplete?: () => void;
  onDismiss?: () => void;
}

const STATE_COLORS: Record<LearnerState, string> = {
  "first-read":    "border-sky-600/40 bg-sky-900/20",
  "second-read":   "border-indigo-600/40 bg-indigo-900/20",
  "active-recall": "border-emerald-600/40 bg-emerald-900/20",
  "needs-review":  "border-amber-600/40 bg-amber-900/20",
};

const STATE_ACCENT: Record<LearnerState, string> = {
  "first-read":    "text-sky-400",
  "second-read":   "text-indigo-400",
  "active-recall": "text-emerald-400",
  "needs-review":  "text-amber-400",
};

const STATE_LABEL: Record<LearnerState, string> = {
  "first-read":    "First Read",
  "second-read":   "Second Read",
  "active-recall": "Active Recall",
  "needs-review":  "Needs Review",
};

export default function PageGoalBanner({
  mission,
  learnerState,
  completed = false,
  onMarkComplete,
  onDismiss,
}: PageGoalBannerProps) {
  const [expanded, setExpanded] = useState(true);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className={`w-full text-left px-3 py-2 rounded-lg border text-[11px] font-semibold transition-colors ${STATE_COLORS[learnerState]} ${STATE_ACCENT[learnerState]}`}
      >
        🎯 {mission.headline} · {mission.estimatedMinutes} min
        <span className="ml-1 text-slate-500 font-normal">▸ expand</span>
      </button>
    );
  }

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${STATE_COLORS[learnerState]}`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px]">🎯</span>
          <span className={`text-[11px] font-bold uppercase tracking-wider ${STATE_ACCENT[learnerState]}`}>
            {STATE_LABEL[learnerState]}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-500">{mission.estimatedMinutes} min</span>
          <button
            onClick={() => setExpanded(false)}
            className="text-[10px] text-slate-600 hover:text-slate-400 px-1"
          >▾</button>
        </div>
      </div>

      {/* Focus hint */}
      <p className="text-[11px] text-slate-300 leading-relaxed mb-2">
        {mission.focusHint}
      </p>

      {/* Success criteria */}
      <div className="flex flex-col gap-1">
        {mission.successCriteria.map((criterion, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <span className={`text-[10px] mt-0.5 flex-shrink-0 ${completed ? "text-emerald-400" : "text-slate-600"}`}>
              {completed ? "✓" : "○"}
            </span>
            <span className="text-[11px] text-slate-400 leading-snug">{criterion}</span>
          </div>
        ))}
      </div>

      {/* Mark complete */}
      {onMarkComplete && (
        <button
          onClick={onMarkComplete}
          className={`mt-2.5 w-full rounded py-1.5 text-[11px] font-medium transition-colors ${
            completed
              ? "bg-emerald-700/30 text-emerald-300 border border-emerald-700/40"
              : "bg-white/6 text-slate-300 border border-white/10 hover:bg-emerald-900/30 hover:text-emerald-300 hover:border-emerald-700/40"
          }`}
        >
          {completed ? "✓ Page Complete" : "Mark as Complete"}
        </button>
      )}
    </div>
  );
}
