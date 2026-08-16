// lib/elena/childCanonicalExtraction.ts
// E3 — Elena's own book now produces real CanonicalThoughtUnits, the SAME
// shared record every other product (Reader, DAT Apex, NoteLab, Recall)
// reads from. Reuses chunkTextToUnits/buildCanonicalUnits/saveCanonicalUnits
// verbatim — the exact pipeline pages/index.tsx's startBookProcessing runs
// for the adult Reader's whole-book upload — just triggered per-page as
// Elena reads instead of once for the whole book at upload time. Geometric
// grounding degrades gracefully (buildCanonicalUnits falls back to
// synthetic/ungrounded anchors when a page hasn't been rendered through a
// PDF text layer yet) — never blocks or fails extraction.

import { chunkTextToUnits } from "@/lib/parser";
import { buildCanonicalUnits, type RawPageChunk } from "@/lib/canonical/builder";
import { saveCanonicalUnits, getCanonicalUnitsByPage } from "@/lib/canonical/store";

/** Pure — mirrors pages/index.tsx's startBookProcessing onBatch handler:
 *  chunk raw page text into thought-unit-sized pieces with char offsets. */
export function buildCanonicalChunks(pageText: string): RawPageChunk[] {
  const rawChunks = chunkTextToUnits(pageText);
  let searchStart = 0;
  return rawChunks.map((chunk) => {
    const idx = pageText.indexOf(chunk.text, searchStart);
    const startChar = idx >= 0 ? idx : searchStart;
    const endChar = startChar + chunk.text.length;
    searchStart = endChar;
    return { text: chunk.text, startChar, endChar };
  });
}

/**
 * Extracts and persists CanonicalThoughtUnits for one page of a child's own
 * book. Skips pages that already have units (avoids re-extracting on every
 * revisit) and no-ops on empty text — safe to call on every page-text-ready
 * callback without throttling at the caller.
 */
export async function extractChildPageCanonicalUnits(
  documentId: string,
  bookTitle: string,
  pageIndex: number,
  pageText: string,
): Promise<void> {
  if (!pageText || !pageText.trim()) return;

  const existing = await getCanonicalUnitsByPage(documentId, pageIndex);
  if (existing.length > 0) return;

  const chunks = buildCanonicalChunks(pageText);
  if (chunks.length === 0) return;

  const units = buildCanonicalUnits({ documentId, bookId: documentId, bookTitle, pageIndex, chunks });
  if (units.length > 0) await saveCanonicalUnits(units);
}
