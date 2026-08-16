// tests/elena/childTeachingAdapter.test.ts
// E3 — replaces raw-pageText grounding for elena-buddy/elena-vocab with real
// CanonicalThoughtUnits, ranked by importance. selectTeachingUnits/
// buildGroundedPageContext are pure and get full behavioral coverage.

import { selectTeachingUnits, buildGroundedPageContext } from "@/lib/elena/childTeachingAdapter";
import type { CanonicalThoughtUnit } from "@/lib/canonical/types";

function makeUnit(id: string, text: string, overrides: Partial<CanonicalThoughtUnit> = {}): CanonicalThoughtUnit {
  return {
    id, documentId: "doc-1", pageIndex: 0, unitIndex: 0, text,
    anchor: { pageIndex: 0, startChar: 0, endChar: text.length, quote: text.slice(0, 20) },
    datSection: "none", datTopic: "General", datUnitType: "fact",
    datRelevance: 0.5, classificationConfidence: 0.5, classificationSource: "unclassified",
    difficulty: 0.5, createdAt: 0, updatedAt: 0,
    ...overrides,
  };
}

describe("selectTeachingUnits", () => {
  it("returns units sorted by importanceScore descending", () => {
    const units = [
      makeUnit("a", "low importance",  { importanceScore: 0.2 }),
      makeUnit("b", "high importance", { importanceScore: 0.9 }),
      makeUnit("c", "mid importance",  { importanceScore: 0.5 }),
    ];
    const selected = selectTeachingUnits(units);
    expect(selected.map(u => u.id)).toEqual(["b", "c", "a"]);
  });

  it("falls back to datRelevance when importanceScore is absent", () => {
    const units = [
      makeUnit("a", "one", { datRelevance: 0.3 }),
      makeUnit("b", "two", { datRelevance: 0.8 }),
    ];
    expect(selectTeachingUnits(units).map(u => u.id)).toEqual(["b", "a"]);
  });

  it("caps at maxUnits", () => {
    const units = Array.from({ length: 10 }, (_, i) => makeUnit(`u${i}`, `text ${i}`, { importanceScore: i / 10 }));
    expect(selectTeachingUnits(units, 3)).toHaveLength(3);
  });

  it("does not mutate the input array", () => {
    const units = [makeUnit("a", "x", { importanceScore: 0.1 }), makeUnit("b", "y", { importanceScore: 0.9 })];
    const copy = [...units];
    selectTeachingUnits(units);
    expect(units).toEqual(copy);
  });
});

describe("buildGroundedPageContext", () => {
  it("joins selected units' text with a blank line between them", () => {
    const units = [
      makeUnit("a", "First concept.", { importanceScore: 0.9 }),
      makeUnit("b", "Second concept.", { importanceScore: 0.5 }),
    ];
    expect(buildGroundedPageContext(units)).toBe("First concept.\n\nSecond concept.");
  });

  it("returns an empty string for an empty unit list", () => {
    expect(buildGroundedPageContext([])).toBe("");
  });
});
