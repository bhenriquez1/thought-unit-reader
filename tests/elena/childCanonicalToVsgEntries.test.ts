// tests/elena/childCanonicalToVsgEntries.test.ts
// L19 — the adapter converting Elena's own per-page CanonicalThoughtUnits
// into the Whiteboard's CanonicalEntryInput[] shape, mirroring
// surgeonAnnotationsToCanonicalEntries's role for the adult Reader.

import { childCanonicalUnitsToVsgEntries } from "../../lib/elena/childCanonicalToVsgEntries";
import type { CanonicalThoughtUnit } from "../../lib/canonical/types";

function makeUnit(overrides: Partial<CanonicalThoughtUnit> = {}): CanonicalThoughtUnit {
  return {
    id: "doc-1:0:0",
    documentId: "doc-1",
    pageIndex: 0,
    unitIndex: 0,
    text: "The sun is a big, bright star that gives us light and warmth.",
    anchor: {
      pageIndex: 0, startChar: 0, endChar: 10, quote: "The sun is",
    },
    datSection: "survey-natural-sciences" as any,
    datTopic: "general-biology" as any,
    datUnitType: "concept" as any,
    datRelevance: 0.5,
    classificationConfidence: 0.5,
    classificationSource: "heuristic" as any,
    difficulty: 0.5,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("childCanonicalUnitsToVsgEntries", () => {
  it("converts a unit's id/text/canonicalType/page straight through", () => {
    const unit = makeUnit({ id: "doc-1:2:0", pageIndex: 2, canonicalType: "definition", text: "A star is a giant ball of hot gas." });
    const [entry] = childCanonicalUnitsToVsgEntries([unit]);
    expect(entry.id).toBe("doc-1:2:0");
    expect(entry.text).toBe("A star is a giant ball of hot gas.");
    expect(entry.canonicalType).toBe("definition");
  });

  it("REQUIRED: converts 0-based pageIndex to the VSG's 1-based page convention", () => {
    const unit = makeUnit({ pageIndex: 4 });
    const [entry] = childCanonicalUnitsToVsgEntries([unit]);
    expect(entry.page).toBe(5);
  });

  it("buckets importanceScore into a 1-5 priorityTier matching resolveImportanceLevel's tier semantics", () => {
    expect(childCanonicalUnitsToVsgEntries([makeUnit({ importanceScore: 0.9 })])[0].priorityTier).toBe(5);
    expect(childCanonicalUnitsToVsgEntries([makeUnit({ importanceScore: 0.65 })])[0].priorityTier).toBe(4);
    expect(childCanonicalUnitsToVsgEntries([makeUnit({ importanceScore: 0.45 })])[0].priorityTier).toBe(3);
    expect(childCanonicalUnitsToVsgEntries([makeUnit({ importanceScore: 0.1 })])[0].priorityTier).toBe(2);
  });

  it("falls back to datRelevance when importanceScore is absent", () => {
    const unit = makeUnit({ importanceScore: undefined, datRelevance: 0.85 });
    expect(childCanonicalUnitsToVsgEntries([unit])[0].priorityTier).toBe(5);
  });

  it("leaves priorityTier undefined when neither importanceScore nor datRelevance is present", () => {
    const unit = makeUnit({ importanceScore: undefined, datRelevance: undefined as any });
    expect(childCanonicalUnitsToVsgEntries([unit])[0].priorityTier).toBeUndefined();
  });

  it("REQUIRED: reuses selectTeachingUnits — ranks by importance and caps at maxEntries (default 6)", () => {
    const units = Array.from({ length: 10 }, (_, i) =>
      makeUnit({ id: `doc-1:0:${i}`, unitIndex: i, importanceScore: i / 10, text: `unit ${i}` }));
    const entries = childCanonicalUnitsToVsgEntries(units);
    expect(entries).toHaveLength(6);
    // Highest importanceScore (unit 9) ranked first.
    expect(entries[0].id).toBe("doc-1:0:9");
    expect(entries[5].id).toBe("doc-1:0:4");
  });

  it("respects a caller-supplied maxEntries", () => {
    const units = Array.from({ length: 4 }, (_, i) => makeUnit({ id: `doc-1:0:${i}`, unitIndex: i }));
    expect(childCanonicalUnitsToVsgEntries(units, 2)).toHaveLength(2);
  });

  it("returns an empty array for an empty input", () => {
    expect(childCanonicalUnitsToVsgEntries([])).toEqual([]);
  });
});
