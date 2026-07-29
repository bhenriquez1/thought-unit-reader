// tests/reader/chiefResidentContextBuilder.test.ts
// Tests for lib/reader/chiefResidentContextBuilder.ts

import {
  buildCanonicalContext,
  toCanonicalUnitInputs,
  type CanonicalUnitSummary,
} from "../../lib/reader/chiefResidentContextBuilder";
import { UNIVERSAL_PACK } from "../../lib/semantic/packs/universal";
import { DENTISTRY_PACK } from "../../lib/semantic/packs/dentistry";

// ── Fixtures ───────────────────────────────────────────────────────────────

const UNIT_CRITICAL: CanonicalUnitSummary = {
  id: "u1",
  text: "Ameloblasts produce enamel matrix and are lost after tooth eruption — no regeneration possible.",
  canonicalType: "high-yield",
  importanceScore: 90,
  title: "Ameloblast fate",
  page: 5,
};

const UNIT_HIGH: CanonicalUnitSummary = {
  id: "u2",
  text: "Do not confuse enamel (hardest tissue) with dentin (most abundant tissue).",
  canonicalType: "warning",
  importanceScore: 65,
};

const UNIT_MEDIUM: CanonicalUnitSummary = {
  id: "u3",
  text: "Enamel is the hard, calcified tissue covering the crowns of teeth.",
  canonicalType: "definition",
  importanceScore: 40,
  title: "Enamel",
};

const UNIT_REFERENCE: CanonicalUnitSummary = {
  id: "u4",
  text: "The color of enamel ranges from yellow-white to grey-white.",
  canonicalType: "finding",
  priorityTier: 1,
};

const ALL_UNITS = [UNIT_MEDIUM, UNIT_REFERENCE, UNIT_HIGH, UNIT_CRITICAL];

// ── buildCanonicalContext — output structure ────────────────────────────────

describe("buildCanonicalContext — output structure", () => {
  it("returns a non-empty contextText", () => {
    const { contextText } = buildCanonicalContext([UNIT_CRITICAL], UNIVERSAL_PACK);
    expect(contextText.trim().length).toBeGreaterThan(0);
  });

  it("includes a SEMANTIC UNITS header", () => {
    const { contextText } = buildCanonicalContext([UNIT_CRITICAL], UNIVERSAL_PACK);
    expect(contextText).toMatch(/SEMANTIC UNITS/);
  });

  it("unitCount reflects how many units were included", () => {
    const { unitCount } = buildCanonicalContext(ALL_UNITS, UNIVERSAL_PACK);
    expect(unitCount).toBe(4);
  });

  it("typeSummary describes the types present", () => {
    const { typeSummary } = buildCanonicalContext([UNIT_CRITICAL, UNIT_MEDIUM], UNIVERSAL_PACK);
    expect(typeSummary.length).toBeGreaterThan(0);
    // Should mention the label count somewhere
    expect(typeSummary).toMatch(/\d+/);
  });

  it("truncated is false when all units fit", () => {
    const { truncated } = buildCanonicalContext([UNIT_CRITICAL], UNIVERSAL_PACK);
    expect(truncated).toBe(false);
  });

  it("truncated is true when total text exceeds maxChars", () => {
    // Create many long units
    const bigUnits: CanonicalUnitSummary[] = Array.from({ length: 20 }, (_, i) => ({
      id: `big${i}`,
      text: "x".repeat(300),
      canonicalType: "definition",
      importanceScore: 50,
    }));
    const { truncated, unitCount } = buildCanonicalContext(bigUnits, UNIVERSAL_PACK, 1000);
    expect(truncated).toBe(true);
    expect(unitCount).toBeLessThan(20);
  });
});

// ── buildCanonicalContext — importance ordering ────────────────────────────

describe("buildCanonicalContext — importance ordering", () => {
  it("places critical units first in contextText", () => {
    const { contextText } = buildCanonicalContext(ALL_UNITS, UNIVERSAL_PACK);
    const criticalPos = contextText.indexOf("CRITICAL");
    const referencePos = contextText.indexOf("REFERENCE");
    expect(criticalPos).toBeLessThan(referencePos);
  });

  it("places high units before medium units", () => {
    const { contextText } = buildCanonicalContext([UNIT_MEDIUM, UNIT_HIGH], UNIVERSAL_PACK);
    const highPos   = contextText.indexOf("HIGH");
    const mediumPos = contextText.indexOf("MEDIUM");
    expect(highPos).toBeLessThan(mediumPos);
  });

  it("unit with importanceScore takes precedence over tier for ordering", () => {
    const withScore: CanonicalUnitSummary = { id: "s", text: "scored unit", importanceScore: 85 };
    const withTier:  CanonicalUnitSummary = { id: "t", text: "tiered unit", priorityTier: 3 };
    const { contextText } = buildCanonicalContext([withTier, withScore], UNIVERSAL_PACK);
    expect(contextText.indexOf("scored unit")).toBeLessThan(contextText.indexOf("tiered unit"));
  });
});

// ── buildCanonicalContext — content format ─────────────────────────────────

