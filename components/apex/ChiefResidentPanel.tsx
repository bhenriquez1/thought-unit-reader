"use client";
// components/apex/ChiefResidentPanel.tsx
// Chief Resident Teaching mode — the signature "Learn" experience in DAT Apex.
//
// Shows for a given topic:
//   1. Canonical Units from the student's textbook (from IDB, filtered by topic)
//   2. Thought Units (subtopic-level breakdown)
//   3. Chief Resident Teaching (AI, cached per topic in localStorage)
//   4. Common DAT Traps
//   5. Memory Anchors
//   6. Self Check question
//
// If no textbook is loaded for this topic, the AI teaches from general DAT knowledge.

import React, { useState, useEffect, useCallback, useRef } from "react";
import type { TopicNode } from "@/lib/datApex/blueprintTopology";
import type { DatSectionId } from "@/lib/datApex/blueprint";
import type { CanonicalThoughtUnit } from "@/lib/canonical/types";
import { getCanonicalUnitsByDocument } from "@/lib/canonical/store";
import type { ChiefResidentOutput } from "@/pages/api/chief-resident";

/* ─── Cache key ──────────────────────────────────────────────────────────────── */

function cacheKey(sectionId: DatSectionId, topicId: string): string {
  return `avrrio:cr:${sectionId}:${topicId}`;
}

function loadCached(sectionId: DatSectionId, topicId: string): ChiefResidentOutput | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(sectionId, topicId));
    return raw ? (JSON.parse(raw) as ChiefResidentOutput) : null;
  } catch { return null; }
}

function saveCache(sectionId: DatSectionId, topicId: string, data: ChiefResidentOutput): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(cacheKey(sectionId, topicId), JSON.stringify(data)); } catch { /* non-fatal */ }
}

/* ─── Sub-tabs ───────────────────────────────────────────────────────────────── */

type TabId = "teaching" | "units" | "traps" | "selfcheck";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "teaching",  label: "Chief Resident",  icon: "🩺" },
  { id: "units",     label: "Canonical Units",  icon: "📚" },
  { id: "traps",     label: "DAT Traps",        icon: "⚠️" },
  { id: "selfcheck", label: "Self Check",       icon: "✅" },
];

/* ─── Props ──────────────────────────────────────────────────────────────────── */

interface ChiefResidentPanelProps {
  sectionId: DatSectionId;
  sectionLabel: string;
  topic: TopicNode;
  /** Optional: documentIds to pull canonical units from IDB. */
  documentIds?: string[];
  accentColor?: string;
}

/* ─── Component ──────────────────────────────────────────────────────────────── */

