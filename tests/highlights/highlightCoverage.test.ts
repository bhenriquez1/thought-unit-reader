// tests/highlights/highlightCoverage.test.ts
// Stabilization item 4C-5a — Highlight Coverage Auditor (deterministic
// two-state: highlighted / unaccounted).

import { computeHighlightCoverage } from "../../lib/highlights/highlightCoverage";
import { buildCanonicalPageMap } from "../../lib/pdf/canonicalPageMap";
import type { HighlightTarget } from "../../lib/readerContracts";

function target(overrides: Partial<HighlightTarget> = {}): HighlightTarget {
  return {
    id: "t1", page: 1, text: "x", normalizedText: "x", level: "high", score: 1,
    sourceParagraphIndex: 0, kind: "definition", evidenceRefId: "t1",
    ...overrides,
  } as HighlightTarget;
}

describe("computeHighlightCoverage", () => {
  const PAGE_TEXT =
    "CHAPTER 4 Acid-Base Equilibrium\n\n" +
    "Buffer solutions resist changes in pH through a weak acid and its conjugate base. " +
    "A strong acid added to the buffer reacts with the conjugate base. " +
    "The buffer capacity is not unlimited.";

  it("returns null when no canonicalMap is given", () => {
    expect(computeHighlightCoverage(undefined, PAGE_TEXT, [])).toBeNull();
  });

  it("REQUIRED: returns null when canonicalMap.fullText does not match pageText exactly — never audits against mismatched text", () => {
    const map = buildCanonicalPageMap(0, "This is completely different page content.");
    expect(computeHighlightCoverage(map, PAGE_TEXT, [])).toBeNull();
  });

  it("REQUIRED: excludes non-body sentences (chapter heading/furniture) from the audit entirely — not counted for or against coverage", () => {
    const map = buildCanonicalPageMap(0, PAGE_TEXT);
    const report = computeHighlightCoverage(map, PAGE_TEXT, [])!;
    expect(report).not.toBeNull();
    expect(report.sentences.every(s => !s.text.startsWith("CHAPTER 4"))).toBe(true);
    // Only the 3 real body sentences are audited.
    expect(report.auditedSentenceCount).toBe(3);
  });

  it("REQUIRED: a sentenceId match marks that exact sentence highlighted, others unaccounted", () => {
    const map = buildCanonicalPageMap(0, PAGE_TEXT);
    const bufferSentence = map.sentences.find(s => s.text.startsWith("Buffer solutions"))!;
    const report = computeHighlightCoverage(map, PAGE_TEXT, [
      target({ sourceSentenceId: bufferSentence.id }),
    ])!;
    expect(report.highlightedCount).toBe(1);
    expect(report.unaccountedCount).toBe(2);
    const match = report.sentences.find(s => s.sentenceId === bufferSentence.id)!;
    expect(match.status).toBe("highlighted");
  });

  it("REQUIRED: a fullSentence-scope char-offset overlap marks a sentence highlighted even without sourceSentenceId", () => {
    const map = buildCanonicalPageMap(0, PAGE_TEXT);
    const strongAcidSentence = map.sentences.find(s => s.text.startsWith("A strong acid"))!;
    const report = computeHighlightCoverage(map, PAGE_TEXT, [
      target({
        spanScope: "fullSentence",
        sourceCharStart: strongAcidSentence.charStart,
        sourceCharEnd: strongAcidSentence.charEnd,
      }),
    ])!;
    const match = report.sentences.find(s => s.sentenceId === strongAcidSentence.id)!;
    expect(match.status).toBe("highlighted");
  });

  it("REQUIRED: an entity-scope highlight overlapping a sentence's range does NOT mark that whole sentence highlighted", () => {
    const map = buildCanonicalPageMap(0, PAGE_TEXT);
    const bufferSentence = map.sentences.find(s => s.text.startsWith("Buffer solutions"))!;
    const report = computeHighlightCoverage(map, PAGE_TEXT, [
      target({
        spanScope: "entity",
        sourceCharStart: bufferSentence.charStart,
        sourceCharEnd: bufferSentence.charStart + 6, // "Buffer" — a fragment, not the whole sentence
      }),
    ])!;
    const match = report.sentences.find(s => s.sentenceId === bufferSentence.id)!;
    expect(match.status).toBe("unaccounted");
  });

  it("a target with no resolved position (sourceCharStart/End absent, no sourceSentenceId) never marks any sentence highlighted — never guesses", () => {
    const map = buildCanonicalPageMap(0, PAGE_TEXT);
    const report = computeHighlightCoverage(map, PAGE_TEXT, [
      target({ spanScope: "fullSentence" /* no offsets, no sourceSentenceId */ }),
    ])!;
    expect(report.highlightedCount).toBe(0);
    expect(report.unaccountedCount).toBe(report.auditedSentenceCount);
  });

  it("REQUIRED: a fully-covered page reports zero unaccounted sentences", () => {
    const map = buildCanonicalPageMap(0, PAGE_TEXT);
    const bodySentences = map.sentences.filter(s => s.regionRole === "body");
    const targets = bodySentences.map(s => target({ id: s.id, sourceSentenceId: s.id }));
    const report = computeHighlightCoverage(map, PAGE_TEXT, targets)!;
    expect(report.unaccountedCount).toBe(0);
    expect(report.highlightedCount).toBe(report.auditedSentenceCount);
  });

  it("a page with no highlights at all reports every body sentence unaccounted", () => {
    const map = buildCanonicalPageMap(0, PAGE_TEXT);
    const report = computeHighlightCoverage(map, PAGE_TEXT, [])!;
    expect(report.highlightedCount).toBe(0);
    expect(report.unaccountedCount).toBe(report.auditedSentenceCount);
    expect(report.sentences.every(s => s.status === "unaccounted")).toBe(true);
  });
});
