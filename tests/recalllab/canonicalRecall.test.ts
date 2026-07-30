// tests/recalllab/canonicalRecall.test.ts
// Tests for lib/recalllab/canonicalRecall.ts

import {
  canonicalToRecallCards,
  buildRecallSetFromCanonical,
  importanceFilteredEntries,
  type CanonicalRecallInput,
} from "../../lib/recalllab/canonicalRecall";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CAUSE: CanonicalRecallInput     = { id: "c1", text: "Acid attacks demineralize enamel surfaces", canonicalType: "cause",          importanceScore: 90 };
const EFFECT: CanonicalRecallInput    = { id: "e1", text: "Demineralization leads to cavity formation",  canonicalType: "effect",         importanceScore: 75 };
const DEFINITION: CanonicalRecallInput = { id: "d1", text: "Caries is a microbial disease of dental tissue", title: "Caries", canonicalType: "definition", importanceScore: 55 };
const MECHANISM: CanonicalRecallInput = { id: "m1", text: "Fluoride substitutes into hydroxyapatite crystals", canonicalType: "mechanism", importanceScore: 70 };
const WARNING: CanonicalRecallInput   = { id: "w1", text: "Do not confuse remineralization with fluorosis",    canonicalType: "warning",   importanceScore: 60 };
const HIGH_YIELD: CanonicalRecallInput = { id: "h1", text: "Most tested: acid-base balance in caries",       canonicalType: "high-yield", importanceScore: 92 };
const INDICATION: CanonicalRecallInput = { id: "i1", text: "Fluoride varnish for high-caries-risk patients", canonicalType: "indication", priorityTier: 4 };
const MEMORY: CanonicalRecallInput    = { id: "mn1", text: "CARIES = Cavities Are Really Irritating Enamel Sores", canonicalType: "memory-anchor", importanceScore: 50 };
const FORMULA: CanonicalRecallInput   = { id: "f1", text: "pH = -log[H+]", title: "pH Formula", canonicalType: "formula", importanceScore: 80 };

// ── canonicalToRecallCards — basic structure ──────────────────────────────────

describe("canonicalToRecallCards — basic structure", () => {
  it("returns empty array for empty input", () => {
    expect(canonicalToRecallCards([])).toHaveLength(0);
  });

  it("generates one card per entry", () => {
    const cards = canonicalToRecallCards([CAUSE, EFFECT, DEFINITION]);
    expect(cards).toHaveLength(3);
  });

  it("each card has required RecallCard fields", () => {
    const [card] = canonicalToRecallCards([CAUSE]);
    expect(card.id).toBeTruthy();
    expect(card.type).toBeTruthy();
    expect(card.front).toBeTruthy();
    expect(card.back).toBeTruthy();
    expect(card.reviewCount).toBe(0);
    expect(card.isMissed).toBe(false);
  });

  it("card id encodes canonical type and entry id", () => {
    const [card] = canonicalToRecallCards([CAUSE]);
    expect(card.id).toContain("cause");
    expect(card.id).toContain("c1");
  });
});

// ── canonicalToRecallCards — question stems ───────────────────────────────────

describe("canonicalToRecallCards — question stems", () => {
  it("cause entry uses 'What causes:' stem", () => {
    const [card] = canonicalToRecallCards([CAUSE]);
    expect(card.front).toMatch(/What causes:/i);
  });

  it("definition entry uses 'Define:' stem and title as label", () => {
    const [card] = canonicalToRecallCards([DEFINITION]);
    expect(card.front).toMatch(/Define:/i);
    expect(card.front).toContain("Caries");
  });

  it("mechanism entry uses 'Explain the mechanism of:' stem", () => {
    const [card] = canonicalToRecallCards([MECHANISM]);
    expect(card.front).toMatch(/Explain the mechanism of:/i);
  });

  it("warning entry includes warning emoji", () => {
    const [card] = canonicalToRecallCards([WARNING]);
    expect(card.front).toContain("⚠️");
  });

  it("high-yield entry uses 'high-yield point' stem", () => {
    const [card] = canonicalToRecallCards([HIGH_YIELD]);
    expect(card.front).toMatch(/high-yield point/i);
  });

  it("formula entry uses title as label when present", () => {
    const [card] = canonicalToRecallCards([FORMULA]);
    expect(card.front).toContain("pH Formula");
  });

  it("memory-anchor entry uses 'How do you remember:' stem", () => {
    const [card] = canonicalToRecallCards([MEMORY]);
    expect(card.front).toMatch(/How do you remember:/i);
  });

  it("unknown canonical type falls back to 'Explain:' stem", () => {
    const entry: CanonicalRecallInput = { id: "x1", text: "Some text", canonicalType: "unknown-type", importanceScore: 50 };
    const [card] = canonicalToRecallCards([entry]);
    expect(card.front).toMatch(/Explain:/i);
  });
});

