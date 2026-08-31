// tests/speech/sourceWordDiagnostic.test.ts
// Correction (Current Mode losslessness) — real behavioral tests for the
// "sourceWordsExpected/Queued/Skipped" diagnostic assertion the correction
// explicitly requested: "sourceWordsSkipped should be 0 for a successfully
// completed Current reading."

import { countSourceWords, buildSourceWordDiagnostic } from "@/lib/speech/sourceWordDiagnostic";

describe("countSourceWords", () => {
  it("counts space-separated words", () => {
    expect(countSourceWords("The cell membrane regulates transport")).toBe(5);
  });

  it("collapses multiple whitespace/newlines between words without inflating the count", () => {
    expect(countSourceWords("The cell   membrane\nregulates\n\ntransport")).toBe(5);
  });

  it("returns 0 for an empty or whitespace-only string", () => {
    expect(countSourceWords("")).toBe(0);
    expect(countSourceWords("   \n\t  ")).toBe(0);
  });

  it("ignores leading/trailing whitespace", () => {
    expect(countSourceWords("  one two three  ")).toBe(3);
  });
});

describe("buildSourceWordDiagnostic", () => {
  it("REQUIRED: sourceWordsSkipped is 0 when every word in the expected text is present across the queued segments — the correction's own passing case", () => {
    const expectedText = "The cell membrane regulates transport across the lipid bilayer.";
    const queuedSegments = ["The cell membrane regulates transport", "across the lipid bilayer."];
    const diagnostic = buildSourceWordDiagnostic(expectedText, queuedSegments);
    expect(diagnostic).toEqual({
      sourceWordsExpected: 9,
      sourceWordsQueued: 9,
      sourceWordsSkipped: 0,
    });
  });

  it("REQUIRED: sourceWordsSkipped reflects real word loss when queued segments contain fewer words than expected", () => {
    const expectedText = "one two three four five six";
    const queuedSegments = ["one two three"];
    const diagnostic = buildSourceWordDiagnostic(expectedText, queuedSegments);
    expect(diagnostic.sourceWordsExpected).toBe(6);
    expect(diagnostic.sourceWordsQueued).toBe(3);
    expect(diagnostic.sourceWordsSkipped).toBe(3);
  });

  it("sums word counts across ALL queued segments, not just the first", () => {
    const expectedText = "a b c d e f";
    const queuedSegments = ["a b", "c d", "e f"];
    const diagnostic = buildSourceWordDiagnostic(expectedText, queuedSegments);
    expect(diagnostic.sourceWordsQueued).toBe(6);
    expect(diagnostic.sourceWordsSkipped).toBe(0);
  });

  it("REQUIRED: sourceWordsSkipped is never negative — more queued words than expected (e.g. re-segmentation quirks) clamps to 0, never a misleading negative count", () => {
    const expectedText = "one two three";
    const queuedSegments = ["one two three four"]; // hypothetical over-count
    const diagnostic = buildSourceWordDiagnostic(expectedText, queuedSegments);
    expect(diagnostic.sourceWordsSkipped).toBe(0);
  });

  it("handles an empty expected text and empty queue without throwing", () => {
    expect(buildSourceWordDiagnostic("", [])).toEqual({
      sourceWordsExpected: 0,
      sourceWordsQueued: 0,
      sourceWordsSkipped: 0,
    });
  });

  it("an empty queue against real expected text reports the full loss", () => {
    const diagnostic = buildSourceWordDiagnostic("one two three", []);
    expect(diagnostic).toEqual({
      sourceWordsExpected: 3,
      sourceWordsQueued: 0,
      sourceWordsSkipped: 3,
    });
  });
});
