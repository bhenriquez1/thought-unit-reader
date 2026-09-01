"use client";

// components/library/LibraryRowProgress.tsx
// L7 — self-contained per-row progress line for the Library drawer.
// Fetches on mount for its own bookId (same "compute progress for a book
// that isn't necessarily open" pattern KnowledgeStatePanel already uses
// for the current book's nodes), so rendering N rows doesn't block the
// drawer opening on N sequential IDB round-trips.

import React, { useEffect, useState } from "react";
import { computeBookProgressSummary, type BookProgressSummary } from "@/lib/library/bookProgressSummary";

export default function LibraryRowProgress({ bookId }: { bookId: string }) {
  const [summary, setSummary] = useState<BookProgressSummary | null>(null);

  useEffect(() => {
    let alive = true;
    setSummary(null);
    computeBookProgressSummary(bookId).then((s) => { if (alive) setSummary(s); });
    return () => { alive = false; };
  }, [bookId]);

  if (!summary) return null;

  const parts: string[] = [];
  if (summary.furthestPageReached != null) parts.push(`p.${summary.furthestPageReached} reached`);
  if (summary.conceptsEncountered > 0) parts.push(`${summary.conceptsEncountered} concept${summary.conceptsEncountered === 1 ? "" : "s"}`);
  if (summary.dueForRecallCount > 0) parts.push(`${summary.dueForRecallCount} due`);
  if (summary.weakConceptsCount > 0) parts.push(`${summary.weakConceptsCount} weak`);
  if (summary.notesCount > 0) parts.push(`${summary.notesCount} note${summary.notesCount === 1 ? "" : "s"}`);

  if (parts.length === 0) return <div className="text-[10px] text-gray-500 mt-0.5">Not started yet</div>;

  return (
    <div className="text-[10px] text-gray-400 mt-0.5 flex flex-wrap gap-x-2">
      {parts.map((p, i) => <span key={i}>{p}</span>)}
    </div>
  );
}
