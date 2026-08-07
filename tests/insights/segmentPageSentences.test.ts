// tests/insights/segmentPageSentences.test.ts
// Pure-function tests for the deterministic sentence segmenter that backs
// SurgeonAnnotationPlan's sentenceId-based grounding (see
// lib/highlights/groundSurgeonQuotes.ts's Stage 0).

import { segmentPageSentences, sentencesById, formatSentenceList } from "../../lib/insights/segmentPageSentences";

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
