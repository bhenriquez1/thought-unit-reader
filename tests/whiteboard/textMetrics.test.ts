// tests/whiteboard/textMetrics.test.ts
import {
  estimateLabelWidth, estimateLabelHeight, wordCount, isParagraphShaped, clampToShortLabel,
} from "../../lib/whiteboard/textMetrics";

describe("estimateLabelWidth — responsive layout: width derives from label length", () => {
  it("a longer label gets a wider box than a shorter one", () => {
    const short = estimateLabelWidth("Aspirin");
    const long  = estimateLabelWidth("Rapid airway breathing circulation assessment");
    expect(long).toBeGreaterThan(short);
  });

  it("never goes below a sane minimum, even for a one-character label", () => {
    expect(estimateLabelWidth("X")).toBeGreaterThanOrEqual(120);
  });

  it("is capped at a maximum so an unusually long label doesn't blow out the canvas", () => {
    const width = estimateLabelWidth("A".repeat(200));
    expect(width).toBeLessThanOrEqual(700);
  });

  it("REQUIRED: a full 8-word label fits on one line within the cap — the direct fix for boxes too narrow to hold a short phrase", () => {
    const eightWordLabel = "When a strong acid is added to solution";
    const width = estimateLabelWidth(eightWordLabel);
    // Rough same char-width estimate the module itself uses, so a label at
    // the top of the allowed 2-8 word range never gets clipped by the cap.
    expect(width).toBeGreaterThanOrEqual(eightWordLabel.length * 7);
  });

  it("is deterministic — same label always produces the same width", () => {
    expect(estimateLabelWidth("Aspirin overdose")).toBe(estimateLabelWidth("Aspirin overdose"));
  });
});

describe("estimateLabelHeight", () => {
  it("returns a fixed, positive height", () => {
    expect(estimateLabelHeight()).toBeGreaterThan(0);
  });
});

describe("wordCount", () => {
  it("counts words separated by whitespace", () => {
    expect(wordCount("Rapid airway assessment")).toBe(3);
  });
  it("returns 0 for empty/whitespace-only text", () => {
    expect(wordCount("   ")).toBe(0);
    expect(wordCount("")).toBe(0);
  });
});

describe("isParagraphShaped — the guard against textbook prose inside a node", () => {
  it("flags a long single sentence as paragraph-shaped", () => {
    expect(isParagraphShaped(
      "The clinician should perform a rapid initial assessment of the patient's overall condition before proceeding.",
    )).toBe(true);
  });

  it("flags multi-sentence text as paragraph-shaped even if individually short", () => {
    expect(isParagraphShaped("Phase one is X. Phase two is Y.")).toBe(true);
  });

  it("does not flag a short hand-written phrase", () => {
    expect(isParagraphShaped("Rapid assessment")).toBe(false);
    expect(isParagraphShaped("Airway, breathing, circulation")).toBe(false);
  });
});

describe("clampToShortLabel — labels must normally contain 2-8 words", () => {
  it("leaves a short phrase unchanged", () => {
    expect(clampToShortLabel("Rapid assessment")).toBe("Rapid assessment");
  });

  it("truncates a long phrase at the word boundary to <=8 words by default", () => {
    const result = clampToShortLabel("The clinician should perform a rapid initial assessment of the patient");
    expect(wordCount(result)).toBeLessThanOrEqual(8);
    expect(result).toBe("The clinician should perform a rapid initial assessment");
  });

  it("respects a custom maxWords", () => {
    const result = clampToShortLabel("one two three four five six", 3);
    expect(result).toBe("one two three");
  });

  it("never produces a mid-word cut", () => {
    const result = clampToShortLabel("alpha beta gamma delta epsilon zeta eta theta iota kappa", 4);
    expect(result.split(" ").every(w => "alpha beta gamma delta epsilon zeta eta theta iota kappa".split(" ").includes(w))).toBe(true);
  });
});
