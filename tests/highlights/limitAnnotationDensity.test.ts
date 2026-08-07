// tests/highlights/limitAnnotationDensity.test.ts
// Pure-function tests for the deterministic density post-filter that runs after
// groundSurgeonQuotes.ts — per-category caps, the mechanism/procedure mutual
// exclusion slot, importance-based selection, stable tie-breaks, and the global
// backstop cap.

import { limitAnnotationDensity } from "../../lib/highlights/limitAnnotationDensity";
import type { GroundedSurgeonAnnotation } from "../../lib/highlights/groundSurgeonQuotes";
import { DEFAULT_TREATMENT } from "../../lib/insights/pageAnnotationPlan";
import type { CanonicalType, Importance } from "../../lib/insights/pageAnnotationPlan";

const TREATMENT_FOR: Record<CanonicalType, GroundedSurgeonAnnotation["treatment"]> = DEFAULT_TREATMENT;

function makeGrounded(
  canonicalType: CanonicalType,
  importance: Importance,
  overrides: Partial<GroundedSurgeonAnnotation> = {},
): GroundedSurgeonAnnotation {
  return {
    canonicalType,
    exactQuote:    `${canonicalType} quote`,
    reason:        "reason",
    importance,
    treatment:     TREATMENT_FOR[canonicalType],
    spanScope:     "fullSentence",
    groundedText:  `${canonicalType} quote`,
    groundingState: "exact",
    confidence:    1.0,
    originalIndex: 0,
    ...overrides,
  };
}

describe("limitAnnotationDensity — empty / no-op inputs", () => {
  it("returns [] for empty input", () => {
    expect(limitAnnotationDensity([])).toEqual([]);
  });

  it("passes through input smaller than every cap unchanged (order preserved)", () => {
    const input = [
      makeGrounded("definition", "critical"),
      makeGrounded("trap", "high"),
      makeGrounded("comparison", "supporting"),
    ];
    const result = limitAnnotationDensity(input);
    expect(result).toHaveLength(3);
    expect(result.map(r => r.canonicalType)).toEqual(["definition", "trap", "comparison"]);
  });
});

describe("limitAnnotationDensity — per-category caps", () => {
  it("caps definition at 3, keeping the 3 highest-importance entries", () => {
    const input = [
      makeGrounded("definition", "supporting", { exactQuote: "d1" }),
      makeGrounded("definition", "critical",   { exactQuote: "d2" }),
      makeGrounded("definition", "high",       { exactQuote: "d3" }),
      makeGrounded("definition", "high",       { exactQuote: "d4" }),
      makeGrounded("definition", "supporting", { exactQuote: "d5" }),
    ];
    const result = limitAnnotationDensity(input);
    expect(result).toHaveLength(3);
    expect(result.map(r => r.exactQuote)).toEqual(["d2", "d3", "d4"]);
  });

  it("caps trap, supportingEvidence, decision, comparison, clinicalPearl at 1 each", () => {
    const input = [
      makeGrounded("trap", "high", { exactQuote: "t1" }),
      makeGrounded("trap", "critical", { exactQuote: "t2" }),
      makeGrounded("supportingEvidence", "high", { exactQuote: "e1" }),
      makeGrounded("supportingEvidence", "supporting", { exactQuote: "e2" }),
      makeGrounded("decision", "high", { exactQuote: "dec1" }),
      makeGrounded("comparison", "high", { exactQuote: "c1" }),
      makeGrounded("clinicalPearl", "high", { exactQuote: "p1" }),
    ];
    const result = limitAnnotationDensity(input);
    const byType = (t: CanonicalType) => result.filter(r => r.canonicalType === t);
    expect(byType("trap")).toHaveLength(1);
    expect(byType("trap")[0].exactQuote).toBe("t2"); // higher importance wins
    expect(byType("supportingEvidence")).toHaveLength(1);
    expect(byType("supportingEvidence")[0].exactQuote).toBe("e1");
    expect(byType("decision")).toHaveLength(1);
    expect(byType("comparison")).toHaveLength(1);
    expect(byType("clinicalPearl")).toHaveLength(1);
  });

  it("breaks ties within a category by original array order when importance is equal", () => {
    const input = [
      makeGrounded("trap", "high", { exactQuote: "first" }),
      makeGrounded("trap", "high", { exactQuote: "second" }),
    ];
    const result = limitAnnotationDensity(input);
    expect(result).toHaveLength(1);
    expect(result[0].exactQuote).toBe("first");
  });
});

