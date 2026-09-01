"use client";

// components/learningHub/KnowledgeStatePanel.tsx
// C8 (Phase 0 audit) — Learning Hub's live UI runs entirely on
// lib/syllabus/chapterProgress.ts (TOC-chapter-keyed, built from
// RecallLab/NoteLab/StudyGuide/page-visit/highlight data), with zero
// connection to the shared Learning State (KnowledgeNodeProgress) — the
// same store TestLab, Recall, and Whiteboard already read/write through.
// Confirmed via audit: getNodeProgress is called exactly once in the whole
// app, for a small Reader-tab banner, never inside Learning Hub itself.
//
// This is the first real connection. Deliberately additive: reads directly
// from the shared store (no new mastery store invented), at node
// granularity (no chapter rollup needed — that's what the store already
// gives for free), and does not touch or replace chapterProgress.ts or any
// of its existing consumers (StudyPlanLab, ChapterDashboard, the three
// buildXPlan generators) — collapsing chapter-granular and node-granular
// progress into one model is a much larger, separately-scoped migration.
//
// Surfaces three of the roadmap's named target surfaces that were
// completely absent from Learning Hub: Due for Recall, Test Lab
// Recommended (weak concepts — reuses lib/examEngine/examScope.ts's
// selectWeakNodes(), the exact same logic TestLab's own "weak areas" exam
// scope already uses, so "weak" means the same thing in both products),
// and Recently Mastered.

import React, { useEffect, useState } from "react";
import { getNodeProgress } from "@/lib/knowledge/knowledgeGraphStore";
import { selectWeakNodes } from "@/lib/examEngine/examScope";
import { selectDueForRecall, selectRecentlyMastered } from "@/lib/learningHub/knowledgeStateSelectors";
import type { KnowledgeNode, KnowledgeNodeProgress } from "@/lib/knowledge/knowledgeGraphSchema";

/** L6 — which list a node click came from, so the caller can route each
 *  list to the module it's actually about (Recall for due-for-recall,
 *  TestLab for the weak/"recommended" list, Reader for browsing a mastered
 *  concept's source) instead of every list navigating identically. */
export type KnowledgeStateListKind = "due" | "weak" | "mastered";

export interface KnowledgeStatePanelProps {
  nodes: KnowledgeNode[];
  onOpenNode: (node: KnowledgeNode, kind: KnowledgeStateListKind) => void;
}

const WEAK_ACCURACY_THRESHOLD = 60;
const MIN_ATTEMPTS_FOR_SIGNAL = 3;

type Accent = "amber" | "rose" | "emerald";

const ACCENT_CLASSES: Record<Accent, string> = {
  amber: "border-amber-500/20 bg-amber-950/20 hover:bg-amber-950/30 text-amber-300",
  rose: "border-rose-500/20 bg-rose-950/20 hover:bg-rose-950/30 text-rose-300",
  emerald: "border-emerald-500/20 bg-emerald-950/20 hover:bg-emerald-950/30 text-emerald-300",
};

function NodeList({
  title,
  nodes,
  accent,
  kind,
  onOpenNode,
}: {
  title: string;
  nodes: KnowledgeNode[];
  accent: Accent;
  kind: KnowledgeStateListKind;
  onOpenNode: (node: KnowledgeNode, kind: KnowledgeStateListKind) => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/60 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">{title}</div>
      <div className="space-y-1">
        {nodes.map((n) => (
          <button
            key={n.id}
            onClick={() => onOpenNode(n, kind)}
            className={`w-full flex items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs font-medium border transition-colors ${ACCENT_CLASSES[accent]}`}
          >
            <span className="truncate">{n.title}</span>
            <span className="text-[10px] opacity-70 shrink-0">p.{n.sourcePages[0] ?? "?"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function KnowledgeStatePanel({ nodes, onOpenNode }: KnowledgeStatePanelProps) {
  const [progressByNodeId, setProgressByNodeId] = useState<Map<string, KnowledgeNodeProgress>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    if (nodes.length === 0) {
      setProgressByNodeId(new Map());
      setLoaded(true);
      return;
    }
    setLoaded(false);
    Promise.all(nodes.map(async (n) => [n.id, await getNodeProgress(n.id).catch(() => null)] as const))
      .then((entries) => {
        if (!alive) return;
        const map = new Map<string, KnowledgeNodeProgress>();
        for (const [id, p] of entries) if (p) map.set(id, p);
        setProgressByNodeId(map);
        setLoaded(true);
      })
      .catch(() => {
        if (alive) {
          setProgressByNodeId(new Map());
          setLoaded(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [nodes]);

  if (!loaded || nodes.length === 0) return null;

  const dueForRecall = selectDueForRecall({ nodes, progressByNodeId });

  const weakConcepts = selectWeakNodes({
    nodes,
    progressByNodeId,
    weakAccuracyThreshold: WEAK_ACCURACY_THRESHOLD,
    minAttemptsForSignal: MIN_ATTEMPTS_FOR_SIGNAL,
  }).slice(0, 5);

  const recentlyMastered = selectRecentlyMastered({ nodes, progressByNodeId });

  if (dueForRecall.length === 0 && weakConcepts.length === 0 && recentlyMastered.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="text-xs font-bold uppercase tracking-widest text-indigo-400">Knowledge State</div>
      {dueForRecall.length > 0 && (
        <NodeList title="⏰ Due for Recall" nodes={dueForRecall} accent="amber" kind="due" onOpenNode={onOpenNode} />
      )}
      {weakConcepts.length > 0 && (
        <NodeList title="🎯 Test Lab Recommended" nodes={weakConcepts} accent="rose" kind="weak" onOpenNode={onOpenNode} />
      )}
      {recentlyMastered.length > 0 && (
        <NodeList title="✅ Recently Mastered" nodes={recentlyMastered} accent="emerald" kind="mastered" onOpenNode={onOpenNode} />
      )}
    </div>
  );
}
