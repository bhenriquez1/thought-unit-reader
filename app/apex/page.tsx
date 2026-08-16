"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TrainingArena from "@/components/apex/TrainingArena";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ACTIVE_DAT_BLUEPRINT } from "@/lib/datApex/activeBlueprint";
import { listAttempts, loadReadinessState } from "@/lib/datApex/idbStore";
import { totalBlueprintItems, totalTestingMinutes } from "@/lib/datApex/blueprint";
import { useApexEngineStore } from "@/lib/stores/apexEngineStore";
import { generateWeakTopicsPracticeExam, generateFullSimulationExam } from "@/lib/examEngine/profileGeneration";
import { savePendingExam } from "@/lib/db/examStore";
import { safeSetItem } from "@/lib/storage/safeStorage";
import type { DatAttempt, DatReadinessState } from "@/lib/datApex/types";

/* ─── Tab config ──────────────────────────────────────────────────────────── */

type TabId = "today" | "learn" | "practice" | "exams" | "mistakes" | "readiness" | "history";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "today",     label: "Today",             icon: "🎯" },
  { id: "learn",     label: "Learn & Improve",   icon: "🧠" },
  { id: "practice",  label: "Practice",          icon: "⚡" },
  { id: "exams",     label: "Full-Length Exams", icon: "📋" },
  { id: "mistakes",  label: "Review Mistakes",   icon: "🔍" },
  { id: "readiness", label: "Readiness",         icon: "📊" },
  { id: "history",   label: "History",           icon: "📅" },
];

/* ─── Display maps ────────────────────────────────────────────────────────── */

const SECTION_DISPLAY: Record<string, { label: string; short: string; colorClass: string }> = {
  "biology":               { label: "Biology",               short: "Bio", colorClass: "text-purple-400" },
  "general-chemistry":     { label: "General Chemistry",     short: "GC",  colorClass: "text-blue-400"   },
  "organic-chemistry":     { label: "Organic Chemistry",     short: "OC",  colorClass: "text-green-400"  },
  "perceptual-ability":    { label: "Perceptual Ability",    short: "PAT", colorClass: "text-yellow-400" },
  "reading-comprehension": { label: "Reading Comprehension", short: "RC",  colorClass: "text-pink-400"   },
  "quantitative-reasoning":{ label: "Quantitative Reasoning",short: "QR",  colorClass: "text-teal-400"   },
};

const BAND_INFO: Record<string, { label: string; color: string; bg: string }> = {
  "foundation":  { label: "Foundation",  color: "text-gray-300",   bg: "bg-gray-600/20"   },
  "developing":  { label: "Developing",  color: "text-yellow-300", bg: "bg-yellow-600/20" },
  "competitive": { label: "Competitive", color: "text-blue-300",   bg: "bg-blue-600/20"   },
  "strong":      { label: "Strong",      color: "text-green-300",  bg: "bg-green-600/20"  },
  "exam-ready":  { label: "Exam Ready",  color: "text-emerald-300",bg: "bg-emerald-600/20"},
};

/* ─── Today tab ───────────────────────────────────────────────────────────── */

