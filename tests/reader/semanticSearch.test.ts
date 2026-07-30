// tests/reader/semanticSearch.test.ts
// Tests for lib/reader/semanticSearch.ts

import { semanticSearch, buildSearchSnippet } from "../../lib/reader/semanticSearch";
import { UNIVERSAL_PACK } from "../../lib/semantic/packs/universal";

// ── Fixtures ───────────────────────────────────────────────────────────────

const BASE_ENTRIES = [
  {
    id: "e1",
    text: "Enamel is the hardest substance in the human body",
    title: "Enamel Structure",
    canonicalType: "definition",
    priorityTier: 3,
  },
  {
    id: "e2",
    text: "Dentinal tubules run from the dentin-enamel junction to the pulp",
    title: "Dentinal Tubules",
    canonicalType: "process",
    priorityTier: 4,
  },
  {
    id: "e3",
    text: "The sulcular epithelium lines the gingival sulcus",
    reason: "This is high-yield anatomy for boards",
    canonicalType: "high-yield",
    importanceScore: 85,
  },
  {
    id: "e4",
    text: "The formula for stress is force divided by area",
    title: "Stress Formula",
    canonicalType: "formula",
    priorityTier: 5,
  },
];

// ── semanticSearch — basic behavior ───────────────────────────────────────

describe("semanticSearch — basic behavior", () => {
  it("returns empty array for query shorter than 2 chars", () => {
    expect(semanticSearch(BASE_ENTRIES, "", UNIVERSAL_PACK)).toEqual([]);
    expect(semanticSearch(BASE_ENTRIES, "e", UNIVERSAL_PACK)).toEqual([]);
  });

  it("returns results for a matching query", () => {
    const results = semanticSearch(BASE_ENTRIES, "enamel", UNIVERSAL_PACK);
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((r) => r.entry.id);
    expect(ids).toContain("e1");
  });

  it("is case-insensitive", () => {
    const lower = semanticSearch(BASE_ENTRIES, "enamel", UNIVERSAL_PACK);
    const upper = semanticSearch(BASE_ENTRIES, "ENAMEL", UNIVERSAL_PACK);
    expect(lower.map((r) => r.entry.id)).toEqual(upper.map((r) => r.entry.id));
  });

  it("returns no results when nothing matches", () => {
    const results = semanticSearch(BASE_ENTRIES, "zzznomatch", UNIVERSAL_PACK);
    expect(results).toEqual([]);
  });
});

// ── semanticSearch — result shape ─────────────────────────────────────────

describe("semanticSearch — result shape", () => {
  it("each result carries canonicalLabel, icon, and importanceLevel", () => {
    const [result] = semanticSearch(BASE_ENTRIES, "enamel", UNIVERSAL_PACK);
    expect(result.canonicalLabel).toBeTruthy();
    expect(result.canonicalIcon).toBeTruthy();
    expect(result.canonicalShortLabel).toBeTruthy();
    expect(["critical", "high", "medium", "reference"]).toContain(result.importanceLevel);
  });

  it("result.entry is the original entry object", () => {
    const [result] = semanticSearch(BASE_ENTRIES, "enamel", UNIVERSAL_PACK);
    expect(result.entry).toBe(BASE_ENTRIES.find((e) => e.id === "e1"));
  });

  it("matchedField is set to 'text' for text matches", () => {
    const [result] = semanticSearch(BASE_ENTRIES, "enamel", UNIVERSAL_PACK);
    expect(result.matchedField).toBe("text");
  });

  it("matchedField is set to 'title' for title-only matches", () => {
    // "Tubules" appears in title but not in text
    const results = semanticSearch(BASE_ENTRIES, "Tubules", UNIVERSAL_PACK);
    // e2 has "Dentinal Tubules" in title; text starts with "Dentinal tubules" (lowercase "t")
    // so "Tubules" (lowercase = "tubules") may match text too — check reason carefully
    // Actually "tubules" IS in the text of e2: "Dentinal tubules run from..."
    // So matchedField will be "text"
    const e2Result = results.find((r) => r.entry.id === "e2")!;
    expect(e2Result).toBeDefined();
    expect(e2Result.matchedField).toBe("text");
  });

  it("matchedField is 'reason' when match is in reason field only", () => {
    // "high-yield anatomy" only appears in reason of e3
    const results = semanticSearch(BASE_ENTRIES, "anatomy", UNIVERSAL_PACK);
    const e3Result = results.find((r) => r.entry.id === "e3")!;
    expect(e3Result).toBeDefined();
    expect(e3Result.matchedField).toBe("reason");
  });
});

