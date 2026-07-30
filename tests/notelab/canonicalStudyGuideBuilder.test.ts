// tests/notelab/canonicalStudyGuideBuilder.test.ts
// Tests for lib/notelab/canonicalStudyGuideBuilder.ts

import {
  buildStudyGuideFromCanonical,
  type CanonicalGuideEntry,
  type LearnerLevel,
} from "../../lib/notelab/canonicalStudyGuideBuilder";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const DEFINITION: CanonicalGuideEntry = {
  id: "d1", text: "Caries is a microbial disease of dental hard tissue. It is initiated by acid produced by bacteria.",
  title: "Caries", canonicalType: "definition", importanceScore: 55,
};
const CAUSE: CanonicalGuideEntry = {
  id: "c1", text: "Acid attack from bacteria causes demineralization of enamel surfaces.",
  canonicalType: "cause", importanceScore: 90,
};
const EFFECT: CanonicalGuideEntry = {
  id: "e1", text: "Demineralization leads to cavitation and cavity formation over time.",
  canonicalType: "effect", importanceScore: 75,
};
const MECHANISM: CanonicalGuideEntry = {
  id: "m1", text: "Fluoride substitutes hydroxyl groups in hydroxyapatite, forming fluorapatite which is more acid-resistant.",
  canonicalType: "mechanism", importanceScore: 70,
};
const PROCESS: CanonicalGuideEntry = {
  id: "p1", text: "Evaluate anatomy → Remove defective restoration → Establish straight-line access → Locate canal orifices",
  canonicalType: "process", importanceScore: 65,
};
const WARNING: CanonicalGuideEntry = {
  id: "w1", text: "Do not confuse remineralization speed with fluoride concentration.",
  canonicalType: "warning", importanceScore: 60,
};
const HIGH_YIELD: CanonicalGuideEntry = {
  id: "h1", text: "Most tested board concept: acid-base balance in caries is critical to understand.",
  canonicalType: "high-yield", importanceScore: 92,
};
const MEMORY: CanonicalGuideEntry = {
  id: "mn1", text: "CARIES = Cavities Are Really Irritating Enamel Sores",
  canonicalType: "memory-anchor", importanceScore: 50,
};
const FORMULA: CanonicalGuideEntry = {
  id: "f1", text: "pH = -log[H+] where H+ is hydrogen ion concentration",
  title: "pH Formula", canonicalType: "formula", importanceScore: 80,
};
const CLINICAL_PEARL: CanonicalGuideEntry = {
  id: "cp1", text: "Fluoride varnish applied immediately after scaling reduces sensitivity and remineralizes.",
  canonicalType: "clinical-pearl", importanceScore: 78,
};

const ALL_ENTRIES = [DEFINITION, CAUSE, EFFECT, MECHANISM, PROCESS, WARNING, HIGH_YIELD, MEMORY, FORMULA, CLINICAL_PEARL];

// ── Output structure ──────────────────────────────────────────────────────────

describe("buildStudyGuideFromCanonical — output structure", () => {
  it("returns a valid AdaptiveStudySheet for non-empty input", () => {
    const sheet = buildStudyGuideFromCanonical(ALL_ENTRIES, { topic: "Dental Caries" });
    expect(sheet.concept).toBe("Dental Caries");
    expect(sheet.coreIdea).toBeTruthy();
    expect(Array.isArray(sheet.sections)).toBe(true);
    expect(sheet.sections.length).toBeGreaterThan(0);
    expect(sheet.generatorVersion).toBe("canonical-v1");
    expect(sheet.modelId).toBe("canonical");
    expect(sheet.schemaVersion).toBe(1);
  });

  it("returns an empty-sections sheet for empty input", () => {
    const sheet = buildStudyGuideFromCanonical([], { topic: "Empty" });
    expect(sheet.concept).toBe("Empty");
    expect(sheet.sections).toHaveLength(0);
    expect(sheet.coreIdea).toBeTruthy();
  });

  it("each section has required fields: label, icon, content", () => {
    const sheet = buildStudyGuideFromCanonical(ALL_ENTRIES);
    for (const section of sheet.sections) {
      expect(section.label).toBeTruthy();
      expect(section.icon).toBeTruthy();
      expect(section.content).toBeTruthy();
    }
  });

  it("coreIdea comes from the definition/core-concept entry", () => {
    const sheet = buildStudyGuideFromCanonical([DEFINITION, CAUSE, EFFECT]);
    expect(sheet.coreIdea).toContain("Caries");
  });

  it("formula section is populated when formula entry present", () => {
    const sheet = buildStudyGuideFromCanonical([FORMULA, DEFINITION]);
    expect(sheet.formula).not.toBeNull();
    expect(sheet.formula?.expression).toContain("pH");
  });

  it("formula is null when no formula entry", () => {
    const sheet = buildStudyGuideFromCanonical([CAUSE, EFFECT]);
    expect(sheet.formula).toBeNull();
  });

  it("connections includes cause→effect pair when both present", () => {
    const sheet = buildStudyGuideFromCanonical([CAUSE, EFFECT]);
    expect(sheet.connections).not.toBeNull();
    expect(sheet.connections?.some((c) => c.connection === "cause → effect")).toBe(true);
  });

  it("connections is null when no matching pairs", () => {
    const sheet = buildStudyGuideFromCanonical([HIGH_YIELD, MEMORY]);
    expect(sheet.connections).toBeNull();
  });

  it("pageNumber is written to sourcePage on sections when provided", () => {
    const sheet = buildStudyGuideFromCanonical([DEFINITION], { pageNumber: 42 });
    expect(sheet.canonicalSourcePage).toBe(42);
    expect(sheet.sections[0].sourcePage).toBe(42);
  });
});

