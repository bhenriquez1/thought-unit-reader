"use client";
// components/recalllab/Recall2Lab.tsx
// Container that wires Recall2Dashboard + Recall2Session together.
// Manages the blueprint store, view state, and refresh events.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  getBlueprintsForDocument,
  getBlueprintsForDocumentAsync,
  saveBlueprintsPreservingProgress,
} from "@/lib/recalllab/recall2Store";
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
import Recall2Dashboard from "./Recall2Dashboard";
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
  const [view,       setView]       = useState<View>({ kind: "dashboard" });

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
      <CanonicalRecallPanel modes={canonicalModes} onStart={startCanonicalMode} />
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <Recall2Dashboard
          blueprints={blueprints}
          legacySets={legacySets}
          bookId={bookId}
          topic={topic}
          bookTitle={bookTitle}
          onStartSession={(queue, phases) => setView({ kind: "session", queue, phases, canonical: false })}
          onRefresh={reload}
        />
      </div>
    </div>
  );
}

const MODE_ICON: Record<CanonicalRecallModeBundle["mode"], string> = {
  concept: "🧠",
  "professor-snapshot": "🧑‍🏫",
  "misconception-repair": "🛠️",
};

function CanonicalRecallPanel({
  modes,
  onStart,
}: {
  modes: CanonicalRecallModeBundle[];
  onStart: (mode: CanonicalRecallModeBundle) => Promise<void>;
}) {
  const [starting, setStarting] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  return (
    <div style={{ margin: "10px 12px 0", padding: 10, borderRadius: 11, border: "1px solid rgba(52,211,153,0.28)", background: "rgba(16,185,129,0.06)", flexShrink: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", color: "#6ee7b7", marginBottom: 3 }}>
        CURRENT PAGE RETRIEVAL
      </div>
      <div style={{ fontSize: 9, color: "rgba(148,163,184,0.58)", marginBottom: 8 }}>
        Canonical Thought Units and saved lessons only · no page re-analysis
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
        {modes.map(mode => {
          const enabled = mode.cards.length > 0 && !starting;
          return (
            <button
              key={mode.mode}
              type="button"
              disabled={!enabled}
              title={mode.description}
              onClick={() => {
                setStarting(mode.mode);
                setStartError(null);
                void onStart(mode)
                  .catch(() => setStartError("Could not prepare this retrieval session. Please try again."))
                  .finally(() => setStarting(null));
              }}
              style={{ padding: "8px 5px", minWidth: 0, borderRadius: 8, border: `1px solid ${enabled ? "rgba(52,211,153,0.25)" : "rgba(255,255,255,0.05)"}`, background: enabled ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.02)", color: enabled ? "rgba(255,255,255,0.82)" : "rgba(148,163,184,0.3)", cursor: enabled ? "pointer" : "default" }}
            >
              <div style={{ fontSize: 15 }}>{MODE_ICON[mode.mode]}</div>
              <div style={{ fontSize: 8, fontWeight: 700, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {mode.title}
              </div>
              <div style={{ fontSize: 8, marginTop: 2, color: enabled ? "#6ee7b7" : "rgba(148,163,184,0.25)" }}>
                {starting === mode.mode ? "Preparing…" : `${mode.cards.length} card${mode.cards.length === 1 ? "" : "s"}`}
              </div>
            </button>
          );
        })}
      </div>
      {startError && (
        <div role="alert" style={{ marginTop: 7, fontSize: 9, color: "#fca5a5" }}>{startError}</div>
      )}
    </div>
  );
}