export default function ChiefResidentPanel({
  sectionId,
  sectionLabel,
  topic,
  documentIds = [],
  accentColor = "purple",
}: ChiefResidentPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("teaching");
  const [teaching, setTeaching] = useState<ChiefResidentOutput | null>(null);
  const [teachingLoading, setTeachingLoading] = useState(false);
  const [teachingError, setTeachingError] = useState<string | null>(null);
  const [units, setUnits] = useState<CanonicalThoughtUnit[]>([]);
  const [selfCheckAnswer, setSelfCheckAnswer] = useState<string | null>(null);
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load canonical units from IDB for all provided document IDs
  useEffect(() => {
    if (!documentIds.length) { setUnits([]); return; }
    let alive = true;
    Promise.all(documentIds.map((docId) => getCanonicalUnitsByDocument(docId)))
      .then((allUnits) => {
        if (!alive) return;
        const flat = allUnits.flat().filter((u) => {
          // Filter to this section and topic
          const secMatch = u.datSection === sectionId.replace(/-/g, "_");
          const topicMatch =
            u.datTopic?.toLowerCase().replace(/\s+/g, "-").includes(topic.topicId) ||
            topic.topicId.includes(u.datTopic?.toLowerCase().replace(/\s+/g, "-") ?? "");
          return secMatch && topicMatch && u.datRelevance >= 0.3;
        });
        // Sort by relevance desc, then page/unit
        flat.sort((a, b) =>
          b.datRelevance - a.datRelevance || a.pageIndex - b.pageIndex || a.unitIndex - b.unitIndex,
        );
        setUnits(flat.slice(0, 20));
      })
      .catch(() => alive && setUnits([]));
    return () => { alive = false; };
  }, [documentIds.join(","), sectionId, topic.topicId]);

  // Load Chief Resident teaching (cached or API)
  const loadTeaching = useCallback(async () => {
    const cached = loadCached(sectionId, topic.topicId);
    if (cached) { setTeaching(cached); return; }

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setTeachingLoading(true);
    setTeachingError(null);
    try {
      const res = await fetch("/api/chief-resident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          sectionLabel,
          topicLabel:  topic.label,
          subtopics:   topic.subtopics.map((s) => s.label),
          knownTraps:  topic.datTraps,
          thoughtUnitTexts: units.slice(0, 6).map((u) => u.text),
        }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = (await res.json()) as ChiefResidentOutput;
      saveCache(sectionId, topic.topicId, data);
      setTeaching(data);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setTeachingError("Chief Resident is unavailable right now. Check your connection.");
    } finally {
      setTeachingLoading(false);
    }
  }, [sectionId, topic, sectionLabel, units]);

  // Auto-load teaching when tab is opened
  useEffect(() => {
    if (activeTab === "teaching" && !teaching && !teachingLoading) loadTeaching();
  }, [activeTab, teaching, teachingLoading, loadTeaching]);

  // Reset self check answer when topic changes
  useEffect(() => { setSelfCheckAnswer(null); }, [topic.topicId]);

  const accent = {
    border:  `border-${accentColor}-500/40`,
    text:    `text-${accentColor}-300`,
    bg:      `bg-${accentColor}-500/10`,
    ring:    `ring-${accentColor}-500`,
    button:  `bg-${accentColor}-600 hover:bg-${accentColor}-500`,
    tabActive: `border-b-2 border-${accentColor}-400 text-${accentColor}-300`,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Topic header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/5">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-white leading-tight">{topic.label}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {sectionLabel} · {topic.targetPct}% of exam ({Math.round(topic.targetPct * 0.4)} questions typical)
            </p>
          </div>
          {teaching && (
            <button
              onClick={() => {
                saveCache(sectionId, topic.topicId, null as unknown as ChiefResidentOutput);
                setTeaching(null);
                setTeachingLoading(false);
                setTeachingError(null);
              }}
              className="text-[10px] text-gray-500 hover:text-gray-300 shrink-0 mt-0.5"
              title="Refresh Chief Resident explanation"
            >
              ↺ refresh
            </button>
          )}
        </div>

        {/* Subtopic pills */}
        <div className="flex flex-wrap gap-1 mt-2">
          {topic.subtopics.map((s) => (
            <span key={s.id} className="px-2 py-0.5 rounded-full bg-white/5 text-[10px] text-gray-400">
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-white/5 text-xs shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-2 py-2 transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-purple-400 text-purple-300 font-medium"
                : "text-gray-400 hover:text-gray-200 border-b-2 border-transparent"
            }`}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
            {tab.id === "units" && units.length > 0 && (
              <span className="ml-1 opacity-60">({units.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        {/* ── Chief Resident Teaching ── */}
        {activeTab === "teaching" && (
          <div className="space-y-4">
            {teachingLoading && (
              <div className="flex items-center gap-3 text-gray-400">
                <span className="animate-spin text-lg">◌</span>
                <span>Chief Resident is preparing…</span>
              </div>
            )}
            {teachingError && (
              <div className="space-y-2">
                <p className="text-red-400 text-xs">{teachingError}</p>
                <button onClick={loadTeaching} className="text-xs text-purple-400 underline">
                  Try again
                </button>
              </div>
            )}
            {teaching && !teachingLoading && (
              <div className="space-y-4">
                {/* Core teaching */}
                <div>
                  <div className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mb-2">
                    Chief Resident Teaching
                  </div>
                  <div className="text-gray-200 leading-relaxed whitespace-pre-line text-sm">
                    {teaching.teaching}
                  </div>
                </div>

                {/* Clinical connection */}
                <div className="rounded-lg bg-teal-900/20 border border-teal-700/30 p-3">
                  <div className="text-[10px] font-semibold text-teal-400 uppercase tracking-wider mb-1">
                    Clinical Connection
                  </div>
                  <p className="text-teal-100 text-xs leading-relaxed">{teaching.clinicalConnection}</p>
                </div>

                {/* Memory anchor */}
                <div className="rounded-lg bg-amber-900/20 border border-amber-700/30 p-3">
                  <div className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1">
                    Memory Anchor
                  </div>
                  <p className="text-amber-100 text-sm font-medium">{teaching.memoryAnchor}</p>
                </div>
              </div>
            )}
            {!teaching && !teachingLoading && !teachingError && (
              <button
                onClick={loadTeaching}
                className="w-full py-3 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300 text-sm hover:bg-purple-600/30 transition-colors"
              >
                Load Chief Resident Teaching
              </button>
            )}
          </div>
        )}

        {/* ── Canonical Units ── */}
        {activeTab === "units" && (
          <div className="space-y-3">
            {units.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                <p className="text-2xl mb-2">📭</p>
                <p>No textbook content for this topic yet.</p>
                <p className="text-xs mt-1">Upload a {sectionLabel} textbook to see your Thought Units here.</p>
              </div>
            ) : (
              units.map((unit) => {
                const isOpen = expandedUnit === unit.id;
                return (
                  <div key={unit.id} className="rounded-lg border border-white/10 overflow-hidden">
                    <button
                      onClick={() => setExpandedUnit(isOpen ? null : unit.id)}
                      className="w-full flex items-start justify-between gap-2 px-3 py-2.5 bg-white/5 hover:bg-white/8 text-left transition-colors"
                    >
                      <span className="text-xs text-gray-200 leading-relaxed line-clamp-2">
                        {unit.text.slice(0, 140)}
                        {unit.text.length > 140 ? "…" : ""}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                          unit.datRelevance >= 0.7 ? "bg-green-500/20 text-green-300"
                          : unit.datRelevance >= 0.4 ? "bg-yellow-500/20 text-yellow-300"
                          : "bg-gray-500/20 text-gray-400"
                        }`}>
                          {unit.datUnitType}
                        </span>
                        <span className="text-gray-500 text-xs">{isOpen ? "▲" : "▼"}</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-3 py-3 bg-black/20 space-y-2 text-xs">
                        <p className="text-gray-200 leading-relaxed">{unit.text}</p>
                        <div className="flex items-center gap-3 text-gray-500 pt-1">
                          <span>p.{unit.pageIndex + 1}</span>
                          {unit.datSubtopic && <span>· {unit.datSubtopic}</span>}
                          <span>· relevance {Math.round(unit.datRelevance * 100)}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── DAT Traps ── */}
        {activeTab === "traps" && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">
              High-yield traps that separate 18s from 22s on this topic.
            </p>
            {topic.datTraps.map((trap, i) => (
              <div key={i} className="rounded-lg bg-rose-900/15 border border-rose-700/25 p-3">
                <div className="flex items-start gap-2">
                  <span className="text-rose-400 text-xs shrink-0 mt-0.5">⚠</span>
                  <p className="text-rose-100 text-xs leading-relaxed">{trap}</p>
                </div>
              </div>
            ))}
            {topic.memoryAnchors.length > 0 && (
              <div className="pt-2">
                <div className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-2">
                  Memory Anchors
                </div>
                {topic.memoryAnchors.map((anchor, i) => (
                  <div key={i} className="rounded-lg bg-amber-900/10 border border-amber-700/20 px-3 py-2 mb-2">
                    <p className="text-amber-100 text-xs font-medium">{anchor}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Self Check ── */}
        {activeTab === "selfcheck" && (
          <div className="space-y-4">
            {teaching?.selfCheckQuestion ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-white/5 border border-white/10 p-4">
                  <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-2">
                    Reasoning Question
                  </div>
                  <p className="text-white text-sm leading-relaxed">{teaching.selfCheckQuestion}</p>
                </div>

                {selfCheckAnswer === null ? (
                  <button
                    onClick={() => setSelfCheckAnswer("")}
                    className="w-full py-2 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs hover:bg-blue-600/30 transition-colors"
                  >
                    Show answer space
                  </button>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      rows={4}
                      value={selfCheckAnswer}
                      onChange={(e) => setSelfCheckAnswer(e.target.value)}
                      placeholder="Think it through… type your reasoning here."
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-purple-500/50"
                    />
                    <p className="text-xs text-gray-500">
                      This is for your own recall — nothing is submitted. The discipline of writing forces clarity.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">
                <p>Load Chief Resident Teaching first to unlock the self check question.</p>
                <button
                  onClick={() => { setActiveTab("teaching"); loadTeaching(); }}
                  className="mt-3 text-xs text-purple-400 underline"
                >
                  Open Chief Resident →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
