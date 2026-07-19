// components/elena/ElenaChildWorkspace.tsx
// Elena Mode workspace — child-learning hub with 9 sections.
// Uses getChildDisplayCopy() for all labels; never hard-codes child names.

import React, { useState, useEffect, useCallback, useRef } from "react";
import ReadingBuddy    from "@/components/elena/ReadingBuddy";
import MemoryMatch     from "@/components/elena/MemoryMatch";
import WordScramble    from "@/components/elena/WordScramble";
import AdventureMap    from "@/components/elena/AdventureMap";
import ParentDashboard from "@/components/elena/ParentDashboard";
import { getChildDisplayCopy } from "@/lib/elena/displayCopy";
import {
  saveChildProfile,
  loadChildProfile,
  loadRewardState,
  saveRewardState,
  loadChildProgress,
  saveChildProgress,
  saveVocabWord,
  loadVocabWords,
  deleteVocabWord,
} from "@/lib/elena/idbStore";
import type {
  ChildProfile,
  ChildAgeRange,
  ChildRewardState,
  ChildProgress,
} from "@/lib/elena/types";
import type { VocabWord, VocabStatus } from "@/lib/elena/vocabulary";
import { VOCAB_STATUS_META } from "@/lib/elena/vocabulary";

/* ─── Constants ─────────────────────────────────────────────────────────────── */

const INTERESTS = [
  "Animals", "Space", "Dinosaurs", "Art", "Music", "Sports",
  "Science", "Math", "History", "Cooking", "Nature", "Technology",
];

const AGE_RANGES: { value: ChildAgeRange; label: string }[] = [
  { value: "3-4",   label: "3–4 years"   },
  { value: "5-6",   label: "5–6 years"   },
  { value: "7-8",   label: "7–8 years"   },
  { value: "9-10",  label: "9–10 years"  },
  { value: "11-12", label: "11–12 years" },
];

const INTEREST_EMOJI: Record<string, string> = {
  Animals: "🐾", Space: "🚀", Dinosaurs: "🦕", Art: "🎨", Music: "🎵",
  Sports: "⚽", Science: "🔬", Math: "🔢", History: "🏛️", Cooking: "🍳",
  Nature: "🌿", Technology: "💻",
};

const LEVEL_INFO: Record<string, { icon: string; label: string; desc: string; color: string }> = {
  emergent:     { icon: "🌱", label: "Emergent Reader",     desc: "Just starting out — every page is an adventure!",   color: "text-green-300"  },
  early:        { icon: "🐣", label: "Early Reader",        desc: "Words are coming together — keep it up!",           color: "text-yellow-300" },
  developing:   { icon: "📖", label: "Developing Reader",   desc: "Getting stronger every day!",                       color: "text-blue-300"   },
  transitional: { icon: "🚀", label: "Transitional Reader", desc: "Reading is becoming second nature!",                color: "text-purple-300" },
  fluent:       { icon: "⭐", label: "Fluent Reader",       desc: "Reading flows! You make it look easy.",             color: "text-yellow-200" },
  advanced:     { icon: "🏆", label: "Advanced Reader",     desc: "Outstanding! You're a reading champion.",           color: "text-orange-300" },
};

const ACHIEVEMENTS: {
  id: string; icon: string; label: string; desc: string;
  test: (r: ChildRewardState) => boolean;
}[] = [
  { id: "first-star",  icon: "⭐", label: "First Star",    desc: "Earned your first star!",              test: r => r.totalStars >= 1  },
  { id: "reader-5",    icon: "📖", label: "Bookworm",      desc: "Earned 5 stars — you love reading!",   test: r => r.totalStars >= 5  },
  { id: "reader-10",   icon: "🏆", label: "Reading Champ", desc: "Earned 10 stars — incredible!",        test: r => r.totalStars >= 10 },
  { id: "reader-25",   icon: "🌟", label: "Super Reader",  desc: "25 stars — you're a super reader!",    test: r => r.totalStars >= 25 },
  { id: "streak-2",    icon: "🔥", label: "On a Roll",     desc: "Read 2 days in a row!",                test: r => r.currentStreak >= 2 },
  { id: "streak-7",    icon: "💥", label: "Week Warrior",  desc: "7-day reading streak!",                test: r => r.currentStreak >= 7 },
  { id: "streak-best", icon: "🎯", label: "Personal Best", desc: "Longest streak: 3+ days",             test: r => r.longestStreak >= 3 },
];

/* ─── Tab config ─────────────────────────────────────────────────────────────── */

type ElenaTab =
  | "home"
  | "reading"
  | "today"
  | "adventures"
  | "achievements"
  | "library"
  | "vocabulary"
  | "games"
  | "challenge";

const ELENA_TABS: { id: ElenaTab; icon: string; label: string }[] = [
  { id: "home",         icon: "🏠", label: "Home"       },
  { id: "reading",      icon: "📖", label: "Reading"    },
  { id: "today",        icon: "⭐", label: "Today"      },
  { id: "adventures",   icon: "🗺",  label: "Adventures" },
  { id: "achievements", icon: "🏆", label: "Badges"     },
  { id: "library",      icon: "📚", label: "Library"    },
  { id: "vocabulary",   icon: "🔤", label: "Words"      },
  { id: "games",        icon: "🧠", label: "Games"      },
  { id: "challenge",    icon: "🎯", label: "Challenge"  },
];

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function isoToday(): string {
  return new Date().toISOString().split("T")[0];
}

function awardStar(prev: ChildRewardState): ChildRewardState {
  const todayStr = isoToday();
  const lastStr  = prev.updatedAt.split("T")[0];
  const ms       = new Date(todayStr).getTime() - new Date(lastStr).getTime();
  const daysDiff = Math.round(ms / 86400000);
  const newStreak = daysDiff <= 1 ? prev.currentStreak + 1 : 1;
  return {
    ...prev,
    totalStars:    prev.totalStars + 1,
    currentStreak: newStreak,
    longestStreak: Math.max(prev.longestStreak, newStreak),
    updatedAt:     new Date().toISOString(),
  };
}

/* ─── Setup form ─────────────────────────────────────────────────────────────── */

