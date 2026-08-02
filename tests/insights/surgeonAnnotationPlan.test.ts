// tests/insights/surgeonAnnotationPlan.test.ts
// Unit tests for lib/insights/pageAnnotationPlan.ts (SurgeonAnnotationPlan schema)

import {
  SurgeonAnnotationPlanSchema,
  SurgeonAnnotationSchema,
  CanonicalTypeSchema,
  TreatmentSchema,
  parseSurgeonAnnotationPlan,
  DEFAULT_TREATMENT,
  type SurgeonAnnotationPlan,
  type SurgeonAnnotation,
} from "../../lib/insights/pageAnnotationPlan";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_ANNOTATION: SurgeonAnnotation = {
  canonicalType: "definition",
  exactQuote:    "An element is a substance that cannot be broken down into simpler substances.",
  reason:        "Defines the core term the rest of the page builds on.",
  importance:    "critical",
  treatment:     "definitionBar",
};

const VALID_PLAN: SurgeonAnnotationPlan = {
  pageTruthKey: "doc-abc::3::t",
  pageThesis:   "Elements and compounds differ in their atomic composition.",
  annotations:  [VALID_ANNOTATION],
};

const ALL_CANONICAL_TYPES = [
  "definition", "mechanism", "procedure", "decision",
  "comparison", "trap", "clinicalPearl", "supportingEvidence",
] as const;

const ALL_TREATMENTS = [
  "definitionBar", "mechanismBrace", "procedureRail", "decisionConnector",
  "comparisonBracket", "trapNotch", "pearlMarker", "evidenceUnderline",
] as const;

// ── SurgeonAnnotationSchema ────────────────────────────────────────────────────

describe("SurgeonAnnotationSchema", () => {
  it("accepts a valid annotation", () => {
    expect(() => SurgeonAnnotationSchema.parse(VALID_ANNOTATION)).not.toThrow();
  });

  it("rejects an empty exactQuote", () => {
    expect(() => SurgeonAnnotationSchema.parse({ ...VALID_ANNOTATION, exactQuote: "" })).toThrow();
  });

  it("rejects exactQuote longer than 600 chars", () => {
    expect(() => SurgeonAnnotationSchema.parse({ ...VALID_ANNOTATION, exactQuote: "x".repeat(601) })).toThrow();
  });

  it("rejects unknown canonicalType", () => {
    expect(() => SurgeonAnnotationSchema.parse({ ...VALID_ANNOTATION, canonicalType: "footnote" })).toThrow();
  });

  it("rejects unknown treatment", () => {
    expect(() => SurgeonAnnotationSchema.parse({ ...VALID_ANNOTATION, treatment: "squiggle" })).toThrow();
  });

  it("rejects unknown importance", () => {
    expect(() => SurgeonAnnotationSchema.parse({ ...VALID_ANNOTATION, importance: "medium" })).toThrow();
  });

  it("rejects reason longer than 300 chars", () => {
    expect(() => SurgeonAnnotationSchema.parse({ ...VALID_ANNOTATION, reason: "y".repeat(301) })).toThrow();
  });

  it("accepts all 8 canonicalType values", () => {
    for (const canonicalType of ALL_CANONICAL_TYPES) {
      expect(() => SurgeonAnnotationSchema.parse({ ...VALID_ANNOTATION, canonicalType })).not.toThrow();
    }
  });

  it("accepts all 8 treatment values", () => {
    for (const treatment of ALL_TREATMENTS) {
      expect(() => SurgeonAnnotationSchema.parse({ ...VALID_ANNOTATION, treatment })).not.toThrow();
    }
  });

  it("does NOT accept canonicalUnitIds (old grounding mechanism is gone)", () => {
    const parsed = SurgeonAnnotationSchema.parse({ ...VALID_ANNOTATION, canonicalUnitIds: ["u1"] });
    expect((parsed as any).canonicalUnitIds).toBeUndefined();
  });
});

// ── SurgeonAnnotationPlanSchema ────────────────────────────────────────────────

