// tests/insights/segmentPageSentences.test.ts
// Pure-function tests for the deterministic sentence segmenter that backs
// SurgeonAnnotationPlan's sentenceId-based grounding (see
// lib/highlights/groundSurgeonQuotes.ts's Stage 0).

import { segmentPageSentences, sentencesById, formatSentenceList, findSentenceSpans } from "../../lib/insights/segmentPageSentences";
import { buildCanonicalPageMap } from "../../lib/pdf/canonicalPageMap";
import { CanonicalPageMapRegistry } from "../../lib/pdf/canonicalPageMapRegistry";

describe("segmentPageSentences — basic segmentation", () => {
  it("returns [] for empty/null/undefined input", () => {
    expect(segmentPageSentences("")).toEqual([]);
    expect(segmentPageSentences(null)).toEqual([]);
    expect(segmentPageSentences(undefined)).toEqual([]);
  });

  it("splits a simple multi-sentence page into ID'd sentences in order", () => {
    const text = "The cell is the basic unit of life. Mitochondria produce ATP through respiration. Ribosomes synthesize proteins from mRNA.";
    const result = segmentPageSentences(text);
    expect(result.map(s => s.id)).toEqual(["S001", "S002", "S003"]);
    expect(result[0].text).toBe("The cell is the basic unit of life.");
    expect(result[1].text).toBe("Mitochondria produce ATP through respiration.");
    expect(result[2].text).toBe("Ribosomes synthesize proteins from mRNA.");
  });

  it("REQUIRED: every returned sentence is an exact substring of the input text (indexOf must succeed)", () => {
    const text = "First real sentence here for testing. Second real sentence follows immediately after that one.";
    const result = segmentPageSentences(text);
    for (const s of result) {
      expect(text.indexOf(s.text)).toBeGreaterThan(-1);
    }
  });

  it("does not cross a paragraph break (double newline) into the next block", () => {
    const text = "First paragraph sentence with enough length to pass the floor.\n\nSecond paragraph sentence also long enough to pass the floor.";
    const result = segmentPageSentences(text);
    expect(result).toHaveLength(2);
    expect(result[0].text).not.toContain("Second paragraph");
  });
});

describe("segmentPageSentences — filters junk", () => {
  it("REQUIRED: skips lines that look like a running header/footer (isLikelyHeaderLine)", () => {
    const text = "CHAPTER 4 Acid-Base Equilibrium\n\nBuffer solutions resist changes in pH through a weak acid and its conjugate base working together.";
    const result = segmentPageSentences(text);
    expect(result.every(s => !/^CHAPTER 4/.test(s.text))).toBe(true);
    expect(result.some(s => s.text.includes("Buffer solutions resist"))).toBe(true);
  });

  it("skips implausibly short fragments (below the minimum length floor)", () => {
    const text = "Ok.\n\nA genuinely complete sentence long enough to pass the minimum length floor easily.";
    const result = segmentPageSentences(text);
    expect(result.every(s => s.text.length >= 15)).toBe(true);
  });

  it("respects the maxSentences cap on a very dense page", () => {
    const many = Array.from({ length: 100 }, (_, i) => `This is test sentence number ${i} with enough length to count.`).join(" ");
    const result = segmentPageSentences(many, 10);
    expect(result).toHaveLength(10);
    expect(result[9].id).toBe("S010");
  });
});

describe("sentencesById / formatSentenceList", () => {
  it("builds an id -> text lookup map", () => {
    const sentences = segmentPageSentences("First sentence goes right here for the test. Second sentence goes right here too.");
    const map = sentencesById(sentences);
    expect(map.get("S001")).toBe(sentences[0].text);
    expect(map.get("S002")).toBe(sentences[1].text);
    expect(map.has("S999")).toBe(false);
  });

  it("formats the numbered list as \"S001: text\" lines, one per sentence", () => {
    const sentences = segmentPageSentences("First sentence goes right here for the test. Second sentence goes right here too.");
    const formatted = formatSentenceList(sentences);
    expect(formatted).toMatch(/^S001: First sentence goes right here for the test\./);
    expect(formatted).toContain("S002: Second sentence goes right here too.");
  });
});

describe("findSentenceSpans — the shared boundary core (item 4C-1)", () => {
  it("REQUIRED: every span's offsets are exact — rawPageText.slice(start, end) === text always holds", () => {
    const text = "First sentence here for the test. Second sentence follows right after that one. Third one too.";
    const spans = findSentenceSpans(text);
    expect(spans.length).toBeGreaterThan(0);
    for (const span of spans) {
      expect(text.slice(span.start, span.end)).toBe(span.text);
    }
  });

  it("REQUIRED: retains every span with no length/header filtering — segmentPageSentences filters this same input down, findSentenceSpans does not", () => {
    const text = "CHAPTER 4 Acid-Base Equilibrium\n\nOk.\n\nBuffer solutions resist changes in pH through a weak acid and its conjugate base.";
    const spans = findSentenceSpans(text);
    const filtered = segmentPageSentences(text);
    expect(spans.length).toBeGreaterThan(filtered.length);
    expect(spans.some(s => s.text.startsWith("CHAPTER 4"))).toBe(true);
    expect(spans.some(s => s.text === "Ok.")).toBe(true);
  });

  it("REQUIRED: segmentPageSentences' filtered output is a subsequence of findSentenceSpans' text, in the same order — the refactor shares one boundary algorithm, not two independently-drifting ones", () => {
    const text = "CHAPTER 4 Acid-Base Equilibrium\n\nBuffer solutions resist changes in pH through a weak acid and its conjugate base. A common trap students fall into is assuming buffer capacity is unlimited.";
    const spans = findSentenceSpans(text);
    const filtered = segmentPageSentences(text);
    const spanTexts = spans.map(s => s.text);
    let cursor = -1;
    for (const s of filtered) {
      const idx = spanTexts.indexOf(s.text, cursor + 1);
      expect(idx).toBeGreaterThan(cursor);
      cursor = idx;
    }
  });

  it("returns [] for empty/null/undefined input", () => {
    expect(findSentenceSpans("")).toEqual([]);
    expect(findSentenceSpans(null)).toEqual([]);
    expect(findSentenceSpans(undefined)).toEqual([]);
  });
});

