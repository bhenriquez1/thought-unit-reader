// tests/reader/importanceBadge.test.ts
// Tests for lib/reader/importanceBadge.ts

import {
  importanceLevelFromScore,
  importanceLevelFromTier,
  resolveImportanceLevel,
  getImportanceLevelDescriptor,
} from "../../lib/reader/importanceBadge";

describe("importanceLevelFromScore", () => {
  it("maps 80–100 → critical", () => {
    expect(importanceLevelFromScore(100)).toBe("critical");
    expect(importanceLevelFromScore(80)).toBe("critical");
  });

  it("maps 55–79 → high", () => {
    expect(importanceLevelFromScore(79)).toBe("high");
    expect(importanceLevelFromScore(55)).toBe("high");
  });

  it("maps 30–54 → medium", () => {
    expect(importanceLevelFromScore(54)).toBe("medium");
    expect(importanceLevelFromScore(30)).toBe("medium");
  });

  it("maps 0–29 → reference", () => {
    expect(importanceLevelFromScore(0)).toBe("reference");
    expect(importanceLevelFromScore(29)).toBe("reference");
  });
});

describe("importanceLevelFromTier", () => {
  it("tier 5 → critical", () => expect(importanceLevelFromTier(5)).toBe("critical"));
  it("tier 4 → high",     () => expect(importanceLevelFromTier(4)).toBe("high"));
  it("tier 3 → medium",   () => expect(importanceLevelFromTier(3)).toBe("medium"));
  it("tier 2 → reference", () => expect(importanceLevelFromTier(2)).toBe("reference"));
  it("tier 1 → reference", () => expect(importanceLevelFromTier(1)).toBe("reference"));
});

describe("resolveImportanceLevel", () => {
  it("importanceScore takes precedence over priorityTier", () => {
    // score=90 → critical; tier=1 → reference; critical wins
    expect(resolveImportanceLevel(90, 1)).toBe("critical");
  });

  it("falls back to priorityTier when importanceScore is absent", () => {
    expect(resolveImportanceLevel(undefined, 5)).toBe("critical");
    expect(resolveImportanceLevel(undefined, 3)).toBe("medium");
  });

  it("returns medium when both are absent", () => {
    expect(resolveImportanceLevel()).toBe("medium");
  });

  it("returns medium when both are undefined", () => {
    expect(resolveImportanceLevel(undefined, undefined)).toBe("medium");
  });
});

describe("getImportanceLevelDescriptor", () => {
  it("returns a descriptor with all required fields", () => {
    const desc = getImportanceLevelDescriptor("critical");
    expect(desc.level).toBe("critical");
    expect(desc.label).toBe("Critical");
    expect(desc.color).toBeTruthy();
    expect(desc.bgColor).toBeTruthy();
    expect(desc.borderColor).toBeTruthy();
  });

  it("reference descriptor has a distinct color from critical", () => {
    const crit = getImportanceLevelDescriptor("critical");
    const ref  = getImportanceLevelDescriptor("reference");
    expect(crit.color).not.toBe(ref.color);
  });
});