// ── Cognitive phase ordering ──────────────────────────────────────────────────

describe("buildStudyGuideFromCanonical — phase ordering", () => {
  it("Core Concept (definition) appears before Warning (recall phase)", () => {
    const sheet = buildStudyGuideFromCanonical([WARNING, DEFINITION, CAUSE]);
    const labelIndex = (label: string) => sheet.sections.findIndex((s) => s.label.startsWith(label));
    expect(labelIndex("Core Concept")).toBeLessThan(labelIndex("Common Trap"));
  });

  it("Mechanism appears before High-Yield Fact", () => {
    const sheet = buildStudyGuideFromCanonical([HIGH_YIELD, MECHANISM, DEFINITION]);
    const labelIndex = (prefix: string) => sheet.sections.findIndex((s) => s.label.startsWith(prefix));
    expect(labelIndex("Mechanism")).toBeLessThan(labelIndex("High-Yield"));
  });

  it("Recall Check section is always last", () => {
    const sheet = buildStudyGuideFromCanonical(ALL_ENTRIES);
    const last = sheet.sections[sheet.sections.length - 1];
    expect(last.label).toBe("Recall Check");
  });

  it("Recall Check contains subItems (one per critical/high unit)", () => {
    const sheet = buildStudyGuideFromCanonical([CAUSE, EFFECT, HIGH_YIELD, DEFINITION]);
    const recallSection = sheet.sections.find((s) => s.label === "Recall Check");
    expect(recallSection?.subItems?.length).toBeGreaterThan(0);
  });
});

// ── Learner level adaptation ──────────────────────────────────────────────────

describe("buildStudyGuideFromCanonical — learner level", () => {
  it("'new' learner includes definition sections", () => {
    const sheet = buildStudyGuideFromCanonical([DEFINITION, CAUSE], { learnerLevel: "new" });
    expect(sheet.sections.some((s) => s.label.startsWith("Core Concept"))).toBe(true);
  });

  it("'advanced' learner skips definition/core-concept sections", () => {
    const sheet = buildStudyGuideFromCanonical([DEFINITION, WARNING, HIGH_YIELD], { learnerLevel: "advanced" });
    expect(sheet.sections.some((s) => s.label.startsWith("Core Concept"))).toBe(false);
  });

  it("'advanced' learner still includes warnings and high-yield", () => {
    const sheet = buildStudyGuideFromCanonical([DEFINITION, WARNING, HIGH_YIELD], { learnerLevel: "advanced" });
    expect(sheet.sections.some((s) => s.label.startsWith("Common Trap"))).toBe(true);
    expect(sheet.sections.some((s) => s.label.startsWith("High-Yield"))).toBe(true);
  });

  it("'new' learner shows full text content", () => {
    const longEntry: CanonicalGuideEntry = {
      id: "long", text: "First sentence. Second sentence. Third sentence. Fourth sentence.",
      canonicalType: "mechanism", importanceScore: 70,
    };
    const sheet = buildStudyGuideFromCanonical([longEntry], { learnerLevel: "new" });
    const mechSection = sheet.sections.find((s) => s.label.startsWith("Mechanism"));
    expect(mechSection?.content).toContain("Third sentence");
  });

  it("'intermediate' learner content is truncated to 2 sentences", () => {
    const longEntry: CanonicalGuideEntry = {
      id: "long", text: "First sentence. Second sentence. Third sentence. Fourth sentence.",
      canonicalType: "mechanism", importanceScore: 70,
    };
    const sheet = buildStudyGuideFromCanonical([longEntry], { learnerLevel: "intermediate" });
    const mechSection = sheet.sections.find((s) => s.label.startsWith("Mechanism"));
    expect(mechSection?.content).not.toContain("Third sentence");
  });
});

