// lib/highlights/highlightAgent.ts
// HA1 — the Highlight Agent's narrow mission, first pass: enforce ONE
// grounding standard for anything that claims to be a "grounded annotation
// candidate" bound for a consumer that has no independent way to re-verify
// it, regardless of which upstream pipeline proposed it.
//
// Background: this codebase runs two parallel annotation systems.
// "Pipeline B" (lib/insights/pageAnnotationPlan.ts + groundSurgeonQuotes.ts)
// is strict reject-only — it owns the PDF overlay exclusively and never
// substitutes a different sentence for one that doesn't verify. "Pipeline A"
// (lib/highlights/groundHighlightAnchors.ts + currentPageStudyModel.ts's
// VisualAnchor) is older and deliberately permissive: it rescues a
// paraphrased AI anchor by substituting the best-scoring REAL sentence —
// correct for its own purpose (Pipeline A never claims verbatim), but wrong
// if that substituted output is later treated as if it WERE verbatim.
//
// pages/api/chief-resident-teaching.ts's own header comment documents
// exactly this risk for its optional canonicalUnits field ("carry no
// guarantee they're grounded... confirmed root cause of a report where a
// chemistry page's Chief Resident answered about glycolysis/Krebs cycle").
// At the time of this module, no current caller of buildChiefResidentContext
// actually populates canonicalUnits — the code path that once did was
// deleted along with the old Reader-only ChiefResidentModal.tsx during the
// Chief Resident consolidation — so that specific incident is dormant, not
// live. But the field is still a supported part of the request shape, so
// nothing stops a future caller from wiring Pipeline A's VisualAnchor-derived
// candidates straight through, silently reintroducing the exact bug that was
// already diagnosed once. buildChiefResidentContext.ts now runs any supplied
// canonicalUnits through groundHighlightCandidates() before they can reach a
// request, so a future caller gets the safe behavior automatically instead
// of having to remember to re-derive it.
//
// Deliberately narrow: this does NOT change Pipeline A's own behavior for
// ITS OWN consumers (the Thought Unit Navigator/Roadmap sidebar) — semantic
// substitution stays exactly as useful there as it always was. It also does
// NOT touch pages/api/page-annotation-plan.ts's existing schema-retry/
// coverage-repair machinery, or attempt a from-scratch page-type classifier
// — both were judged, on investigation, to be incremental/already-hardened
// concerns rather than the acute failure this pass targets.

import { normText } from "./groundHighlightAnchors";

export interface HighlightCandidate {
  text: string;
  sentenceId?: string | null;
}

export type HighlightGroundingState = "sentenceId" | "exact" | "normalized";
export type HighlightRejectReason = "empty_text" | "no_match";

export interface GroundedHighlightCandidate<T extends HighlightCandidate> {
  candidate: T;
  groundingState: HighlightGroundingState;
}

export interface RejectedHighlightCandidate<T extends HighlightCandidate> {
  candidate: T;
  reason: HighlightRejectReason;
}

export interface HighlightGroundingResult<T extends HighlightCandidate> {
  grounded: GroundedHighlightCandidate<T>[];
  rejected: RejectedHighlightCandidate<T>[];
}

// Mirrors groundSurgeonQuotes.ts's own floor — below this length, a
// normalized substring match is too likely to be a coincidental fragment
// rather than a genuine grounding.
const MIN_NORMALIZED_MATCH_LENGTH = 5;

/**
 * Pure — no network, no IDB, no React. A generalized version of
 * groundSurgeonQuotes.ts's three-stage strict-reject verification
 * (sentenceId lookup -> exact substring -> normalized substring), but over
 * a minimal HighlightCandidate shape rather than SurgeonAnnotationPlan's own
 * annotation type, and WITHOUT sentence-boundary expansion — a candidate's
 * text (e.g. a CanonicalUnitInput) is already a complete unit, not a
 * fragment quote that needs widening. Never substitutes a different
 * sentence for one that fails to match; a candidate that can't be verified
 * is rejected, never rewritten — same "no highlight is better than a wrong
 * highlight" discipline groundSurgeonQuotes.ts documents.
 */
export function groundHighlightCandidates<T extends HighlightCandidate>(
  candidates: readonly T[],
  pageText: string,
  sentencesById?: ReadonlyMap<string, string>,
): HighlightGroundingResult<T> {
  const grounded: GroundedHighlightCandidate<T>[] = [];
  const rejected: RejectedHighlightCandidate<T>[] = [];

  if (!pageText || pageText.length < 10) {
    for (const candidate of candidates) rejected.push({ candidate, reason: "no_match" });
    return { grounded, rejected };
  }

  const normedPage = normText(pageText);

  for (const candidate of candidates) {
    const text = candidate.text?.trim();
    if (!text) {
      rejected.push({ candidate, reason: "empty_text" });
      continue;
    }

    // Stage 0 — sentenceId lookup: guaranteed-exact by construction, no
    // string matching involved.
    if (candidate.sentenceId && sentencesById?.has(candidate.sentenceId)) {
      grounded.push({ candidate, groundingState: "sentenceId" });
      continue;
    }

    // Stage 1 — exact substring match.
    if (pageText.includes(text)) {
      grounded.push({ candidate, groundingState: "exact" });
      continue;
    }

    // Stage 2 — normalized match (ligatures/quotes/dashes/whitespace).
    const normedText = normText(text);
    if (normedText.length >= MIN_NORMALIZED_MATCH_LENGTH && normedPage.includes(normedText)) {
      grounded.push({ candidate, groundingState: "normalized" });
      continue;
    }

    // Stage 3 — no match. Reject, never substitute.
    rejected.push({ candidate, reason: "no_match" });
  }

  return { grounded, rejected };
}
