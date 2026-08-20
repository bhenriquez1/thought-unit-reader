// lib/highlights/highlightCoverage.ts
// Stabilization item 4C-5a — Highlight Coverage Auditor (deterministic
// two-state slice: "highlighted" vs "unaccounted"). Cross-references a
// page's canonical body sentences (lib/pdf/canonicalPageMap.ts) against its
// final, density-limited HighlightTarget[] set — the same sentences the
// student actually sees decided upon, not the pre-density-limit proposal.
//
// Deliberately NOT the full 3-way classification (highlighted /
// intentionally-omitted / unsupported-unresolved) from the original spec:
// distinguishing "the AI saw this and decided it wasn't highlight-worthy"
// from "this is a real coverage gap" requires the AI to self-report what it
// considered and skipped, which nothing in the current pipeline captures.
// That's a separate, later phase (4C-5b) — a prompt/schema change, a
// different risk class than this file. This file only ever answers "did
// SOMETHING account for this sentence," never "was it correct to skip it."
//
// Two rules matter more than the matching logic itself:
//   1. Only regionRole === "body" sentences are ever audited — furniture/
//      heading/caption/checkpoint/callout sentences are never counted for OR
//      against coverage. "Never highlight page furniture merely to achieve
//      100% coverage" extends symmetrically to "never COUNT furniture
//      against coverage either."
//   2. Never computed against mismatched text. canonicalMap.fullText must
//      equal the EXACT pageText the highlights were grounded against, or
//      this returns null — the same consistency check
//      segmentPageSentences' own canonical-path safety rule uses (item
//      4C-3), for the same reason: char offsets from two different text
//      reconstructions are not comparable, even if they look similar.

import type { CanonicalPageMap } from "../pdf/canonicalPageMapRegistry";
import type { HighlightTarget } from "../readerContracts";

export type CoverageStatus = "highlighted" | "unaccounted";

export interface SentenceCoverage {
  sentenceId: string;
  text: string;
  status: CoverageStatus;
}

export interface CoverageReport {
  pageIndex: number;
  auditedSentenceCount: number;
  highlightedCount: number;
  unaccountedCount: number;
  sentences: SentenceCoverage[];
}

/**
 * A sentence counts as "highlighted" via either:
 *   (a) an EXACT canonical sentenceId match — some target's
 *       sourceSentenceId equals this sentence's id. Only ever set when
 *       grounding resolved via Stage 0 (guaranteed-exact, no string
 *       matching), and Stage 0 is only ever attempted for fullSentence-
 *       scope annotations in the first place (see
 *       groundSurgeonQuotes.ts's own header comment) — so an id match is
 *       already, by construction, a real whole-sentence highlight.
 *   (b) a char-range OVERLAP with a fullSentence-scope target's
 *       sourceCharStart/sourceCharEnd. Entity-scope targets (a single
 *       term/formula/drug name — a deliberate fragment) are EXCLUDED from
 *       this path: a fragment overlapping a sentence's range does not mean
 *       the whole proposition was surfaced to the student. A target with
 *       an unresolved position (sourceCharStart/End absent) is excluded
 *       too — never guess a location for coverage purposes.
 */
export function computeHighlightCoverage(
  canonicalMap: CanonicalPageMap | undefined,
  pageText: string,
  highlightTargets: HighlightTarget[],
): CoverageReport | null {
  if (!canonicalMap || canonicalMap.fullText !== pageText) return null;

  const bodySentences = canonicalMap.sentences.filter(s => s.regionRole === "body");

  const idMatches = new Set(
    highlightTargets
      .map(t => t.sourceSentenceId)
      .filter((id): id is string => Boolean(id)),
  );

  const overlapCandidates = highlightTargets.filter(
    (t): t is HighlightTarget & { sourceCharStart: number; sourceCharEnd: number } =>
      t.spanScope !== "entity" && typeof t.sourceCharStart === "number" && typeof t.sourceCharEnd === "number",
  );

  const sentences: SentenceCoverage[] = bodySentences.map(s => {
    const covered = idMatches.has(s.id)
      || overlapCandidates.some(t => t.sourceCharStart < s.charEnd && t.sourceCharEnd > s.charStart);
    return { sentenceId: s.id, text: s.text, status: covered ? "highlighted" : "unaccounted" };
  });

  const highlightedCount = sentences.filter(s => s.status === "highlighted").length;

  return {
    pageIndex: canonicalMap.pageIndex,
    auditedSentenceCount: sentences.length,
    highlightedCount,
    unaccountedCount: sentences.length - highlightedCount,
    sentences,
  };
}