// ── Weak unit surfacing ───────────────────────────────────────────────────────

describe("buildStudyGuideFromCanonical — weak unit surfacing", () => {
  it("weak unit appears before a same-phase non-weak unit", () => {
    // Both are phase 1 (understand); weak one should come first
    const sheet = buildStudyGuideFromCanonical(
      [MECHANISM, CAUSE],
      { weakUnitIds: ["c1"] }, // CAUSE is weak
    );
    const causeIdx = sheet.sections.findIndex((s) => s.label.startsWith("Cause"));
    const mechIdx  = sheet.sections.findIndex((s) => s.label.startsWith("Mechanism"));
    expect(causeIdx).toBeLessThan(mechIdx);
  });

  it("no error when weakUnitIds references ids not in entries", () => {
    expect(() =>
      buildStudyGuideFromCanonical([CAUSE, EFFECT], { weakUnitIds: ["nonexistent-id"] })
    ).not.toThrow();
  });
});

// ── Process / sequence sub-items ──────────────────────────────────────────────

describe("buildStudyGuideFromCanonical — sequence extraction", () => {
  it("arrow-separated process text is split into subItems", () => {
    const sheet = buildStudyGuideFromCanonical([PROCESS]);
    const seq = sheet.sections.find((s) => s.label.startsWith("Sequence"));
    expect(seq?.subItems?.length).toBeGreaterThan(1);
  });

  it("plain text for non-process types does not generate subItems", () => {
    const sheet = buildStudyGuideFromCanonical([DEFINITION]);
    const core = sheet.sections.find((s) => s.label.startsWith("Core Concept"));
    // subItems should be null for non-sequence types
    expect(core?.subItems).toBeNull();
  });
});

// ── Profile auto-detection ────────────────────────────────────────────────────

describe("buildStudyGuideFromCanonical — profile detection", () => {
  it("detects 'dental' profile from clinical-pearl/treatment entries", () => {
    const sheet = buildStudyGuideFromCanonical([CLINICAL_PEARL, WARNING]);
    expect(sheet.profileId).toBe("dental");
    expect(sheet.sheetStyle).toBe("clinical");
  });

  it("detects 'chemistry' profile from formula/worked-example entries", () => {
    const wex: CanonicalGuideEntry = { id: "wx", text: "Solve for pH when [H+]=0.001", canonicalType: "worked-example", importanceScore: 70 };
    const sheet = buildStudyGuideFromCanonical([FORMULA, wex]);
    expect(sheet.profileId).toBe("chemistry");
    expect(sheet.sheetStyle).toBe("exam-prep");
  });

  it("falls back to 'general' profile for unrecognized entry cluster", () => {
    const sheet = buildStudyGuideFromCanonical([HIGH_YIELD, MEMORY]);
    expect(sheet.profileId).toBe("general");
  });

  it("respects explicit profileId override", () => {
    const sheet = buildStudyGuideFromCanonical([CAUSE, EFFECT], { profileId: "biology" });
    expect(sheet.profileId).toBe("biology");
  });
});

// ── Recall question generation ────────────────────────────────────────────────

describe("buildStudyGuideFromCanonical — recall questions", () => {
  it("cause unit generates 'What is the primary cause of' recall question", () => {
    const sheet = buildStudyGuideFromCanonical([CAUSE]);
    const recall = sheet.sections.find((s) => s.label === "Recall Check");
    expect(recall?.subItems?.some((q) => q.includes("primary cause"))).toBe(true);
  });

  it("mechanism unit generates 'Explain the mechanism of' recall question", () => {
    const sheet = buildStudyGuideFromCanonical([MECHANISM]);
    const recall = sheet.sections.find((s) => s.label === "Recall Check");
    expect(recall?.subItems?.some((q) => q.includes("mechanism"))).toBe(true);
  });

  it("no recall section when no critical/high units present", () => {
    const ref: CanonicalGuideEntry = { id: "r1", text: "Some reference text", canonicalType: "evidence", importanceScore: 10 };
    const sheet = buildStudyGuideFromCanonical([ref]);
    const recall = sheet.sections.find((s) => s.label === "Recall Check");
    expect(recall).toBeUndefined();
  });
});
