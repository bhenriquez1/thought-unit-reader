"use client";

// The single public Recall surface. The former classic dashboard/session is
// quarantined for migration reference only and is not
// reachable from Reader navigation. Shared RecallSet storage remains because
// Recall imports existing cards into the canonical blueprint store.

import React, { useCallback, useEffect, useState } from "react";
import Recall2Lab from "./Recall2Lab";
import { getAllRecallSets, getAllRecallSetsAsync, type RecallSet } from "@/lib/recalllab/recallStore";
import type { GroundedSurgeonAnnotation } from "@/lib/highlights/groundSurgeonQuotes";
import type { ThoughtUnitDetail } from "@/lib/insights/buildThoughtUnitDetail";
import type { NoteCard } from "@/lib/insights/synthesizeTeachingOutput";

interface RecallLabProps {
  onNavigateToPage?: (pageNumber: number) => void;
  bookId?: string;
  documentId: string;
  pageTruthKey: string;
  surgeonPageTruthKey?: string | null;
  groundedAnnotations: GroundedSurgeonAnnotation[];
  knowledgeNodeId?: string | null;
  refreshKey?: number;
  lastSetId?: string;
  openUnit?: ThoughtUnitDetail | null;
  onOpenUnitConsumed?: () => void;
  onVisualize?: (detail: ThoughtUnitDetail) => void;
  onOpenInWhiteboard?: (detail: ThoughtUnitDetail) => void;
  onOpenExplainStep?: (detail: ThoughtUnitDetail) => void;
  focusedKnowledgeNodeId?: string | null;
  currentPageNoteCards?: NoteCard[] | null;
  currentPage?: number;
  currentPageTitle?: string | null;
}

function forDocument(sets: RecallSet[], documentId: string): RecallSet[] {
  return sets.filter(set => set.documentId === documentId);
}

export default function RecallLab({
  onNavigateToPage,
  bookId,
  documentId,
  pageTruthKey,
  surgeonPageTruthKey,
  groundedAnnotations,
  knowledgeNodeId,
  refreshKey,
  openUnit,
  onOpenUnitConsumed,
  currentPage,
  currentPageTitle,
}: RecallLabProps) {
  const [legacySets, setLegacySets] = useState<RecallSet[]>(() => forDocument(getAllRecallSets(), documentId));

  const reloadMigrationSource = useCallback(() => {
    getAllRecallSetsAsync().then(sets => setLegacySets(forDocument(sets, documentId)));
  }, [documentId]);

  useEffect(() => { reloadMigrationSource(); }, [reloadMigrationSource, refreshKey]);
  useEffect(() => {
    window.addEventListener("recall-lab-updated", reloadMigrationSource);
    return () => window.removeEventListener("recall-lab-updated", reloadMigrationSource);
  }, [reloadMigrationSource]);

  // A Thought Unit pushed from the Reader is already represented by current
  // grounded evidence in Recall. Consume the old deep-link signal without
  // reopening the quarantined classic detail/session surface.
  useEffect(() => {
    if (openUnit) onOpenUnitConsumed?.();
  }, [openUnit, onOpenUnitConsumed]);

  return (
    <section data-testid="recall-canonical-surface" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <header style={{ padding: "14px 14px 11px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 750, color: "rgba(255,255,255,0.96)" }}>Recall</div>
        <div style={{ marginTop: 3, fontSize: 10, color: "rgba(148,163,184,0.68)" }}>
          Memory engineering • active retrieval • spaced review
        </div>
      </header>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <Recall2Lab
          bookId={bookId}
          documentId={documentId}
          pageNumber={currentPage ?? 0}
          pageTruthKey={pageTruthKey}
          surgeonPageTruthKey={surgeonPageTruthKey}
          groundedAnnotations={groundedAnnotations}
          knowledgeNodeId={knowledgeNodeId}
          bookTitle={legacySets[0]?.bookTitle}
          topic={currentPageTitle ?? undefined}
          legacySets={legacySets}
          onNavigateToPage={onNavigateToPage}
        />
      </div>
    </section>
  );
}
