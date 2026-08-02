// tests/recalllab/semanticQuestionFamilies.test.ts
// Unit tests for lib/recalllab/semanticQuestionFamilies.ts
//
// Guards the semantic-type-aware question family engine:
//   - Definitions → only definition-appropriate families
//   - Mechanisms → sequential families, not definition families
//   - Never generates clinical/temporal questions for pure definition types
//   - buildSemanticCards produces correctly templated front text
//   - supportsSequentialReasoning / supportsClinicalReasoning gates

import {
  buildSemanticCards,
  supportsSequentialReasoning,
  supportsClinicalReasoning,
  QUESTION_FAMILIES_BY_TYPE,
  type QuestionFamily,
} from "../../lib/recalllab/semanticQuestionFamilies";

// ── QUESTION_FAMILIES_BY_TYPE correctness ─────────────────────────────────

describe("QUESTION_FAMILIES_BY_TYPE — definition type", () => {
  const families = QUESTION_FAMILIES_BY_TYPE["definition"] ?? [];

  it("includes identity family", () => {
    expect(families).toContain("identity");
  });

  it("includes distinction family", () => {
    expect(families).toContain("distinction");
  });

  it("includes example family", () => {
    expect(families).toContain("example");
  });

  it("includes misconception family", () => {
    expect(families).toContain("misconception");
  });

  it("does NOT include mechanism-specific families", () => {
    const sequential: QuestionFamily[] = ["trigger", "sequence", "causal-interrupt", "order"];
    for (const fam of sequential) {
      expect(families).not.toContain(fam);
    }
  });

  it("does NOT include clinical families", () => {
    const clinical: QuestionFamily[] = ["indication", "complication", "application"];
    for (const fam of clinical) {
      expect(families).not.toContain(fam);
    }
  });
});

describe("QUESTION_FAMILIES_BY_TYPE — mechanism type", () => {
  const families = QUESTION_FAMILIES_BY_TYPE["mechanism"] ?? [];

  it("includes trigger family", () => {
    expect(families).toContain("trigger");
  });

  it("includes sequence family", () => {
    expect(families).toContain("sequence");
  });

  it("includes causal-interrupt family", () => {
    expect(families).toContain("causal-interrupt");
  });

  it("includes outcome family", () => {
    expect(families).toContain("outcome");
  });

  it("does NOT include classification (definition-only)", () => {
    expect(families).not.toContain("classification");
  });
});

describe("QUESTION_FAMILIES_BY_TYPE — procedure type", () => {
  const families = QUESTION_FAMILIES_BY_TYPE["procedure"] ?? [];

  it("includes order family", () => {
    expect(families).toContain("order");
  });

  it("includes decision family", () => {
    expect(families).toContain("decision");
  });

  it("includes error family", () => {
    expect(families).toContain("error");
  });

  it("includes complication family", () => {
    expect(families).toContain("complication");
  });
});

describe("QUESTION_FAMILIES_BY_TYPE — comparison type", () => {
  const families = QUESTION_FAMILIES_BY_TYPE["comparison"] ?? [];

  it("includes similarity family", () => {
    expect(families).toContain("similarity");
  });

  it("includes difference family", () => {
    expect(families).toContain("difference");
  });

  it("includes selection family", () => {
    expect(families).toContain("selection");
  });

  it("does NOT include mechanism families", () => {
    expect(families).not.toContain("trigger");
    expect(families).not.toContain("sequence");
  });
});

// ── buildSemanticCards — template correctness ─────────────────────────────

describe("buildSemanticCards — definition type", () => {
  const entry = {
    text:          "An element is a substance that cannot be broken down chemically.",
    title:         "An element",
    canonicalType: "definition",
  };

  it("first card asks 'What is X?'", () => {
    const cards = buildSemanticCards(entry);
    expect(cards[0].front).toMatch(/^What is An element\?$/);
  });

  it("distinction card asks about distinguishing from related concepts", () => {
    const cards = buildSemanticCards(entry);
    const d = cards.find(c => c.family === "distinction");
    expect(d?.front).toMatch(/distinguishes An element/);
  });

  it("every card's back contains the original unit text", () => {
    const cards = buildSemanticCards(entry);
    for (const card of cards) {
      expect(card.back).toContain("element");
    }
  });

  it("does NOT produce a 'What is the mechanism of An element?' card", () => {
    const cards = buildSemanticCards(entry);
    const mechanismCard = cards.find(c => c.front.includes("mechanism"));
    expect(mechanismCard).toBeUndefined();
  });

  it("does NOT produce a 'What occurs immediately after element?' card", () => {
    const cards = buildSemanticCards(entry);
    const temporal = cards.find(c => /occurs.*after|next.*step|sequence/.test(c.front.toLowerCase()));
    expect(temporal).toBeUndefined();
  });
});

