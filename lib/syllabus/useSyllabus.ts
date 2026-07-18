// lib/syllabus/useSyllabus.ts
// React hook for loading and generating universal syllabi.
// Loads from IDB on mount; generates via /api/generate-universal-syllabus on demand.

import { useState, useEffect, useRef } from "react";
import type { BookIntelligence } from "@/lib/bookIntelligence/types";
import type { StructureCandidate } from "./syllabusSchema";
import type { UniversalSyllabus } from "./types";
import { loadSyllabus, saveSyllabus } from "./idbStore";

export type SyllabusState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; syllabus: UniversalSyllabus }
  | { status: "generating" }
  | { status: "error"; message: string };

export interface GenerateSignals {
  intelligence: BookIntelligence;
  candidates: StructureCandidate[];
  totalPages: number;
  contextSample?: string;
}

export function useSyllabus(documentId: string | null) {
  const [state, setState] = useState<SyllabusState>({ status: "idle" });
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!documentId) return;
    setState({ status: "loading" });
    loadSyllabus(documentId)
      .then(record => {
        setState(record ? { status: "ready", syllabus: record } : { status: "idle" });
      })
      .catch(() => setState({ status: "idle" }));
  }, [documentId]);

  async function generate(signals: GenerateSignals): Promise<void> {
    if (!documentId || inFlightRef.current) return;
    inFlightRef.current = true;
    setState({ status: "generating" });
    try {
      const res = await fetch("/api/generate-universal-syllabus", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          intelligence:  signals.intelligence,
          candidates:    signals.candidates,
          totalPages:    signals.totalPages,
          contextSample: signals.contextSample,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      await saveSyllabus(data.syllabus);
      setState({ status: "ready", syllabus: data.syllabus });
    } catch (err: any) {
      setState({ status: "error", message: err?.message ?? "Failed to generate syllabus" });
    } finally {
      inFlightRef.current = false;
    }
  }

  return { state, generate };
}
