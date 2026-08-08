// lib/insights/requestDiagnostics.ts
// Shared helpers for the structured, production-safe diagnostic logs required
// on the AI-backed page-reading endpoints (SurgeonAnnotationPlan, Professor
// Lesson Planner) and their client hooks: a per-request id to correlate a
// client log line with the matching server log line, and a one-way hash for
// documentId so a book's identity never appears in logs as plain text.
//
// Textbook TEXT (page content, quotes, narration) must never be logged by
// callers of these helpers — only identifiers, counts, and timings.

// Caps how much of a caller-supplied string THIS MODULE's own callers ever
// hash — documentId is a request-body value (bounded by the route's own
// body-size limit, but not by anything in this module), so the loop bound
// used for it must never be taken directly from an unbounded/attacker-
// controlled length. Other callers of the shared fnv1a below (e.g. a
// content-integrity hash over full page text, where truncating would
// silently reduce detection fidelity for long pages) pass their own bound —
// see fnv1a's maxLength param.
const MAX_HASH_INPUT_LENGTH = 2048;

// The ONE fnv1a implementation in the app — exported so every other
// content/identity hash (lib/insights/pageContentHash.ts's
// computePageContentHash, lib/useActivePageIntelligence.ts's textHash) reuses
// it instead of reimplementing the same algorithm. Previously there were
// THREE independent hash routines for conceptually related "detect content
// change" purposes: this one, an identical copy-paste of it inside
// pageContentHash.ts (missing this file's length cap), and a completely
// different base-31 polynomial rolling hash inside useActivePageIntelligence.ts
// — a future change to hashing behavior would have needed applying in up to
// three places (Thought Unit Engine identity audit's RC5 finding).
// maxLength defaults to the FULL string (no truncation) — callers that need
// a bound (hashDocumentId below, guarding against an unbounded/untrusted
// input) pass one explicitly; a correctness-sensitive caller (a content hash
// over real page text) is never silently truncated unless it asks to be.
export function fnv1a(str: string, maxLength: number = str.length): string {
  let hash = 0x811c9dc5;
  const len = Math.min(str.length, maxLength);
  for (let i = 0; i < len; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** One-way, non-reversible id for a documentId — safe to log; the raw
 *  documentId (which may embed a filename or title) is not. */
export function hashDocumentId(documentId: string): string {
  return `doc_${fnv1a(documentId, MAX_HASH_INPUT_LENGTH)}`;
}

let counter = 0;

/** A per-request correlation id — cheap, collision-resistant enough for log
 *  correlation (not a security token). No crypto dependency so it works
 *  identically in the browser and on the server. */
export function newRequestId(): string {
  counter = (counter + 1) % 1_000_000;
  return `req_${Date.now().toString(36)}_${counter.toString(36)}`;
}
