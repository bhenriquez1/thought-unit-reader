"use client";
// app/apex/review/page.tsx
// PDRM Mistake Review Engine
// Surfaces Pattern · Decision Rule · Reason · Miss breakdown for every logged mistake.

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useApexEngineStore } from "@/lib/stores/apexEngineStore";
import type { ApexSection, MissReason } from "@/lib/apex/datApexTypes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SECTION_LABELS: Record<ApexSection, string> = {
  bio: "Biology",
  gc: "General Chemistry",
  orgo: "Organic Chemistry",
  pat: "PAT",
  rc: "Reading Comprehension",
  qr: "QR / Math",
};

const SECTION_COLORS: Record<ApexSection, string> = {
  bio: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  gc: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  orgo: "bg-green-500/20 text-green-300 border-green-500/30",
  pat: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  rc: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  qr: "bg-orange-500/20 text-orange-300 border-orange-500/30",
};

const REASON_LABELS: Record<MissReason, string> = {
  pattern_miss: "Pattern Miss",
  wrong_rule: "Wrong Rule",
  knowledge_gap: "Knowledge Gap",
  trap_fell_for: "Fell for Trap",
  rushed: "Rushed",
  careless: "Careless",
};

const REASON_COLORS: Record<MissReason, string> = {
  pattern_miss: "bg-red-500/20 text-red-300",
  wrong_rule: "bg-orange-500/20 text-orange-300",
  knowledge_gap: "bg-yellow-500/20 text-yellow-300",
  trap_fell_for: "bg-rose-500/20 text-rose-300",
  rushed: "bg-slate-500/20 text-slate-300",
  careless: "bg-gray-500/20 text-gray-300",
};

