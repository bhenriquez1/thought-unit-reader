// components/elena/ElenaChildWorkspace.tsx
// Elena Mode workspace — child-learning hub with 9 sections.
// Uses getChildDisplayCopy() for all labels; never hard-codes child names.

import React, { useState, useEffect, useCallback } from "react";
import ReadingBuddy from "@/components/elena/ReadingBuddy";
import { getChildDisplayCopy } from "@/lib/elena/displayCopy";
import {
  saveChildProfile,
  loadChildProfile,
  loadRewardState,
  saveRewardState,
  loadChildProgress,
  saveChildProgress,
} from "@/lib/elena/idbStore";
import type {
  ChildProfile,
  ChildAgeRange,
  ChildRewardState,
  ChildProgress,
} from "@/lib/elena/types";

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

  async function handleSave() {
    if (!displayName.trim()) { setError("Please enter a name."); return; }
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
    await saveChildProfile(profile);
    onSave(profile);
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
  profile:       ChildProfile;
  bookTitle?:    string;
  currentPage?:  number;
  totalPages?:   number;
  pageText?:     string;
  progress:      ChildProgress | null;
  onLogSession:  () => Promise<void>;
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
            <p className="text-slate-400 text-sm">Switch to the Reader tab and open a PDF to track your progress.</p>
          </div>
        )}
      </div>

      {/* Reading Buddy — fills remaining space */}
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