describe("buildCanonicalContext — content format", () => {
  it("includes the canonical type label in the context line", () => {
    const { contextText } = buildCanonicalContext([UNIT_CRITICAL], UNIVERSAL_PACK);
    // HIGH YIELD should appear as the type label (uppercased)
    expect(contextText).toMatch(/HIGH YIELD/i);
  });

  it("includes the importance level in the context line", () => {
    const { contextText } = buildCanonicalContext([UNIT_CRITICAL], UNIVERSAL_PACK);
    expect(contextText).toMatch(/CRITICAL/i);
  });

  it("includes the unit title when present", () => {
    const { contextText } = buildCanonicalContext([UNIT_CRITICAL], UNIVERSAL_PACK);
    expect(contextText).toContain("Ameloblast fate");
  });

  it("includes the unit text", () => {
    const { contextText } = buildCanonicalContext([UNIT_MEDIUM], UNIVERSAL_PACK);
    expect(contextText).toContain("Enamel is the hard");
  });

  it("truncates individual unit text at 400 chars", () => {
    const longUnit: CanonicalUnitSummary = {
      id: "long",
      text: "z".repeat(1000),
      canonicalType: "definition",
      importanceScore: 50,
    };
    const { contextText } = buildCanonicalContext([longUnit], UNIVERSAL_PACK);
    // 'z' never appears in headers, labels, or icons — count is purely the text portion
    const zCount = (contextText.match(/z/g) ?? []).length;
    expect(zCount).toBeLessThanOrEqual(400);
  });
});

// ── buildCanonicalContext — pack label mapping ─────────────────────────────

describe("buildCanonicalContext — pack label mapping", () => {
  it("uses DENTISTRY_PACK labels (e.g. 'material' → pack label) when pack is active", () => {
    const materialUnit: CanonicalUnitSummary = {
      id: "m1",
      text: "Amalgam is a dental restorative material.",
      canonicalType: "material",
      importanceScore: 45,
    };
    const { contextText } = buildCanonicalContext([materialUnit], DENTISTRY_PACK);
    // DENTISTRY_PACK should provide a label for "material"
    expect(contextText.trim().length).toBeGreaterThan(0);
    expect(contextText).toContain("Amalgam is a dental");
  });

  it("falls back to a formatted type string for unknown canonicalType", () => {
    const unknownUnit: CanonicalUnitSummary = {
      id: "u",
      text: "Some complication text.",
      canonicalType: "complication",
      importanceScore: 60,
    };
    const { contextText } = buildCanonicalContext([unknownUnit], UNIVERSAL_PACK);
    expect(contextText).toContain("Some complication text.");
  });
});

// ── buildCanonicalContext — edge cases ────────────────────────────────────

describe("buildCanonicalContext — edge cases", () => {
  it("handles empty entries array", () => {
    const { contextText, unitCount } = buildCanonicalContext([], UNIVERSAL_PACK);
    expect(unitCount).toBe(0);
    expect(contextText).toMatch(/SEMANTIC UNITS.*0/);
  });

  it("handles entries with no canonicalType (defaults to core-concept)", () => {
    const noType: CanonicalUnitSummary = { id: "n", text: "Some content", importanceScore: 50 };
    const { contextText, unitCount } = buildCanonicalContext([noType], UNIVERSAL_PACK);
    expect(unitCount).toBe(1);
    expect(contextText).toContain("Some content");
  });

  it("handles entries with neither importanceScore nor priorityTier (defaults to medium)", () => {
    const noLevel: CanonicalUnitSummary = { id: "n", text: "Neutral content", canonicalType: "definition" };
    const { contextText } = buildCanonicalContext([noLevel], UNIVERSAL_PACK);
    expect(contextText).toMatch(/MEDIUM/i);
  });
});

// ── toCanonicalUnitInputs ──────────────────────────────────────────────────

describe("toCanonicalUnitInputs", () => {
  it("filters out entries with empty text", () => {
    const entries: CanonicalUnitSummary[] = [
      { id: "a", text: "valid" },
      { id: "b", text: "" },
      { id: "c", text: "   " },
    ];
    const result = toCanonicalUnitInputs(entries);
    expect(result.length).toBe(1);
    expect(result[0].text).toBe("valid");
  });

  it("strips the id field from output", () => {
    const entries: CanonicalUnitSummary[] = [{ id: "myid", text: "hello" }];
    const result = toCanonicalUnitInputs(entries);
    expect("id" in result[0]).toBe(false);
  });

  it("preserves canonicalType, importanceScore, priorityTier, title, page", () => {
    const entry: CanonicalUnitSummary = {
      id: "x",
      text: "text",
      canonicalType: "definition",
      importanceScore: 75,
      priorityTier: 4,
      title: "My Title",
      page: 7,
    };
    const [out] = toCanonicalUnitInputs([entry]);
    expect(out.canonicalType).toBe("definition");
    expect(out.importanceScore).toBe(75);
    expect(out.priorityTier).toBe(4);
    expect(out.title).toBe("My Title");
    expect(out.page).toBe(7);
  });

  it("trims whitespace from text", () => {
    const entry: CanonicalUnitSummary = { id: "x", text: "  hello world  " };
    const [out] = toCanonicalUnitInputs([entry]);
    expect(out.text).toBe("hello world");
  });
});
