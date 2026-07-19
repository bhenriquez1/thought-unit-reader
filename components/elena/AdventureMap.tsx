// components/elena/AdventureMap.tsx
// Interactive Adventure Map — gamified world progression for Elena Mode.
// Worlds unlock by earning stars. Each world has 3 quests derived from
// rewards + progress state; no additional storage required.

import React, { useState } from "react";
import type { ChildRewardState, ChildProgress } from "@/lib/elena/types";

/* ─── World / quest definitions ──────────────────────────────────────────────── */

type Quest = {
  id:    string;
  label: string;
  done:  (r: ChildRewardState, p: ChildProgress | null) => boolean;
};

type World = {
  id:          string;
  emoji:       string;
  name:        string;
  tagline:     string;
  color:       string;      // Tailwind colour token (border/bg)
  starsNeeded: number;
  quests:      Quest[];
};

const WORLDS: World[] = [
  {
    id:          "forest",
    emoji:       "🌲",
    name:        "Reading Forest",
    tagline:     "Every adventure begins here!",
    color:       "emerald",
    starsNeeded: 0,
    quests: [
      { id: "f1", label: "Complete your first reading session",  done: (_, p) => (p?.totalSessions ?? 0) >= 1  },
      { id: "f2", label: "Earn 3 reading stars",                done: r => r.totalStars >= 3                  },
      { id: "f3", label: "Read for 3 days in a row",            done: r => r.longestStreak >= 3               },
    ],
  },
  {
    id:          "mountain",
    emoji:       "🏔️",
    name:        "Science Mountain",
    tagline:     "Discover how the world works!",
    color:       "sky",
    starsNeeded: 10,
    quests: [
      { id: "m1", label: "Earn 10 stars total",                 done: r => r.totalStars >= 10                 },
      { id: "m2", label: "Complete 5 reading sessions",         done: (_, p) => (p?.totalSessions ?? 0) >= 5  },
      { id: "m3", label: "Reach a 5-day reading streak",        done: r => r.longestStreak >= 5               },
    ],
  },
  {
    id:          "ocean",
    emoji:       "🌊",
    name:        "Ocean Explorer",
    tagline:     "Dive into deep-sea mysteries!",
    color:       "blue",
    starsNeeded: 25,
    quests: [
      { id: "o1", label: "Earn 25 stars total",                 done: r => r.totalStars >= 25                 },
      { id: "o2", label: "Complete 15 reading sessions",        done: (_, p) => (p?.totalSessions ?? 0) >= 15 },
      { id: "o3", label: "Finish your first book",              done: (_, p) => (p?.booksCompleted ?? 0) >= 1 },
    ],
  },
  {
    id:          "castle",
    emoji:       "🏰",
    name:        "History Castle",
    tagline:     "Travel back in time!",
    color:       "amber",
    starsNeeded: 50,
    quests: [
      { id: "c1", label: "Earn 50 stars total",                 done: r => r.totalStars >= 50                 },
      { id: "c2", label: "Complete 30 reading sessions",        done: (_, p) => (p?.totalSessions ?? 0) >= 30 },
      { id: "c3", label: "Finish 3 books",                      done: (_, p) => (p?.booksCompleted ?? 0) >= 3 },
    ],
  },
  {
    id:          "space",
    emoji:       "🚀",
    name:        "Space Station",
    tagline:     "Reach for the stars!",
    color:       "violet",
    starsNeeded: 100,
    quests: [
      { id: "s1", label: "Earn 100 stars total",                done: r => r.totalStars >= 100                },
      { id: "s2", label: "Complete 60 reading sessions",        done: (_, p) => (p?.totalSessions ?? 0) >= 60 },
      { id: "s3", label: "Achieve a 14-day reading streak",     done: r => r.longestStreak >= 14              },
    ],
  },
];

/* ─── Colour helpers ─────────────────────────────────────────────────────────── */

type ColourToken = typeof WORLDS[number]["color"];

const BORDER: Record<ColourToken, string> = {
  emerald: "border-emerald-400/50",
  sky:     "border-sky-400/50",
  blue:    "border-blue-400/50",
  amber:   "border-amber-400/50",
  violet:  "border-violet-400/50",
};
const BG: Record<ColourToken, string> = {
  emerald: "bg-emerald-500/15",
  sky:     "bg-sky-500/15",
  blue:    "bg-blue-500/15",
  amber:   "bg-amber-500/15",
  violet:  "bg-violet-500/15",
};
const TEXT: Record<ColourToken, string> = {
  emerald: "text-emerald-300",
  sky:     "text-sky-300",
  blue:    "text-blue-300",
  amber:   "text-amber-300",
  violet:  "text-violet-300",
};
const GLOW: Record<ColourToken, string> = {
  emerald: "shadow-emerald-500/30",
  sky:     "shadow-sky-500/30",
  blue:    "shadow-blue-500/30",
  amber:   "shadow-amber-500/30",
  violet:  "shadow-violet-500/30",
};

/* ─── Props ──────────────────────────────────────────────────────────────────── */

interface AdventureMapProps {
  rewards:  ChildRewardState;
  progress: ChildProgress | null;
}

/* ─── Component ──────────────────────────────────────────────────────────────── */

