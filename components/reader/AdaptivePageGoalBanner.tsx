"use client";

// components/reader/AdaptivePageGoalBanner.tsx
// Self-contained Mission banner for the left panel.
// Derives the AdaptiveGuide internally from the navigator entries + session history,
// then delegates rendering to PageGoalBanner. No adaptive-guide state lives in parents.

import React, { useMemo, useState, useEffect } from "react";
import type { ThoughtUnitNavigatorEntry } from "./ThoughtUnitNavigator";
import PageGoalBanner from "./PageGoalBanner";
import { buildAdaptiveGuide, type AdaptableUnit } from "@/lib/adaptiveGuide/adaptiveGuideEngine";
import { buildStudentProfile } from "@/lib/adaptiveGuide/studentProfile";
import { useSessionStore } from "@/lib/adaptiveGuide/sessionStore";

// Maps Phase 1C CanonicalSemanticType → adaptive guide engine canonicalType
const CANONICAL_TO_ENGINE: Record<string, string> = {
  "core-concept":    "thesis",
  "definition":      "definition",
  "mechanism":       "mechanism",
  "process":         "mechanism",
  "formula":         "dat_fact",
  "high-yield":      "dat_fact",
  "clinical-pearl":  "clinical",
  "memory-anchor":   "memoryAnchor",
  "common-error":    "trap",
  "warning":         "trap",
  "exception":       "trap",
  "contraindication":"trap",
  "worked-example":  "application",
  "indication":      "application",
  "treatment":       "application",
  "finding":         "keyDetail",
  "cause":           "keyDetail",
  "classification":  "keyDetail",
  "decision-point":  "keyDetail",
  "complication":    "keyDetail",
  "relationship":    "keyDetail",
  "evidence":        "keyDetail",
};

// Maps ParagraphKind / anchorType → adaptive guide engine canonicalType
const KIND_TO_ENGINE: Record<string, string> = {
  thesis:         "thesis",
  conclusion:     "thesis",
  definition:     "definition",
  mechanism:      "mechanism",
  formula:        "dat_fact",
  trap:           "trap",
  clinical:       "clinical",
  clinical_pearl: "clinical",
  memoryAnchor:   "memoryAnchor",
  memory_hook:    "memoryAnchor",
  application:    "application",
  example_step:   "application",
  keyDetail:      "keyDetail",
  keyAnatomy:     "keyDetail",
  anatomy:        "keyDetail",
  comparison:     "keyDetail",
  dat_fact:       "dat_fact",
};

interface AdaptivePageGoalBannerProps {
  bookId: string;
  currentPage: number;
  entries: ThoughtUnitNavigatorEntry[];
}

export default function AdaptivePageGoalBanner({
  bookId,
  currentPage,
  entries,
}: AdaptivePageGoalBannerProps) {
  const [completed, setCompleted] = useState(false);

  // Reset completion state when page changes
  useEffect(() => { setCompleted(false); }, [currentPage]);

  const allSessions = useSessionStore(s => s.sessions);
  const allRecalls  = useSessionStore(s => s.recalls);
  const sessions = useMemo(
    () => allSessions.filter(s => s.bookId === bookId),
    [allSessions, bookId],
  );
  const recalls = useMemo(
    () => allRecalls.filter(r => r.bookId === bookId),
    [allRecalls, bookId],
  );

  const adaptableUnits = useMemo<AdaptableUnit[]>(() =>
    entries.map(e => ({
      id:            e.id,
      text:          e.text,
      title:         e.title ?? e.reason?.slice(0, 60) ?? undefined,
      canonicalType: e.canonicalType
        ? (CANONICAL_TO_ENGINE[e.canonicalType] ?? e.canonicalType)
        : (KIND_TO_ENGINE[e.kind] ?? e.kind),
      importanceScore: e.importanceScore ?? (e.priorityTier ? e.priorityTier * 20 : undefined),
      priorityTier:  e.priorityTier,
      pageNumber:    currentPage,
    })),
    [entries, currentPage],
  );

  const studentProfile = useMemo(
    () => buildStudentProfile(bookId, sessions, recalls),
    [bookId, sessions, recalls],
  );

  const adaptiveGuide = useMemo(
    () => buildAdaptiveGuide(adaptableUnits, studentProfile, currentPage),
    [adaptableUnits, studentProfile, currentPage],
  );

  if (entries.length === 0) return null;

  return (
    <PageGoalBanner
      mission={adaptiveGuide.mission}
      learnerState={adaptiveGuide.learnerState}
      completed={completed}
      onMarkComplete={() => setCompleted(true)}
    />
  );
}