describe("segmentPageSentences — item 4C-3: canonical-map-backed ids when available and consistent", () => {
  beforeEach(() => {
    CanonicalPageMapRegistry.clear();
  });

  it("REQUIRED: uses the canonical map's stable ids when pageIndex is given and the registry's fullText matches exactly", () => {
    const text = "The cell is the basic unit of life. Mitochondria produce ATP through respiration.";
    CanonicalPageMapRegistry.set(buildCanonicalPageMap(3, text));
    const result = segmentPageSentences(text, 80, 3);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "S001", text: "The cell is the basic unit of life." });
    expect(result[1]).toEqual({ id: "S002", text: "Mitochondria produce ATP through respiration." });
  });

  it("REQUIRED: the SAME candidate set (text-wise) is produced whether or not the canonical map is used — a pure infrastructure migration, not a content change", () => {
    const text = "CHAPTER 4 Acid-Base Equilibrium\n\nBuffer solutions resist changes in pH through a weak acid and its conjugate base.";
    const withoutCanonical = segmentPageSentences(text); // no pageIndex -> fallback path
    CanonicalPageMapRegistry.set(buildCanonicalPageMap(5, text));
    const withCanonical = segmentPageSentences(text, 80, 5);
    expect(withCanonical.map(s => s.text)).toEqual(withoutCanonical.map(s => s.text));
  });

  it("REQUIRED: canonical-path ids are not guaranteed contiguous (they reflect position in the FULL unfiltered enumeration), but every id still resolves correctly via sentencesById", () => {
    // "CHAPTER 4..." is S001 in the canonical map (retained, tagged
    // page-furniture/heading) but filtered OUT of the candidate list here —
    // so the single surviving body sentence is S002, not S001.
    const text = "CHAPTER 4 Acid-Base Equilibrium\n\nBuffer solutions resist changes in pH through a weak acid and its conjugate base.";
    CanonicalPageMapRegistry.set(buildCanonicalPageMap(7, text));
    const result = segmentPageSentences(text, 80, 7);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("S002");
    const map = sentencesById(result);
    expect(map.get("S002")).toBe(result[0].text);
  });

  it("REQUIRED: the same sentence keeps the SAME id across repeated calls against the same cached canonical map — the actual id-stability benefit over the always-fresh-and-contiguous fallback", () => {
    const text = "CHAPTER 4 Acid-Base Equilibrium\n\nBuffer solutions resist changes in pH through a weak acid and its conjugate base.";
    CanonicalPageMapRegistry.set(buildCanonicalPageMap(9, text));
    const first = segmentPageSentences(text, 80, 9);
    const second = segmentPageSentences(text, 80, 9);
    expect(first).toEqual(second);
  });

  it("falls back to fresh computation when no canonical map exists yet for that pageIndex (extraction still running)", () => {
    const text = "The cell is the basic unit of life. Mitochondria produce ATP through respiration.";
    // Registry deliberately left empty for pageIndex 11.
    const result = segmentPageSentences(text, 80, 11);
    expect(result[0].id).toBe("S001"); // contiguous fallback numbering
    expect(result[0].text).toBe("The cell is the basic unit of life.");
  });

  it("REQUIRED: falls back to fresh computation, never trusting a stale/different-content canonical map, when the registry's fullText does not match rawPageText", () => {
    const staleText = "This is completely different page content from a stale cached entry.";
    CanonicalPageMapRegistry.set(buildCanonicalPageMap(13, staleText));
    const currentText = "The cell is the basic unit of life. Mitochondria produce ATP through respiration.";
    const result = segmentPageSentences(currentText, 80, 13);
    // Fallback contiguous numbering over the CURRENT text, not anything
    // derived from the stale cached map.
    expect(result[0]).toEqual({ id: "S001", text: "The cell is the basic unit of life." });
    expect(result.every(s => s.text !== staleText)).toBe(true);
  });

  it("respects maxSentences on the canonical path exactly like the fallback path", () => {
    const many = Array.from({ length: 20 }, (_, i) => `This is test sentence number ${i} with enough length to count.`).join(" ");
    CanonicalPageMapRegistry.set(buildCanonicalPageMap(17, many));
    const result = segmentPageSentences(many, 5, 17);
    expect(result).toHaveLength(5);
  });
});