function AdventuresTab({ rewards }: { rewards: ChildRewardState }) {
  const WORLDS = [
    { emoji: "🌲", name: "Reading Forest",   starsNeeded: 0,  desc: "Every adventure begins here!" },
    { emoji: "🏔️", name: "Science Mountain", starsNeeded: 10, desc: "Discover how the world works!" },
    { emoji: "🌊", name: "Ocean Explorer",   starsNeeded: 25, desc: "Dive into deep-sea mysteries!" },
    { emoji: "🏰", name: "History Castle",   starsNeeded: 50, desc: "Travel back in time!" },
    { emoji: "🚀", name: "Space Station",    starsNeeded: 100,desc: "Reach for the stars!" },
  ];

  return (
    <div className="h-full overflow-auto p-5">
      <h2 className="text-lg font-bold text-white mb-1">🗺️ Adventures</h2>
      <p className="text-indigo-300 text-sm mb-5">Read to unlock new worlds!</p>

      <div className="space-y-3">
        {WORLDS.map((world, i) => {
          const unlocked = rewards.totalStars >= world.starsNeeded;
          return (
            <div
              key={world.name}
              className={`rounded-2xl border p-4 flex items-center gap-4 ${
                unlocked
                  ? "border-indigo-400/40 bg-indigo-500/10"
                  : "border-white/8 bg-white/3 opacity-60"
              }`}
            >
              <div className={`text-4xl ${unlocked ? "" : "grayscale"}`}>{world.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className={`font-bold text-sm ${unlocked ? "text-white" : "text-slate-400"}`}>
                    {world.name}
                  </h3>
                  {i === 0 && (
                    <span className="text-[10px] bg-green-500/20 text-green-300 border border-green-500/30 px-1.5 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                </div>
                <p className={`text-xs mt-0.5 ${unlocked ? "text-indigo-300" : "text-slate-500"}`}>
                  {world.desc}
                </p>
                {!unlocked && (
                  <p className="text-[11px] text-yellow-400/60 mt-1">
                    🔒 Unlock at {world.starsNeeded} ⭐ stars ({Math.max(0, world.starsNeeded - rewards.totalStars)} more to go)
                  </p>
                )}
              </div>
              {unlocked && i === 0 && (
                <span className="text-green-400 text-lg flex-shrink-0">▶</span>
              )}
              {!unlocked && (
                <span className="text-slate-600 text-lg flex-shrink-0">🔒</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-2xl border border-blue-400/20 bg-blue-500/5 p-4 text-center">
        <p className="text-blue-300 text-sm font-semibold mb-1">Adventure Map — Coming Soon! 🗺️</p>
        <p className="text-blue-400/60 text-xs">
          Full interactive adventure map with quests, treasure chests, and daily challenges is on the way!
        </p>
      </div>
    </div>
  );
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

/* ─── Vocabulary tab (placeholder — PR #3) ───────────────────────────────────── */

function VocabularyTab() {
  const PREVIEW_WORDS = [
    { word: "Chrysalis", emoji: "🦋", preview: "The protective case around a butterfly…" },
    { word: "Photosynthesis", emoji: "🌱", preview: "How plants make their own food…" },
    { word: "Orbit", emoji: "🪐", preview: "The path a planet takes around the sun…" },
  ];

  return (
    <div className="h-full overflow-auto p-5">
      <h2 className="text-lg font-bold text-white mb-1">🔤 My Words</h2>
      <p className="text-indigo-300 text-sm mb-5">Words you discover while reading appear here.</p>

      {/* Coming soon banner */}
      <div className="mb-5 rounded-2xl border border-teal-400/30 bg-teal-500/10 p-4 text-center">
        <div className="text-3xl mb-2">🔤</div>
        <p className="text-teal-200 font-bold text-sm mb-1">Vocabulary Builder — Coming Soon!</p>
        <p className="text-teal-400/60 text-xs">
          Every new word you find while reading will become a flashcard you can study and master.
        </p>
      </div>

      {/* Preview cards */}
      <div className="mb-3">
        <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide mb-3">Preview</p>
        <div className="space-y-3">
          {PREVIEW_WORDS.map(({ word, emoji, preview }) => (
            <div key={word} className="rounded-xl border border-white/8 bg-white/3 px-4 py-3 flex items-start gap-3 opacity-60">
              <span className="text-2xl">{emoji}</span>
              <div>
                <div className="text-white font-bold text-sm">{word}</div>
                <div className="text-slate-400 text-xs mt-0.5">{preview}</div>
              </div>
              <span className="ml-auto text-slate-600 text-xs flex-shrink-0">🔒</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-slate-500 text-xs">Your real word collection will look just like this!</p>
    </div>
  );
}

/* ─── Memory Games tab (placeholder — PR #4) ─────────────────────────────────── */

function GamesTab({ rewards }: { rewards: ChildRewardState }) {
  const GAMES = [
    { emoji: "🃏", name: "Memory Match",    desc: "Match words to their meanings",    starsNeeded: 0  },
    { emoji: "🔤", name: "Word Builder",    desc: "Unscramble letters to make words", starsNeeded: 5  },
    { emoji: "🖼️", name: "Picture Match",  desc: "Match words to pictures",          starsNeeded: 10 },
    { emoji: "📝", name: "Fill-in-Blank",   desc: "Complete the sentence",            starsNeeded: 15 },
    { emoji: "🔀", name: "Story Sequencer", desc: "Put the story in the right order", starsNeeded: 25 },
  ];

  return (
    <div className="h-full overflow-auto p-5">
      <h2 className="text-lg font-bold text-white mb-1">🧠 Memory Games</h2>
      <p className="text-indigo-300 text-sm mb-5">Games that make learning fun!</p>

      {/* Coming soon banner */}
      <div className="mb-5 rounded-2xl border border-green-400/30 bg-green-500/10 p-4 text-center">
        <div className="text-3xl mb-2">🎮</div>
        <p className="text-green-200 font-bold text-sm mb-1">Memory Games — Coming Soon!</p>
        <p className="text-green-400/60 text-xs">
          Games use the words from your Vocabulary Collection. Build your word list first!
        </p>
      </div>

      {/* Game previews */}
      <div className="space-y-3">
        {GAMES.map(({ emoji, name, desc, starsNeeded }) => {
          const unlocked = rewards.totalStars >= starsNeeded;
          return (
            <div
              key={name}
              className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
                unlocked && starsNeeded === 0
                  ? "border-green-400/25 bg-green-500/8"
                  : "border-white/8 bg-white/3 opacity-50"
              }`}
            >
              <span className={`text-2xl ${unlocked ? "" : "grayscale"}`}>{emoji}</span>
              <div className="flex-1">
                <div className="text-white font-semibold text-sm">{name}</div>
                <div className="text-slate-400 text-xs">{desc}</div>
                {starsNeeded > 0 && !unlocked && (
                  <div className="text-yellow-400/60 text-[10px] mt-0.5">Unlock at {starsNeeded} ⭐</div>
                )}
              </div>
              <span className="text-slate-600 text-sm flex-shrink-0">
                {starsNeeded === 0 ? "🔜" : "🔒"}
              </span>
            </div>
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
  /** Raw text of the current PDF page (from the Reader's OCR pipeline) */
  pageText?:     string;
}

export default function ElenaChildWorkspace({ bookTitle, currentPage, totalPages, pageText }: ElenaChildWorkspaceProps) {
  const [profile,   setProfile]   = useState<ChildProfile | null>(null);
  const [rewards,   setRewards]   = useState<ChildRewardState | null>(null);
  const [progress,  setProgress]  = useState<ChildProgress | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState<ElenaTab>("home");

  useEffect(() => {
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
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async (p: ChildProfile) => {
    localStorage.setItem(STORAGE_KEY, p.id);
    const defaultRewards = makeDefaultRewards(p.id);
    await saveRewardState(defaultRewards);
    setProfile(p);
    setRewards(defaultRewards);
    setProgress(null);
  }, []);

  const handleReset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setProfile(null); setRewards(null); setProgress(null);
  }, []);

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

  if (!profile || !rewards) return <SetupForm onSave={handleSave} />;

  return (
    <div className="h-full w-full flex flex-col bg-gradient-to-br from-violet-950 via-indigo-950 to-slate-950">
      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
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
        {activeTab === "adventures"   && <AdventuresTab rewards={rewards} />}
        {activeTab === "achievements" && <AchievementsTab rewards={rewards} progress={progress} />}
        {activeTab === "library"      && <LibraryTab profile={profile} progress={progress} />}
        {activeTab === "vocabulary"   && <VocabularyTab />}
        {activeTab === "games"        && <GamesTab rewards={rewards} />}
        {activeTab === "challenge"    && (
          <WeeklyChallengeTab rewards={rewards} progress={progress} onLogSession={handleLogSession} />
        )}
      </div>

      {/* Bottom nav — horizontally scrollable for 9 tabs */}
      <div className="flex-shrink-0 border-t border-white/10 bg-slate-950/80 backdrop-blur-sm">
        <div className="flex overflow-x-auto scrollbar-hide">
          {ELENA_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-none flex flex-col items-center px-3 py-2 gap-0.5 min-w-[56px] transition-colors ${
                activeTab === tab.id
                  ? "text-indigo-300 border-t-2 border-indigo-400"
                  : "text-slate-500 hover:text-slate-300 border-t-2 border-transparent"
              }`}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span className={`font-medium leading-none ${activeTab === tab.id ? "text-[9px]" : "text-[9px]"}`}>
                {tab.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