const ALL_SECTIONS: ApexSection[] = ["bio", "gc", "orgo", "pat", "rc", "qr"];
const ALL_REASONS: MissReason[] = [
  "pattern_miss",
  "wrong_rule",
  "knowledge_gap",
  "trap_fell_for",
  "rushed",
  "careless",
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReviewPage() {
  const { mistakes, patterns } = useApexEngineStore();

  const [sectionFilter, setSectionFilter] = useState<ApexSection | "all">(
    "all",
  );
  const [reasonFilter, setReasonFilter] = useState<MissReason | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return mistakes.filter((m) => {
      if (sectionFilter !== "all" && m.section !== sectionFilter) return false;
      if (reasonFilter !== "all" && m.reasonMissed !== reasonFilter)
        return false;
      return true;
    });
  }, [mistakes, sectionFilter, reasonFilter]);

  // Aggregate stats
  const reasonCounts = useMemo(() => {
    const counts: Partial<Record<MissReason, number>> = {};
    for (const m of mistakes) {
      counts[m.reasonMissed] = (counts[m.reasonMissed] ?? 0) + 1;
    }
    return counts;
  }, [mistakes]);

  const topReason =
    Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0] ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-sm border-b border-blue-500/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <Link
                  href="/apex"
                  className="text-blue-300 hover:text-white text-sm transition-colors"
                >
                  ← TestLab
                </Link>
                <span className="text-gray-600">/</span>
                <h1 className="text-2xl font-bold text-white">
                  🧠 PDRM Mistake Review
                </h1>
              </div>
              <p className="text-blue-200 text-sm mt-1">
                Pattern · Decision Rule · Reason · Miss — every error, fully
                broken down
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-white">
                {mistakes.length}
              </div>
              <div className="text-xs text-gray-400">total logged</div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {mistakes.length === 0 ? (
          /* ── Empty state ─────────────────────────────────────────────── */
          <div className="text-center py-24">
            <div className="text-6xl mb-6">🎯</div>
            <h2 className="text-2xl font-bold text-white mb-3">
              No mistakes logged yet
            </h2>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              Complete practice sessions in the Training Arena. Every incorrect
              answer is automatically logged here with a full PDRM breakdown.
            </p>
            <Link
              href="/apex"
              className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
            >
              Open Training Arena
            </Link>
          </div>
        ) : (
          <>
            {/* ── Summary bar ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-black/30 rounded-xl p-4 border border-blue-500/20">
                <div className="text-2xl font-bold text-white">
                  {mistakes.length}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  total mistakes
                </div>
              </div>

              <div className="bg-black/30 rounded-xl p-4 border border-blue-500/20">
                <div className="text-2xl font-bold text-rose-400">
                  {reasonCounts["trap_fell_for"] ?? 0}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">trap hits</div>
              </div>

              <div className="bg-black/30 rounded-xl p-4 border border-blue-500/20">
                <div className="text-2xl font-bold text-orange-400">
                  {reasonCounts["wrong_rule"] ?? 0}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  rule errors
                </div>
              </div>

              <div className="bg-black/30 rounded-xl p-4 border border-blue-500/20">
                <div className="text-2xl font-bold text-yellow-400">
                  {reasonCounts["knowledge_gap"] ?? 0}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  knowledge gaps
                </div>
              </div>
            </div>

            {/* Most repeated error */}
            {topReason && topReason[1] >= 2 && (
              <div className="mb-6 bg-gradient-to-r from-rose-600/10 to-red-600/10 rounded-xl p-4 border border-rose-500/20">
                <div className="flex items-center gap-2">
                  <span className="text-rose-400">⚠️</span>
                  <p className="text-sm text-white">
                    <span className="font-semibold">Most repeated error:</span>{" "}
                    {REASON_LABELS[topReason[0] as MissReason]} — triggered{" "}
                    {topReason[1]} times. Focus your next session on this
                    pattern.
                  </p>
                </div>
              </div>
            )}

            {/* ── Filters ────────────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-3 mb-6">
              {/* Section filter */}
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => setSectionFilter("all")}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    sectionFilter === "all"
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-black/20 text-gray-400 border-gray-600/30 hover:border-gray-400"
                  }`}
                >
                  All Sections
                </button>
                {ALL_SECTIONS.filter((s) =>
                  mistakes.some((m) => m.section === s),
                ).map((s) => (
                  <button
                    key={s}
                    onClick={() =>
                      setSectionFilter(sectionFilter === s ? "all" : s)
                    }
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      sectionFilter === s
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-black/20 text-gray-400 border-gray-600/30 hover:border-gray-400"
                    }`}
                  >
                    {SECTION_LABELS[s]}
                  </button>
                ))}
              </div>

              <div className="w-px bg-gray-600/50 self-stretch" />

              {/* Reason filter */}
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => setReasonFilter("all")}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    reasonFilter === "all"
                      ? "bg-purple-600 text-white border-purple-600"
                      : "bg-black/20 text-gray-400 border-gray-600/30 hover:border-gray-400"
                  }`}
                >
                  All Reasons
                </button>
                {ALL_REASONS.filter((r) =>
                  mistakes.some((m) => m.reasonMissed === r),
                ).map((r) => (
                  <button
                    key={r}
                    onClick={() =>
                      setReasonFilter(reasonFilter === r ? "all" : r)
                    }
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      reasonFilter === r
                        ? "bg-purple-600 text-white border-purple-600"
                        : "bg-black/20 text-gray-400 border-gray-600/30 hover:border-gray-400"
                    }`}
                  >
                    {REASON_LABELS[r]}
                    {reasonCounts[r] ? (
                      <span className="ml-1 text-gray-500">
                        {reasonCounts[r]}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            {/* Result count */}
            <p className="text-xs text-gray-500 mb-4">
              Showing {filtered.length} of {mistakes.length} mistakes
            </p>

            {/* ── Mistake cards ───────────────────────────────────────────── */}
            <div className="space-y-4">
              {filtered.map((mistake) => {
                const isOpen = expandedId === mistake.id;
                const storedPattern = patterns.find(
                  (p) => p.id === mistake.patternId,
                );

                return (
                  <div
                    key={mistake.id}
                    className="bg-black/30 backdrop-blur-sm rounded-xl border border-gray-600/30 overflow-hidden"
                  >
                    {/* Card header — always visible */}
                    <button
                      className="w-full text-left p-5 hover:bg-white/5 transition-colors"
                      onClick={() =>
                        setExpandedId(isOpen ? null : mistake.id)
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span
                              className={`text-xs px-2 py-0.5 rounded border ${SECTION_COLORS[mistake.section]}`}
                            >
                              {SECTION_LABELS[mistake.section]}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded ${REASON_COLORS[mistake.reasonMissed]}`}
                            >
                              {REASON_LABELS[mistake.reasonMissed]}
                            </span>
                            {mistake.patternId && (
                              <span className="text-xs text-gray-500">
                                {storedPattern?.name ?? mistake.patternId}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-red-300">
                              ✗ {mistake.userAnswer}
                            </span>
                            <span className="text-gray-600">→</span>
                            <span className="text-green-300">
                              ✓ {mistake.correctAnswer}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-gray-500">
                            {formatDate(mistake.createdAt)}
                          </span>
                          <span className="text-gray-500 text-sm">
                            {isOpen ? "▲" : "▼"}
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* Expanded PDRM breakdown */}
                    {isOpen && (
                      <div className="px-5 pb-5 border-t border-gray-600/20">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                          {/* Pattern */}
                          <div className="bg-blue-600/10 rounded-lg p-4 border border-blue-500/20">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-blue-400 text-xs font-bold uppercase tracking-wider">
                                P
                              </span>
                              <span className="text-blue-300 text-xs font-semibold">
                                Pattern
                              </span>
                            </div>
                            <p className="text-white text-sm">
                              {mistake.pdrm.pattern || "—"}
                            </p>
                            {storedPattern && (
                              <p className="text-gray-400 text-xs mt-1">
                                Trigger: {storedPattern.trigger}
                              </p>
                            )}
                          </div>

                          {/* Decision Rule */}
                          <div className="bg-green-600/10 rounded-lg p-4 border border-green-500/20">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-green-400 text-xs font-bold uppercase tracking-wider">
                                D
                              </span>
                              <span className="text-green-300 text-xs font-semibold">
                                Decision Rule
                              </span>
                            </div>
                            <p className="text-white text-sm">
                              {mistake.pdrm.decisionRule || "—"}
                            </p>
                          </div>

                          {/* Reason */}
                          <div className="bg-yellow-600/10 rounded-lg p-4 border border-yellow-500/20">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-yellow-400 text-xs font-bold uppercase tracking-wider">
                                R
                              </span>
                              <span className="text-yellow-300 text-xs font-semibold">
                                Reason
                              </span>
                            </div>
                            <p className="text-white text-sm">
                              {mistake.pdrm.reason || "—"}
                            </p>
                          </div>

                          {/* Miss / Trap */}
                          <div className="bg-rose-600/10 rounded-lg p-4 border border-rose-500/20">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-rose-400 text-xs font-bold uppercase tracking-wider">
                                M
                              </span>
                              <span className="text-rose-300 text-xs font-semibold">
                                Miss / Trap
                              </span>
                            </div>
                            <p className="text-white text-sm">
                              {mistake.pdrm.miss || "—"}
                            </p>
                            {storedPattern?.commonTrap && (
                              <p className="text-gray-400 text-xs mt-1">
                                Known trap: {storedPattern.commonTrap}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Pattern readiness bar */}
                        {storedPattern && storedPattern.timesSeen > 0 && (
                          <div className="mt-4 pt-3 border-t border-gray-600/20">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-gray-400">
                                Pattern Readiness
                              </span>
                              <span className="text-xs text-white">
                                {storedPattern.readiness}%
                              </span>
                            </div>
                            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  storedPattern.readiness >= 75
                                    ? "bg-green-500"
                                    : storedPattern.readiness >= 50
                                      ? "bg-yellow-500"
                                      : "bg-red-500"
                                }`}
                                style={{
                                  width: `${storedPattern.readiness}%`,
                                }}
                              />
                            </div>
                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                              <span>
                                {storedPattern.timesSeen} attempts
                              </span>
                              <span
                                className={
                                  storedPattern.masteryLevel === "mastered"
                                    ? "text-green-400"
                                    : storedPattern.masteryLevel === "strong"
                                      ? "text-blue-400"
                                      : storedPattern.masteryLevel ===
                                          "unstable"
                                        ? "text-yellow-400"
                                        : "text-red-400"
                                }
                              >
                                {storedPattern.masteryLevel}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {filtered.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                No mistakes match the current filters.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