describe("buildSemanticCards — mechanism type", () => {
  const entry = {
    text:          "ATP synthase rotates to produce ATP from ADP + Pi using a proton gradient.",
    title:         "ATP synthesis",
    canonicalType: "mechanism",
  };

  it("produces a trigger card", () => {
    const cards = buildSemanticCards(entry, { maxCards: 10 });
    expect(cards.some(c => c.family === "trigger")).toBe(true);
  });

  it("produces a sequence card", () => {
    const cards = buildSemanticCards(entry, { maxCards: 10 });
    expect(cards.some(c => c.family === "sequence")).toBe(true);
  });

  it("does NOT produce an identity/classification card (definition families)", () => {
    const cards = buildSemanticCards(entry, { maxCards: 10 });
    expect(cards.some(c => c.family === "classification")).toBe(false);
    expect(cards.some(c => c.family === "example")).toBe(false);
  });
});

describe("buildSemanticCards — maxCards cap", () => {
  it("respects maxCards=2", () => {
    const entry = { text: "A compound contains two or more elements chemically bonded.", canonicalType: "definition" };
    const cards = buildSemanticCards(entry, { maxCards: 2 });
    expect(cards.length).toBeLessThanOrEqual(2);
  });

  it("default maxCards=5", () => {
    const entry = { text: "A compound contains two or more elements chemically bonded.", canonicalType: "definition" };
    const cards = buildSemanticCards(entry);
    expect(cards.length).toBeLessThanOrEqual(5);
  });
});

describe("buildSemanticCards — back text truncation", () => {
  it("truncates back text at 300 chars with ellipsis", () => {
    const long = "x".repeat(400);
    const cards = buildSemanticCards({ text: long, canonicalType: "definition" });
    for (const card of cards) {
      expect(card.back.length).toBeLessThanOrEqual(304); // 300 + "…"
      expect(card.back).toMatch(/…$/);
    }
  });

  it("does not truncate text under 300 chars", () => {
    const short = "Short definition.";
    const cards = buildSemanticCards({ text: short, canonicalType: "definition" });
    expect(cards[0].back).toBe(short);
  });
});

describe("buildSemanticCards — unknown canonical type falls back to identity+distinction", () => {
  it("unknown type produces at least identity card", () => {
    const cards = buildSemanticCards({ text: "Something.", canonicalType: "unknown-xyz" });
    expect(cards.some(c => c.family === "identity")).toBe(true);
  });
});

// ── supportsSequentialReasoning ───────────────────────────────────────────

describe("supportsSequentialReasoning", () => {
  it("returns true for mechanism", () => {
    expect(supportsSequentialReasoning("mechanism")).toBe(true);
  });

  it("returns true for process", () => {
    expect(supportsSequentialReasoning("process")).toBe(true);
  });

  it("returns true for procedure", () => {
    expect(supportsSequentialReasoning("procedure")).toBe(true);
  });

  it("returns false for definition", () => {
    expect(supportsSequentialReasoning("definition")).toBe(false);
  });

  it("returns false for core-concept", () => {
    expect(supportsSequentialReasoning("core-concept")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(supportsSequentialReasoning(undefined)).toBe(false);
  });
});

// ── supportsClinicalReasoning ─────────────────────────────────────────────

describe("supportsClinicalReasoning", () => {
  it("returns true for indication", () => {
    expect(supportsClinicalReasoning("indication")).toBe(true);
  });

  it("returns true for treatment", () => {
    expect(supportsClinicalReasoning("treatment")).toBe(true);
  });

  it("returns true for clinical-pearl", () => {
    expect(supportsClinicalReasoning("clinical-pearl")).toBe(true);
  });

  it("returns false for definition", () => {
    expect(supportsClinicalReasoning("definition")).toBe(false);
  });

  it("returns false for core-concept", () => {
    expect(supportsClinicalReasoning("core-concept")).toBe(false);
  });

  it("returns false for mechanism", () => {
    expect(supportsClinicalReasoning("mechanism")).toBe(false);
  });
});
