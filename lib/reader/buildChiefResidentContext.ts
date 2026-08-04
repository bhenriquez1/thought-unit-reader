// lib/reader/buildChiefResidentContext.ts
// The SINGLE shared context-builder for Chief Resident. There is exactly one
// component that owns Chief Resident's teaching UI and request-building:
// components/notelab/ChiefResidentPanel.tsx. Reader opens it via
// components/reader/ChiefResidentModalShell.tsx, a chrome-only wrapper with
// no generation logic of its own — so this builder effectively has a single
// caller today, kept as its own module because /api/chief-resident-teaching's
// request shape and matchesFrozenSnapshot() validation are independently
// unit-testable concerns.
//
// Root cause this exists to prevent: prior to this, each caller built its own
// ad-hoc request body. The Reader's version discarded real page text whenever
// canonicalUnits were present (fixed separately, see chief-resident-teaching.ts's
// buildUserContext), and neither caller validated that a streamed response
// still belonged to the page/document it was requested for. One builder, one
// validation function — used identically by both — closes off that entire
// class of bug rather than requiring two implementations to independently
// stay correct.

import type {
  ChiefResidentRequest,
  TeachingMode,
  TeachingAudience,
  TeachingMessage,
  CanonicalUnitInput,
} from "@/pages/api/chief-resident-teaching";

/**
 * The frozen identity of "which page/document this Chief Resident request is
 * for" — captured ONCE when a request is sent, never re-read from live state
 * afterward. Every SSE event is checked against this exact object, not
 * against whatever the caller's current props happen to be by the time the
 * event arrives.
 */
export interface ChiefResidentFrozenSnapshot {
  documentId:    string;
  pageNumber:    number;
  pageTruthKey:  string;
  pageText:      string;
  canonicalUnits?: CanonicalUnitInput[];
  activeCanonicalUnitId?: string | null;
  domain?:       string;
}

export interface BuildChiefResidentContextArgs extends ChiefResidentFrozenSnapshot {
  mode:          TeachingMode;
  audience?:     TeachingAudience;
  selectedText?: string;
  title?:        string;
  messages?:     TeachingMessage[];
}

const IMPORTANCE_SORT_KEY = (u: CanonicalUnitInput): number =>
  u.priorityTier != null ? -u.priorityTier
  : u.importanceScore != null ? -u.importanceScore
  : 0;

/**
 * Build the exact request body sent to /api/chief-resident-teaching.
 * canonicalUnits (when present) are sorted highest-importance-first so the
 * API's structured block reads critical-first regardless of the order the
 * caller happened to collect them in.
 */
export function buildChiefResidentContext(args: BuildChiefResidentContextArgs): ChiefResidentRequest {
  const {
    documentId, pageNumber, pageTruthKey, pageText, canonicalUnits,
    mode, audience, selectedText, title, messages,
  } = args;

  return {
    mode,
    audience,
    sourceText:     pageText,
    canonicalUnits: canonicalUnits && canonicalUnits.length > 0
      ? [...canonicalUnits].sort((a, b) => IMPORTANCE_SORT_KEY(a) - IMPORTANCE_SORT_KEY(b))
      : undefined,
    selectedText,
    title,
    messages: messages ?? [],
    documentId,
    pageNumber,
    pageTruthKey,
  };
}

/** Shape of the identity fields echoed back on every SSE event. */
export interface ChiefResidentSSEIdentity {
  documentId?:   string;
  pageNumber?:   number;
  pageTruthKey?: string;
}

/**
 * True only when an SSE event's echoed identity matches the frozen snapshot
 * the request was built from, on all three fields. Used to discard a token,
 * error, or completion event that arrived for a superseded request (page
 * changed, document changed, modal closed, a newer request started) even if
 * it was already in flight over the network when the client tried to abort.
 */
export function matchesFrozenSnapshot(
  event:  ChiefResidentSSEIdentity,
  frozen: ChiefResidentFrozenSnapshot,
): boolean {
  return event.documentId === frozen.documentId
    && event.pageNumber === frozen.pageNumber
    && event.pageTruthKey === frozen.pageTruthKey;
}
