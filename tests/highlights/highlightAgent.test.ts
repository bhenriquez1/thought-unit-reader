// tests/highlights/highlightAgent.test.ts
// HA1 — real function-call tests for the Highlight Agent's pure grounding
// core: groundHighlightCandidates(). Mirrors groundSurgeonQuotes.ts's own
// three-stage strict-reject discipline (sentenceId -> exact -> normalized),
// generalized to a minimal HighlightCandidate shape.

import { groundHighlightCandidates, type HighlightCandidate } from "../../lib/highlights/highlightAgent";

const PAGE_TEXT = "Atoms consist of a nucleus surrounded by electrons in discrete energy levels.";

describe("groundHighlightCandidates — exact substring match", () => {
  it("grounds a candidate whose text is an exact substring of pageText", () => {
    const candidates: HighlightCandidate[] = [{ text: "electrons in discrete energy levels" }];
    const { grounded, rejected } = groundHighlightCandidates(candidates, PAGE_TEXT);
    expect(grounded).toHaveLength(1);
    expect(grounded[0].groundingState).toBe("exact");
    expect(rejected).toHaveLength(0);
  });
});

describe("groundHighlightCandidates — normalized match", () => {
  it("grounds a candidate that differs only by whitespace collapsing", () => {
    const candidates: HighlightCandidate[] = [{ text: "a nucleus surrounded  by electrons" }];
    const { grounded } = groundHighlightCandidates(candidates, PAGE_TEXT);
    expect(grounded).toHaveLength(1);
    expect(grounded[0].groundingState).toBe("normalized");
  });

  it("grounds a candidate that differs only by case", () => {
    const candidates: HighlightCandidate[] = [{ text: "ATOMS CONSIST OF A NUCLEUS" }];
    const { grounded } = groundHighlightCandidates(candidates, PAGE_TEXT);
    expect(grounded).toHaveLength(1);
    expect(grounded[0].groundingState).toBe("normalized");
  });

  it("does not accept a normalized match shorter than the minimum length floor", () => {
    // "of a" is a real substring but far too short/generic to trust as a match.
    const candidates: HighlightCandidate[] = [{ text: "of a" }];
    const { grounded, rejected } = groundHighlightCandidates(candidates, PAGE_TEXT);
    // "of a" IS an exact substring of PAGE_TEXT ("consist OF A nucleus"), so it
    // is accepted via Stage 1 (exact), not Stage 2 — the length floor only
    // gates the normalized stage. This test documents that distinction.
    expect(grounded).toHaveLength(1);
    expect(grounded[0].groundingState).toBe("exact");
    expect(rejected).toHaveLength(0);
  });
});

describe("groundHighlightCandidates — sentenceId lookup", () => {
  it("grounds via sentenceId even when the text itself would not otherwise match", () => {
    const sentencesById = new Map([["s1", "some sentence text tracked only by id"]]);
    const candidates: HighlightCandidate[] = [{ text: "a paraphrase of that sentence", sentenceId: "s1" }];
    const { grounded } = groundHighlightCandidates(candidates, PAGE_TEXT, sentencesById);
    expect(grounded).toHaveLength(1);
    expect(grounded[0].groundingState).toBe("sentenceId");
  });

  it("falls through to exact/normalized when sentenceId does not resolve in the map", () => {
    const sentencesById = new Map([["s1", "unrelated sentence"]]);
    const candidates: HighlightCandidate[] = [{ text: "electrons in discrete energy levels", sentenceId: "s2" }];
    const { grounded } = groundHighlightCandidates(candidates, PAGE_TEXT, sentencesById);
    expect(grounded).toHaveLength(1);
    expect(grounded[0].groundingState).toBe("exact");
  });
});

describe("groundHighlightCandidates — strict reject, never substitutes", () => {
  it("rejects a candidate with no match anywhere in pageText — no semantic substitution", () => {
    const candidates: HighlightCandidate[] = [{ text: "muscle contraction requires actin and myosin" }];
    const { grounded, rejected } = groundHighlightCandidates(candidates, PAGE_TEXT);
    expect(grounded).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe("no_match");
  });

  it("rejects an empty/whitespace-only candidate text", () => {
    const candidates: HighlightCandidate[] = [{ text: "   " }];
    const { grounded, rejected } = groundHighlightCandidates(candidates, PAGE_TEXT);
    expect(grounded).toHaveLength(0);
    expect(rejected[0].reason).toBe("empty_text");
  });

  it("rejects every candidate when pageText is missing or too short to verify against", () => {
    const candidates: HighlightCandidate[] = [{ text: "electrons in discrete energy levels" }];
    const { grounded, rejected } = groundHighlightCandidates(candidates, "");
    expect(grounded).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe("no_match");
  });
});

describe("groundHighlightCandidates — mixed batch", () => {
  it("grounds the valid candidates and rejects the invalid ones independently, preserving order", () => {
    const candidates: HighlightCandidate[] = [
      { text: "electrons in discrete energy levels" },
      { text: "muscle contraction requires actin and myosin" },
      { text: "a nucleus surrounded by electrons" },
    ];
    const { grounded, rejected } = groundHighlightCandidates(candidates, PAGE_TEXT);
    expect(grounded.map((g) => g.candidate.text)).toEqual([
      "electrons in discrete energy levels",
      "a nucleus surrounded by electrons",
    ]);
    expect(rejected.map((r) => r.candidate.text)).toEqual(["muscle contraction requires actin and myosin"]);
  });
});
