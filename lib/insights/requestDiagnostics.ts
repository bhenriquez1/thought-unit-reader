// lib/insights/requestDiagnostics.ts
// Shared helpers for the structured, production-safe diagnostic logs required
// on the AI-backed page-reading endpoints (SurgeonAnnotationPlan, Professor
// Lesson Planner) and their client hooks: a per-request id to correlate a
// client log line with the matching server log line, and a one-way hash for
// documentId so a book's identity never appears in logs as plain text.
//
// Textbook TEXT (page content, quotes, narration) must never be logged by
// callers of these helpers — only identifiers, counts, and timings.

// Caps how much of a caller-supplied string this ever hashes — documentId is
// a request-body value (bounded by the route's own body-size limit, but not
// by anything in this module), so the loop bound here must never be taken
// directly from an unbounded/attacker-controlled length.
const MAX_HASH_INPUT_LENGTH = 2048;

function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  const len = Math.min(str.length, MAX_HASH_INPUT_LENGTH);
  for (let i = 0; i < len; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** One-way, non-reversible id for a documentId — safe to log; the raw
 *  documentId (which may embed a filename or title) is not. */
export function hashDocumentId(documentId: string): string {
  return `doc_${fnv1a(documentId)}`;
}

let counter = 0;

/** A per-request correlation id — cheap, collision-resistant enough for log
 *  correlation (not a security token). No crypto dependency so it works
 *  identically in the browser and on the server. */
export function newRequestId(): string {
  counter = (counter + 1) % 1_000_000;
  return `req_${Date.now().toString(36)}_${counter.toString(36)}`;
}