describe("limitAnnotationDensity — mechanism/procedure mutual exclusion", () => {
  it("keeps only one slot total across mechanism + procedure combined", () => {
    const input = [
      makeGrounded("mechanism", "critical", { exactQuote: "m1" }),
      makeGrounded("procedure", "critical", { exactQuote: "p1" }),
    ];
    const result = limitAnnotationDensity(input);
    const mechOrProc = result.filter(r => r.canonicalType === "mechanism" || r.canonicalType === "procedure");
    expect(mechOrProc).toHaveLength(1);
  });

  it("the type with more surviving instances wins the shared slot", () => {
    const input = [
      makeGrounded("mechanism", "supporting", { exactQuote: "m1" }),
      makeGrounded("mechanism", "supporting", { exactQuote: "m2" }),
      makeGrounded("procedure", "critical", { exactQuote: "p1" }),
    ];
    const result = limitAnnotationDensity(input);
    const mechOrProc = result.filter(r => r.canonicalType === "mechanism" || r.canonicalType === "procedure");
    expect(mechOrProc).toHaveLength(1);
    expect(mechOrProc[0].canonicalType).toBe("mechanism"); // 2 instances beats 1
  });

  it("when counts tie, higher importance within the tied group wins", () => {
    const input = [
      makeGrounded("mechanism", "supporting", { exactQuote: "m1" }),
      makeGrounded("procedure", "critical", { exactQuote: "p1" }),
    ];
    const result = limitAnnotationDensity(input);
    const mechOrProc = result.filter(r => r.canonicalType === "mechanism" || r.canonicalType === "procedure");
    expect(mechOrProc).toHaveLength(1);
    expect(mechOrProc[0].canonicalType).toBe("procedure");
  });

  it("when counts and importance both tie, earliest original index wins", () => {
    const input = [
      makeGrounded("procedure", "high", { exactQuote: "p1" }),
      makeGrounded("mechanism", "high", { exactQuote: "m1" }),
    ];
    const result = limitAnnotationDensity(input);
    const mechOrProc = result.filter(r => r.canonicalType === "mechanism" || r.canonicalType === "procedure");
    expect(mechOrProc).toHaveLength(1);
    expect(mechOrProc[0].canonicalType).toBe("procedure"); // appeared first
  });
});

describe("limitAnnotationDensity — global backstop cap", () => {
  it("caps total output at 8 even when every per-category cap is individually satisfied", () => {
    const input: GroundedSurgeonAnnotation[] = [
      ...Array.from({ length: 3 }, (_, i) => makeGrounded("definition", "critical", { exactQuote: `def${i}` })),
      makeGrounded("mechanism", "critical", { exactQuote: "mech" }),
      makeGrounded("trap", "critical", { exactQuote: "trap" }),
      makeGrounded("supportingEvidence", "critical", { exactQuote: "evid" }),
      makeGrounded("decision", "critical", { exactQuote: "dec" }),
      makeGrounded("comparison", "critical", { exactQuote: "cmp" }),
      makeGrounded("clinicalPearl", "critical", { exactQuote: "pearl" }),
    ];
    // Per-category selection alone would yield 3+1+1+1+1+1+1 = 9 — one over
    // the 8-item ceiling (a genuinely dense page — 7 distinct categories —
    // must still land within the 5-8 target range, not be clipped to 7).
    const result = limitAnnotationDensity(input);
    expect(result.length).toBeLessThanOrEqual(8);
    expect(result).toHaveLength(8);
  });

  it("when the global cap trims entries, lower-importance survivors are dropped first", () => {
    const input: GroundedSurgeonAnnotation[] = [
      ...Array.from({ length: 3 }, (_, i) => makeGrounded("definition", "critical", { exactQuote: `def${i}` })),
      makeGrounded("mechanism", "critical", { exactQuote: "mech" }),
      makeGrounded("trap", "critical", { exactQuote: "trap" }),
      makeGrounded("supportingEvidence", "supporting", { exactQuote: "evid-low" }),
      makeGrounded("decision", "critical", { exactQuote: "dec" }),
      makeGrounded("comparison", "critical", { exactQuote: "cmp" }),
      makeGrounded("clinicalPearl", "supporting", { exactQuote: "pearl-low" }),
    ];
    // 9 candidates, cap 8 — exactly one must be dropped: the lowest-ranked
    // by importance, tie-broken by later original index (pearl-low is both
    // "supporting" AND appears after evid-low, so it's the one cut).
    const result = limitAnnotationDensity(input);
    expect(result).toHaveLength(8);
    const quotes = result.map(r => r.exactQuote);
    expect(quotes).toContain("evid-low");
    expect(quotes).not.toContain("pearl-low");
  });

  it("preserves original relative order in the final output, not importance order", () => {
    const input = [
      makeGrounded("trap", "supporting", { exactQuote: "t1" }),
      makeGrounded("definition", "critical", { exactQuote: "d1" }),
    ];
    const result = limitAnnotationDensity(input);
    expect(result.map(r => r.exactQuote)).toEqual(["t1", "d1"]);
  });
});