function SetupForm({ onSave }: { onSave: (profile: ChildProfile) => void }) {
  const [displayName,   setDisplayName]   = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [ageRange,      setAgeRange]      = useState<ChildAgeRange | "">("");
  const [interests,     setInterests]     = useState<string[]>([]);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState("");

  function toggleInterest(interest: string) {
    setInterests(prev =>
      prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest],
    );
  }

  function handleSave() {
    if (!displayName.trim() || saving) {
      if (!displayName.trim()) setError("Please enter a name.");
      return;
    }
    setSaving(true);
    setError("");
    const now = new Date().toISOString();
    const profile: ChildProfile = {
      id:              `child-${Date.now()}`,
      displayName:     displayName.trim(),
      preferredName:   preferredName.trim() || undefined,
      ageRange:        (ageRange as ChildAgeRange) || undefined,
      interests,
      accessibilityPreferences: {
        highContrastMode: false, textToSpeech: false,
        reducedMotion: false, dyslexiaFont: false,
      },
      parentAccountId: "local",
      createdAt: now,
      updatedAt: now,
    };
    // Open the workspace immediately — do NOT await IDB before calling onSave.
    // ElenaChildWorkspace.handleSave handles all persistence from here.
    onSave(profile);
    // Component will unmount as soon as React processes the state update above,
    // so setSaving(false) is a no-op but harmless.
    setSaving(false);
  }

  return (
    <div className="h-full w-full overflow-auto bg-gradient-to-br from-violet-950 via-indigo-950 to-slate-950 flex items-start justify-center p-8">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">✨</div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome to Elena Mode</h1>
          <p className="text-indigo-300">Let's set up a learning space. Tell us a bit about the learner.</p>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl p-6 space-y-5 shadow-xl">
          <div>
            <label className="block text-sm font-medium text-indigo-200 mb-1.5">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => { setDisplayName(e.target.value); setError(""); }}
              placeholder="e.g. Elena"
              maxLength={40}
              className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-indigo-200 mb-1.5">
              Nickname <span className="text-white/40 text-xs">(optional)</span>
            </label>
            <input
              type="text"
              value={preferredName}
              onChange={e => setPreferredName(e.target.value)}
              placeholder="e.g. Ellie"
              maxLength={30}
              className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-indigo-200 mb-1.5">
              Age range <span className="text-white/40 text-xs">(optional)</span>
            </label>
            <select
              value={ageRange}
              onChange={e => setAgeRange(e.target.value as ChildAgeRange | "")}
              className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="" className="bg-slate-900">Select age range…</option>
              {AGE_RANGES.map(a => (
                <option key={a.value} value={a.value} className="bg-slate-900">{a.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-indigo-200 mb-2">
              Interests <span className="text-white/40 text-xs">(pick any)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map(interest => (
                <button
                  key={interest}
                  type="button"
                  onClick={() => toggleInterest(interest)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    interests.includes(interest)
                      ? "bg-indigo-500 text-white border border-indigo-400"
                      : "bg-white/10 text-white/70 border border-white/20 hover:bg-white/20"
                  }`}
                >
                  {interest}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !displayName.trim()}
            className="w-full rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 font-semibold text-white transition-colors"
          >
            {saving ? "Setting up…" : "Create Learning Space →"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Log session button (shared CTA) ──────────────────────────────────────── */

function LogSessionButton({
  onLog,
  compact = false,
}: {
  onLog: () => Promise<void>;
  compact?: boolean;
}) {
  const [logging, setLogging]       = useState(false);
  const [justEarned, setJustEarned] = useState(false);

  async function handleLog() {
    setLogging(true);
    await onLog();
    setLogging(false);
    setJustEarned(true);
    setTimeout(() => setJustEarned(false), 2500);
  }

  return (
    <div>
      {justEarned && !compact && (
        <div className="mb-3 rounded-2xl bg-yellow-400/20 border border-yellow-400/40 p-3 text-center animate-bounce">
          <span className="text-2xl">⭐</span>
          <p className="text-yellow-200 font-semibold text-sm mt-1">You earned a star! Great reading!</p>
        </div>
      )}
      <button
        onClick={handleLog}
        disabled={logging}
        className={`w-full rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-semibold transition-colors ${
          compact ? "py-2 text-sm" : "py-2.5 text-sm"
        }`}
      >
        {logging ? "Logging…" : compact ? "+1 ⭐  Log Reading Session" : "✅ Log Reading Session  (+1 ⭐)"}
      </button>
    </div>
  );
}

/* ─── Home tab (dashboard hub) ──────────────────────────────────────────────── */

interface HomeTabProps {
  profile:      ChildProfile;
  rewards:      ChildRewardState;
  progress:     ChildProgress | null;
  onReset:      () => void;
  onLogSession: () => Promise<void>;
  onNav:        (tab: ElenaTab) => void;
}

function TodayAdventureCard({
  rewards, progress, readToday, onNav,
}: {
  rewards: ChildRewardState;
  progress: ChildProgress | null;
  readToday: boolean;
  onNav: (tab: ElenaTab) => void;
}) {
  const wordsLearned = (progress?.totalSessions ?? 0) > 0;
  const task1Done    = readToday;
  const task2Done    = wordsLearned;
  const allDone      = task1Done && task2Done;

  return (
    <div className="mb-5 rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-500/8 to-orange-500/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🌟</span>
          <span className="text-amber-200 font-bold text-sm">Today's Adventure</span>
        </div>
        <div className="flex items-center gap-1 bg-amber-400/15 border border-amber-400/25 rounded-lg px-2 py-0.5">
          <span className="text-xs">Reward:</span>
          <span className="text-amber-200 text-xs font-bold">⭐⭐</span>
        </div>
      </div>

      <div className="space-y-2 mb-3">
        <button
          onClick={() => !task1Done && onNav("reading")}
          className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors ${
            task1Done ? "bg-emerald-500/10 border border-emerald-400/25" : "bg-white/5 border border-white/10 hover:bg-white/8"
          }`}
        >
          <span className={`text-lg flex-shrink-0 ${task1Done ? "" : "opacity-40"}`}>{task1Done ? "✅" : "📖"}</span>
          <div className="min-w-0">
            <div className={`text-sm font-medium ${task1Done ? "text-emerald-300 line-through opacity-70" : "text-white"}`}>
              Read for 10 minutes
            </div>
            {!task1Done && <div className="text-[10px] text-slate-500">Tap to open Reading tab</div>}
          </div>
        </button>

        <button
          onClick={() => !task2Done && onNav("vocabulary")}
          className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors ${
            task2Done ? "bg-emerald-500/10 border border-emerald-400/25" : "bg-white/5 border border-white/10 hover:bg-white/8"
          }`}
        >
          <span className={`text-lg flex-shrink-0 ${task2Done ? "" : "opacity-40"}`}>{task2Done ? "✅" : "🔤"}</span>
          <div className="min-w-0">
            <div className={`text-sm font-medium ${task2Done ? "text-emerald-300 line-through opacity-70" : "text-white"}`}>
              Learn 3 new words
            </div>
            {!task2Done && <div className="text-[10px] text-slate-500">Tap to open Words tab</div>}
          </div>
        </button>
      </div>

      {allDone ? (
        <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/25 px-3 py-2 text-center">
          <span className="text-emerald-300 font-bold text-sm">🎉 Adventure complete! ⭐⭐ earned</span>
        </div>
      ) : (
        <div className="flex gap-1">
          {[task1Done, task2Done].map((done, i) => (
            <div key={i} className={`flex-1 h-1.5 rounded-full ${done ? "bg-emerald-400" : "bg-white/10"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function HomeTab({ profile, rewards, progress, onReset, onLogSession, onNav }: HomeTabProps) {
  const copy       = getChildDisplayCopy(profile);
  const earned     = ACHIEVEMENTS.filter(a => a.test(rewards));
  const nextUp     = ACHIEVEMENTS.find(a => !a.test(rewards));
  const level      = progress?.currentLevel ?? "developing";
  const levelInfo  = LEVEL_INFO[level] ?? LEVEL_INFO.developing;
  const readToday  = rewards.updatedAt.split("T")[0] === isoToday() && rewards.totalStars > 0;

  const QUICK_NAV: { tab: ElenaTab; icon: string; label: string; color: string }[] = [
    { tab: "reading",      icon: "📖", label: "Continue Reading", color: "from-blue-600/30 to-blue-700/20 border-blue-500/30"       },
    { tab: "today",        icon: "⭐", label: "Today's Goal",     color: "from-yellow-600/30 to-amber-700/20 border-yellow-500/30"  },
    { tab: "achievements", icon: "🏆", label: "My Badges",        color: "from-purple-600/30 to-purple-700/20 border-purple-500/30" },
    { tab: "vocabulary",   icon: "🔤", label: "My Words",         color: "from-teal-600/30 to-teal-700/20 border-teal-500/30"      },
    { tab: "games",        icon: "🧠", label: "Memory Games",     color: "from-green-600/30 to-emerald-700/20 border-green-500/30" },
    { tab: "adventures",   icon: "🗺",  label: "Adventures",       color: "from-rose-600/30 to-pink-700/20 border-rose-500/30"      },
  ];

  return (
    <div className="h-full overflow-auto p-5">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{copy.workspaceTitle}</h1>
          <p className="text-indigo-300 text-sm mt-0.5">{copy.welcomeGreeting}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <div className="flex items-center gap-1.5 bg-yellow-400/20 border border-yellow-400/30 rounded-xl px-3 py-1.5">
            <span className="text-lg">⭐</span>
            <span className="text-yellow-200 font-bold text-lg tabular-nums">{rewards.totalStars}</span>
          </div>
          {rewards.currentStreak > 0 && (
            <div className="flex items-center gap-1 bg-orange-500/20 border border-orange-400/30 rounded-xl px-2.5 py-1">
              <span className="text-sm">🔥</span>
              <span className="text-orange-200 font-semibold text-sm">{rewards.currentStreak}d streak</span>
            </div>
          )}
        </div>
      </div>

      {/* Level badge */}
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-purple-400/25 bg-purple-500/8 px-4 py-3">
        <span className="text-2xl">{levelInfo.icon}</span>
        <div>
          <div className={`text-sm font-bold ${levelInfo.color}`}>{levelInfo.label}</div>
          <div className="text-[11px] text-indigo-400/70">{levelInfo.desc}</div>
        </div>
      </div>

      {/* Log session CTA */}
      <div className="mb-5 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">📖</span>
          <div>
            <p className="text-white font-semibold">{copy.readingLabel}</p>
            <p className="text-indigo-300 text-xs mt-0.5">Open the Reader, then log your session here.</p>
          </div>
          {readToday && (
            <span className="ml-auto text-xs bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-0.5 rounded-full whitespace-nowrap">
              ✓ Read today!
            </span>
          )}
        </div>
        <LogSessionButton onLog={onLogSession} />
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { icon: "⭐", value: String(rewards.totalStars),           label: "Stars"    },
          { icon: "🔥", value: String(rewards.currentStreak),        label: "Streak"   },
          { icon: "📚", value: String(progress?.totalSessions ?? 0), label: "Sessions" },
        ].map(({ icon, value, label }) => (
          <div key={label} className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
            <div className="text-xl mb-0.5">{icon}</div>
            <div className="text-xl font-bold text-white tabular-nums">{value}</div>
            <div className="text-[10px] text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      {/* Today's Adventure */}
      <TodayAdventureCard rewards={rewards} progress={progress} readToday={readToday} onNav={onNav} />

      {/* Quick nav grid */}
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wide mb-3">Explore</h2>
        <div className="grid grid-cols-2 gap-3">
          {QUICK_NAV.map(({ tab, icon, label, color }) => (
            <button
              key={tab}
              onClick={() => onNav(tab)}
              className={`bg-gradient-to-br ${color} rounded-2xl border p-4 text-left hover:opacity-90 transition-opacity`}
            >
              <div className="text-2xl mb-1.5">{icon}</div>
              <div className="text-white font-semibold text-sm">{label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Next achievement teaser */}
      {nextUp && (
        <div className="rounded-2xl border border-yellow-400/20 bg-yellow-500/5 p-3 mb-4">
          <div className="text-[11px] text-yellow-400/60 font-semibold mb-2 uppercase tracking-wide">Next Badge</div>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl opacity-50">{nextUp.icon}</span>
            <div>
              <div className="text-yellow-200 font-semibold text-sm">{nextUp.label}</div>
              <div className="text-yellow-400/60 text-[11px]">{nextUp.desc}</div>
            </div>
          </div>
        </div>
      )}

      {/* Earned badges strip */}
      {earned.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            {earned.map(a => (
              <div key={a.id}
                className="flex items-center gap-1.5 bg-yellow-400/15 border border-yellow-400/25 rounded-xl px-2.5 py-1.5"
                title={a.desc}>
                <span className="text-base">{a.icon}</span>
                <span className="text-yellow-200 text-xs font-medium">{a.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onReset}
        className="mt-2 text-xs text-white/20 hover:text-white/50 transition-colors block mx-auto"
      >
        Reset profile
      </button>
    </div>
  );
}

/* ─── Continue Reading tab ───────────────────────────────────────────────────── */

function ContinueReadingTab({
  profile,
  bookTitle,
  currentPage,
  totalPages,
  pageText,
  progress,
  onLogSession,
}: {
  profile:      ChildProfile;
  bookTitle?:   string;
  currentPage?: number;
  totalPages?:  number;
  pageText?:    string;
  progress:     ChildProgress | null;
  onLogSession: () => Promise<void>;
}) {
  const pct = currentPage && totalPages && totalPages > 0
    ? Math.round((currentPage / totalPages) * 100)
    : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Book context strip */}
      <div className="flex-shrink-0 p-4 pb-3">
        {bookTitle ? (
          <div className="rounded-2xl border border-blue-400/30 bg-blue-500/10 p-4">
            <div className="flex items-start gap-3 mb-3">
              <span className="text-3xl">📘</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-white font-bold text-base leading-tight truncate">{bookTitle}</h3>
                {currentPage && totalPages ? (
                  <p className="text-blue-300 text-sm mt-0.5">Page {currentPage} of {totalPages}</p>
                ) : (
                  <p className="text-blue-300/60 text-sm mt-0.5">Open in Reader to track your page</p>
                )}
              </div>
              <LogSessionButton onLog={onLogSession} compact />
            </div>
            {pct !== null && (
              <div>
                <div className="flex justify-between text-[11px] text-blue-300/70 mb-1.5">
                  <span>Reading progress</span><span>{pct}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/3 p-5 text-center">
            <div className="text-4xl mb-2">📚</div>
            <h3 className="text-white font-bold text-base mb-1">No book open yet</h3>
            <p className="text-slate-400 text-sm">Switch to the Reader tab and open a PDF to start reading.</p>
          </div>
        )}
      </div>

      {/* Reading Buddy — fills remaining height */}
      <div className="flex-1 min-h-0 px-4 pb-4">
        <ReadingBuddy
          profile={profile}
          pageText={pageText}
          bookTitle={bookTitle}
          currentPage={currentPage}
        />
      </div>
    </div>
  );
}

/* ─── Today's Goal tab ───────────────────────────────────────────────────────── */

function TodayGoalTab({
  rewards,
  progress,
  onLogSession,
}: {
  rewards: ChildRewardState;
  progress: ChildProgress | null;
  onLogSession: () => Promise<void>;
}) {
  const todayStr    = isoToday();
  const readToday   = rewards.updatedAt.split("T")[0] === todayStr && rewards.totalStars > 0;
  const streak      = rewards.currentStreak;

  const ENCOURAGEMENTS = [
    "Every page makes you smarter! 🌟",
    "You're doing amazing — keep reading! 🚀",
    "Reading is a superpower. You've got this! 💪",
    "Each session brings a new adventure! 📖",
    "You're building your reading muscles! 🏋️",
  ];
  const encouragement = ENCOURAGEMENTS[rewards.totalStars % ENCOURAGEMENTS.length];

  // Weekly goal: read 5 days this week (approximate from streak)
  const weekProgress = Math.min(streak, 5);

  return (
    <div className="h-full overflow-auto p-5">
      <h2 className="text-lg font-bold text-white mb-4">⭐ Today's Goal</h2>

      {/* Today's status */}
      <div className={`mb-4 rounded-2xl border p-5 text-center ${
        readToday
          ? "border-green-400/40 bg-green-500/10"
          : "border-yellow-400/30 bg-yellow-500/8"
      }`}>
        <div className="text-4xl mb-2">{readToday ? "🎉" : "📖"}</div>
        <h3 className={`text-lg font-bold mb-1 ${readToday ? "text-green-200" : "text-yellow-200"}`}>
          {readToday ? "Goal complete for today!" : "Today's goal: Read one session"}
        </h3>
        <p className="text-sm text-slate-300">{encouragement}</p>
      </div>

      {/* Log CTA (shown when not yet read today) */}
      {!readToday && (
        <div className="mb-4 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-4">
          <p className="text-indigo-200 text-sm mb-3">
            Open the Reader, read for a few minutes, then log your session to earn a ⭐ star!
          </p>
          <LogSessionButton onLog={onLogSession} />
        </div>
      )}

      {/* Streak card */}
      <div className="mb-4 rounded-2xl border border-orange-400/25 bg-orange-500/8 p-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-3xl">🔥</span>
          <div>
            <div className="text-orange-200 font-bold text-lg">{streak} day streak</div>
            <div className="text-orange-400/60 text-xs">
              {streak === 0 ? "Start your streak today!" : streak === 1 ? "Great start! Keep it going!" : "Awesome — don't break it!"}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, i) => {
            const filled = i < Math.min(streak, 7);
            return (
              <div key={i} className={`h-7 rounded-lg flex items-center justify-center text-sm ${
                filled ? "bg-orange-500/40 border border-orange-400/50" : "bg-white/5 border border-white/10"
              }`}>
                {filled ? "🔥" : ""}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-1.5 text-[9px] text-slate-500">
          {["M","T","W","T","F","S","S"].map((d, i) => <span key={i}>{d}</span>)}
        </div>
      </div>

      {/* Weekly goal progress */}
      <div className="rounded-2xl border border-purple-400/25 bg-purple-500/8 p-4">
        <h3 className="text-sm font-bold text-purple-200 mb-3">🎯 This Week's Mission</h3>
        <p className="text-slate-300 text-sm mb-3">Read for 5 days this week</p>
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-3 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all"
              style={{ width: `${(weekProgress / 5) * 100}%` }}
            />
          </div>
          <span className="text-purple-300 text-sm font-semibold tabular-nums whitespace-nowrap">
            {weekProgress}/5
          </span>
        </div>
        {weekProgress >= 5 ? (
          <p className="text-green-300 text-xs">🎉 Weekly mission complete! Amazing work!</p>
        ) : (
          <p className="text-purple-400/60 text-xs">{5 - weekProgress} more reading {5 - weekProgress === 1 ? "day" : "days"} to go!</p>
        )}
      </div>
    </div>
  );
}

/* ─── Adventures tab (placeholder — PR #5) ──────────────────────────────────── */

function AdventuresTab({
  rewards,
  progress,
}: {
  rewards:  ChildRewardState;
  progress: ChildProgress | null;
}) {
  return <AdventureMap rewards={rewards} progress={progress} />;
}

/* ─── Achievements tab ───────────────────────────────────────────────────────── */

function AchievementsTab({
  rewards,
  progress,
}: {
  rewards: ChildRewardState;
  progress: ChildProgress | null;
}) {
  const level     = progress?.currentLevel ?? "developing";
  const levelInfo = LEVEL_INFO[level] ?? LEVEL_INFO.developing;
  const earned    = ACHIEVEMENTS.filter(a => a.test(rewards));
  const locked    = ACHIEVEMENTS.filter(a => !a.test(rewards));

  return (
    <div className="h-full overflow-auto p-5">
      <h2 className="text-lg font-bold text-white mb-4">🏆 My Badges</h2>

      {/* Level badge */}
      <div className="mb-5 rounded-2xl border border-purple-400/30 bg-purple-500/10 p-4 text-center">
        <div className="text-4xl mb-1">{levelInfo.icon}</div>
        <div className={`text-lg font-bold ${levelInfo.color} mb-0.5`}>{levelInfo.label}</div>
        <div className="text-indigo-300 text-sm">{levelInfo.desc}</div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {[
          { icon: "⭐", label: "Total Stars",     value: String(rewards.totalStars)              },
          { icon: "🔥", label: "Best Streak",     value: `${rewards.longestStreak} days`         },
          { icon: "🔥", label: "Current Streak",  value: `${rewards.currentStreak} days`         },
          { icon: "📚", label: "Sessions Done",   value: String(progress?.totalSessions ?? 0)    },
          { icon: "📘", label: "Books Finished",  value: String(progress?.booksCompleted ?? 0)   },
          { icon: "⏱️", label: "Minutes Read",    value: progress?.totalMinutes ? String(progress.totalMinutes) : "—" },
        ].map(({ icon, label, value }) => (
          <div key={label} className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
            <div className="text-xl mb-0.5">{icon}</div>
            <div className="text-lg font-bold text-white tabular-nums">{value}</div>
            <div className="text-[10px] text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      {/* Earned badges */}
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">Achievements</h3>
        <span className="text-xs text-yellow-400/60">{earned.length}/{ACHIEVEMENTS.length} earned</span>
      </div>

      {earned.length > 0 && (
        <div className="mb-3 space-y-2">
          <div className="text-[10px] text-yellow-400/70 font-semibold uppercase tracking-wide">Earned ✓</div>
          {earned.map(a => (
            <div key={a.id}
              className="flex items-center gap-3 rounded-xl bg-yellow-400/10 border border-yellow-400/25 px-3 py-2.5">
              <span className="text-2xl">{a.icon}</span>
              <div>
                <div className="text-yellow-200 font-semibold text-sm">{a.label}</div>
                <div className="text-yellow-400/60 text-[11px]">{a.desc}</div>
              </div>
              <span className="ml-auto text-yellow-300 text-sm">✓</span>
            </div>
          ))}
        </div>
      )}

      {locked.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Locked 🔒</div>
          {locked.map(a => (
            <div key={a.id}
              className="flex items-center gap-3 rounded-xl bg-white/3 border border-white/8 px-3 py-2.5 opacity-50">
              <span className="text-2xl grayscale">{a.icon}</span>
              <div>
                <div className="text-slate-300 font-semibold text-sm">{a.label}</div>
                <div className="text-slate-500 text-[11px]">{a.desc}</div>
              </div>
              <span className="ml-auto text-slate-500 text-sm">🔒</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Library tab ────────────────────────────────────────────────────────────── */

function LibraryTab({ profile, progress }: { profile: ChildProfile; progress: ChildProgress | null }) {
  const booksCompleted = progress?.booksCompleted ?? 0;
  const totalSessions  = progress?.totalSessions ?? 0;
  const BOOK_EMOJIS    = ["📘", "📗", "📙", "📕", "📔", "📒", "📓"];

  return (
    <div className="h-full overflow-auto p-5">
      <h2 className="text-lg font-bold text-white mb-4">📚 My Library</h2>

      {/* Bookshelf */}
      <div className="mb-5">
        <p className="text-indigo-300 text-sm mb-3">
          {booksCompleted === 0
            ? "Open the Reader to start your first book!"
            : `${booksCompleted} ${booksCompleted === 1 ? "book" : "books"} completed!`}
        </p>
        <div className="flex flex-wrap gap-2 min-h-[48px] rounded-2xl border border-indigo-400/20 bg-indigo-500/5 p-3">
          {booksCompleted === 0 ? (
            <span className="text-indigo-400/40 text-sm italic self-center">Your bookshelf is empty — start reading!</span>
          ) : (
            Array.from({ length: Math.min(booksCompleted, 14) }).map((_, i) => (
              <span key={i} className="text-3xl leading-none" title={`Book ${i + 1}`}>
                {BOOK_EMOJIS[i % BOOK_EMOJIS.length]}
              </span>
            ))
          )}
          {booksCompleted > 14 && (
            <span className="text-indigo-300 text-sm self-center font-semibold">+{booksCompleted - 14} more</span>
          )}
        </div>
        {booksCompleted > 0 && (
          <p className="text-[11px] text-indigo-400/60 mt-1.5 text-right">{totalSessions} reading sessions total</p>
        )}
      </div>

      {/* Interests */}
      {profile.interests.length > 0 && (
        <div className="mb-5">
          <h3 className="text-base font-bold text-white mb-2">❤️ Topics I Love</h3>
          <div className="flex flex-wrap gap-2">
            {profile.interests.map(interest => (
              <div key={interest}
                className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-violet-500/15 border border-violet-400/25 text-violet-200 text-sm font-medium">
                <span>{INTEREST_EMOJI[interest] ?? "✨"}</span>
                <span>{interest}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="rounded-2xl border border-teal-400/20 bg-teal-500/5 p-4">
        <h3 className="text-base font-bold text-teal-200 mb-3">📊 Reading Adventures</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: "📖", label: "Sessions",      value: String(totalSessions)               },
            { icon: "📚", label: "Books Done",    value: String(booksCompleted)              },
            { icon: "⏱️", label: "Total Minutes", value: progress?.totalMinutes ? `${progress.totalMinutes}` : "—" },
            { icon: "✍️", label: "Words Explored",value: progress?.totalWordsRead ? `${progress.totalWordsRead}` : "—" },
          ].map(({ icon, label, value }) => (
            <div key={label} className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <div className="text-xl mb-0.5">{icon}</div>
              <div className="text-lg font-bold text-white tabular-nums">{value}</div>
              <div className="text-[10px] text-slate-400">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Vocabulary tab ─────────────────────────────────────────────────────────── */

const STATUS_ORDER: VocabStatus[] = ["new", "reviewing", "mastered"];

function nextStatus(s: VocabStatus): VocabStatus | null {
  const i = STATUS_ORDER.indexOf(s);
  return i < STATUS_ORDER.length - 1 ? STATUS_ORDER[i + 1] : null;
}

function VocabularyTab({
  profile,
  pageText,
  bookTitle,
  currentPage,
}: {
  profile:      ChildProfile;
  pageText?:    string;
  bookTitle?:   string;
  currentPage?: number;
}) {
  const [words,     setWords]     = useState<VocabWord[]>([]);
  const [flippedId, setFlippedId] = useState<string | null>(null);
  const [filter,    setFilter]    = useState<VocabStatus | "all">("all");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadVocabWords(profile.id).then(setWords).catch(() => {});
  }, [profile.id]);

  const extractWords = useCallback(async () => {
    if (!pageText?.trim() || loading) return;
    setLoading(true);
    setError(null);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const resp = await fetch("/api/elena-vocab", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ pageText, ageRange: profile.ageRange, bookTitle, currentPage }),
        signal:  abortRef.current.signal,
      });
      const data = await resp.json();
      if (!resp.ok || data.error) { setError(data.error || "Couldn't find words. Try again!"); return; }

      const now = new Date().toISOString();
      const existing = new Set(words.map(w => w.word.toLowerCase()));
      const newWords: VocabWord[] = (data.words as { word: string; definition: string; exampleSentence: string; emoji: string }[])
        .filter(w => !existing.has(w.word.toLowerCase()))
        .map(w => ({
          id:              crypto.randomUUID(),
          childProfileId:  profile.id,
          word:            w.word,
          definition:      w.definition,
          exampleSentence: w.exampleSentence,
          emoji:           w.emoji,
          sourceBookTitle: bookTitle,
          sourcePage:      currentPage,
          status:          "new" as VocabStatus,
          createdAt:       now,
          updatedAt:       now,
        }));

      await Promise.all(newWords.map(saveVocabWord));
      setWords(prev => [...prev, ...newWords]);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError("Something went wrong. Try again in a moment!");
    } finally {
      setLoading(false);
    }
  }, [pageText, loading, words, profile, bookTitle, currentPage]);

  const advanceStatus = useCallback(async (word: VocabWord) => {
    const next = nextStatus(word.status);
    if (!next) return;
    const updated: VocabWord = { ...word, status: next, updatedAt: new Date().toISOString() };
    await saveVocabWord(updated);
    setWords(prev => prev.map(w => w.id === word.id ? updated : w));
  }, []);

  const removeWord = useCallback(async (id: string) => {
    await deleteVocabWord(id);
    setWords(prev => prev.filter(w => w.id !== id));
    if (flippedId === id) setFlippedId(null);
  }, [flippedId]);

  const counts = {
    new:       words.filter(w => w.status === "new").length,
    reviewing: words.filter(w => w.status === "reviewing").length,
    mastered:  words.filter(w => w.status === "mastered").length,
  };

  const visible = filter === "all" ? words : words.filter(w => w.status === filter);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header + stats */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-white leading-tight">🔤 My Words</h2>
            <p className="text-indigo-300/70 text-xs">{words.length} word{words.length !== 1 ? "s" : ""} collected</p>
          </div>
          {pageText && (
            <button
              onClick={extractWords}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs bg-teal-600/30 hover:bg-teal-600/50 disabled:opacity-50 border border-teal-400/30 text-teal-200 rounded-xl px-3 py-2 transition-colors"
            >
              {loading ? (
                <span className="inline-flex gap-1">
                  <span className="w-1 h-1 bg-teal-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1 h-1 bg-teal-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1 h-1 bg-teal-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </span>
              ) : "✨ Find words"}
            </button>
          )}
        </div>

        {/* Mastery stats row */}
        <div className="flex gap-2 mb-3">
          {(["new", "reviewing", "mastered"] as VocabStatus[]).map(s => {
            const m = VOCAB_STATUS_META[s];
            return (
              <button
                key={s}
                onClick={() => setFilter(prev => prev === s ? "all" : s)}
                className={`flex-1 rounded-xl py-1.5 text-center transition-colors border ${
                  filter === s
                    ? "bg-white/10 border-white/20"
                    : "bg-white/3 border-white/8 hover:bg-white/6"
                }`}
              >
                <div className="text-base leading-none">{m.emoji}</div>
                <div className={`text-[10px] font-bold tabular-nums mt-0.5 ${m.color}`}>{counts[s]}</div>
                <div className="text-[9px] text-slate-500">{m.label}</div>
              </button>
            );
          })}
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-900/20 border border-red-500/20 rounded-xl px-3 py-2 mb-2">
            {error}
          </div>
        )}
      </div>

      {/* Word list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {visible.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-4xl mb-3">{words.length === 0 ? "📖" : "🔍"}</div>
            <p className="text-slate-400 text-sm font-medium mb-1">
              {words.length === 0 ? "No words yet!" : `No ${filter} words`}
            </p>
            <p className="text-slate-500 text-xs">
              {words.length === 0
                ? pageText
                  ? 'Tap "✨ Find words" to discover words from this page.'
                  : "Open a book in the Reader, then come back here."
                : "Try a different filter above."}
            </p>
          </div>
        ) : (
          visible.map(word => {
            const isFlipped = flippedId === word.id;
            const meta = VOCAB_STATUS_META[word.status];
            const next = nextStatus(word.status);

            return (
              <div
                key={word.id}
                className="rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-900/40 to-violet-900/30 overflow-hidden"
              >
                {/* Card front */}
                <button
                  onClick={() => setFlippedId(isFlipped ? null : word.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="text-2xl flex-shrink-0">{word.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-bold text-sm">{word.word}</div>
                    {!isFlipped && (
                      <div className="text-indigo-300/60 text-xs mt-0.5 truncate">{word.definition}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`text-[10px] font-semibold ${meta.color}`}>{meta.emoji} {meta.label}</span>
                    <span className="text-slate-500 text-xs">{isFlipped ? "▲" : "▼"}</span>
                  </div>
                </button>

                {/* Card back (expanded) */}
                {isFlipped && (
                  <div className="px-4 pb-4 border-t border-white/8">
                    <p className="text-indigo-100 text-sm mt-3 leading-relaxed">{word.definition}</p>
                    <p className="text-indigo-300/80 text-xs mt-2 italic leading-relaxed">
                      &ldquo;{word.exampleSentence}&rdquo;
                    </p>
                    {word.sourceBookTitle && (
                      <p className="text-slate-500 text-[10px] mt-2">
                        From: {word.sourceBookTitle}{word.sourcePage ? ` p.${word.sourcePage}` : ""}
                      </p>
                    )}
                    <div className="flex gap-2 mt-3">
                      {next && (
                        <button
                          onClick={() => advanceStatus(word)}
                          className="flex-1 text-xs bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-400/30 text-emerald-200 rounded-xl py-2 transition-colors"
                        >
                          {VOCAB_STATUS_META[next].emoji} Mark as {VOCAB_STATUS_META[next].label}
                        </button>
                      )}
                      <button
                        onClick={() => removeWord(word.id)}
                        className="text-xs bg-red-900/20 hover:bg-red-900/40 border border-red-500/20 text-red-400 rounded-xl px-3 py-2 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ─── Memory Games tab (placeholder — PR #4) ─────────────────────────────────── */

type ActiveGame = "memory-match" | "word-scramble" | null;

function GamesTab({
  profile,
  rewards,
  onAwardStar,
}: {
  profile:     ChildProfile;
  rewards:     ChildRewardState;
  onAwardStar: () => Promise<void>;
}) {
  const [activeGame, setActiveGame] = useState<ActiveGame>(null);

  const GAMES: {
    id:          ActiveGame;
    emoji:       string;
    name:        string;
    desc:        string;
    starsNeeded: number;
  }[] = [
    { id: "memory-match",  emoji: "🃏", name: "Memory Match",    desc: "Match each word to its meaning",        starsNeeded: 0 },
    { id: "word-scramble", emoji: "🔤", name: "Word Scramble",   desc: "Unscramble letters to spell the word",  starsNeeded: 5 },
    { id: null,            emoji: "🖼️", name: "Picture Match",  desc: "Match words to pictures",               starsNeeded: 10 },
    { id: null,            emoji: "📝", name: "Fill-in-Blank",   desc: "Complete the sentence",                 starsNeeded: 15 },
    { id: null,            emoji: "🔀", name: "Story Sequencer", desc: "Put the story in the right order",      starsNeeded: 25 },
  ];

  if (activeGame === "memory-match") {
    return (
      <MemoryMatch
        childProfileId={profile.id}
        onBack={() => setActiveGame(null)}
        onWin={async () => { await onAwardStar(); }}
      />
    );
  }

  if (activeGame === "word-scramble") {
    return (
      <WordScramble
        childProfileId={profile.id}
        onBack={() => setActiveGame(null)}
        onWin={async () => { await onAwardStar(); }}
      />
    );
  }

  return (
    <div className="h-full overflow-auto p-5">
      <h2 className="text-lg font-bold text-white mb-1">🧠 Games</h2>
      <p className="text-indigo-300 text-sm mb-5">Play with words from your collection!</p>

      <div className="space-y-3">
        {GAMES.map(({ id, emoji, name, desc, starsNeeded }) => {
          const unlocked  = rewards.totalStars >= starsNeeded;
          const playable  = unlocked && id !== null;

          return (
            <button
              key={name}
              onClick={() => playable && setActiveGame(id)}
              disabled={!playable}
              className={`w-full rounded-xl border px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                playable
                  ? "border-indigo-400/25 bg-indigo-500/8 hover:bg-indigo-500/15"
                  : "border-white/8 bg-white/3 opacity-50 cursor-not-allowed"
              }`}
            >
              <span className={`text-2xl flex-shrink-0 ${!unlocked ? "grayscale" : ""}`}>{emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-white font-semibold text-sm">{name}</div>
                <div className="text-slate-400 text-xs">{desc}</div>
                {starsNeeded > 0 && !unlocked && (
                  <div className="text-yellow-400/60 text-[10px] mt-0.5">Unlock at {starsNeeded} ⭐</div>
                )}
              </div>
              <span className="text-slate-500 text-sm flex-shrink-0">
                {playable ? "▶" : "🔒"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Weekly Challenge tab ───────────────────────────────────────────────────── */

function WeeklyChallengeTab({
  rewards,
  progress,
  onLogSession,
}: {
  rewards: ChildRewardState;
  progress: ChildProgress | null;
  onLogSession: () => Promise<void>;
}) {
  const streak       = rewards.currentStreak;
  const weekProgress = Math.min(streak, 5);
  const done         = weekProgress >= 5;

  const PAST_CHALLENGES = [
    { label: "First Session",  completed: (progress?.totalSessions ?? 0) >= 1, icon: "📖" },
    { label: "3-Day Streak",   completed: rewards.longestStreak >= 3,           icon: "🔥" },
    { label: "5 Stars Earned", completed: rewards.totalStars >= 5,              icon: "⭐" },
  ];

  return (
    <div className="h-full overflow-auto p-5">
      <h2 className="text-lg font-bold text-white mb-4">🎯 Weekly Challenge</h2>

      {/* This week */}
      <div className={`mb-5 rounded-2xl border p-5 ${
        done ? "border-green-400/40 bg-green-500/10" : "border-purple-400/30 bg-purple-500/8"
      }`}>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">{done ? "🏆" : "🎯"}</span>
          <div>
            <h3 className={`font-bold ${done ? "text-green-200" : "text-purple-200"}`}>
              {done ? "Challenge complete! 🎉" : "This Week's Challenge"}
            </h3>
            <p className={`text-sm ${done ? "text-green-300/70" : "text-purple-300/70"}`}>
              Read for 5 different days this week
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-4 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                done ? "bg-gradient-to-r from-green-500 to-emerald-400" : "bg-gradient-to-r from-purple-500 to-indigo-500"
              }`}
              style={{ width: `${(weekProgress / 5) * 100}%` }}
            />
          </div>
          <span className={`font-bold text-sm tabular-nums ${done ? "text-green-300" : "text-purple-300"}`}>
            {weekProgress}/5
          </span>
        </div>

        <div className="flex gap-1.5 justify-center mb-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg border ${
              i < weekProgress
                ? "bg-purple-500/40 border-purple-400/50"
                : "bg-white/5 border-white/10"
            }`}>
              {i < weekProgress ? "✓" : ""}
            </div>
          ))}
        </div>

        {done ? (
          <p className="text-center text-green-300 text-sm font-semibold">Amazing! You crushed it this week! 🌟</p>
        ) : (
          <LogSessionButton onLog={onLogSession} compact />
        )}
      </div>

      {/* Milestone challenges */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <h3 className="text-sm font-bold text-white mb-3">🏅 Milestone Challenges</h3>
        <div className="space-y-2.5">
          {PAST_CHALLENGES.map(({ label, completed, icon }) => (
            <div key={label} className="flex items-center gap-3">
              <span className={`text-xl ${completed ? "" : "grayscale opacity-40"}`}>{icon}</span>
              <span className={`flex-1 text-sm ${completed ? "text-white" : "text-slate-500"}`}>{label}</span>
              <span className={`text-sm ${completed ? "text-green-400" : "text-slate-600"}`}>
                {completed ? "✓ Done" : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Storage helpers ────────────────────────────────────────────────────────── */

const STORAGE_KEY = "elena-active-profile-id";

function makeDefaultRewards(childProfileId: string): ChildRewardState {
  return { childProfileId, totalStars: 0, currentStreak: 0, longestStreak: 0, updatedAt: new Date().toISOString() };
}

function makeDefaultProgress(childProfileId: string): ChildProgress {
  return {
    childProfileId, currentLevel: "developing", booksCompleted: 0, totalSessions: 0,
    totalMinutes: 0, totalWordsRead: 0, lastActiveAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

/* ─── Main workspace ─────────────────────────────────────────────────────────── */

interface ElenaChildWorkspaceProps {
  bookTitle?:    string;
  currentPage?:  number;
  totalPages?:   number;
  /** Raw text of the current PDF page — passed to Vocabulary Builder and Reading Buddy */
  pageText?:     string;
}

export default function ElenaChildWorkspace({ bookTitle, currentPage, totalPages, pageText }: ElenaChildWorkspaceProps) {
  const [profile,     setProfile]     = useState<ChildProfile | null>(null);
  const [rewards,     setRewards]     = useState<ChildRewardState | null>(null);
  const [progress,    setProgress]    = useState<ChildProgress | null>(null);
  const [loading,            setLoading]            = useState(true);
  const [idbError,           setIdbError]           = useState<string | null>(null);
  const [persistenceWarning, setPersistenceWarning] = useState<string | null>(null);
  const [loadAttempt,        setLoadAttempt]        = useState(0);
  const [activeTab,          setActiveTab]          = useState<ElenaTab>("home");
  const [showParent,         setShowParent]         = useState(false);

  useEffect(() => {
    setLoading(true);
    setIdbError(null);
    const savedId = localStorage.getItem(STORAGE_KEY);
    if (!savedId) { setLoading(false); return; }
    Promise.all([
      loadChildProfile(savedId),
      loadRewardState(savedId),
      loadChildProgress(savedId),
    ]).then(([p, r, prog]) => {
      setProfile(p);
      setRewards(r ?? (p ? makeDefaultRewards(p.id) : null));
      setProgress(prog);
      setLoading(false);
    }).catch((err) => {
      const blocked = String(err).includes("blocked");
      setIdbError(
        blocked
          ? "Elena Mode needs a storage update. Close other Avrrio Reader tabs, then tap Retry."
          : "Couldn't load your profile. Please retry.",
      );
      setLoading(false);
    });
  }, [loadAttempt]);

  const handleSave = useCallback(async (p: ChildProfile) => {
    // Write the active profile ID synchronously so the next mount can load it.
    localStorage.setItem(STORAGE_KEY, p.id);
    const defaultRewards = makeDefaultRewards(p.id);

    // Open the workspace immediately — state updates happen before any IDB await.
    setProfile(p);
    setRewards(defaultRewards);
    setProgress(null);
    setIdbError(null);
    setPersistenceWarning(null);
    setActiveTab("home");

    // Persist profile + rewards in the background.
    // Both writes are independent; a failure is non-blocking but visible.
    const [profileErr, rewardErr] = await Promise.all([
      saveChildProfile(p).then(() => null).catch((e: unknown) => e),
      saveRewardState(defaultRewards).then(() => null).catch((e: unknown) => e),
    ]);
    if (profileErr || rewardErr) {
      const blocked = String(profileErr ?? rewardErr).includes("blocked");
      setPersistenceWarning(
        blocked
          ? "Your profile is open but couldn't be saved. Close other Avrrio tabs to allow storage access."
          : "Your profile is open but couldn't be saved to storage. It will not persist after a refresh.",
      );
    }
  }, []);

  const handleReset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setProfile(null); setRewards(null); setProgress(null);
  }, []);

  const handleAwardStar = useCallback(async () => {
    if (!profile || !rewards) return;
    const updated = awardStar(rewards);
    await saveRewardState(updated);
    setRewards(updated);
  }, [profile, rewards]);

  const handleLogSession = useCallback(async () => {
    if (!profile || !rewards) return;
    const updated = awardStar(rewards);
    await saveRewardState(updated);
    setRewards(updated);
    const now = new Date().toISOString();
    const updatedProgress: ChildProgress = progress
      ? { ...progress, totalSessions: progress.totalSessions + 1, lastActiveAt: now, updatedAt: now }
      : { ...makeDefaultProgress(profile.id), totalSessions: 1, lastActiveAt: now };
    await saveChildProgress(updatedProgress);
    setProgress(updatedProgress);
  }, [profile, rewards, progress]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-violet-950 via-indigo-950 to-slate-950">
        <div className="text-indigo-400 text-sm animate-pulse">Loading…</div>
      </div>
    );
  }

  if (idbError) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-violet-950 via-indigo-950 to-slate-950 p-8 text-center">
        <div className="text-4xl">⚠️</div>
        <p className="text-sm text-indigo-200 max-w-xs leading-relaxed">{idbError}</p>
        <button
          onClick={() => setLoadAttempt(a => a + 1)}
          className="rounded-xl bg-indigo-500 hover:bg-indigo-400 px-5 py-2.5 text-sm font-semibold text-white transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!profile || !rewards) return <SetupForm onSave={handleSave} />;

  return (
    <div className="h-full w-full flex flex-col bg-gradient-to-br from-violet-950 via-indigo-950 to-slate-950 overflow-hidden">
      {/* Parent Dashboard overlay */}
      {showParent && (
        <ParentDashboard
          profile={profile}
          rewards={rewards}
          progress={progress}
          onClose={() => setShowParent(false)}
        />
      )}

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/8 bg-slate-950/40 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">✨</span>
          <div>
            <div className="text-white font-bold text-sm leading-tight">Elena Mode</div>
            <div className="text-indigo-400 text-[10px] leading-tight">{profile.displayName}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[11px] text-amber-300">
            <span>⭐</span>
            <span className="font-bold tabular-nums">{rewards.totalStars}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-300">
            <span>🔥</span>
            <span className="font-bold tabular-nums">{rewards.currentStreak}d</span>
          </div>
          <button
            onClick={() => setShowParent(true)}
            className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/5"
            aria-label="Open parent dashboard"
          >
            <span>👤</span>
            <span>Parent</span>
          </button>
        </div>
      </div>

      {/* Persistence warning — soft, dismissible, non-blocking */}
      {persistenceWarning && (
        <div className="flex-shrink-0 flex items-start gap-2 px-4 py-2 bg-amber-500/15 border-b border-amber-400/25 text-amber-200 text-xs">
          <span className="mt-px flex-shrink-0">⚠️</span>
          <span className="flex-1">{persistenceWarning}</span>
          <button
            onClick={() => setPersistenceWarning(null)}
            className="flex-shrink-0 text-amber-400/60 hover:text-amber-200 transition-colors ml-1"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tab content — centered with max-width and responsive padding */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="h-full max-w-2xl mx-auto w-full px-4 py-4">
          {activeTab === "home" && (
            <HomeTab
              profile={profile} rewards={rewards} progress={progress}
              onReset={handleReset} onLogSession={handleLogSession}
              onNav={setActiveTab}
            />
          )}
          {activeTab === "reading" && (
            <ContinueReadingTab
              profile={profile}
              bookTitle={bookTitle} currentPage={currentPage} totalPages={totalPages}
              pageText={pageText} progress={progress} onLogSession={handleLogSession}
            />
          )}
          {activeTab === "today" && (
            <TodayGoalTab rewards={rewards} progress={progress} onLogSession={handleLogSession} />
          )}
          {activeTab === "adventures"   && <AdventuresTab rewards={rewards} progress={progress} />}
          {activeTab === "achievements" && <AchievementsTab rewards={rewards} progress={progress} />}
          {activeTab === "library"      && <LibraryTab profile={profile} progress={progress} />}
          {activeTab === "vocabulary"   && (
            <VocabularyTab
              profile={profile} pageText={pageText}
              bookTitle={bookTitle} currentPage={currentPage}
            />
          )}
          {activeTab === "games"        && (
            <GamesTab profile={profile} rewards={rewards} onAwardStar={handleAwardStar} />
          )}
          {activeTab === "challenge"    && (
            <WeeklyChallengeTab rewards={rewards} progress={progress} onLogSession={handleLogSession} />
          )}
        </div>
      </div>

      {/* Bottom nav — clearly separated from content, horizontally scrollable */}
      <div className="flex-shrink-0 border-t-2 border-white/10 bg-slate-950/90 backdrop-blur-md">
        <div className="flex overflow-x-auto scrollbar-hide max-w-2xl mx-auto">
          {ELENA_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-none flex flex-col items-center px-4 py-2.5 gap-1 min-w-[60px] transition-all ${
                activeTab === tab.id
                  ? "text-indigo-300 border-t-2 border-indigo-400 bg-indigo-500/10"
                  : "text-slate-500 hover:text-slate-300 border-t-2 border-transparent hover:bg-white/5"
              }`}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              <span className="text-[9px] font-medium leading-none">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