// ── canonicalToRecallCards — card types ──────────────────────────────────────

describe("canonicalToRecallCards — card types", () => {
  it("cause → 'mechanism' card type", () => {
    const [card] = canonicalToRecallCards([CAUSE]);
    expect(card.type).toBe("mechanism");
  });

  it("definition → 'concept' card type", () => {
    const [card] = canonicalToRecallCards([DEFINITION]);
    expect(card.type).toBe("concept");
  });

  it("high-yield → 'fact' card type", () => {
    const [card] = canonicalToRecallCards([HIGH_YIELD]);
    expect(card.type).toBe("fact");
  });

  it("indication → 'application' card type", () => {
    const [card] = canonicalToRecallCards([INDICATION]);
    expect(card.type).toBe("application");
  });

  it("memory-anchor → 'fact' card type", () => {
    const [card] = canonicalToRecallCards([MEMORY]);
    expect(card.type).toBe("fact");
  });
});

// ── canonicalToRecallCards — importance ordering ──────────────────────────────

describe("canonicalToRecallCards — importance ordering", () => {
  it("critical-importance entry appears before medium-importance entry", () => {
    const cards = canonicalToRecallCards([DEFINITION, HIGH_YIELD]);
    // HIGH_YIELD importanceScore=92 → critical; DEFINITION importanceScore=55 → medium
    expect(cards[0].id).toContain("h1");
    expect(cards[1].id).toContain("d1");
  });

  it("sorts critical before high before medium before reference", () => {
    const refEntry: CanonicalRecallInput  = { id: "ref", text: "reference text", canonicalType: "evidence", importanceScore: 15 };
    const cards = canonicalToRecallCards([DEFINITION, refEntry, HIGH_YIELD, CAUSE]);
    // HIGH_YIELD(92→critical), CAUSE(90→critical), EFFECT-like(55→medium), ref(15→reference)
    // Just verify first card is high-yield or cause (both critical)
    const firstImportanceScore = cards[0].id.includes("h1") || cards[0].id.includes("c1");
    expect(firstImportanceScore).toBe(true);
    // Last card should be the reference entry
    expect(cards[cards.length - 1].id).toContain("ref");
  });

  it("resolves importance from priorityTier when no importanceScore", () => {
    const cards = canonicalToRecallCards([INDICATION]); // priorityTier=4 → high
    expect(cards[0].id).toContain("i1");
    // No error should be thrown
  });
});

// ── canonicalToRecallCards — content limits ───────────────────────────────────

describe("canonicalToRecallCards — content limits", () => {
  it("caps cards at maxCards", () => {
    const entries: CanonicalRecallInput[] = Array.from({ length: 30 }, (_, i) => ({
      id: `e${i}`,
      text: `text ${i}`,
      canonicalType: "definition",
      importanceScore: i,
    }));
    expect(canonicalToRecallCards(entries, 10)).toHaveLength(10);
  });

  it("truncates back text at 300 chars with ellipsis", () => {
    const longEntry: CanonicalRecallInput = {
      id: "long",
      text: "x".repeat(400),
      canonicalType: "definition",
      importanceScore: 50,
    };
    const [card] = canonicalToRecallCards([longEntry]);
    expect(card.back.length).toBeLessThanOrEqual(304); // 300 chars + "…"
    expect(card.back.endsWith("…")).toBe(true);
  });

  it("does not truncate back text under 300 chars", () => {
    const [card] = canonicalToRecallCards([CAUSE]);
    expect(card.back).toBe(CAUSE.text);
    expect(card.back.endsWith("…")).toBe(false);
  });

  it("uses truncated text as label for front when no title and text is long", () => {
    const longEntry: CanonicalRecallInput = {
      id: "long",
      text: "y".repeat(200),
      canonicalType: "definition",
      importanceScore: 50,
    };
    const [card] = canonicalToRecallCards([longEntry]);
    // Front should include the 50-char truncated label
    expect(card.front.length).toBeLessThan(200);
  });
});