describe("SurgeonAnnotationPlanSchema", () => {
  it("accepts a valid plan", () => {
    expect(() => SurgeonAnnotationPlanSchema.parse(VALID_PLAN)).not.toThrow();
  });

  it("accepts a plan with zero annotations", () => {
    expect(() => SurgeonAnnotationPlanSchema.parse({ ...VALID_PLAN, annotations: [] })).not.toThrow();
  });

  it("rejects plan with empty pageTruthKey", () => {
    expect(() => SurgeonAnnotationPlanSchema.parse({ ...VALID_PLAN, pageTruthKey: "" })).toThrow();
  });

  it("rejects plan with empty pageThesis", () => {
    expect(() => SurgeonAnnotationPlanSchema.parse({ ...VALID_PLAN, pageThesis: "" })).toThrow();
  });

  it("rejects plan with pageThesis longer than 200 chars", () => {
    expect(() => SurgeonAnnotationPlanSchema.parse({ ...VALID_PLAN, pageThesis: "z".repeat(201) })).toThrow();
  });

  it("rejects plan with invalid annotation nested inside", () => {
    const bad = { ...VALID_ANNOTATION, canonicalType: "not-a-type" };
    expect(() => SurgeonAnnotationPlanSchema.parse({ ...VALID_PLAN, annotations: [bad] })).toThrow();
  });
});

// ── parseSurgeonAnnotationPlan ─────────────────────────────────────────────────

describe("parseSurgeonAnnotationPlan", () => {
  it("returns the plan for valid input", () => {
    const plan = parseSurgeonAnnotationPlan(VALID_PLAN);
    expect(plan.pageTruthKey).toBe("doc-abc::3::t");
    expect(plan.annotations).toHaveLength(1);
  });

  it("allows a plan with no annotations (empty page)", () => {
    const emptyPlan = { ...VALID_PLAN, annotations: [] };
    expect(() => parseSurgeonAnnotationPlan(emptyPlan)).not.toThrow();
  });

  it("throws when raw input fails the Zod schema", () => {
    expect(() => parseSurgeonAnnotationPlan({ pageTruthKey: 42 })).toThrow();
  });

  it("does not require or check any canonicalUnitIds / known-id set — no second argument", () => {
    // parseSurgeonAnnotationPlan takes only the raw plan; unlike the old
    // validateAnnotationPlan, there is no knownUnitIds parameter at all.
    expect(parseSurgeonAnnotationPlan.length).toBe(1);
  });
});

// ── DEFAULT_TREATMENT ─────────────────────────────────────────────────────────

describe("DEFAULT_TREATMENT", () => {
  it("has an entry for every CanonicalType", () => {
    for (const canonicalType of ALL_CANONICAL_TYPES) {
      expect(DEFAULT_TREATMENT[canonicalType]).toBeDefined();
      expect(() => TreatmentSchema.parse(DEFAULT_TREATMENT[canonicalType])).not.toThrow();
    }
  });

  it("maps definition → definitionBar", () => {
    expect(DEFAULT_TREATMENT.definition).toBe("definitionBar");
  });

  it("maps mechanism → mechanismBrace", () => {
    expect(DEFAULT_TREATMENT.mechanism).toBe("mechanismBrace");
  });

  it("maps procedure → procedureRail", () => {
    expect(DEFAULT_TREATMENT.procedure).toBe("procedureRail");
  });

  it("maps decision → decisionConnector", () => {
    expect(DEFAULT_TREATMENT.decision).toBe("decisionConnector");
  });

  it("maps comparison → comparisonBracket", () => {
    expect(DEFAULT_TREATMENT.comparison).toBe("comparisonBracket");
  });

  it("maps trap → trapNotch", () => {
    expect(DEFAULT_TREATMENT.trap).toBe("trapNotch");
  });

  it("maps clinicalPearl → pearlMarker", () => {
    expect(DEFAULT_TREATMENT.clinicalPearl).toBe("pearlMarker");
  });

  it("maps supportingEvidence → evidenceUnderline", () => {
    expect(DEFAULT_TREATMENT.supportingEvidence).toBe("evidenceUnderline");
  });
});

// ── CanonicalTypeSchema / TreatmentSchema exhaustiveness ──────────────────────

describe("enum exhaustiveness", () => {
  it("CanonicalTypeSchema accepts exactly the target's 8 values", () => {
    for (const t of ALL_CANONICAL_TYPES) expect(() => CanonicalTypeSchema.parse(t)).not.toThrow();
    expect(() => CanonicalTypeSchema.parse("evidence")).toThrow(); // old short name — no longer valid
  });

  it("TreatmentSchema accepts exactly the target's 8 values", () => {
    for (const t of ALL_TREATMENTS) expect(() => TreatmentSchema.parse(t)).not.toThrow();
    expect(() => TreatmentSchema.parse("gold-rule")).toThrow(); // old display name — no longer valid
  });
});
