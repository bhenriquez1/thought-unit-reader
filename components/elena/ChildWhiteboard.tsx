"use client";
// components/elena/ChildWhiteboard.tsx
// L19 — Elena Mode's first real Whiteboard integration. A light, child-safe
// mount of the SAME TldrawCanvas/useProfessorLesson engine the adult Reader
// uses (audience: "child" selects the simpler Director/runtime-agent prompt
// variants L18 already wired end to end) — but skips WhiteboardPanel's
// adult-only NoteLab/Recall/StudyGuide save machinery entirely: nothing here
// persists a lesson snapshot or writes to the Knowledge Graph.
//
// Content source: Elena's own per-page CanonicalThoughtUnits (lib/elena/
// childCanonicalExtraction.ts's lightweight, non-AI chunker) — the same
// canonical records elena-buddy/elena-vocab already ground their answers in
// — converted to the Whiteboard's CanonicalEntryInput[] shape by
// childCanonicalToVsgEntries.ts.

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { getCanonicalUnitsByPage } from "@/lib/canonical/store";
import type { CanonicalThoughtUnit } from "@/lib/canonical/types";
import { childCanonicalUnitsToVsgEntries } from "@/lib/elena/childCanonicalToVsgEntries";
import { computeVSGState } from "@/lib/whiteboard/visualSceneGraph";
import { buildPageTruthKey } from "@/lib/useActivePageIntelligence";

const TldrawCanvas = dynamic(() => import("@/components/whiteboard/TldrawCanvas"), { ssr: false });

interface ChildWhiteboardProps {
  documentId: string;
  /** 1-based, matching ChildLibraryEntry.currentPage. */
  currentPage: number;
  bookTitle: string;
  onClose: () => void;
}

export default function ChildWhiteboard({ documentId, currentPage, bookTitle, onClose }: ChildWhiteboardProps) {
  // Loaded fresh per documentId/currentPage — extraction is best-effort and
  // asynchronous (childCanonicalExtraction.ts runs off the reader's own
  // page-text-ready callback), so a page the child just turned to may not
  // have units yet; the "nothing to draw yet" state below handles that.
  const [units, setUnits] = useState<CanonicalThoughtUnit[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUnits(null);
    getCanonicalUnitsByPage(documentId, currentPage - 1)
      .then((result) => { if (!cancelled) setUnits(result); })
      .catch(() => { if (!cancelled) setUnits([]); });
    return () => { cancelled = true; };
  }, [documentId, currentPage]);

  const entries = useMemo(
    () => (units ? childCanonicalUnitsToVsgEntries(units) : []),
    [units],
  );
  const vsgState = useMemo(
    () => computeVSGState(entries, "flow", { pageNumber: currentPage }),
    [entries, currentPage],
  );
  const pageTruthKey = useMemo(
    () => buildPageTruthKey(documentId, currentPage),
    [documentId, currentPage],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-indigo-300/20 bg-slate-950/40">
      <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-300/80">🎨 Let&apos;s draw it out</div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          ✕ Close
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {units === null ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
            Getting the page ready…
          </div>
        ) : vsgState.status !== "ready" ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
            There&apos;s nothing to draw on this page yet — keep reading and check back!
          </div>
        ) : (
          <TldrawCanvas
            noteCards={[]}
            pageTitle={bookTitle}
            vsg={vsgState.vsg}
            documentId={documentId}
            pageTruthKey={pageTruthKey}
            activeCanonicalUnitId={null}
            audience="child"
            autoStartProfessor
            storageKey={`elena_${documentId}_${pageTruthKey}`}
          />
        )}
      </div>
    </div>
  );
}
