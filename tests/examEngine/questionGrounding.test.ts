// tests/examEngine/questionGrounding.test.ts
// X2 — the strict provenance/rejection gate. isGroundedQuote/normalizeForGrounding
// are pure and get full behavioral coverage, mirroring the same quote-
// grounding pattern already proven in professorTldrawAgent.ts's
// isGroundedLabelText.

import { isGroundedQuote, normalizeForGrounding, QUESTION_GENERATOR_VERSION } from "@/lib/examEngine/questionGrounding";

describe("normalizeForGrounding", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeForGrounding("The  Mitochondria   IS the powerhouse")).toBe("the mitochondria is the powerhouse");
  });

  it("strips punctuation but keeps a safe symbol set (%+-/())", () => {
    expect(normalizeForGrounding("ATP yields 30-32% efficiency (approx.)")).toBe("atp yields 30-32% efficiency (approx )");
  });
});

describe("isGroundedQuote", () => {
  const source = normalizeForGrounding(
    "The mitochondria is the powerhouse of the cell. It produces ATP through cellular respiration, " +
    "a process that occurs primarily in the inner membrane.",
  );

  it("REQUIRED: a real, sufficiently long verbatim quote from the source is accepted", () => {
    expect(isGroundedQuote("The mitochondria is the powerhouse of the cell.", source)).toBe(true);
  });

  it("REQUIRED: tolerates whitespace/case/punctuation drift between the claimed quote and the source", () => {
    expect(isGroundedQuote("the   MITOCHONDRIA is the powerhouse of the cell", source)).toBe(true);
  });

  it("REQUIRED: a fabricated quote not present in the source is rejected", () => {
    expect(isGroundedQuote("Photosynthesis occurs in the chloroplast during daylight hours.", source)).toBe(false);
  });

  it("REQUIRED: a too-short quote is rejected even if it technically matches — avoids trivial common-phrase matches", () => {
    expect(isGroundedQuote("the cell", source)).toBe(false);
  });

  it("rejects an empty quote", () => {
    expect(isGroundedQuote("", source)).toBe(false);
  });
});

describe("QUESTION_GENERATOR_VERSION", () => {
  it("is a positive integer, stamped onto every surviving question", () => {
    expect(Number.isInteger(QUESTION_GENERATOR_VERSION)).toBe(true);
    expect(QUESTION_GENERATOR_VERSION).toBeGreaterThan(0);
  });
});
