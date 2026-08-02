// tests/insights/pageAnnotationPlan.test.ts
// Unit tests for lib/insights/pageAnnotationPlan.ts

import {
  PageAnnotationPlanSchema,
  AnnotationStructureSchema,
  validateAnnotationPlan,
  DEFAULT_DISPLAY,
  type PageAnnotationPlan,
  type AnnotationStructure,
} from "../../lib/insights/pageAnnotationPlan";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_STRUCTURE: AnnotationStructure = {
  id:               "str-1",
  type:             "definition",
  canonicalUnitIds: ["u1", "u2"],
  label:            "Element vs compound",
  rationale:        "Both units define the two key terms for this section.",
  display:          "gold-rule",
};

const VALID_PLAN: PageAnnotationPlan = {
  pageTruthKey: "doc-abc::3::t",
  pageThesis:   "Elements and compounds differ in their atomic composition.",
  structures:   [VALID_STRUCTURE],
};

// ── AnnotationStructureSchema ─────────────────────────────────────────────────

describe("AnnotationStructureSchema", () => {
  it("accepts a valid structure", () => {
    expect(() => AnnotationStructureSchema.parse(VALID_STRUCTURE)).not.toThrow();
  });

  it("rejects structure with no canonicalUnitIds", () => {
    expect(() => AnnotationStructureSchema.parse({ ...VALID_STRUCTURE, canonicalUnitIds: [] })).toThrow();
  });

  it("rejects unknown type", () => {
    expect(() => AnnotationStructureSchema.parse({ ...VALID_STRUCTURE, type: "footnote" })).toThrow();
  });

  it("rejects unknown display", () => {
    expect(() => AnnotationStructureSchema.parse({ ...VALID_STRUCTURE, display: "squiggle" })).toThrow();
  });

  it("rejects label longer than 120 chars", () => {
    expect(() => AnnotationStructureSchema.parse({ ...VALID_STRUCTURE, label: "x".repeat(121) })).toThrow();
  });

  it("rejects rationale longer than 400 chars", () => {
    expect(() => AnnotationStructureSchema.parse({ ...VALID_STRUCTURE, rationale: "y".repeat(401) })).toThrow();
  });

  it("accepts all valid structure types", () => {
    const types = ["definition","mechanism","procedure","decision","trap","pearl","comparison","evidence"] as const;
    for (const type of types) {
      expect(() => AnnotationStructureSchema.parse({ ...VALID_STRUCTURE, type })).not.toThrow();
    }
  });

  it("accepts all valid display values", () => {
    const displays = ["gold-rule","brace","numbered-rail","decision-marker","danger-notch","pearl-marker","connector","underline"] as const;
    for (const display of displays) {
      expect(() => AnnotationStructureSchema.parse({ ...VALID_STRUCTURE, display })).not.toThrow();
    }
  });
});

// ── PageAnnotationPlanSchema ──────────────────────────────────────────────────

describe("PageAnnotationPlanSchema", () => {
  it("accepts a valid plan", () => {
    expect(() => PageAnnotationPlanSchema.parse(VALID_PLAN)).not.toThrow();
  });

  it("accepts a plan with zero structures", () => {
    expect(() => PageAnnotationPlanSchema.parse({ ...VALID_PLAN, structures: [] })).not.toThrow();
  });

  it("rejects plan with empty pageTruthKey", () => {
    expect(() => PageAnnotationPlanSchema.parse({ ...VALID_PLAN, pageTruthKey: "" })).toThrow();
  });

  it("rejects plan with empty pageThesis", () => {
    expect(() => PageAnnotationPlanSchema.parse({ ...VALID_PLAN, pageThesis: "" })).toThrow();
  });

  it("rejects plan with pageThesis longer than 200 chars", () => {
    expect(() => PageAnnotationPlanSchema.parse({ ...VALID_PLAN, pageThesis: "z".repeat(201) })).toThrow();
  });

  it("rejects plan with invalid structure nested inside", () => {
    const badStructure = { ...VALID_STRUCTURE, type: "not-a-type" };
    expect(() => PageAnnotationPlanSchema.parse({ ...VALID_PLAN, structures: [badStructure] })).toThrow();
  });
});

// ── validateAnnotationPlan ────────────────────────────────────────────────────

describe("validateAnnotationPlan", () => {
  const knownIds = new Set(["u1", "u2", "u3"]);

  it("returns the plan when all unit ids are known", () => {
    const plan = validateAnnotationPlan(VALID_PLAN, knownIds);
    expect(plan.pageTruthKey).toBe("doc-abc::3::t");
    expect(plan.structures).toHaveLength(1);
  });

  it("throws when a structure references an unknown unit id", () => {
    const planWithBadRef: PageAnnotationPlan = {
      ...VALID_PLAN,
      structures: [{ ...VALID_STRUCTURE, canonicalUnitIds: ["u1", "UNKNOWN-ID"] }],
    };
    expect(() => validateAnnotationPlan(planWithBadRef, knownIds)).toThrow(/unknown unit id/);
  });

  it("throws when raw input fails Zod schema", () => {
    expect(() => validateAnnotationPlan({ pageTruthKey: 42 }, knownIds)).toThrow();
  });

  it("allows a plan with no structures (empty page)", () => {
    const emptyPlan = { ...VALID_PLAN, structures: [] };
    expect(() => validateAnnotationPlan(emptyPlan, knownIds)).not.toThrow();
  });

  it("throws on cross-page bleed — unit from another page", () => {
    const onlyPageOneIds = new Set(["u1"]);
    const planWithPageTwoUnit: PageAnnotationPlan = {
      ...VALID_PLAN,
      structures: [{ ...VALID_STRUCTURE, canonicalUnitIds: ["u1", "u2"] }],
    };
    // u2 is not in the page-1 known set
    expect(() => validateAnnotationPlan(planWithPageTwoUnit, onlyPageOneIds)).toThrow(/unknown unit id/);
  });
});

// ── DEFAULT_DISPLAY ───────────────────────────────────────────────────────────

describe("DEFAULT_DISPLAY", () => {
  it("has an entry for every AnnotationStructureType", () => {
    const types = ["definition","mechanism","procedure","decision","trap","pearl","comparison","evidence"] as const;
    for (const type of types) {
      expect(DEFAULT_DISPLAY[type]).toBeDefined();
    }
  });

  it("maps definition → gold-rule", () => {
    expect(DEFAULT_DISPLAY["definition"]).toBe("gold-rule");
  });

  it("maps mechanism → brace", () => {
    expect(DEFAULT_DISPLAY["mechanism"]).toBe("brace");
  });

  it("maps procedure → numbered-rail", () => {
    expect(DEFAULT_DISPLAY["procedure"]).toBe("numbered-rail");
  });

  it("maps trap → danger-notch", () => {
    expect(DEFAULT_DISPLAY["trap"]).toBe("danger-notch");
  });
});
