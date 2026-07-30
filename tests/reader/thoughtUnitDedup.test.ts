// tests/reader/thoughtUnitDedup.test.ts
// Tests for lib/reader/thoughtUnitDedup.ts

import {
  deduplicateEntries,
  isSyntheticEntry,
  type DeduplicableEntry,
} from "../../lib/reader/thoughtUnitDedup";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function entry(overrides: Partial<DeduplicableEntry> & { id: string; text: string }): DeduplicableEntry {
  return {
    kind: "why-it-matters",
    canonicalType: "mechanism",
    importanceScore: 50,
    confidence: 1,
    groundingState: "exact",
    ...overrides,
  };
}

const A = entry({ id: "a", text: "Acid attack demineralizes enamel and leads to cavitation over time.", importanceScore: 60 });
const A_DUP = entry({ id: "a2", text: "Acid attack demineralizes enamel and leads to cavitation over time.", importanceScore: 40 });
const A_HIGHER = entry({ id: "a3", text: "Acid attack demineralizes enamel and leads to cavitation over time.", importanceScore: 90 });
const B = entry({ id: "b", text: "Fluoride substitutes hydroxyl groups in hydroxyapatite crystals.", importanceScore: 80, canonicalType: "mechanism" });
const C = entry({ id: "c", text: "Cavitation is the final stage of caries progression.", importanceScore: 70, canonicalType: "effect" });
const D = entry({ id: "d", text: "Do not confuse remineralization rate with fluoride concentration.", importanceScore: 55, canonicalType: "warning" });
const NEAR_DUP = entry({ id: "nd", text: "Acid attack demineralizes enamel and leads to cavitation, which progresses slowly.", importanceScore: 30 });
const LOW_CONF = entry({ id: "lc", text: "Some low confidence entry from extraction.", importanceScore: 80, confidence: 0.2 });
const SYNTHETIC = entry({ id: "syn", text: "Synthetic note with no PDF anchor.", groundingState: "synthetic" });

// ── Exact duplicate dedup ─────────────────────────────────────────────────────

describe("deduplicateEntries — canonical-hash dedup", () => {
  it("removes exact duplicate text, keeps only one", () => {
    const result = deduplicateEntries([A, A_DUP]);
    expect(result).toHaveLength(1);
  });

  it("keeps the higher-importance duplicate", () => {
    const result = deduplicateEntries([A_DUP, A_HIGHER]);
    expect(result[0].id).toBe("a3"); // importance 90 > 40
  });

  it("does not remove non-duplicate entries", () => {
    const result = deduplicateEntries([A, B, C]);
    expect(result).toHaveLength(3);
  });

  it("handles empty input", () => {
    expect(deduplicateEntries([])).toHaveLength(0);
  });

  it("handles single entry", () => {
    expect(deduplicateEntries([A])).toHaveLength(1);
  });
});

// ── Prefix-similarity dedup ───────────────────────────────────────────────────

describe("deduplicateEntries — prefix-similarity dedup", () => {
  it("removes near-duplicate sharing same 50-char prefix", () => {
    // Both start with "acid attack demineralizes enamel and leads to cavi" (first 50 chars match)
    const result = deduplicateEntries([A, NEAR_DUP]);
    expect(result).toHaveLength(1);
  });

  it("keeps higher-importance entry when prefix matches", () => {
    // A has importanceScore 60, NEAR_DUP has 30
    const result = deduplicateEntries([NEAR_DUP, A]);
    expect(result[0].importanceScore).toBe(60);
  });

  it("keeps distinct entries with different prefixes", () => {
    const result = deduplicateEntries([A, B, C, D]);
    expect(result).toHaveLength(4);
  });
});

// ── Category cap ─────────────────────────────────────────────────────────────

describe("deduplicateEntries — category cap", () => {
  it("caps entries per category at maxPerCategory", () => {
    const manyMechanisms = Array.from({ length: 10 }, (_, i) =>
      entry({ id: `m${i}`, text: `Mechanism ${i}: unique text about topic ${i}.`, canonicalType: "mechanism", importanceScore: 50 + i })
    );
    const result = deduplicateEntries(manyMechanisms, { maxPerCategory: 3 });
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("default maxPerCategory is 5", () => {
    const manyWarnings = Array.from({ length: 8 }, (_, i) =>
      entry({ id: `w${i}`, text: `Warning ${i}: distinct unique warning text about topic ${i}.`, canonicalType: "warning", importanceScore: 60 })
    );
    const result = deduplicateEntries(manyWarnings);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("allows entries from different categories to both appear", () => {
    const mechanisms = Array.from({ length: 3 }, (_, i) =>
      entry({ id: `m${i}`, text: `Mechanism ${i}: unique mechanism text ${i}.`, canonicalType: "mechanism" })
    );
    const warnings = Array.from({ length: 3 }, (_, i) =>
      entry({ id: `w${i}`, text: `Warning ${i}: unique warning text ${i}.`, canonicalType: "warning" })
    );
    const result = deduplicateEntries([...mechanisms, ...warnings], { maxPerCategory: 3 });
    const mechCount = result.filter((e) => e.canonicalType === "mechanism").length;
    const warnCount = result.filter((e) => e.canonicalType === "warning").length;
    expect(mechCount).toBe(3);
    expect(warnCount).toBe(3);
  });
});

// ── Confidence threshold ──────────────────────────────────────────────────────

describe("deduplicateEntries — confidence threshold", () => {
  it("filters entries below minConfidence", () => {
    const result = deduplicateEntries([A, LOW_CONF], { minConfidence: 0.5 });
    expect(result.some((e) => e.id === "lc")).toBe(false);
  });

  it("keeps entries at or above minConfidence", () => {
    const result = deduplicateEntries([A, LOW_CONF], { minConfidence: 0.2 });
    expect(result.some((e) => e.id === "lc")).toBe(true);
  });

  it("no filter applied when minConfidence is 0 (default)", () => {
    const result = deduplicateEntries([A, LOW_CONF]);
    expect(result.some((e) => e.id === "lc")).toBe(true);
  });
});

// ── Order preservation ────────────────────────────────────────────────────────

describe("deduplicateEntries — order preservation", () => {
  it("preserves original input order among survivors", () => {
    const result = deduplicateEntries([D, B, C]);
    const ids = result.map((e) => e.id);
    expect(ids.indexOf("d")).toBeLessThan(ids.indexOf("b"));
    expect(ids.indexOf("b")).toBeLessThan(ids.indexOf("c"));
  });
});

// ── isSyntheticEntry ──────────────────────────────────────────────────────────

describe("isSyntheticEntry", () => {
  it("returns true for groundingState === 'synthetic'", () => {
    expect(isSyntheticEntry(SYNTHETIC)).toBe(true);
  });

  it("returns false for exact grounding", () => {
    expect(isSyntheticEntry(A)).toBe(false);
  });

  it("returns false for fuzzy grounding", () => {
    const fuzzy = entry({ id: "f1", text: "Fuzzy grounded entry.", groundingState: "fuzzy" });
    expect(isSyntheticEntry(fuzzy)).toBe(false);
  });

  it("returns false when groundingState is undefined", () => {
    const noState: DeduplicableEntry = { id: "ns", text: "No state entry." };
    expect(isSyntheticEntry(noState)).toBe(false);
  });
});