describe("limitAnnotationDensity — page-role-adaptive category caps", () => {
  it("REQUIRED: without a pageRole, comparison stays capped at 1 (base default, no regression)", () => {
    const input = [
      makeGrounded("comparison", "critical", { exactQuote: "cmp1" }),
      makeGrounded("comparison", "high", { exactQuote: "cmp2" }),
      makeGrounded("comparison", "supporting", { exactQuote: "cmp3" }),
    ];
    const result = limitAnnotationDensity(input);
    expect(result).toHaveLength(1);
  });

  it("REQUIRED: pageRole 'comparison' raises the comparison cap to 3", () => {
    const input = [
      makeGrounded("comparison", "critical", { exactQuote: "cmp1" }),
      makeGrounded("comparison", "high", { exactQuote: "cmp2" }),
      makeGrounded("comparison", "supporting", { exactQuote: "cmp3" }),
    ];
    const result = limitAnnotationDensity(input, "comparison");
    expect(result).toHaveLength(3);
  });

  it("REQUIRED: pageRole 'comparison' does NOT loosen unrelated categories (trap stays capped at 1)", () => {
    const input = [
      makeGrounded("trap", "critical", { exactQuote: "trap1" }),
      makeGrounded("trap", "high", { exactQuote: "trap2" }),
    ];
    const result = limitAnnotationDensity(input, "comparison");
    expect(result).toHaveLength(1);
  });

  it("REQUIRED: pageRole 'example' raises the supportingEvidence ('worked example') cap to 3", () => {
    const input = [
      makeGrounded("supportingEvidence", "critical", { exactQuote: "ex1" }),
      makeGrounded("supportingEvidence", "high", { exactQuote: "ex2" }),
      makeGrounded("supportingEvidence", "supporting", { exactQuote: "ex3" }),
    ];
    expect(limitAnnotationDensity(input, "example")).toHaveLength(3);
    expect(limitAnnotationDensity(input, null)).toHaveLength(1);
  });

  it("REQUIRED: pageRole 'procedure' gives mechanism AND procedure their OWN slot instead of one shared slot", () => {
    const input = [
      makeGrounded("mechanism", "critical", { exactQuote: "mech1" }),
      makeGrounded("procedure", "critical", { exactQuote: "proc1" }),
    ];
    const withoutOverride = limitAnnotationDensity(input);
    expect(withoutOverride).toHaveLength(1); // shared slot, one winner

    const withOverride = limitAnnotationDensity(input, "procedure");
    expect(withOverride).toHaveLength(2);
    expect(withOverride.map(r => r.exactQuote).sort()).toEqual(["mech1", "proc1"]);
  });

  it("an unrecognized pageRole string falls back to the base caps (no throw)", () => {
    const input = [
      makeGrounded("comparison", "critical", { exactQuote: "cmp1" }),
      makeGrounded("comparison", "high", { exactQuote: "cmp2" }),
    ];
    const result = limitAnnotationDensity(input, "anatomy");
    expect(result).toHaveLength(1);
  });
});
