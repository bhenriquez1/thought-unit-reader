"use client";

// components/learningHub/LearningHubLaunchPanel.tsx
// Workflow launch cards for the Learning Hub overview.
// Each card represents a concrete study session type with a clear "Launch →" CTA.
// The adaptive guide is pre-loaded in the reader whenever a reader-launch is triggered
// (StudyGuideLab defaults to the Adaptive tab since PR #578).

import React from "react";

interface LaunchCard {
  icon: string;
  title: string;
  description: string;
  badge?: "Recommended" | "New";
  accentColor: string;       // Tailwind color name for border + accent
  onLaunch: () => void;
  disabled?: boolean;
}

interface LearningHubLaunchPanelProps {
  bookLoaded: boolean;
  hasWeakAreas: boolean;
  hasStudyPlan: boolean;
  nextTopicLabel?: string;     // e.g. "Chapter 4 · p.67"
  onAdaptiveStudy: () => void;
  onTodaySession: () => void;
  onContinueReading: () => void;
  onWeakAreaReview: () => void;
  onExamPrep: () => void;
  onAiCoach: () => void;
}

function LaunchCard({
  icon,
  title,
  description,
  badge,
  accentColor,
  onLaunch,
  disabled,
}: LaunchCard) {
  const accentClass: Record<string, { border: string; text: string; btn: string; bg: string }> = {
    indigo:  { border: "border-indigo-500/30",  text: "text-indigo-300",  btn: "bg-indigo-700/40 hover:bg-indigo-600/50 border-indigo-500/40 text-indigo-200",  bg: "bg-indigo-950/30"  },
    amber:   { border: "border-amber-500/30",   text: "text-amber-300",   btn: "bg-amber-700/40 hover:bg-amber-600/50 border-amber-500/40 text-amber-200",     bg: "bg-amber-950/25"   },
    emerald: { border: "border-emerald-500/30", text: "text-emerald-300", btn: "bg-emerald-700/40 hover:bg-emerald-600/50 border-emerald-500/40 text-emerald-200", bg: "bg-emerald-950/25"},
    rose:    { border: "border-rose-500/30",    text: "text-rose-300",    btn: "bg-rose-700/40 hover:bg-rose-600/50 border-rose-500/40 text-rose-200",          bg: "bg-rose-950/25"    },
    violet:  { border: "border-violet-500/30",  text: "text-violet-300",  btn: "bg-violet-700/40 hover:bg-violet-600/50 border-violet-500/40 text-violet-200",  bg: "bg-violet-950/25"  },
    slate:   { border: "border-white/10",       text: "text-slate-300",   btn: "bg-slate-700/40 hover:bg-slate-600/50 border-white/20 text-slate-200",           bg: "bg-slate-900/40"   },
  };
  const cls = accentClass[accentColor] ?? accentClass.slate;

  return (
    <div
      className={`flex flex-col gap-2.5 rounded-xl border p-3.5 transition-colors ${cls.border} ${cls.bg} ${
        disabled ? "opacity-40 pointer-events-none" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-1.5">
        <span className="text-xl leading-none">{icon}</span>
        {badge && (
          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${cls.text} bg-white/8 border border-white/10`}>
            {badge}
          </span>
        )}
      </div>
      <div>
        <div className={`text-[11px] font-bold ${cls.text}`}>{title}</div>
        <div className="text-[10px] text-slate-400 leading-snug mt-0.5">{description}</div>
      </div>
      <button
        onClick={onLaunch}
        className={`mt-auto w-full rounded-lg border px-3 py-1.5 text-[10px] font-semibold transition-colors ${cls.btn}`}
      >
        Launch →
      </button>
    </div>
  );
}

export default function LearningHubLaunchPanel({
  bookLoaded,
  hasWeakAreas,
  hasStudyPlan,
  nextTopicLabel,
  onAdaptiveStudy,
  onTodaySession,
  onContinueReading,
  onWeakAreaReview,
  onExamPrep,
  onAiCoach,
}: LearningHubLaunchPanelProps) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Launch a Study Session
        </span>
        {nextTopicLabel && (
          <span className="text-[9px] text-slate-600 truncate max-w-[50%]">Next: {nextTopicLabel}</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <LaunchCard
          icon="🎯"
          title="Adaptive Study"
          description="AI picks what to focus on based on your gaps. Guide pre-loaded."
          badge="Recommended"
          accentColor="indigo"
          onLaunch={onAdaptiveStudy}
          disabled={!bookLoaded}
        />
        <LaunchCard
          icon="📅"
          title="Today's Plan"
          description={hasStudyPlan ? "Work through your scheduled session." : "Review today's key concepts."}
          accentColor="amber"
          onLaunch={onTodaySession}
          disabled={!bookLoaded}
        />
        <LaunchCard
          icon="📖"
          title="Continue Reading"
          description="Pick up where you left off with thought units highlighted."
          accentColor="emerald"
          onLaunch={onContinueReading}
          disabled={!bookLoaded}
        />
        <LaunchCard
          icon="⚠️"
          title="Weak Area Drill"
          description={hasWeakAreas ? "Targeted review of your identified gaps." : "Complete more chapters to detect gaps."}
          accentColor="rose"
          onLaunch={onWeakAreaReview}
          disabled={!bookLoaded || !hasWeakAreas}
        />
        <LaunchCard
          icon="🎯"
          title="Exam Prep"
          description="High-yield concept review and practice exam simulations."
          accentColor="violet"
          onLaunch={onExamPrep}
          disabled={!bookLoaded}
        />
        <LaunchCard
          icon="🤖"
          title="AI Coach"
          description="Get a personalized study plan from your AI coach."
          accentColor="slate"
          onLaunch={onAiCoach}
          disabled={!bookLoaded}
        />
      </div>
    </div>
  );
}
