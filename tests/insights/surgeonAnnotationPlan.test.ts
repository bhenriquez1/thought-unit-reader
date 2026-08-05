// tests/insights/surgeonAnnotationPlan.test.ts
// Unit tests for lib/insights/pageAnnotationPlan.ts (SurgeonAnnotationPlan schema)

import {
  SurgeonAnnotationPlanSchema,
  SurgeonAnnotationSchema,
  CanonicalTypeSchema,
  TreatmentSchema,
  SpanScopeSchema,
  RelationshipSchema,
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
  spanScope:     "fullSentence",
};

const VALID_PLAN: SurgeonAnnotationPlan = {
  pageTruthKey: "doc-abc::3::t",
  pageThesis:   "Elements and compounds differ in their atomic composition.",
  pageRole:     "definition",
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

  it("accepts a long multi-sentence exactQuote up to 1400 chars (allows single-span concepts)", () => {
    expect(() => SurgeonAnnotationSchema.parse({ ...VALID_ANNOTATION, exactQuote: "x".repeat(1400) })).not.toThrow();
  });

  it("rejects exactQuote longer than 1400 chars", () => {
    expect(() => SurgeonAnnotationSchema.parse({ ...VALID_ANNOTATION, exactQuote: "x".repeat(1401) })).toThrow();
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

// ── spanScope — sentence-boundary highlighting rule ────────────────────────────

describe("spanScope", () => {
  it("accepts fullSentence and entity", () => {
    expect(() => SpanScopeSchema.parse("fullSentence")).not.toThrow();
    expect(() => SpanScopeSchema.parse("entity")).not.toThrow();
  });

  it("rejects any other value", () => {
    expect(() => SpanScopeSchema.parse("partial")).toThrow();
  });

  it("defaults to fullSentence when omitted from a parsed annotation", () => {
    const { spanScope, ...withoutSpanScope } = VALID_ANNOTATION;
    const parsed = SurgeonAnnotationSchema.parse(withoutSpanScope);
    expect(parsed.spanScope).toBe("fullSentence");
  });

  it("defaults to fullSentence when omitted from a parsed plan's annotations", () => {
    const { spanScope, ...withoutSpanScope } = VALID_ANNOTATION;
    const parsed = parseSurgeonAnnotationPlan({ ...VALID_PLAN, annotations: [withoutSpanScope] });
    expect(parsed.annotations[0].spanScope).toBe("fullSentence");
  });

  it("preserves an explicit entity spanScope (does not silently override to fullSentence)", () => {
    const parsed = SurgeonAnnotationSchema.parse({ ...VALID_ANNOTATION, spanScope: "entity" });
    expect(parsed.spanScope).toBe("entity");
  });
});

// ── pageRole — page-level dominant-grammar classification ─────────────────────

describe("pageRole", () => {
  const ALL_PAGE_ROLES = [
    "definition", "procedure", "mechanism", "comparison", "example",
    "anatomy", "physiology", "pharmacology", "diagnosis", "histology",
    "classification", "decision-tree", "workflow",
    "mathematical-derivation", "organic-chemistry-reaction",
  ] as const;

  it("is required on a plan", () => {
    const { pageRole, ...withoutPageRole } = VALID_PLAN;
    expect(() => SurgeonAnnotationPlanSchema.parse(withoutPageRole)).toThrow();
  });

  it(`accepts all ${ALL_PAGE_ROLES.length} values — the shared page-classifier taxonomy`, () => {
    for (const pageRole of ALL_PAGE_ROLES) {
      expect(() => SurgeonAnnotationPlanSchema.parse({ ...VALID_PLAN, pageRole })).not.toThrow();
    }
  });

  it("rejects an unknown value", () => {
    expect(() => SurgeonAnnotationPlanSchema.parse({ ...VALID_PLAN, pageRole: "narrative" })).toThrow();
  });
});

// ── relationship — optional, schema-only annotation-to-annotation link ────────

describe("relationship", () => {
  it("is optional — a plan parses fine without any annotation setting it", () => {
    expect(() => parseSurgeonAnnotationPlan(VALID_PLAN)).not.toThrow();
    expect(parseSurgeonAnnotationPlan(VALID_PLAN).annotations[0].relationship).toBeUndefined();
  });

  it("accepts all 4 relationship types with a valid targetIndex", () => {
    const TYPES = ["sequence", "cause-effect", "comparison", "supports"] as const;
    for (const type of TYPES) {
      const annotation = { ...VALID_ANNOTATION, relationship: { type, targetIndex: 1 } };
      expect(() => SurgeonAnnotationSchema.parse(annotation)).not.toThrow();
    }
  });

  it("rejects an unknown relationship type", () => {
    const annotation = { ...VALID_ANNOTATION, relationship: { type: "related-to", targetIndex: 0 } };
    expect(() => SurgeonAnnotationSchema.parse(annotation)).toThrow();
  });

  it("rejects a negative targetIndex", () => {
    const annotation = { ...VALID_ANNOTATION, relationship: { type: "sequence", targetIndex: -1 } };
    expect(() => SurgeonAnnotationSchema.parse(annotation)).toThrow();
  });

  it("rejects a non-integer targetIndex", () => {
    const annotation = { ...VALID_ANNOTATION, relationship: { type: "sequence", targetIndex: 1.5 } };
    expect(() => SurgeonAnnotationSchema.parse(annotation)).toThrow();
  });

  it("targetIndex references another annotation's position in the SAME plan's annotations[] array, not a canonicalUnitId", () => {
    // Documents the deliberate design choice: no canonicalUnitId anywhere in this
    // schema — grounding and cross-referencing both stay index/quote-based.
    expect(RelationshipSchema.shape.targetIndex).toBeDefined();
    expect((RelationshipSchema.shape as any).canonicalUnitId).toBeUndefined();
  });
});
