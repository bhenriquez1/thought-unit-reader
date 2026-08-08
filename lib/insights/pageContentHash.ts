// lib/insights/pageContentHash.ts
// A content-derived integrity fingerprint for a page — additive to, never a
// replacement for, the existing pageTruthKey (lib/useActivePageIntelligence.ts's
// `${documentId}::${pageNumber}::${textReady ? "t" : "f"}`, used pervasively
// across caching, Chief Resident identity, and PDF highlightKey construction).
//
// pageTruthKey answers "is this the same page slot" (position-based: same
// document, same page number, text loaded). pageContentHash answers "is this
// literally the same extracted text" — it changes if re-extraction ever
// produces different text for the same page slot, which pageTruthKey alone
// cannot detect. Used ONLY as a request/response integrity check for the
// Surgeon Annotation pipeline (pages/api/page-annotation-plan.ts): the client
// sends it, the server echoes it back unchanged, and the client re-derives
// its own current value at response time and rejects on mismatch — the same
// "a late result from page 77 must never render on page 78" guarantee
// pageTruthKey already gives, now also covering "or the SAME page slot with
// different content."
//
// No crypto dependency (must run identically in the browser and on the
// server) — a plain, deterministic, non-cryptographic hash is sufficient
// here since this is an integrity check against accidental staleness, not a
// security boundary. fnv1a itself lives in requestDiagnostics.ts — the ONE
// shared implementation, not a local copy (see that file's doc comment).

import { fnv1a } from "./requestDiagnostics";

/** Case/whitespace-insensitive so a purely cosmetic re-extraction (different
 *  line wrapping, extra spaces) doesn't spuriously invalidate a matching page. */
export function normalizeForContentHash(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function computePageContentHash(
  documentId: string,
  pageNumber: number,
  structuredText: string,
): string {
  const normalized = normalizeForContentHash(structuredText);
  return `pch_${fnv1a(`${documentId}::${pageNumber}::${normalized}`)}`;
}