export default function AdventureMap({ rewards, progress }: AdventureMapProps) {
  const [openWorldId, setOpenWorldId] = useState<string | null>(null);

  // The current active world = last unlocked world
  const activeWorld = [...WORLDS]
    .reverse()
    .find(w => rewards.totalStars >= w.starsNeeded) ?? WORLDS[0];

  const nextWorld = WORLDS.find(w => rewards.totalStars < w.starsNeeded) ?? null;
  const starsToNext = nextWorld ? nextWorld.starsNeeded - rewards.totalStars : 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3">
        <h2 className="text-lg font-bold text-white leading-tight">🗺️ Adventure Map</h2>
        <p className="text-indigo-300/70 text-xs mt-0.5">
          {nextWorld
            ? `${starsToNext} more ⭐ to unlock ${nextWorld.name}`
            : "You've unlocked all worlds! 🏆"}
        </p>

        {/* Star progress toward next world */}
        {nextWorld && (
          <div className="mt-2">
            <div className="h-1.5 rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-yellow-400 to-orange-400 transition-all duration-700"
                style={{
                  width: `${Math.min(100, (rewards.totalStars / nextWorld.starsNeeded) * 100)}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
              <span>{rewards.totalStars} ⭐</span>
              <span>{nextWorld.starsNeeded} ⭐</span>
            </div>
          </div>
        )}
      </div>

      {/* World nodes */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <div className="relative">
          {/* Vertical connector path */}
          <div className="absolute left-[27px] top-10 bottom-10 w-0.5 border-l-2 border-dashed border-white/10 z-0" />

          <div className="space-y-3 relative z-10">
            {WORLDS.map((world, idx) => {
              const unlocked  = rewards.totalStars >= world.starsNeeded;
              const isActive  = world.id === activeWorld.id;
              const isOpen    = openWorldId === world.id;
              const quests    = world.quests.map(q => ({ ...q, completed: q.done(rewards, progress) }));
              const doneCount = quests.filter(q => q.completed).length;

              return (
                <div key={world.id}>
                  <button
                    onClick={() => unlocked && setOpenWorldId(isOpen ? null : world.id)}
                    disabled={!unlocked}
                    className={`w-full flex items-center gap-3 rounded-2xl border p-3 text-left transition-all ${
                      unlocked
                        ? `${BORDER[world.color]} ${BG[world.color]} hover:brightness-110 ${
                            isActive ? `shadow-lg ${GLOW[world.color]}` : ""
                          }`
                        : "border-white/8 bg-white/3 opacity-50 cursor-not-allowed"
                    }`}
                  >
                    {/* World node circle */}
                    <div className={`w-12 h-12 flex-shrink-0 rounded-full flex items-center justify-center text-2xl ${
                      unlocked ? `${BG[world.color]} border ${BORDER[world.color]}` : "bg-white/5 border border-white/10"
                    } ${isActive ? "ring-2 ring-white/30 ring-offset-1 ring-offset-transparent" : ""}`}>
                      <span className={unlocked ? "" : "grayscale"}>{world.emoji}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-sm ${unlocked ? "text-white" : "text-slate-500"}`}>
                          {world.name}
                        </span>
                        {isActive && (
                          <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${TEXT[world.color]} ${BG[world.color]} border ${BORDER[world.color]}`}>
                            Current
                          </span>
                        )}
                      </div>
                      <p className={`text-xs mt-0.5 ${unlocked ? "text-slate-400" : "text-slate-600"}`}>
                        {unlocked ? world.tagline : `🔒 Unlock at ${world.starsNeeded} ⭐`}
                      </p>
                      {unlocked && (
                        <div className="flex items-center gap-1 mt-1">
                          {quests.map(q => (
                            <span
                              key={q.id}
                              className={`w-2 h-2 rounded-full ${q.completed ? "bg-emerald-400" : "bg-white/20"}`}
                            />
                          ))}
                          <span className="text-[10px] text-slate-500 ml-1">{doneCount}/3 quests</span>
                        </div>
                      )}
                    </div>

                    {unlocked && (
                      <span className="text-slate-500 text-xs flex-shrink-0">{isOpen ? "▲" : "▼"}</span>
                    )}
                  </button>

                  {/* Quest drawer */}
                  {isOpen && unlocked && (
                    <div className={`mt-1 ml-15 rounded-2xl border ${BORDER[world.color]} bg-black/20 px-4 py-3 space-y-2`}
                      style={{ marginLeft: "60px" }}
                    >
                      <p className={`text-[10px] font-semibold uppercase tracking-wide ${TEXT[world.color]} mb-2`}>
                        Quests
                      </p>
                      {quests.map(q => (
                        <div key={q.id} className="flex items-start gap-2.5">
                          <span className={`flex-shrink-0 mt-0.5 text-sm ${q.completed ? "text-emerald-400" : "text-slate-600"}`}>
                            {q.completed ? "✅" : "⬜"}
                          </span>
                          <span className={`text-xs leading-snug ${q.completed ? "text-slate-400 line-through" : "text-slate-300"}`}>
                            {q.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Path segment between worlds */}
                  {idx < WORLDS.length - 1 && (
                    <div className="flex justify-center my-1">
                      <span className="text-white/15 text-xs">⋮</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
