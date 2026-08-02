// tests/highlights/groundSurgeonQuotes.test.ts
// Pure-function tests for the strict SurgeonAnnotationPlan quote verifier.
// Key regression guard: a near-miss quote (the kind groundHighlightAnchors.ts's
// stage-3 semantic recovery would have rescued by substituting a different
// sentence) must be REJECTED here, not silently replaced — per the confirmed
// "strict reject only" design decision for this pipeline.

import { groundSurgeonQuotes } from "../../lib/highlights/groundSurgeonQuotes";
import type { SurgeonAnnotationPlan } from "../../lib/insights/pageAnnotationPlan";

type Annotation = SurgeonAnnotationPlan["annotations"][number];

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    canonicalType: "definition",
    exactQuote:    "Glycolysis converts glucose into pyruvate in the cytosol.",
    reason:        "Defines the core process for this page.",
    importance:    "critical",
    treatment:     "definitionBar",
    ...overrides,
  };
}

const PAGE_TEXT =
  "Cellular Respiration Overview\n\n" +
  "Glycolysis converts glucose into pyruvate in the cytosol. " +
  "This process yields a net gain of two ATP molecules per glucose.\n\n" +
  "The Krebs cycle then oxidizes pyruvate-derived acetyl-CoA in the mitochondrial matrix.";

describe("groundSurgeonQuotes — Stage 1: exact match", () => {
  it("accepts a quote that appears verbatim in the page text", () => {
    const result = groundSurgeonQuotes([makeAnnotation()], PAGE_TEXT);
    expect(result).toHaveLength(1);
    expect(result[0].groundingState).toBe("exact");
    expect(result[0].confidence).toBe(1.0);
    expect(result[0].groundedText).toBe("Glycolysis converts glucose into pyruvate in the cytosol.");
  });

  it("carries forward canonicalType, reason, importance, treatment unchanged", () => {
    const annotation = makeAnnotation({ canonicalType: "mechanism", treatment: "mechanismBrace", importance: "high" });
    const result = groundSurgeonQuotes([annotation], PAGE_TEXT);
    expect(result[0].canonicalType).toBe("mechanism");
    expect(result[0].treatment).toBe("mechanismBrace");
    expect(result[0].importance).toBe("high");
  });
});

describe("groundSurgeonQuotes — Stage 2: normalized match", () => {
  it("accepts a quote that differs only by en/em-dash vs. hyphen", () => {
    const pageWithDash = "Oxygen–dependent ATP production occurs in the mitochondria.";
    const annotation = makeAnnotation({ exactQuote: "Oxygen-dependent ATP production occurs in the mitochondria." });
    const result = groundSurgeonQuotes([annotation], pageWithDash);
    expect(result).toHaveLength(1);
    expect(result[0].groundingState).toBe("normalized");
    expect(result[0].confidence).toBe(0.95);
  });

  it("accepts a quote that differs only by extra internal whitespace", () => {
    const annotation = makeAnnotation({ exactQuote: "Glycolysis converts glucose  into   pyruvate in the cytosol." });
    const result = groundSurgeonQuotes([annotation], PAGE_TEXT);
    expect(result).toHaveLength(1);
    expect(result[0].groundingState).toBe("normalized");
  });
});

describe("groundSurgeonQuotes — Stage 3: strict reject (no semantic substitution)", () => {
  it("rejects and excludes a quote that does not appear anywhere in the page", () => {
    const annotation = makeAnnotation({ exactQuote: "Photosynthesis converts sunlight into chemical energy." });
    const result = groundSurgeonQuotes([annotation], PAGE_TEXT);
    expect(result).toHaveLength(0);
  });

  it("REGRESSION GUARD: a near-miss, semantically-similar quote is rejected, not substituted with a different real sentence", () => {
    // This exact quote is close in meaning to a real sentence on the page ("Glycolysis
    // converts glucose into pyruvate...") but is NOT verbatim (wrong verb, different
    // structure) — groundHighlightAnchors.ts's stage-3 recovery would likely have
    // substituted the real sentence here. groundSurgeonQuotes must NOT do that.
    const nearMiss = makeAnnotation({ exactQuote: "Glucose is transformed into pyruvate during glycolysis in the cell cytoplasm." });
    const result = groundSurgeonQuotes([nearMiss], PAGE_TEXT);
    expect(result).toHaveLength(0);
    // Confirm no other annotation was fabricated in its place.
    expect(result.length).toBe(0);
  });

  it("never returns a groundedText that differs from a real match found in the page", () => {
    // Sanity check: whenever an annotation IS returned, its groundedText is the
    // original exactQuote unchanged — never a "recovered" replacement sentence.
    const annotation = makeAnnotation();
    const result = groundSurgeonQuotes([annotation], PAGE_TEXT);
    expect(result[0].groundedText).toBe(annotation.exactQuote);
  });
});

describe("groundSurgeonQuotes — batch behavior", () => {
  it("keeps matched annotations and drops unmatched ones from a mixed batch", () => {
    const good = makeAnnotation({ exactQuote: "The Krebs cycle then oxidizes pyruvate-derived acetyl-CoA in the mitochondrial matrix." });
    const bad  = makeAnnotation({ exactQuote: "This sentence does not exist on the page at all." });
    const result = groundSurgeonQuotes([good, bad], PAGE_TEXT);
    expect(result).toHaveLength(1);
    expect(result[0].exactQuote).toBe(good.exactQuote);
  });

  it("returns an empty array for empty pageText", () => {
    expect(groundSurgeonQuotes([makeAnnotation()], "")).toEqual([]);
  });

  it("returns an empty array for an empty annotations list", () => {
    expect(groundSurgeonQuotes([], PAGE_TEXT)).toEqual([]);
  });
});
