"use client";

import React from "react";
import Link from "next/link";
import { DAT_SECTIONS } from "@/types/apex-exam";
import { DAT_PATTERN_MODULES, getModulesBySection } from "@/lib/apex/datApex.seed";
import { useApexEngineStore } from "@/lib/stores/apexEngineStore";
import TrainingArena from "@/components/apex/TrainingArena";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const MODE_LABELS: Record<string, string> = {
  quick: "Quick",
  mistake_review: "Mistake Review",
  pattern_drill: "Pattern Drill",
  section_test: "Section Test",
  full_sim: "Full Sim",
};

const SECTION_LABELS: Record<string, string> = {
  bio: "Bio",
  gc: "GC",
  orgo: "Orgo",
  pat: "PAT",
  rc: "RC",
  qr: "QR",
  mixed: "Mixed",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DATLearningHub() {
  const {
    sessions,
    scores,
    patterns,
    insights,
    projection,
    mistakes,
    traps,
    currentRecommendation,
  } = useApexEngineStore();

  // ── Derived metrics ────────────────────────────────────────────────────────

  // Deep Work: timed sessions (section_test or full_sim)
  const deepWorkCount = sessions.filter(
    (s) => s.mode === "section_test" || s.mode === "full_sim",
  ).length;

  // Patterns Ready: strong + mastered
  const patternsReady = patterns.filter(
    (p) => p.masteryLevel === "strong" || p.masteryLevel === "mastered",
  ).length;

  // Decision Accuracy: avg correct/seen across patterns that have been seen
  const seenPatterns = patterns.filter((p) => p.timesSeen > 0);
  const decisionAccuracy =
    seenPatterns.length > 0
      ? Math.round(
          (seenPatterns.reduce(
            (sum, p) => sum + p.timesCorrect / p.timesSeen,
            0,
          ) /
            seenPatterns.length) *
            100,
        )
      : 0;

  // DAT Projection
  const datProjection = projection?.totalProjected ?? null;
  const projDelta =
    scores.length >= 2
      ? Math.round(scores[0].percent - scores[1].percent)
      : null;

  // Strengths: top 3 mastered/strong patterns
  const strengthPatterns = [...patterns]
    .filter((p) => p.masteryLevel === "mastered" || p.masteryLevel === "strong")
    .sort((a, b) => b.readiness - a.readiness)
    .slice(0, 3);

  // Focus areas: learning/unstable patterns
  const focusPatterns = [...patterns]
    .filter(
      (p) => p.masteryLevel === "learning" || p.masteryLevel === "unstable",
    )
    .sort((a, b) => a.readiness - b.readiness)
    .slice(0, 3);

  // Top trap this week
  const weekCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentTraps = traps
    .filter((t) => new Date(t.lastTriggeredAt).getTime() > weekCutoff)
    .sort((a, b) => b.timesTriggered - a.timesTriggered);
  const topTrap = recentTraps[0] ?? null;

  // Recent sessions (last 5 with score data)
  const recentSessions = sessions.slice(0, 5);

  // AI insights (from store — engine-backed after first session)
  const aiInsights = insights;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-sm border-b border-blue-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">
                🧠 DAT Learning Hub
              </h1>
              <p className="text-blue-200 mt-1">
                Cognitive Command Center · Pattern Engine · Score Builder
              </p>
            </div>

            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                ← Back to Reader
              </Link>

              <div className="text-right">
                <div className="text-sm text-blue-200">Projection</div>
                <div className="text-xl font-bold text-green-400">
                  {datProjection ? datProjection : "—"}
                </div>
                <div className="text-xs text-gray-400">
                  {projection?.confidence
                    ? `${projection.confidence} confidence`
                    : "no data yet"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ── Top 4 stat cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {/* Deep Work */}
          <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-200 text-sm">Deep Work</p>
                <p className="text-2xl font-bold text-white">
                  {deepWorkCount}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  timed sessions
                </p>
              </div>
              <div className="text-purple-400 text-2xl">⏱️</div>
            </div>
          </div>

          {/* Patterns Ready */}
          <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-200 text-sm">Patterns Ready</p>
                <p className="text-2xl font-bold text-green-400">
                  {patternsReady}
                  <span className="text-base text-gray-400 font-normal">
                    /{patterns.length}
                  </span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  strong + mastered
                </p>
              </div>
              <div className="text-green-400 text-2xl">🧠</div>
            </div>
          </div>

          {/* Decision Accuracy */}
          <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-200 text-sm">Decision Accuracy</p>
                <p className="text-2xl font-bold text-orange-400">
                  {seenPatterns.length > 0 ? `${decisionAccuracy}%` : "—"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  rule selection avg
                </p>
              </div>
              <div className="text-orange-400 text-2xl">🎯</div>
            </div>
          </div>

          {/* DAT Projection */}
          <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-200 text-sm">DAT Projection</p>
                <p className="text-2xl font-bold text-blue-400">
                  {datProjection ? datProjection : "—"}
                </p>
                {projDelta !== null && (
                  <p
                    className={`text-xs mt-1 ${projDelta >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {projDelta >= 0 ? `+${projDelta}%` : `${projDelta}%`} vs
                    last
                  </p>
                )}
                {!projDelta && (
                  <p className="text-xs text-gray-400 mt-1">
                    {projection?.confidence ?? "start practicing"}
                  </p>
                )}
              </div>
              <div className="text-blue-400 text-2xl">📈</div>
            </div>
          </div>
        </div>

        {/* ── Next Action recommendation ───────────────────────────────────── */}
        {currentRecommendation && (
          <div className="mb-8 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 rounded-xl p-4 border border-indigo-500/30">
            <div className="flex items-start gap-3">
              <span className="text-yellow-400 text-lg mt-0.5">⚡</span>
              <div>
                <p className="text-white font-semibold text-sm">
                  Next Best Action
                </p>
                <p className="text-gray-300 text-sm mt-1">
                  {currentRecommendation.reason}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs bg-indigo-600/30 text-indigo-300 px-2 py-0.5 rounded">
                    {SECTION_LABELS[currentRecommendation.section] ??
                      currentRecommendation.section}
                  </span>
                  <span className="text-xs bg-purple-600/30 text-purple-300 px-2 py-0.5 rounded">
                    {MODE_LABELS[currentRecommendation.mode] ??
                      currentRecommendation.mode}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ── Main column ─────────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">
            {/* Quick Start */}
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
              <h2 className="text-xl font-bold text-white mb-4">
                🚀 Quick Start
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link
                  href="/apex/generator"
                  className="group bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 rounded-lg p-6 transition-all transform hover:scale-105"
                >
                  <div className="text-white">
                    <div className="text-2xl mb-2">📝</div>
                    <h3 className="text-lg font-semibold mb-2">
                      Create Practice Exam
                    </h3>
                    <p className="text-blue-100 text-sm">
                      Custom section · pattern density · difficulty · timed
                    </p>
                  </div>
                </Link>

                <Link
                  href="/apex/proctor?config=full-dat"
                  className="group bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 rounded-lg p-6 transition-all transform hover:scale-105"
                >
                  <div className="text-white">
                    <div className="text-2xl mb-2">⏰</div>
                    <h3 className="text-lg font-semibold mb-2">
                      Full DAT Simulation
                    </h3>
                    <p className="text-green-100 text-sm">
                      All sections · official timing · top trap analysis
                    </p>
                  </div>
                </Link>

                <Link
                  href="/apex/review"
                  className="group bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 rounded-lg p-6 transition-all transform hover:scale-105"
                >
                  <div className="text-white">
                    <div className="text-2xl mb-2">🧠</div>
                    <h3 className="text-lg font-semibold mb-2">
                      Review Mistakes
                    </h3>
                    <p className="text-purple-100 text-sm">
                      PDRM breakdown · pattern · trap · decision rule
                    </p>
                    {mistakes.length > 0 && (
                      <span className="inline-block mt-2 text-xs bg-white/20 px-2 py-0.5 rounded">
                        {mistakes.length} logged
                      </span>
                    )}
                  </div>
                </Link>

                <Link
                  href="/apex/generator?mode=quick"
                  className="group bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 rounded-lg p-6 transition-all transform hover:scale-105"
                >
                  <div className="text-white">
                    <div className="text-2xl mb-2">⚡</div>
                    <h3 className="text-lg font-semibold mb-2">
                      Quick Practice
                    </h3>
                    <p className="text-orange-100 text-sm">
                      Recognition · decision · speed — mixed 30q
                    </p>
                  </div>
                </Link>
              </div>
            </div>

            {/* Pattern Rules & Decision Making */}
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">
                  🎯 Pattern Rules & Decision Making
                </h2>
              </div>

              <p className="text-gray-300 text-sm mb-6">
                Each pattern tile shows your readiness, the trigger, decision
                rule, and common trap.
              </p>

              {/* Section grid — sourced from DAT_PATTERN_MODULES (single source of truth) */}
              {(() => {
                const SECTION_CONFIG: Array<{
                  id: "bio" | "gc" | "orgo" | "pat" | "rc" | "qr";
                  label: string;
                  gradient: string;
                  border: string;
                }> = [
                  { id: "bio",  label: "Biology",              gradient: "from-purple-600/20 to-violet-600/20",  border: "border-purple-500/30" },
                  { id: "gc",   label: "General Chemistry",    gradient: "from-blue-600/20 to-cyan-600/20",      border: "border-blue-500/30"   },
                  { id: "orgo", label: "Organic Chemistry",    gradient: "from-green-600/20 to-emerald-600/20",  border: "border-green-500/30"  },
                  { id: "pat",  label: "PAT",                  gradient: "from-yellow-600/20 to-orange-600/20",  border: "border-yellow-500/30" },
                  { id: "rc",   label: "Reading Comprehension",gradient: "from-pink-600/20 to-rose-600/20",      border: "border-pink-500/30"   },
                  { id: "qr",   label: "QR / Math",            gradient: "from-teal-600/20 to-cyan-600/20",     border: "border-teal-500/30"   },
                ];
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {SECTION_CONFIG.map((sec) => {
                      const sectionModules = getModulesBySection(sec.id);
                      const sectionPatterns = patterns.filter((p) => p.section === sec.id);
                      const seenInSection = sectionPatterns.filter((p) => p.timesSeen > 0);
                      const avgReadiness = seenInSection.length
                        ? Math.round(seenInSection.reduce((s, p) => s + p.readiness, 0) / seenInSection.length)
                        : null;
                      return (
                        <div key={sec.id} className={`bg-gradient-to-br ${sec.gradient} rounded-lg p-4 border ${sec.border}`}>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-white">{sec.label}</h3>
                            <div className="flex items-center gap-2">
                              {avgReadiness !== null && (
                                <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-green-300">
                                  {avgReadiness}% ready
                                </span>
                              )}
                              <span className="text-xs bg-white/10 px-2 py-1 rounded text-gray-300">
                                {sectionModules.length} patterns
                              </span>
                            </div>
                          </div>
                          <div className="space-y-2 mb-4">
                            {sectionModules.slice(0, 2).map((m) => {
                              const sp = patterns.find((p) => p.id === m.id);
                              return (
                                <div key={m.id} className="text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="text-white font-medium">• {m.name}</span>
                                    {sp && sp.timesSeen > 0 && (
                                      <span className={`text-xs px-1 rounded ${
                                        sp.masteryLevel === "mastered" ? "bg-green-500/20 text-green-300"
                                          : sp.masteryLevel === "strong" ? "bg-blue-500/20 text-blue-300"
                                          : sp.masteryLevel === "unstable" ? "bg-yellow-500/20 text-yellow-300"
                                          : "bg-red-500/20 text-red-300"
                                      }`}>{sp.masteryLevel}</span>
                                    )}
                                  </div>
                                  <p className="text-gray-400 text-xs mt-0.5 ml-3">
                                    Trap: {m.trap.slice(0, 60)}{m.trap.length > 60 ? "…" : ""}
                                  </p>
                                </div>
                              );
                            })}
                            {sectionModules.length > 2 && (
                              <div className="text-xs text-gray-400">+{sectionModules.length - 2} more patterns</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/apex/patterns?section=${sec.id}`}
                              className="flex-1 text-center px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded text-xs transition-colors"
                            >
                              Study Patterns
                            </Link>
                            <Link
                              href={`/apex/generator?section=${sec.id}`}
                              className="flex-1 text-center px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded text-xs transition-colors"
                            >
                              Practice
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Pattern Spotlight — top 3 modules with lowest store readiness (priority focus) */}
              {(() => {
                const spotlight = [...DAT_PATTERN_MODULES]
                  .map((m) => {
                    const sp = patterns.find((p) => p.id === m.id);
                    return { m, readiness: sp?.readiness ?? 0, timesSeen: sp?.timesSeen ?? 0 };
                  })
                  .filter((x) => x.timesSeen === 0 || x.readiness < 70)
                  .slice(0, 3);
                if (!spotlight.length) return null;
                return (
                  <div className="bg-gradient-to-r from-yellow-600/10 to-orange-600/10 rounded-lg p-4 border border-yellow-500/30 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">⭐</span>
                      <h3 className="font-semibold text-yellow-300">Priority Pattern Focus</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {spotlight.map(({ m, readiness, timesSeen }) => (
                        <div key={m.id} className="bg-black/20 rounded-lg p-3 border border-gray-600/30">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-medium text-white text-sm">{m.name}</h4>
                            {timesSeen > 0 && (
                              <span className={`text-xs ${readiness < 50 ? "text-rose-400" : "text-yellow-400"}`}>
                                {readiness}%
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mb-1">
                            <span className="text-purple-400">Pattern:</span> {m.pattern.slice(0, 50)}{m.pattern.length > 50 ? "…" : ""}
                          </p>
                          <p className="text-xs text-rose-400/80 mb-3">
                            Trap: {m.trap.slice(0, 50)}{m.trap.length > 50 ? "…" : ""}
                          </p>
                          <Link
                            href={`/apex/generator?section=${m.section}`}
                            className="text-xs px-2 py-1 bg-green-600/30 text-green-200 rounded hover:bg-green-600/40 transition-colors"
                          >
                            Practice Now
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/apex/patterns/decision-tree"
                  className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-all"
                >
                  🌳 Interactive Decision Trees
                </Link>
                <Link
                  href="/apex/patterns/flashcards"
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-sm font-medium transition-all"
                >
                  🃏 Pattern Flashcards
                </Link>
                <Link
                  href="/apex/generator?mode=pattern-focused"
                  className="px-4 py-2 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white rounded-lg text-sm font-medium transition-all"
                >
                  🎯 Pattern-Focused Practice
                </Link>
              </div>
            </div>

            {/* DAT Sections Overview */}
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
              <h2 className="text-xl font-bold text-white mb-4">
                📚 DAT Sections
              </h2>

              <div className="space-y-4">
                {DAT_SECTIONS.map((section) => {
                  const sectionScore = projection?.sectionProjected?.[
                    section.id as keyof typeof projection.sectionProjected
                  ];
                  return (
                    <div
                      key={section.id}
                      className="bg-black/20 rounded-lg p-4 border border-gray-600/30"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-white">
                          {section.name}
                        </h3>
                        <div className="flex items-center gap-3">
                          {sectionScore && (
                            <span className="text-sm font-bold text-blue-300">
                              {sectionScore}
                            </span>
                          )}
                          <span className="text-sm text-blue-300">
                            {section.shortName}
                          </span>
                        </div>
                      </div>

                      <p className="text-gray-300 text-sm mb-3">
                        {section.description}
                      </p>

                      <div className="flex items-center justify-between text-sm">
                        <div className="text-gray-400">
                          {section.questionCount} questions ·{" "}
                          {section.timeLimit} minutes
                        </div>

                        <Link
                          href={`/apex/generator?section=${section.id}`}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs transition-colors"
                        >
                          Practice {section.shortName}
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── DAT Training Arena ────────────────────────────────────── */}
            <TrainingArena />
          </div>

          {/* ── Sidebar ─────────────────────────────────────────────────────── */}
          <div className="space-y-6">
            {/* Performance Overview */}
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
              <h2 className="text-lg font-bold text-white mb-4">
                📊 Performance
              </h2>

              {strengthPatterns.length > 0 ? (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-green-400 mb-2">
                    💪 Strengths
                  </h3>
                  <div className="space-y-1">
                    {strengthPatterns.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-gray-300">{p.name}</span>
                        <span className="text-xs text-green-400">
                          {p.readiness}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400 mb-4">
                  Complete practice sessions to identify strengths.
                </p>
              )}

              {focusPatterns.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-red-400 mb-2">
                    🎯 Focus Areas
                  </h3>
                  <div className="space-y-1">
                    {focusPatterns.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-gray-300">{p.name}</span>
                        <span
                          className={`text-xs ${p.masteryLevel === "unstable" ? "text-yellow-400" : "text-red-400"}`}
                        >
                          {p.readiness}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {topTrap && (
                <div className="pt-3 border-t border-gray-600/30">
                  <h3 className="text-sm font-semibold text-orange-400 mb-1">
                    ⚠️ Top Trap This Week
                  </h3>
                  <p className="text-xs text-gray-300">{topTrap.description}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Triggered {topTrap.timesTriggered}× ·{" "}
                    {SECTION_LABELS[topTrap.section] ?? topTrap.section}
                  </p>
                </div>
              )}

              {/* Section projection mini-table */}
              {projection && (
                <div className="pt-3 border-t border-gray-600/30 mt-3">
                  <h3 className="text-sm font-semibold text-blue-300 mb-2">
                    Section Projections
                  </h3>
                  {(
                    Object.entries(projection.sectionProjected) as [
                      string,
                      number,
                    ][]
                  ).map(([sec, score]) => (
                    <div
                      key={sec}
                      className="flex items-center justify-between text-xs py-0.5"
                    >
                      <span className="text-gray-400 uppercase">{sec}</span>
                      <span className="text-white font-medium">{score}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Sessions */}
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
              <h2 className="text-lg font-bold text-white mb-4">
                📅 Recent Sessions
              </h2>

              {recentSessions.length === 0 ? (
                <p className="text-xs text-gray-400">
                  No sessions yet. Start a practice session to track progress.
                </p>
              ) : (
                <div className="space-y-3">
                  {recentSessions.map((session) => {
                    const pct =
                      session.total > 0
                        ? Math.round((session.correct / session.total) * 100)
                        : null;
                    return (
                      <div
                        key={session.id}
                        className="flex items-center justify-between py-2 border-b border-gray-600/30 last:border-b-0"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs bg-blue-600/20 text-blue-300 px-1.5 py-0.5 rounded uppercase">
                              {SECTION_LABELS[session.section] ??
                                session.section}
                            </span>
                            <span className="text-xs text-gray-400">
                              {MODE_LABELS[session.mode] ?? session.mode}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {formatDate(session.startedAt)} ·{" "}
                            {formatSeconds(session.durationSeconds)}
                          </div>
                        </div>

                        <div className="text-right">
                          {pct !== null && (
                            <div
                              className={`text-sm font-semibold ${pct >= 75 ? "text-green-400" : pct >= 50 ? "text-yellow-400" : "text-red-400"}`}
                            >
                              {pct}%
                            </div>
                          )}
                          <div className="text-xs text-gray-500">
                            {session.correct}/{session.total}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* AI Insights */}
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
              <h2 className="text-lg font-bold text-white mb-4">
                🤖 AI Insights
              </h2>

              <div className="space-y-3">
                {aiInsights.map((insight, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-3 bg-blue-600/10 rounded-lg border border-blue-500/20"
                  >
                    <span className="text-blue-400 text-sm">💡</span>
                    <p className="text-sm text-gray-300 flex-1">{insight}</p>
                  </div>
                ))}
              </div>

              {insights.length === 1 && insights[0].startsWith("Complete") && (
                <div className="mt-4 pt-4 border-t border-gray-600/30 text-xs text-gray-500">
                  Engine recalculates after each session.
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
              <h2 className="text-lg font-bold text-white mb-4">
                ⚡ Quick Actions
              </h2>

              <div className="space-y-3">
                <Link
                  href="/apex/review"
                  className="block w-full px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-200 rounded-lg text-sm transition-colors"
                >
                  📚 PDRM Mistake Review
                  {mistakes.length > 0 && (
                    <span className="ml-2 text-xs bg-red-500/30 px-1.5 py-0.5 rounded">
                      {mistakes.length}
                    </span>
                  )}
                </Link>

                <Link
                  href="/apex/generator?mode=weak-topics"
                  className="block w-full px-4 py-2 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 text-orange-200 rounded-lg text-sm transition-colors"
                >
                  🎯 Practice Weak Patterns
                </Link>

                <Link
                  href="/apex/proctor?config=timed-practice"
                  className="block w-full px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-200 rounded-lg text-sm transition-colors"
                >
                  ⏱️ Timed Section Test
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
