"use client";
// components/recalllab/Recall2Lab.tsx
// Container that wires Recall2Dashboard + Recall2Session together.
// Manages the blueprint store, view state, and refresh events.

import React, { useCallback, useEffect, useState } from "react";
import { getBlueprints, getBlueprintsAsync } from "@/lib/recalllab/recall2Store";
import type { RecallBlueprint, SessionPhase } from "@/lib/recalllab/recall2Types";
import type { RecallSet } from "@/lib/recalllab/recallStore";
import Recall2Dashboard from "./Recall2Dashboard";
import Recall2Session   from "./Recall2Session";

type View =
  | { kind: "dashboard" }
  | { kind: "session"; queue: RecallBlueprint[]; phases: SessionPhase[] };

interface Recall2LabProps {
  bookId?:           string;
  bookTitle?:        string;
  topic?:            string;
  legacySets:        RecallSet[];
  onNavigateToPage?: (page: number) => void;
}

export default function Recall2Lab({
  bookId,
  bookTitle,
  topic,
  legacySets,
  onNavigateToPage,
}: Recall2LabProps) {
  const [blueprints, setBlueprints] = useState<RecallBlueprint[]>(() => getBlueprints(bookId));
  const [view,       setView]       = useState<View>({ kind: "dashboard" });

  const reload = useCallback(() => {
    getBlueprintsAsync(bookId).then(setBlueprints);
  }, [bookId]);

  // Initial IDB load
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when bookId changes
  useEffect(() => {
    setView({ kind: "dashboard" });
    reload();
  }, [bookId, reload]);

  // Listen for store updates from other components
  useEffect(() => {
    window.addEventListener("recall2-updated", reload);
    return () => window.removeEventListener("recall2-updated", reload);
  }, [reload]);

  if (view.kind === "session") {
    return (
      <Recall2Session
        initialQueue={view.queue}
        phases={view.phases}
        topic={topic}
        bookTitle={bookTitle}
        onClose={() => { setView({ kind: "dashboard" }); reload(); }}
        onNavigateToPage={onNavigateToPage}
      />
    );
  }

  return (
    <Recall2Dashboard
      blueprints={blueprints}
      legacySets={legacySets}
      bookId={bookId}
      topic={topic}
      bookTitle={bookTitle}
      onStartSession={(queue, phases) => setView({ kind: "session", queue, phases })}
      onRefresh={reload}
    />
  );
}
