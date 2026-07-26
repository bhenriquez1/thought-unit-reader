// components/elena/ParentDashboard.tsx
// Parent Dashboard — read-only summary of the child's learning activity.
// Accessible via a 👤 button in the Elena workspace header; renders as a
// full-screen overlay over the child workspace.

import React, { useEffect, useState } from "react";
import type { ChildProfile, ChildRewardState, ChildProgress } from "@/lib/elena/types";
import type { VocabWord } from "@/lib/elena/vocabulary";
import { loadVocabWords } from "@/lib/elena/idbStore";
import { VOCAB_STATUS_META } from "@/lib/elena/vocabulary";

/* ─── Props ──────────────────────────────────────────────────────────────────── */

interface ParentDashboardProps {
  profile:  ChildProfile;
  rewards:  ChildRewardState;
  progress: ChildProgress | null;
  onClose:  () => void;
}

/* ─── Stat card ──────────────────────────────────────────────────────────────── */

function StatCard({ emoji, label, value, sub }: { emoji: string; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
      <div className="text-2xl mb-1">{emoji}</div>
      <div className="text-xl font-bold text-white tabular-nums">{value}</div>
      <div className="text-xs text-slate-400 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

/* ─── Component ──────────────────────────────────────────────────────────────── */

export default function ParentDashboard({ profile, rewards, progress, onClose }: ParentDashboardProps) {
  const [words, setWords] = useState<VocabWord[]>([]);

  useEffect(() => {
    let alive = true;
    loadVocabWords(profile.id).then(w => { if (alive) setWords(w); }).catch(() => {});
    return () => { alive = false; };
  }, [profile.id]);

  const wordCounts = {
    total:    words.length,
    new:      words.filter(w => w.status === "new").length,
    reviewing: words.filter(w => w.status === "reviewing").length,
    mastered: words.filter(w => w.status === "mastered").length,
  };

  const masteryPct = wordCounts.total > 0
    ? Math.round((wordCounts.mastered / wordCounts.total) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-sm flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div>
          <h1 className="text-white font-bold text-lg leading-tight">Parent Dashboard</h1>
          <p className="text-slate-400 text-xs mt-0.5">
            {profile.preferredName || profile.displayName}'s learning summary
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors text-lg leading-none p-1.5"
          aria-label="Close dashboard"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

        {/* Profile summary */}
        <div className="rounded-2xl border border-indigo-400/20 bg-indigo-500/8 p-4 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-2xl flex-shrink-0">
            {(profile.preferredName || profile.displayName).charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-white font-bold text-base">{profile.preferredName || profile.displayName}</div>
            {profile.ageRange && (
              <div className="text-indigo-300 text-xs mt-0.5">Age {profile.ageRange} · {progress?.currentLevel ?? "developing"} reader</div>
            )}
            {profile.interests.length > 0 && (
              <div className="text-slate-400 text-xs mt-1 truncate">
                Interests: {profile.interests.slice(0, 3).join(", ")}
              </div>
            )}
          </div>
        </div>

        {/* Key stats grid */}
        <div>
          <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide mb-3">Reading Activity</p>
          <div className="grid grid-cols-2 gap-3">
            <StatCard emoji="📖" label="Sessions"      value={String(progress?.totalSessions ?? 0)} />
            <StatCard emoji="⭐" label="Stars Earned"  value={String(rewards.totalStars)} />
            <StatCard emoji="📚" label="Books Finished" value={String(progress?.booksCompleted ?? 0)} />
            <StatCard emoji="🔥" label="Best Streak"   value={`${rewards.longestStreak}d`} sub="days in a row" />
          </div>
        </div>

        {/* Streak info */}
        <div className="rounded-2xl border border-orange-400/20 bg-orange-500/8 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-white">Reading Streaks</span>
          </div>
          <div className="flex gap-4">
            <div className="flex-1 text-center">
              <div className="text-2xl font-bold text-orange-300 tabular-nums">{rewards.currentStreak}</div>
              <div className="text-xs text-slate-400 mt-0.5">Current streak</div>
            </div>
            <div className="w-px bg-white/10" />
            <div className="flex-1 text-center">
              <div className="text-2xl font-bold text-yellow-300 tabular-nums">{rewards.longestStreak}</div>
              <div className="text-xs text-slate-400 mt-0.5">Longest streak</div>
            </div>
          </div>
          {rewards.currentStreak >= 3 && (
            <p className="text-orange-300/80 text-xs mt-3 text-center">
              🔥 Keep it going — {rewards.currentStreak} days and counting!
            </p>
          )}
        </div>

        {/* Vocabulary growth */}
        <div>
          <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide mb-3">Vocabulary Growth</p>
          <div className="rounded-2xl border border-teal-400/20 bg-teal-500/8 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-white">
                {wordCounts.total} word{wordCounts.total !== 1 ? "s" : ""} collected
              </span>
              <span className="text-xs text-teal-300">{masteryPct}% mastered</span>
            </div>

            {/* Mastery bar */}
            <div className="h-3 rounded-full bg-white/10 overflow-hidden flex mb-3">
              <div
                className="h-full bg-emerald-500 transition-all duration-700"
                style={{ width: `${wordCounts.total > 0 ? (wordCounts.mastered / wordCounts.total) * 100 : 0}%` }}
              />
              <div
                className="h-full bg-amber-400 transition-all duration-700"
                style={{ width: `${wordCounts.total > 0 ? (wordCounts.reviewing / wordCounts.total) * 100 : 0}%` }}
              />
            </div>

            <div className="flex gap-4">
              {(["mastered", "reviewing", "new"] as const).map(s => (
                <div key={s} className="flex-1 text-center">
                  <div className="text-base font-bold text-white tabular-nums">{wordCounts[s]}</div>
                  <div className={`text-[10px] mt-0.5 ${VOCAB_STATUS_META[s].color}`}>
                    {VOCAB_STATUS_META[s].emoji} {VOCAB_STATUS_META[s].label}
                  </div>
                </div>
              ))}
            </div>

            {wordCounts.total === 0 && (
              <p className="text-slate-500 text-xs text-center mt-2">
                Words appear here as the child discovers them while reading.
              </p>
            )}
          </div>
        </div>

        {/* Adventure progress */}
        <div>
          <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide mb-3">Adventure Progress</p>
          {[
            { name: "Reading Forest",   starsNeeded: 0,   emoji: "🌲" },
            { name: "Science Mountain", starsNeeded: 10,  emoji: "🏔️" },
            { name: "Ocean Explorer",   starsNeeded: 25,  emoji: "🌊" },
            { name: "History Castle",   starsNeeded: 50,  emoji: "🏰" },
            { name: "Space Station",    starsNeeded: 100, emoji: "🚀" },
          ].map(world => {
            const unlocked = rewards.totalStars >= world.starsNeeded;
            return (
              <div key={world.name} className={`flex items-center gap-3 py-2 border-b border-white/5 last:border-0 ${!unlocked ? "opacity-50" : ""}`}>
                <span className={`text-xl ${unlocked ? "" : "grayscale"}`}>{world.emoji}</span>
                <span className={`text-sm flex-1 ${unlocked ? "text-white" : "text-slate-500"}`}>{world.name}</span>
                {unlocked
                  ? <span className="text-emerald-400 text-xs font-semibold">Unlocked ✓</span>
                  : <span className="text-slate-600 text-xs">{world.starsNeeded} ⭐ needed</span>
                }
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <p className="text-center text-slate-600 text-xs pb-2">
          All data is stored locally on this device.
        </p>
      </div>
    </div>
  );
}