function TodayTab() {
  const { sessions, scores, patterns, projection, currentRecommendation, adaptiveDifficulty, insights } = useApexEngineStore();
  const router = useRouter();
  const [launching, setLaunching] = useState(false);
  const cancelRef = useRef(false);
  useEffect(() => {
    cancelRef.current = false;
    return () => { cancelRef.current = true; };
  }, []);

  const handleStartRecommended = useCallback(async () => {
    if (!currentRecommendation) return;
    setLaunching(true);
    try {
      const exam = await generateWeakTopicsPracticeExam(
        patterns,
        currentRecommendation.targetPatterns,
        20,
        adaptiveDifficulty,
      );
      if (cancelRef.current) return;
      const examId = `recommended-${Date.now()}`;
      await savePendingExam(examId, exam);
      if (cancelRef.current) return;
      safeSetItem("currentExam", JSON.stringify(exam));
      router.push(`/apex/proctor?examId=${examId}`);
    } catch {
      if (!cancelRef.current) setLaunching(false);
    }
  }, [currentRecommendation, patterns, adaptiveDifficulty, router]);

  const bp         = ACTIVE_DAT_BLUEPRINT;
  const totalItems = totalBlueprintItems(bp);
  const testMins   = totalTestingMinutes(bp);

  const patternsReady = patterns.filter(p => p.masteryLevel === "strong" || p.masteryLevel === "mastered").length;
  const seenPatterns  = patterns.filter(p => p.timesSeen > 0);
  const decisionAcc   = seenPatterns.length > 0
    ? Math.round(seenPatterns.reduce((s, p) => s + p.timesCorrect / p.timesSeen, 0) / seenPatterns.length * 100)
    : null;

  return (
    <div className="space-y-6">
      {/* Blueprint snapshot */}
      <div className="bg-black/30 rounded-xl p-5 border border-blue-500/20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Blueprint v{bp.version}</h2>
          <span className="text-xs text-gray-400">Effective {bp.effectiveDate}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {[
            { label: "Total Items",   value: String(totalItems),           sub: "across all sections"          },
            { label: "Testing Time",  value: `${testMins} min`,            sub: "excl. tutorial"               },
            { label: "Tutorial",      value: `${bp.tutorialMinutes} min`,  sub: "before exam"                  },
            { label: "Break",         value: `${bp.breaks[0]?.durationMinutes ?? 0} min`, sub: "after PAT (optional)" },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-white/5 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-white">{value}</div>
              <div className="text-xs text-blue-200 font-medium mt-0.5">{label}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {bp.sections.map(sec => (
            <div key={sec.family} className="flex items-center justify-between text-sm py-1 border-b border-white/5 last:border-b-0">
              <span className="text-gray-300 font-medium">{sec.label}</span>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span>{sec.totalItemCount} items</span>
                <span>{sec.timeLimitMinutes} min</span>
                {sec.subSections.length > 1 && (
                  <span className="text-gray-500">
                    ({sec.subSections.map(ss => SECTION_DISPLAY[ss.id]?.short ?? ss.id).join(" · ")})
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Sessions",          value: String(sessions.length),                              color: "text-white",       sub: "total"                    },
          { label: "Patterns Ready",    value: `${patternsReady}/${patterns.length}`,                color: "text-green-400",   sub: "strong or mastered"       },
          { label: "Decision Accuracy", value: decisionAcc !== null ? `${decisionAcc}%` : "—",       color: "text-orange-400",  sub: "avg across patterns"      },
          { label: "Score Projection",  value: projection?.totalProjected ? String(projection.totalProjected) : "—", color: "text-blue-400", sub: projection?.confidence ?? "start practicing" },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="bg-black/30 rounded-xl p-5 border border-blue-500/20">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-blue-200 font-medium mt-1">{label}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {currentRecommendation && (
        <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/20 rounded-xl p-4 border border-indigo-500/30">
          <div className="flex items-start gap-3">
            <span className="text-yellow-400 text-lg mt-0.5">⚡</span>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm">Next Best Action</p>
              <p className="text-gray-300 text-sm mt-1">{currentRecommendation.reason}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-xs bg-indigo-600/30 text-indigo-300 px-2 py-0.5 rounded">
                  {SECTION_DISPLAY[currentRecommendation.section]?.short ?? currentRecommendation.section}
                </span>
                <span className="text-xs bg-purple-600/30 text-purple-300 px-2 py-0.5 rounded">
                  {currentRecommendation.mode}
                </span>
                {adaptiveDifficulty !== 'mixed' && (
                  <span className="text-xs bg-orange-600/30 text-orange-300 px-2 py-0.5 rounded">
                    {adaptiveDifficulty}
                  </span>
                )}
                <button
                  onClick={handleStartRecommended}
                  disabled={launching}
                  className="ml-auto px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded text-xs font-semibold transition-colors"
                >
                  {launching ? "Loading…" : "Start Now"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: "/apex/generator",            label: "Create Practice Exam",  icon: "📝", color: "from-blue-600 to-blue-700"   },
          { href: "/apex/proctor?config=full",  label: "Full DAT Simulation",   icon: "⏰", color: "from-green-600 to-green-700"  },
          { href: "/apex/review",               label: "Review Mistakes",       icon: "🔍", color: "from-purple-600 to-purple-700" },
          { href: "/apex/generator?mode=quick", label: "Quick Practice (30q)",  icon: "⚡", color: "from-orange-600 to-orange-700" },
        ].map(({ href, label, icon, color }) => (
          <Link
            key={href}
            href={href}
            className={`bg-gradient-to-r ${color} rounded-lg p-4 text-white hover:opacity-90 transition-opacity`}
          >
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-sm font-semibold">{label}</div>
          </Link>
        ))}
      </div>

      {insights.length > 0 && (
        <div className="bg-black/30 rounded-xl p-5 border border-blue-500/20">
          <h3 className="text-sm font-bold text-white mb-3">🤖 AI Insights</h3>
          <div className="space-y-2">
            {insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-gray-300">
                <span className="text-blue-400 shrink-0">💡</span>
                <p>{insight}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Practice tab ────────────────────────────────────────────────────────── */

// Maps canonical DatSectionId → legacy ApexEngineStore section key
const LEGACY_SECTION_MAP: Record<string, string> = {
  "biology":               "bio",
  "general-chemistry":     "gc",
  "organic-chemistry":     "orgo",
  "perceptual-ability":    "pat",
  "reading-comprehension": "rc",
  "quantitative-reasoning":"qr",
};

function PracticeTab() {
  const { patterns } = useApexEngineStore();
  const bp = ACTIVE_DAT_BLUEPRINT;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {bp.sections.flatMap(sec =>
          sec.subSections.map(ss => {
            const display   = SECTION_DISPLAY[ss.id] ?? { label: ss.id, short: ss.id, colorClass: "text-gray-400" };
            const legacyId  = LEGACY_SECTION_MAP[ss.id] ?? ss.id;
            const secPats   = patterns.filter(p => p.section === legacyId);
            const seen      = secPats.filter(p => p.timesSeen > 0);
            const mastered  = seen.filter(p => p.masteryLevel === "mastered" || p.masteryLevel === "strong").length;
            const avgReady  = seen.length
              ? Math.round(seen.reduce((s, p) => s + p.readiness, 0) / seen.length)
              : null;

            return (
              <div key={ss.id} className="bg-black/30 rounded-xl p-5 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className={`font-semibold ${display.colorClass}`}>{display.label}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {ss.itemCount} items · shared block {sec.timeLimitMinutes} min
                    </p>
                  </div>
                  {avgReady !== null && (
                    <span className={`text-sm font-bold ${avgReady >= 75 ? "text-emerald-400" : avgReady >= 50 ? "text-yellow-400" : "text-rose-400"}`}>
                      {avgReady}%
                    </span>
                  )}
                </div>

                {avgReady !== null && (
                  <>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-2">
                      <div
                        className={`h-full rounded-full ${avgReady >= 75 ? "bg-emerald-500" : avgReady >= 50 ? "bg-yellow-500" : "bg-rose-500"}`}
                        style={{ width: `${avgReady}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-500 mb-3">
                      {mastered}/{seen.length} patterns mastered or strong
                    </p>
                  </>
                )}

                <div className="flex gap-2 mt-2">
                  <Link
                    href={`/apex/patterns?section=${ss.id}`}
                    className="flex-1 text-center px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded text-xs transition-colors"
                  >
                    Study Patterns
                  </Link>
                  <Link
                    href={`/apex/generator?section=${legacyId}`}
                    className="flex-1 text-center px-3 py-2 bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 rounded text-xs transition-colors"
                  >
                    Practice
                  </Link>
                </div>
              </div>
            );
          }),
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {[
          { href: "/apex/generator",               label: "📝 Build Custom Exam",         color: "from-blue-600 to-purple-600"   },
          { href: "/apex/patterns/decision-tree",  label: "🌳 Interactive Decision Trees", color: "from-indigo-600 to-purple-600" },
          { href: "/apex/patterns/flashcards",     label: "🃏 Pattern Flashcards",         color: "from-emerald-600 to-teal-600"  },
        ].map(({ href, label, color }) => (
          <Link
            key={href}
            href={href}
            className={`px-4 py-2 bg-gradient-to-r ${color} hover:opacity-90 text-white rounded-lg text-sm font-medium transition-opacity`}
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ─── Full-Length Exams tab ───────────────────────────────────────────────── */

function FullExamsTab() {
  const bp = ACTIVE_DAT_BLUEPRINT;
  const router = useRouter();
  const [seeding, setSeeding]       = useState(false);
  const [seedError, setSeedError]   = useState<string | null>(null);
  const [inProgress, setInProgress] = useState(false);
  const cancelRef = useRef(false);
  useEffect(() => {
    cancelRef.current = false;
    return () => { cancelRef.current = true; };
  }, []);

  // Check if there's a paused exam in localStorage
  useEffect(() => {
    setInProgress(!!localStorage.getItem("examProgress"));
  }, []);

  const handleStartSimulation = useCallback(async (prometric: boolean) => {
    setSeeding(true);
    setSeedError(null);
    try {
      const exam = await generateFullSimulationExam();
      if (cancelRef.current) return;
      const examId = `simulation-${Date.now()}`;
      await savePendingExam(examId, exam);
      if (cancelRef.current) return;
      safeSetItem("currentExam", JSON.stringify(exam));
      router.push(prometric ? `/apex/proctor?examId=${examId}&prometric=1` : `/apex/proctor?examId=${examId}`);
    } catch {
      if (!cancelRef.current) {
        setSeedError("Could not prepare the exam. Please try again.");
        setSeeding(false);
      }
    }
  }, [router]);

  const handleResume = useCallback(() => {
    const progress = localStorage.getItem("examProgress");
    if (!progress) return;
    try {
      const saved = JSON.parse(progress);
      if (saved.exam) safeSetItem("currentExam", JSON.stringify(saved.exam));
      router.push("/apex/proctor");
    } catch {
      setSeedError("Could not resume the saved exam. It may be corrupted.");
    }
  }, [router]);

  return (
    <div className="space-y-6">
      {/* Resume banner */}
      {inProgress && (
        <div className="bg-amber-900/30 border border-amber-500/40 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-amber-200">📌 Exam In Progress</div>
            <div className="text-xs text-amber-300/70 mt-0.5">You have an unfinished exam saved. Resume where you left off.</div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={handleResume}
              className="text-sm px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg transition-colors"
            >
              Resume →
            </button>
            <button
              onClick={() => { localStorage.removeItem("examProgress"); localStorage.removeItem("currentExam"); setInProgress(false); }}
              className="text-sm px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Full simulation panel */}
      <div className="bg-black/30 rounded-xl p-5 border border-blue-500/20">
        <div className="flex items-start justify-between mb-1 gap-4">
          <h2 className="text-lg font-bold text-white">Full-Length DAT Simulation</h2>
          <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wide bg-green-900/40 text-green-300 border border-green-600/30 px-2 py-0.5 rounded-full">
            Official Format
          </span>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          All sections in order · {bp.breaks[0]?.durationMinutes ?? 15}-min optional break after PAT · {bp.totalAdministrationMinutes} min total
        </p>

        <div className="space-y-2 mb-5">
          {bp.sections.map((sec, idx) => (
            <div key={sec.family} className="flex items-center justify-between py-2 border-b border-white/5 last:border-b-0 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 tabular-nums text-xs">{idx + 1}.</span>
                <span className="text-gray-300">{sec.label}</span>
              </div>
              <span className="text-gray-400 text-xs tabular-nums">{sec.totalItemCount} items · {sec.timeLimitMinutes} min</span>
            </div>
          ))}
          {bp.breaks.map((brk, i) => (
            <div key={i} className="text-xs italic text-yellow-300/60 py-1 flex items-center gap-1">
              <span>☕</span>
              <span>Optional {brk.durationMinutes}-min break after PAT</span>
            </div>
          ))}
        </div>

        {seedError && <p className="mb-3 text-sm text-red-400">{seedError}</p>}

        <div className="flex gap-3">
          <button
            onClick={() => handleStartSimulation(false)}
            disabled={seeding}
            className="flex-1 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-opacity text-sm"
          >
            {seeding ? "⏳ Preparing…" : "Start Practice Simulation"}
          </button>
          <button
            onClick={() => handleStartSimulation(true)}
            disabled={seeding}
            title="No pausing, section-locked — mirrors the real DAT testing center"
            className="flex-1 py-3 bg-gradient-to-r from-red-700 to-rose-700 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-opacity text-sm"
          >
            {seeding ? "⏳ Preparing…" : "🏛 Prometric Mode"}
          </button>
        </div>
        <p className="text-[10px] text-gray-500 mt-2 text-center">
          Prometric Mode: no pause, section-locked, auto-submits — just like the real test center
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Section Test",     desc: "One section, timed",              href: "/apex/generator?mode=section_test", icon: "🎯", color: "from-blue-600/20 to-blue-700/20",     border: "border-blue-500/30"   },
          { label: "Timed Practice",   desc: "Mixed questions, real pacing",    href: "/apex/generator?mode=timed",        icon: "⏱️", color: "from-purple-600/20 to-purple-700/20", border: "border-purple-500/30" },
          { label: "Foundation Drill", desc: "Concept-by-concept, no pressure", href: "/apex/generator?mode=foundation",   icon: "🌱", color: "from-green-600/20 to-green-700/20",   border: "border-green-500/30"  },
        ].map(({ label, desc, href, icon, color, border }) => (
          <Link
            key={label}
            href={href}
            className={`bg-gradient-to-br ${color} rounded-xl p-5 border ${border} hover:opacity-90 transition-opacity block`}
          >
            <div className="text-2xl mb-2">{icon}</div>
            <div className="font-semibold text-white text-sm">{label}</div>
            <p className="text-xs text-gray-400 mt-1">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ─── Review Mistakes tab ─────────────────────────────────────────────────── */

function MistakesTab() {
  const { mistakes } = useApexEngineStore();

  if (mistakes.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">✅</div>
        <p className="text-gray-400 text-sm">No mistakes recorded yet.</p>
        <p className="text-gray-500 text-xs mt-1">Complete practice sessions to populate this section.</p>
        <Link
          href="/apex/generator?mode=quick"
          className="inline-block mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
        >
          Start Practicing
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">PDRM Mistake Review</h2>
        <span className="text-xs bg-rose-600/20 text-rose-300 px-2 py-0.5 rounded border border-rose-500/30">
          {mistakes.length} logged
        </span>
      </div>
      {mistakes.map(m => (
        <div key={m.id} className="bg-black/30 rounded-xl p-4 border border-rose-500/20 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-rose-300 uppercase tracking-wide">
              {m.reasonMissed.replace(/_/g, " ")}
            </span>
            <span className="text-[10px] text-gray-500">{m.createdAt.slice(0, 10)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-purple-400 font-medium">Pattern</span>
              <p className="text-gray-300 mt-0.5">{m.pdrm.pattern}</p>
            </div>
            <div>
              <span className="text-blue-400 font-medium">Decision Rule</span>
              <p className="text-gray-300 mt-0.5">{m.pdrm.decisionRule}</p>
            </div>
            <div>
              <span className="text-green-400 font-medium">Why Correct</span>
              <p className="text-gray-300 mt-0.5">{m.pdrm.reason}</p>
            </div>
            <div>
              <span className="text-rose-400 font-medium">Miss</span>
              <p className="text-gray-300 mt-0.5">{m.pdrm.miss}</p>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>
              You: <span className="text-rose-300">{m.userAnswer}</span>
              {" → "}
              Correct: <span className="text-emerald-300">{m.correctAnswer}</span>
            </span>
            <span className="bg-white/5 px-2 py-0.5 rounded uppercase">
              {SECTION_DISPLAY[m.section]?.short ?? m.section}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Readiness tab ───────────────────────────────────────────────────────── */

function ReadinessTab() {
  const [idbState, setIdbState] = useState<DatReadinessState | null>(null);
  const [loading, setLoading]   = useState(true);
  const { patterns, projection } = useApexEngineStore();

  useEffect(() => {
    let alive = true;
    loadReadinessState("default")
      .then(s => { if (alive) setIdbState(s); })
      .catch(() => { if (alive) setIdbState(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const LEGACY_IDS = [
    { id: "bio",  fullId: "biology",                label: "Biology"               },
    { id: "gc",   fullId: "general-chemistry",      label: "General Chemistry"     },
    { id: "orgo", fullId: "organic-chemistry",      label: "Organic Chemistry"     },
    { id: "pat",  fullId: "perceptual-ability",     label: "Perceptual Ability"    },
    { id: "rc",   fullId: "reading-comprehension",  label: "Reading Comprehension" },
    { id: "qr",   fullId: "quantitative-reasoning", label: "Quantitative Reasoning"},
  ];

  return (
    <div className="space-y-6">
      <div className="bg-black/30 rounded-xl p-5 border border-blue-500/20">
        <h2 className="text-lg font-bold text-white mb-4">Pattern Readiness by Section</h2>
        <div className="space-y-3">
          {LEGACY_IDS.map(({ id, fullId, label }) => {
            const secPats  = patterns.filter(p => p.section === id);
            const seen     = secPats.filter(p => p.timesSeen > 0);
            const mastered = seen.filter(p => p.masteryLevel === "mastered" || p.masteryLevel === "strong").length;
            const avgReady = seen.length
              ? Math.round(seen.reduce((s, p) => s + p.readiness, 0) / seen.length)
              : null;
            const display  = SECTION_DISPLAY[fullId];

            return (
              <div key={id}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-medium ${display?.colorClass ?? "text-gray-300"}`}>{label}</span>
                  <span className={`text-sm font-bold ${avgReady === null ? "text-gray-500" : avgReady >= 75 ? "text-emerald-400" : avgReady >= 50 ? "text-yellow-400" : "text-rose-400"}`}>
                    {avgReady !== null ? `${avgReady}%` : "—"}
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${avgReady === null ? "bg-transparent" : avgReady >= 75 ? "bg-emerald-500" : avgReady >= 50 ? "bg-yellow-500" : "bg-rose-500"}`}
                    style={{ width: `${avgReady ?? 0}%` }}
                  />
                </div>
                {seen.length > 0 && (
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {mastered}/{seen.length} patterns at strong or mastered · {secPats.length - seen.length} not started
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {projection && (
        <div className="bg-black/30 rounded-xl p-5 border border-blue-500/20">
          <h2 className="text-lg font-bold text-white mb-3">Score Projection</h2>
          <div className="flex items-center gap-4 mb-4">
            <div className="text-3xl font-bold text-blue-400">{projection.totalProjected ?? "—"}</div>
            <div className="text-xs text-gray-400">{projection.confidence} confidence</div>
          </div>
          {projection.sectionProjected && (
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(projection.sectionProjected) as [string, number][]).map(([sec, score]) => (
                <div key={sec} className="bg-white/5 rounded-lg p-2 text-center">
                  <div className="text-sm font-bold text-white">{score}</div>
                  <div className="text-[10px] text-gray-400 uppercase">{sec}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && idbState && (
        <div className="bg-black/30 rounded-xl p-5 border border-blue-500/20">
          <h2 className="text-lg font-bold text-white mb-1">Exam Attempt Readiness</h2>
          <p className="text-xs text-gray-400 mb-4">
            Updated {new Date(idbState.updatedAt).toLocaleDateString()} · {idbState.totalAttempts} attempt{idbState.totalAttempts !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-gray-400 text-sm">Overall Band:</span>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${BAND_INFO[idbState.overallBand]?.bg ?? "bg-gray-600/20"} ${BAND_INFO[idbState.overallBand]?.color ?? "text-gray-300"}`}>
              {BAND_INFO[idbState.overallBand]?.label ?? idbState.overallBand}
            </span>
          </div>
          <div className="space-y-2">
            {(Object.entries(idbState.sectionBands) as [string, string][]).map(([sec, band]) => (
              <div key={sec} className="flex items-center justify-between text-sm">
                <span className="text-gray-400">{SECTION_DISPLAY[sec]?.label ?? sec}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${BAND_INFO[band]?.bg ?? "bg-gray-600/20"} ${BAND_INFO[band]?.color ?? "text-gray-300"}`}>
                  {BAND_INFO[band]?.label ?? band}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── History tab ─────────────────────────────────────────────────────────── */

function HistoryTab() {
  const [attempts, setAttempts] = useState<DatAttempt[]>([]);
  const [loading, setLoading]   = useState(true);
  const { sessions, scores }    = useApexEngineStore();

  useEffect(() => {
    let alive = true;
    listAttempts()
      .then(all => { if (alive) setAttempts(all.sort((a, b) => b.startedAt.localeCompare(a.startedAt))); })
      .catch(() => { if (alive) setAttempts([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-6">
      {/* Pattern practice history */}
      <div className="bg-black/30 rounded-xl p-5 border border-blue-500/20">
        <h2 className="text-lg font-bold text-white mb-4">Pattern Practice Sessions</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-400">No sessions yet. Start practicing to build history.</p>
        ) : (
          <div className="space-y-3">
            {sessions.slice(0, 10).map(session => {
              const pct = session.total > 0 ? Math.round((session.correct / session.total) * 100) : null;
              return (
                <div key={session.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-b-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-blue-600/20 text-blue-300 px-1.5 py-0.5 rounded uppercase">{session.section}</span>
                      <span className="text-xs text-gray-400">{session.mode}</span>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{new Date(session.startedAt).toLocaleDateString()}</div>
                  </div>
                  {pct !== null && (
                    <span className={`text-sm font-bold ${pct >= 75 ? "text-emerald-400" : pct >= 50 ? "text-yellow-400" : "text-rose-400"}`}>
                      {pct}%
                      <span className="text-[10px] text-gray-500 font-normal ml-1">{session.correct}/{session.total}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Full exam attempts from IDB */}
      <div className="bg-black/30 rounded-xl p-5 border border-blue-500/20">
        <h2 className="text-lg font-bold text-white mb-1">Full Exam Attempts</h2>
        <p className="text-xs text-gray-400 mb-4">Persisted to IndexedDB (avrrio-dat-apex)</p>
        {loading ? (
          <div className="text-center py-6 text-gray-400 text-sm">Loading…</div>
        ) : attempts.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-gray-400 text-sm">No full exam attempts recorded yet.</p>
            <Link
              href="/apex/proctor?config=full-dat"
              className="inline-block mt-3 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm transition-colors"
            >
              Take First Full Exam
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {attempts.map(attempt => (
              <div key={attempt.id} className="flex items-center justify-between py-3 border-b border-white/5 last:border-b-0">
                <div>
                  <div className="text-sm text-white font-medium">
                    {attempt.mode === "simulation" ? "Full Simulation" : "Practice Attempt"}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {new Date(attempt.startedAt).toLocaleDateString()} · {attempt.state}
                  </div>
                </div>
                <div className="text-xs text-gray-500">{attempt.id.slice(0, 8)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {scores.length > 0 && (
        <div className="bg-black/30 rounded-xl p-5 border border-blue-500/20">
          <h2 className="text-lg font-bold text-white mb-4">Score History</h2>
          <div className="space-y-2">
            {scores.map((score, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-gray-400">{new Date(score.createdAt).toLocaleDateString()}</span>
                <span className="font-bold text-blue-300">{Math.round(score.percent)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Page shell ──────────────────────────────────────────────────────────── */

export default function DatApexPage() {
  const [activeTab, setActiveTab] = useState<TabId>("today");
  const { projection } = useApexEngineStore();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_28%),linear-gradient(135deg,#020617,#0f172a_48%,#111827)] text-white">
      <header className="bg-black/20 backdrop-blur-sm border-b border-blue-500/20 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">🎯 Avrrio Exam Forge <span className="text-blue-300 font-bold">— DAT</span></h1>
            <p className="text-xs text-blue-200 mt-0.5">
              Blueprint v{ACTIVE_DAT_BLUEPRINT.version} · {ACTIVE_DAT_BLUEPRINT.scoringModelVersion}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
            >
              ← Reader
            </Link>
            {projection?.totalProjected && (
              <div className="text-right">
                <div className="text-xs text-blue-200">Projected</div>
                <div className="text-lg font-bold text-green-400">{projection.totalProjected}</div>
              </div>
            )}
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4">
          <div className="flex overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-400 text-white"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === "today"     && <TodayTab />}
        {activeTab === "learn"     && (
          <div>
            <p className="text-sm text-gray-400 mb-4">
              Study recognition patterns, decision rules, mechanisms, and traps for each DAT section.
            </p>
            <ErrorBoundary>
              <TrainingArena />
            </ErrorBoundary>
          </div>
        )}
        {activeTab === "practice"  && <PracticeTab />}
        {activeTab === "exams"     && <FullExamsTab />}
        {activeTab === "mistakes"  && <MistakesTab />}
        {activeTab === "readiness" && <ReadinessTab />}
        {activeTab === "history"   && <HistoryTab />}
      </main>
    </div>
  );
}
