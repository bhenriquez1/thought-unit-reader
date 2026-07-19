// components/elena/ElenaChildWorkspace.tsx
// Elena Mode workspace — profile setup + personalized home screen with rewards.
// Uses getChildDisplayCopy() for all labels; never hard-codes "Elena".

import React, { useState, useEffect, useCallback } from "react";
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

const INTERESTS = [
  "Animals", "Space", "Dinosaurs", "Art", "Music", "Sports",
  "Science", "Math", "History", "Cooking", "Nature", "Technology",
];

const AGE_RANGES: { value: ChildAgeRange; label: string }[] = [
  { value: "3-4",  label: "3–4 years" },
  { value: "5-6",  label: "5–6 years" },
  { value: "7-8",  label: "7–8 years" },
  { value: "9-10", label: "9–10 years" },
  { value: "11-12",label: "11–12 years" },
];

// Milestone achievements — unlocked by totalStars or currentStreak
const ACHIEVEMENTS: { id: string; icon: string; label: string; desc: string; test: (r: ChildRewardState) => boolean }[] = [
  { id: "first-star",   icon: "⭐", label: "First Star",     desc: "Earned your first star!",              test: r => r.totalStars >= 1 },
  { id: "reader-5",     icon: "📖", label: "Bookworm",       desc: "Earned 5 stars — you love reading!",   test: r => r.totalStars >= 5 },
  { id: "reader-10",    icon: "🏆", label: "Reading Champ",  desc: "Earned 10 stars — incredible!",        test: r => r.totalStars >= 10 },
  { id: "reader-25",    icon: "🌟", label: "Super Reader",   desc: "25 stars — you're a super reader!",    test: r => r.totalStars >= 25 },
  { id: "streak-2",     icon: "🔥", label: "On a Roll",      desc: "Read 2 days in a row!",               test: r => r.currentStreak >= 2 },
  { id: "streak-7",     icon: "💥", label: "Week Warrior",   desc: "7-day reading streak!",               test: r => r.currentStreak >= 7 },
  { id: "streak-best",  icon: "🎯", label: "Personal Best",  desc: `Longest streak: ${0} days`,           test: r => r.longestStreak >= 3 },
];

function isoToday(): string {
  return new Date().toISOString().split("T")[0];
}