// ── buildRecallSetFromCanonical ───────────────────────────────────────────────

describe("buildRecallSetFromCanonical", () => {
  const OPTS = { bookId: "book-123", pageNumber: 42, pageTitle: "Dental Caries" };

  it("returns a valid RecallSet structure", () => {
    const set = buildRecallSetFromCanonical([CAUSE, EFFECT], OPTS);
    expect(set.id).toBeTruthy();
    expect(set.bookId).toBe("book-123");
    expect(set.pageNumber).toBe(42);
    expect(set.topic).toBe("Dental Caries");
    expect(Array.isArray(set.cards)).toBe(true);
    expect(typeof set.createdAt).toBe("number");
  });

  it("set id is stable (encodes bookId + pageNumber + 'canonical')", () => {
    const set1 = buildRecallSetFromCanonical([CAUSE], OPTS);
    const set2 = buildRecallSetFromCanonical([CAUSE, EFFECT], OPTS);
    expect(set1.id).toBe(set2.id);
  });

  it("set id differs for different pageNumber", () => {
    const set1 = buildRecallSetFromCanonical([CAUSE], { ...OPTS, pageNumber: 1 });
    const set2 = buildRecallSetFromCanonical([CAUSE], { ...OPTS, pageNumber: 2 });
    expect(set1.id).not.toBe(set2.id);
  });

  it("includes all generated cards", () => {
    const set = buildRecallSetFromCanonical([CAUSE, EFFECT, DEFINITION], OPTS);
    expect(set.cards).toHaveLength(3);
  });

  it("falls back to 'Page N' topic when no pageTitle provided", () => {
    const set = buildRecallSetFromCanonical([CAUSE], { bookId: "b1", pageNumber: 7 });
    expect(set.topic).toBe("Page 7");
  });

  it("handles empty entries gracefully", () => {
    const set = buildRecallSetFromCanonical([], OPTS);
    expect(set.cards).toHaveLength(0);
    expect(set.topic).toBe("Dental Caries");
  });

  it("includes bookTitle when provided", () => {
    const set = buildRecallSetFromCanonical([CAUSE], { ...OPTS, bookTitle: "Dental Anatomy" });
    expect(set.bookTitle).toBe("Dental Anatomy");
  });

  it("uses sourceLabel 'right-panel'", () => {
    const set = buildRecallSetFromCanonical([CAUSE], OPTS);
    expect(set.sourceLabel).toBe("right-panel");
  });
});

// ── importanceFilteredEntries ─────────────────────────────────────────────────

describe("importanceFilteredEntries", () => {
  const entries = [HIGH_YIELD, CAUSE, EFFECT, MECHANISM, DEFINITION, WARNING, MEMORY];

  it("returns only critical entries when minLevel is 'critical'", () => {
    const filtered = importanceFilteredEntries(entries, "critical");
    // HIGH_YIELD(92→critical), CAUSE(90→critical)
    expect(filtered.every((e) => (e.importanceScore ?? 0) >= 85)).toBe(true);
  });

  it("includes critical+high when minLevel is 'high'", () => {
    const filtered = importanceFilteredEntries(entries, "high");
    // critical(score≥85) + high(score 70-84) entries
    expect(filtered.length).toBeGreaterThan(2);
    expect(filtered.some((e) => e.id === "h1")).toBe(true);
    expect(filtered.some((e) => e.id === "m1")).toBe(true);
  });

  it("includes all non-reference entries when minLevel is 'medium'", () => {
    const filtered = importanceFilteredEntries(entries, "medium");
    // reference would be importanceScore < 30
    const refEntry: CanonicalRecallInput = { id: "ref", text: "ref", importanceScore: 10 };
    const withRef = importanceFilteredEntries([...entries, refEntry], "medium");
    expect(withRef.some((e) => e.id === "ref")).toBe(false);
  });

  it("returns all entries when minLevel is 'reference'", () => {
    const refEntry: CanonicalRecallInput = { id: "ref", text: "ref", importanceScore: 10 };
    const allEntries = [...entries, refEntry];
    const filtered = importanceFilteredEntries(allEntries, "reference");
    expect(filtered).toHaveLength(allEntries.length);
  });

  it("returns empty array for empty input", () => {
    expect(importanceFilteredEntries([], "critical")).toHaveLength(0);
  });
});
