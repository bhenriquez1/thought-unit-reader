"use client";
// components/recalllab/Recall2Lab.tsx
// Canonical Recall container: one retrieval home plus one session surface.
// Legacy RecallSets are migrated silently as data; their old dashboard is
// never rendered as a competing product.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getBlueprintsForDocument,
  getBlueprintsForDocumentAsync,
  saveBlueprintsDedup,
  saveBlueprintsPreservingProgress,
} from "@/lib/recalllab/recall2Store";
import { recallSetToBlueprints } from "@/lib/recalllab/recall2Builder";
import { buildSessionQueue, computeRecall2Stats, type RecallWeaknessSignal } from "@/lib/recalllab/recall2Srs";
import { fetchRecallWeaknessSignals } from "@/lib/recalllab/recall2LearningStateSignals";
import { buildCanonicalTextbookEvidence } from "@/lib/notelab/conceptEvidenceWorkspace";
import {
  buildCanonicalRecallModes,
  type CanonicalRecallModeBundle,
} from "@/lib/recalllab/canonicalRecallSession";
import {
  getWhiteboardLessonSnapshotsByDocument,
  type WhiteboardLessonSnapshot,
} from "@/lib/knowledge/whiteboardLessonSnapshotStore";
import type { GroundedSurgeonAnnotation } from "@/lib/highlights/groundSurgeonQuotes";
import type { RecallBlueprint, SessionPhase } from "@/lib/recalllab/recall2Types";
import type { RecallSet } from "@/lib/recalllab/recallStore";
import Recall2Session   from "./Recall2Session";

type View =
  | { kind: "dashboard" }
  | { kind: "session"; queue: RecallBlueprint[]; phases: SessionPhase[]; canonical: boolean; title?: string };

interface Recall2LabProps {
  bookId?:           string;
  documentId:        string;
  pageNumber:        number;
  pageTruthKey:      string;
  surgeonPageTruthKey?: string | null;
  groundedAnnotations: GroundedSurgeonAnnotation[];
  knowledgeNodeId?:  string | null;
  bookTitle?:        string;
  topic?:            string;
  legacySets:        RecallSet[];
  onNavigateToPage?: (page: number) => void;
}