function awardStar(prev: ChildRewardState): ChildRewardState {
  const todayStr = isoToday();
  const lastStr  = prev.updatedAt.split("T")[0];
  const ms = new Date(todayStr).getTime() - new Date(lastStr).getTime();
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

/* ─── Setup form ────────────────────────────────────────────────────────────── */

interface SetupFormProps {
  onSave: (profile: ChildProfile) => void;
}

function SetupForm({ onSave }: SetupFormProps) {
  const [displayName,   setDisplayName]   = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [ageRange,      setAgeRange]      = useState<ChildAgeRange | "">("");
  const [interests,     setInterests]     = useState<string[]>([]);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState("");

  function toggleInterest(interest: string) {
    setInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest],
    );
  }

  async function handleSave() {
    if (!displayName.trim()) {
      setError("Please enter a name.");
      return;
    }
    setSaving(true);
    setError("");
    const now     = new Date().toISOString();
    const profile: ChildProfile = {
      id:              `child-${Date.now()}`,
      displayName:     displayName.trim(),
      preferredName:   preferredName.trim() || undefined,
      ageRange:        (ageRange as ChildAgeRange) || undefined,
      interests,
      accessibilityPreferences: {
        highContrastMode: false,
        textToSpeech:     false,
        reducedMotion:    false,
        dyslexiaFont:     false,
      },
      parentAccountId: "local",
      createdAt:       now,
      updatedAt:       now,
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
          {/* Name */}
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

          {/* Preferred name */}
          <div>
            <label className="block text-sm font-medium text-indigo-200 mb-1.5">
              Nickname / preferred name <span className="text-white/40 text-xs">(optional)</span>
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

          {/* Age range */}
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

          {/* Interests */}
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

/* ─── Shared tab types ──────────────────────────────────────────────────────── */

type ElenaTab = "home" | "library" | "progress";

const ELENA_TABS: { id: ElenaTab; icon: string; label: string }[] = [
  { id: "home",     icon: "🏠", label: "Home"     },
  { id: "library",  icon: "📚", label: "Library"  },
  { id: "progress", icon: "🌟", label: "Progress" },
];

/* ─── Library tab ───────────────────────────────────────────────────────────── */

const INTEREST_EMOJI: Record<string, string> = {
  Animals: "🐾", Space: "🚀", Dinosaurs: "🦕", Art: "🎨", Music: "🎵",
  Sports: "⚽", Science: "🔬", Math: "🔢", History: "🏛️", Cooking: "🍳",
  Nature: "🌿", Technology: "💻",
};

function LibraryTab({ profile, progress }: { profile: ChildProfile; progress: ChildProgress | null }) {
  const booksCompleted = progress?.booksCompleted ?? 0;
  const totalSessions  = progress?.totalSessions ?? 0;

  const BOOK_EMOJIS = ["📘", "📗", "📙", "📕", "📔", "📒", "📓"];

  return (
    <div className="h-full overflow-auto p-5">
      {/* My books */}
      <div className="mb-5">
        <h2 className="text-lg font-bold text-white mb-1">📚 My Books</h2>
        <p className="text-indigo-300 text-sm mb-3">
          {booksCompleted === 0
            ? "Open the Reader to start your first book!"
            : `${booksCompleted} ${booksCompleted === 1 ? "book" : "books"} completed!`}
        </p>
        {/* Bookshelf */}
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

      {/* Reading topics */}
      {profile.interests.length > 0 && (
        <div className="mb-5">
          <h2 className="text-base font-bold text-white mb-2">❤️ Topics I Love</h2>
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

      {/* Reading adventures */}
      <div className="rounded-2xl border border-teal-400/20 bg-teal-500/5 p-4">
        <h2 className="text-base font-bold text-teal-200 mb-3">🗺️ Reading Adventures</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: "📖", label: "Sessions",        value: String(totalSessions)  },
            { icon: "📚", label: "Books Done",       value: String(booksCompleted) },
            { icon: "⏱️", label: "Total Minutes",    value: progress?.totalMinutes ? `${progress.totalMinutes}` : "—" },
            { icon: "✍️", label: "Words Explored",   value: progress?.totalWordsRead ? `${progress.totalWordsRead}` : "—" },
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

/* ─── Progress tab ──────────────────────────────────────────────────────────── */

const LEVEL_INFO: Record<string, { icon: string; label: string; desc: string; color: string }> = {
  emergent:     { icon: "🌱", label: "Emergent Reader",    desc: "Just starting out — every page is an adventure!",    color: "text-green-300" },
  early:        { icon: "🐣", label: "Early Reader",       desc: "Words are coming together — keep it up!",            color: "text-yellow-300" },
  developing:   { icon: "📖", label: "Developing Reader",  desc: "Getting stronger every day!",                        color: "text-blue-300"   },
  transitional: { icon: "🚀", label: "Transitional Reader",desc: "Reading is becoming second nature!",                 color: "text-purple-300" },
  fluent:       { icon: "⭐", label: "Fluent Reader",      desc: "Reading flows! You make it look easy.",              color: "text-yellow-200" },
  advanced:     { icon: "🏆", label: "Advanced Reader",    desc: "Outstanding! You're a reading champion.",            color: "text-orange-300" },
};

function ProgressTab({ rewards, progress }: { rewards: ChildRewardState; progress: ChildProgress | null }) {
  const level     = progress?.currentLevel ?? "developing";
  const levelInfo = LEVEL_INFO[level] ?? LEVEL_INFO.developing;
  const earned    = ACHIEVEMENTS.filter(a => a.test(rewards));
  const locked    = ACHIEVEMENTS.filter(a => !a.test(rewards));

  return (
    <div className="h-full overflow-auto p-5">
      {/* Level badge */}
      <div className="mb-5 rounded-2xl border border-purple-400/30 bg-purple-500/10 p-4 text-center">
        <div className="text-4xl mb-1">{levelInfo.icon}</div>
        <div className={`text-lg font-bold ${levelInfo.color} mb-0.5`}>{levelInfo.label}</div>
        <div className="text-indigo-300 text-sm">{levelInfo.desc}</div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {[
          { icon: "⭐", label: "Total Stars",      value: String(rewards.totalStars)              },
          { icon: "🔥", label: "Best Streak",      value: `${rewards.longestStreak} days`         },
          { icon: "🔥", label: "Current Streak",   value: `${rewards.currentStreak} days`         },
          { icon: "📚", label: "Sessions Done",    value: String(progress?.totalSessions ?? 0)    },
          { icon: "📘", label: "Books Completed",  value: String(progress?.booksCompleted ?? 0)   },
          { icon: "⏱️", label: "Minutes Read",     value: progress?.totalMinutes ? String(progress.totalMinutes) : "—" },
        ].map(({ icon, label, value }) => (
          <div key={label} className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
            <div className="text-xl mb-0.5">{icon}</div>
            <div className="text-lg font-bold text-white tabular-nums">{value}</div>
            <div className="text-[10px] text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      {/* All achievements */}
      <h2 className="text-base font-bold text-white mb-3">🏅 Achievements</h2>

      {earned.length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] text-yellow-400/70 font-semibold mb-2 uppercase tracking-wide">Earned ({earned.length})</div>
          <div className="space-y-2">
            {earned.map(a => (
              <div key={a.id} className="flex items-center gap-3 rounded-xl bg-yellow-400/10 border border-yellow-400/25 px-3 py-2.5">
                <span className="text-2xl">{a.icon}</span>
                <div>
                  <div className="text-yellow-200 font-semibold text-sm">{a.label}</div>
                  <div className="text-yellow-400/60 text-[11px]">{a.desc}</div>
                </div>
                <span className="ml-auto text-yellow-300 text-sm">✓</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {locked.length > 0 && (
        <div>
          <div className="text-[11px] text-slate-500 font-semibold mb-2 uppercase tracking-wide">Locked ({locked.length})</div>
          <div className="space-y-2">
            {locked.map(a => (
              <div key={a.id} className="flex items-center gap-3 rounded-xl bg-white/3 border border-white/8 px-3 py-2.5 opacity-50">
                <span className="text-2xl grayscale">{a.icon}</span>
                <div>
                  <div className="text-slate-300 font-semibold text-sm">{a.label}</div>
                  <div className="text-slate-500 text-[11px]">{a.desc}</div>
                </div>
                <span className="ml-auto text-slate-500 text-sm">🔒</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Home screen ───────────────────────────────────────────────────────────── */

interface HomeScreenProps {
  profile:      ChildProfile;
  rewards:      ChildRewardState;
  progress:     ChildProgress | null;
  onReset:      () => void;
  onLogSession: () => Promise<void>;
}

function HomeScreen({ profile, rewards, progress, onReset, onLogSession }: HomeScreenProps) {
  const copy = getChildDisplayCopy(profile);
  const [logging, setLogging] = useState(false);
  const [justEarned, setJustEarned] = useState(false);

  const earned = ACHIEVEMENTS.filter(a => a.test(rewards));
  const nextUp  = ACHIEVEMENTS.find(a => !a.test(rewards));

  async function handleLog() {
    setLogging(true);
    await onLogSession();
    setLogging(false);
    setJustEarned(true);
    setTimeout(() => setJustEarned(false), 2500);
  }

  return (
    <div className="h-full w-full overflow-auto bg-gradient-to-br from-violet-950 via-indigo-950 to-slate-950 p-5">
      {/* Header — name + star count + streak */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{copy.workspaceTitle}</h1>
          <p className="text-indigo-300 text-sm mt-0.5">{copy.welcomeGreeting}</p>
          {profile.interests.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {profile.interests.map(i => (
                <span key={i} className="px-2 py-0.5 rounded-full bg-indigo-500/30 border border-indigo-400/30 text-indigo-200 text-xs">{i}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <div className="flex items-center gap-1.5 bg-yellow-400/20 border border-yellow-400/30 rounded-xl px-3 py-1.5">
            <span className="text-lg">⭐</span>
            <span className="text-yellow-200 font-bold text-lg tabular-nums">{rewards.totalStars}</span>
            <span className="text-yellow-400/60 text-xs">stars</span>
          </div>
          {rewards.currentStreak > 0 && (
            <div className="flex items-center gap-1 bg-orange-500/20 border border-orange-400/30 rounded-xl px-2.5 py-1">
              <span className="text-sm">🔥</span>
              <span className="text-orange-200 font-semibold text-sm">{rewards.currentStreak} day streak</span>
            </div>
          )}
        </div>
      </div>

      {/* Star earned toast */}
      {justEarned && (
        <div className="mb-4 rounded-2xl bg-yellow-400/20 border border-yellow-400/40 p-3 text-center animate-bounce">
          <span className="text-2xl">⭐</span>
          <p className="text-yellow-200 font-semibold text-sm mt-1">You earned a star! Great reading!</p>
        </div>
      )}

      {/* Reading CTA */}
      <div className="mb-4 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">📖</span>
          <div>
            <p className="text-white font-semibold">{copy.readingLabel}</p>
            <p className="text-indigo-300 text-sm">Open a PDF in the Reader, then log your session here.</p>
          </div>
        </div>
        <button
          onClick={handleLog}
          disabled={logging}
          className="w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
        >
          {logging ? "Logging…" : "✅ Log Reading Session  (+1 ⭐)"}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { icon: "⭐", value: String(rewards.totalStars),           label: "Stars Earned" },
          { icon: "🔥", value: String(rewards.currentStreak),        label: "Day Streak"   },
          { icon: "📚", value: String(progress?.totalSessions ?? 0), label: "Sessions"     },
        ].map(({ icon, value, label }) => (
          <div key={label} className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
            <div className="text-xl mb-0.5">{icon}</div>
            <div className="text-xl font-bold text-white tabular-nums">{value}</div>
            <div className="text-[10px] text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      {/* Rewards / achievements */}
      <div className="rounded-2xl border border-yellow-400/20 bg-yellow-500/5 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-yellow-200">⭐ Rewards</div>
          <div className="text-[10px] text-yellow-400/60">{earned.length}/{ACHIEVEMENTS.length} earned</div>
        </div>
        {earned.length === 0 ? (
          <p className="text-xs text-yellow-400/50">Log your first reading session to earn your first badge!</p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-3">
            {earned.map(a => (
              <div key={a.id} className="flex items-center gap-1.5 bg-yellow-400/15 border border-yellow-400/25 rounded-xl px-2.5 py-1.5" title={a.desc}>
                <span className="text-base">{a.icon}</span>
                <span className="text-yellow-200 text-xs font-medium">{a.label}</span>
              </div>
            ))}
          </div>
        )}
        {nextUp && (
          <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
            <span className="text-base opacity-40">{nextUp.icon}</span>
            <div>
              <div className="text-[11px] text-slate-400 font-medium">Next: {nextUp.label}</div>
              <div className="text-[10px] text-slate-500">{nextUp.desc}</div>
            </div>
          </div>
        )}
      </div>

      {/* Progress card */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-4">
        <div className="text-sm font-semibold text-slate-200 mb-2">📊 {copy.progressLabel}</div>
        <div className="space-y-1.5">
          {[
            ["Longest streak", `${rewards.longestStreak} days`],
            ["Total sessions", String(progress?.totalSessions ?? 0)],
            ["Total reading time", progress?.totalMinutes ? `${progress.totalMinutes} min` : "—"],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between text-[11px]">
              <span className="text-slate-400">{label}</span>
              <span className="text-slate-200 font-medium">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onReset}
        className="mt-2 text-xs text-white/20 hover:text-white/50 transition-colors block mx-auto"
        title="Reset profile"
      >
        Reset profile
      </button>
    </div>
  );
}

/* ─── Main workspace ────────────────────────────────────────────────────────── */

const STORAGE_KEY = "elena-active-profile-id";

function makeDefaultRewards(childProfileId: string): ChildRewardState {
  return {
    childProfileId,
    totalStars:    0,
    currentStreak: 0,
    longestStreak: 0,
    updatedAt:     new Date().toISOString(),
  };
}

function makeDefaultProgress(childProfileId: string): ChildProgress {
  return {
    childProfileId,
    currentLevel:    "developing",
    booksCompleted:  0,
    totalSessions:   0,
    totalMinutes:    0,
    totalWordsRead:  0,
    lastActiveAt:    new Date().toISOString(),
    updatedAt:       new Date().toISOString(),
  };
}

export default function ElenaChildWorkspace() {
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
    setProfile(null);
    setRewards(null);
    setProgress(null);
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
      {/* Tab content — fills available height above bottom nav */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "home" && (
          <HomeScreen
            profile={profile}
            rewards={rewards}
            progress={progress}
            onReset={handleReset}
            onLogSession={handleLogSession}
          />
        )}
        {activeTab === "library" && (
          <LibraryTab profile={profile} progress={progress} />
        )}
        {activeTab === "progress" && (
          <ProgressTab rewards={rewards} progress={progress} />
        )}
      </div>

      {/* Bottom nav */}
      <div className="flex-shrink-0 border-t border-white/10 bg-slate-950/80 backdrop-blur-sm">
        <div className="flex">
          {ELENA_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors ${
                activeTab === tab.id
                  ? "text-indigo-300 border-t-2 border-indigo-400"
                  : "text-slate-500 hover:text-slate-300 border-t-2 border-transparent"
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