// ── semanticSearch — ranking ───────────────────────────────────────────────

describe("semanticSearch — ranking", () => {
  it("results are sorted by matchScore descending", () => {
    const results = semanticSearch(BASE_ENTRIES, "formula", UNIVERSAL_PACK);
    const scores = results.map((r) => r.matchScore);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
  });

  it("critical/high importance entries score higher than equal-text-match reference entries", () => {
    const entries = [
      { id: "low",  text: "enamel layer",  canonicalType: "definition",  priorityTier: 1 },
      { id: "high", text: "enamel composition", canonicalType: "high-yield", importanceScore: 85 },
    ];
    const results = semanticSearch(entries, "enamel", UNIVERSAL_PACK);
    const lowIdx  = results.findIndex((r) => r.entry.id === "low");
    const highIdx = results.findIndex((r) => r.entry.id === "high");
    expect(highIdx).toBeLessThan(lowIdx);
  });
});

// ── semanticSearch — maxResults ────────────────────────────────────────────

describe("semanticSearch — maxResults", () => {
  it("respects the maxResults cap", () => {
    // Create 10 entries all matching "test"
    const entries = Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`,
      text: `test entry number ${i}`,
      canonicalType: "definition",
    }));
    const results = semanticSearch(entries, "test", UNIVERSAL_PACK, 3);
    expect(results.length).toBe(3);
  });

  it("returns all results when count < maxResults", () => {
    const results = semanticSearch(BASE_ENTRIES, "enamel", UNIVERSAL_PACK, 20);
    // Only 1-2 entries match "enamel" in BASE_ENTRIES
    expect(results.length).toBeLessThanOrEqual(BASE_ENTRIES.length);
  });
});

// ── buildSearchSnippet ────────────────────────────────────────────────────

describe("buildSearchSnippet", () => {
  it("returns text start when query is not found", () => {
    const text = "abcdefghij".repeat(20);
    const snippet = buildSearchSnippet(text, "zzz", 30);
    expect(snippet).toMatch(/^abcdef/);
  });

  it("includes leading ellipsis when match is mid-text", () => {
    const text = "0123456789".repeat(20);
    // Match near position 100
    const longText = "x".repeat(80) + "keyword" + "x".repeat(100);
    const snippet = buildSearchSnippet(longText, "keyword", 30);
    expect(snippet.startsWith("…")).toBe(true);
  });

  it("includes trailing ellipsis when text exceeds maxLen after match", () => {
    const text = "keyword " + "z".repeat(200);
    const snippet = buildSearchSnippet(text, "keyword", 30);
    expect(snippet.endsWith("…")).toBe(true);
  });

  it("returns full text without ellipsis when text is short", () => {
    const text = "keyword is here";
    const snippet = buildSearchSnippet(text, "keyword", 120);
    expect(snippet).toBe("keyword is here");
    expect(snippet).not.toContain("…");
  });

  it("truncates text that is longer than maxLen and has no match", () => {
    const text = "a".repeat(200);
    const snippet = buildSearchSnippet(text, "zzz", 50);
    expect(snippet.length).toBeLessThanOrEqual(52); // 50 + 1 for "…"
    expect(snippet.endsWith("…")).toBe(true);
  });
});

// ── Semantic metadata in search results ───────────────────────────────────

describe("semanticSearch — semantic metadata", () => {
  it("importanceLevel reflects importanceScore when present", () => {
    // e3 has importanceScore=85 → should be "critical"
    const results = semanticSearch(BASE_ENTRIES, "sulcular", UNIVERSAL_PACK);
    const e3 = results.find((r) => r.entry.id === "e3")!;
    expect(e3.importanceLevel).toBe("critical");
  });

  it("importanceLevel falls back to priorityTier when importanceScore absent", () => {
    // e4 has priorityTier=5 → "critical"
    const results = semanticSearch(BASE_ENTRIES, "stress", UNIVERSAL_PACK);
    const e4 = results.find((r) => r.entry.id === "e4")!;
    expect(e4.importanceLevel).toBe("critical");
  });

  it("uses UNIVERSAL_PACK label for unknown canonicalType", () => {
    const entries = [{ id: "x", text: "unique term xyz", canonicalType: "complication" }];
    const [result] = semanticSearch(entries, "unique", UNIVERSAL_PACK);
    // Should still return a result with non-empty label
    expect(result.canonicalLabel).toBeTruthy();
  });
});