export default function Recall2Lab({
  bookId,
  documentId,
  pageNumber,
  pageTruthKey,
  surgeonPageTruthKey,
  groundedAnnotations,
  knowledgeNodeId,
  bookTitle,
  topic,
  legacySets,
  onNavigateToPage,
}: Recall2LabProps) {
  const [blueprints, setBlueprints] = useState<RecallBlueprint[]>(() => getBlueprintsForDocument(documentId));
  const [snapshots, setSnapshots] = useState<WhiteboardLessonSnapshot[]>([]);
  const [nodeSignals, setNodeSignals] = useState<Map<string, RecallWeaknessSignal>>(new Map());
  const [view,       setView]       = useState<View>({ kind: "dashboard" });
  const migratedKeys = useRef<Set<string>>(new Set());

  const reload = useCallback(() => {
    getBlueprintsForDocumentAsync(documentId).then(setBlueprints);
  }, [documentId]);

  const reloadSnapshots = useCallback(() => {
    getWhiteboardLessonSnapshotsByDocument(documentId)
      .then(setSnapshots)
      .catch(() => setSnapshots([]));
  }, [documentId]);

  // Initial IDB load
  useEffect(() => { reload(); reloadSnapshots(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when canonical document identity changes.
  useEffect(() => {
    setView({ kind: "dashboard" });
    reload();
    reloadSnapshots();
  }, [documentId, reload, reloadSnapshots]);

  // Listen for store updates from other components
  useEffect(() => {
    window.addEventListener("recall2-updated", reload);
    return () => window.removeEventListener("recall2-updated", reload);
  }, [reload]);

  // Preserve old cards without preserving the old product. Migration is
  // idempotent through canonical hashes and never resets Recall 2 progress.
  useEffect(() => {
    const migrationKey = `${documentId}:${legacySets.map((set) => set.id).sort().join(",")}`;
    if (legacySets.length === 0 || migratedKeys.current.has(migrationKey)) return;
    migratedKeys.current.add(migrationKey);
    let cancelled = false;
    void (async () => {
      for (const set of legacySets) {
        await saveBlueprintsDedup(recallSetToBlueprints(set), set.bookId);
      }
      if (!cancelled) reload();
    })().catch(() => {
      migratedKeys.current.delete(migrationKey);
    });
    return () => { cancelled = true; };
  }, [documentId, legacySets, reload]);

  useEffect(() => {
    let cancelled = false;
    fetchRecallWeaknessSignals(blueprints)
      .then((signals) => { if (!cancelled) setNodeSignals(signals); })
      .catch(() => { if (!cancelled) setNodeSignals(new Map()); });
    return () => { cancelled = true; };
  }, [blueprints]);

  const identity = useMemo(() => ({
    bookId: bookId ?? documentId,
    documentId,
    pageNumber,
    pageTruthKey,
    knowledgeNodeId: knowledgeNodeId ?? null,
  }), [bookId, documentId, pageNumber, pageTruthKey, knowledgeNodeId]);

  const canonicalEvidence = useMemo(() => buildCanonicalTextbookEvidence({
    identity,
    surgeonPageTruthKey,
    groundedAnnotations,
  }), [identity, surgeonPageTruthKey, groundedAnnotations]);

  const canonicalModes = useMemo(() => buildCanonicalRecallModes({
    identity,
    evidence: canonicalEvidence,
    snapshots,
  }), [identity, canonicalEvidence, snapshots]);

  const startCanonicalMode = useCallback(async (mode: CanonicalRecallModeBundle) => {
    if (mode.cards.length === 0) return;
    const queue = await saveBlueprintsPreservingProgress(mode.cards, identity);
    setView({ kind: "session", queue, phases: ["mixed"], canonical: true, title: mode.title });
  }, [identity]);

  if (view.kind === "session") {
    return (
      <Recall2Session
        initialQueue={view.queue}
        phases={view.phases}
        topic={view.title ?? topic}
        bookTitle={bookTitle}
        onClose={() => { setView({ kind: "dashboard" }); reload(); }}
        onNavigateToPage={onNavigateToPage}
        allowAiCoach={!view.canonical}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <CanonicalRecallHome
        modes={canonicalModes}
        blueprints={blueprints}
        nodeSignals={nodeSignals}
        onStartCanonical={startCanonicalMode}
        onStartStored={(queue, phases, title) => setView({ kind: "session", queue, phases, canonical: true, title })}
        onNavigateToPage={onNavigateToPage}
      />
    </div>
  );
}

const MODE_ICON: Record<CanonicalRecallModeBundle["mode"], string> = {
  concept: "🧠",
  "professor-snapshot": "🧑‍🏫",
  "misconception-repair": "🛠️",
};

function CanonicalRecallHome({
  modes,
  blueprints,
  nodeSignals,
  onStartCanonical,
  onStartStored,
  onNavigateToPage,
}: {
  modes: CanonicalRecallModeBundle[];
  blueprints: RecallBlueprint[];
  nodeSignals: Map<string, RecallWeaknessSignal>;
  onStartCanonical: (mode: CanonicalRecallModeBundle) => Promise<void>;
  onStartStored: (queue: RecallBlueprint[], phases: SessionPhase[], title: string) => void;
  onNavigateToPage?: (page: number) => void;
}) {
  const [starting, setStarting] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const stats = useMemo(() => computeRecall2Stats(blueprints, nodeSignals), [blueprints, nodeSignals]);
  const dueQueue = useMemo(() => buildSessionQueue(blueprints, ["mixed"], nodeSignals), [blueprints, nodeSignals]);
  const weakQueue = useMemo(() => buildSessionQueue(blueprints, ["weak"], nodeSignals), [blueprints, nodeSignals]);
  const masteryQueue = useMemo(() => buildSessionQueue(blueprints, ["mastery"], nodeSignals), [blueprints, nodeSignals]);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-5">
      <section className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">Current page retrieval</div>
        <p className="mt-1 text-xs text-slate-400">Built from canonical Thought Units and saved Professor lessons—never a second page analysis.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {modes.map((mode) => {
            const enabled = mode.cards.length > 0 && !starting;
            return (
              <button
                key={mode.mode}
                type="button"
                disabled={!enabled}
                title={enabled ? mode.description : `Unavailable: no grounded ${mode.title.toLowerCase()} material on this page.`}
                onClick={() => {
                  setStarting(mode.mode);
                  setStartError(null);
                  void onStartCanonical(mode)
                    .catch(() => setStartError("Could not prepare this retrieval session. Please try again."))
                    .finally(() => setStarting(null));
                }}
                className="rounded-xl border border-white/10 bg-slate-950/35 p-3 text-left transition-colors hover:bg-slate-900/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <div className="text-xl">{MODE_ICON[mode.mode]}</div>
                <div className="mt-2 text-sm font-semibold text-white">{mode.title}</div>
                <div className="mt-1 text-xs text-emerald-300">{starting === mode.mode ? "Preparing…" : `${mode.cards.length} card${mode.cards.length === 1 ? "" : "s"}`}</div>
              </button>
            );
          })}
        </div>
        {startError && <div role="alert" className="mt-3 text-xs text-rose-300">{startError}</div>}
      </section>

      <section className="mt-4 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
        <div className="flex items-start justify-between gap-4">
          <div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-300">Your retrieval plan</div><p className="mt-1 text-xs text-slate-500">Mastery changes only after the learner answers cards.</p></div>
          <div className="text-xs text-slate-400">{stats.total} saved</div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Due", value: stats.due, color: "text-sky-300" },
            { label: "Weak", value: stats.weak, color: "text-rose-300" },
            { label: "Forgotten", value: stats.forgotten, color: "text-orange-300" },
            { label: "Mastered", value: stats.mastered, color: "text-emerald-300" },
          ].map((item) => <div key={item.label} className="rounded-xl border border-white/8 bg-white/[0.03] p-3"><div className={`text-xl font-bold ${item.color}`}>{item.value}</div><div className="mt-1 text-xs text-slate-500">{item.label}</div></div>)}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {[
            { title: "Review due concepts", queue: dueQueue, phases: ["mixed"] as SessionPhase[] },
            { title: "Repair weak concepts", queue: weakQueue, phases: ["weak"] as SessionPhase[] },
            { title: "Mastery challenge", queue: masteryQueue, phases: ["mastery"] as SessionPhase[] },
          ].map((action) => (
            <button key={action.title} type="button" disabled={action.queue.length === 0} onClick={() => onStartStored(action.queue, action.phases, action.title)} className="rounded-xl border border-indigo-400/20 bg-indigo-400/10 px-3 py-2.5 text-sm font-semibold text-indigo-100 hover:bg-indigo-400/15 disabled:cursor-not-allowed disabled:opacity-35" title={action.queue.length ? `${action.queue.length} cards` : "Unavailable: no matching answered/due cards yet."}>
              {action.title} · {action.queue.length}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Source-linked cards</div>
        {blueprints.length === 0 ? (
          <div className="py-8 text-center"><div className="text-3xl">🧠</div><p className="mt-3 text-sm text-slate-400">Save a Thought Unit to Recall or answer a current-page retrieval mode to begin.</p></div>
        ) : (
          <div className="mt-3 space-y-2">
            {blueprints.slice(0, 20).map((card) => (
              <div key={card.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.025] p-3">
                <div className="min-w-0 flex-1"><div className="truncate text-sm text-slate-200">{card.front}</div><div className="mt-1 text-[10px] text-slate-500">{card.sourceKind ?? "saved evidence"}{card.pageNumber ? ` · page ${card.pageNumber}` : ""}</div></div>
                {card.pageNumber && onNavigateToPage && <button type="button" onClick={() => onNavigateToPage(card.pageNumber!)} className="rounded-lg bg-white/5 px-2 py-1 text-xs text-sky-300 hover:bg-white/10">View evidence</button>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
