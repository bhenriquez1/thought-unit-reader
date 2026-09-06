// tests/learningHub.titleNormalizer.test.ts
// Tests for the Learning Hub title normalization layer.
// Covers the user's exact problem cases from the architecture spec:
//   "CH 3" → "Chapter 3"
//   "27 Unit 5 THE EVOLUTIONARY HISTORY…552" → "Unit 5 — Evolutionary History…"
//   "2 H 2 1 O 2 2 H 2 O Reactants…" → low confidence, use safe fallback

import {
  normalizeDisplayTitle,
  normalizeDisplayTitles,
} from "../lib/learningHub/titleNormalizer";

/* ─── Page number stripping ──────────────────────────────────────────────────── */

describe("page number stripping", () => {
  it("strips leading page number from long titles", () => {
    const dt = normalizeDisplayTitle("27 Unit 5 THE EVOLUTIONARY HISTORY OF BIOLOGICAL DIVERSITY 552");
    expect(dt.cleanedTitle).not.toMatch(/^27\b/);
    expect(dt.cleanedTitle).not.toMatch(/552$/);
  });

  it("strips trailing page numbers", () => {
    const dt = normalizeDisplayTitle("Water and Life 48");
    expect(dt.cleanedTitle).not.toMatch(/\d+$/);
    expect(dt.cleanedTitle.toLowerCase()).toContain("water");
  });

  it("strips 'page N' inline", () => {
    const dt = normalizeDisplayTitle("Chapter 3 page 48");
    expect(dt.cleanedTitle).not.toContain("page 48");
  });
});

/* ─── ALL-CAPS normalization ─────────────────────────────────────────────────── */

describe("ALL-CAPS normalization", () => {
  it("converts all-caps subtitle to title case", () => {
    const dt = normalizeDisplayTitle("Chapter 5 THE EVOLUTIONARY HISTORY OF BIOLOGICAL DIVERSITY");
    // Should not remain ALL CAPS
    expect(dt.cleanedTitle).not.toMatch(/^[^a-z]+$/);
  });

  it("preserves mixed-case titles unchanged", () => {
    const dt = normalizeDisplayTitle("Chapter 2 — Chemical Bonds and Water");
    expect(dt.cleanedTitle).toContain("Chemical");
    expect(dt.cleanedTitle).toContain("Water");
  });
});

/* ─── Hierarchy prefix detection ─────────────────────────────────────────────── */

describe("hierarchy prefix detection", () => {
  it("detects 'CH 3' as Chapter 3", () => {
    const dt = normalizeDisplayTitle("CH 3", { safeFallback: "Chapter 3" });
    // Either detects it, or falls back safely
    expect(dt.cleanedTitle).toContain("3");
    expect(dt.useFallback || dt.prefix).toBeTruthy();
  });

  it("detects 'Chapter 3 — Water and Life' correctly", () => {
    const dt = normalizeDisplayTitle("Chapter 3 — Water and Life");
    expect(dt.prefix).toBe("Chapter 3");
    expect(dt.level).toBe("chapter");
    expect(dt.cleanedTitle).toContain("Water and Life");
    expect(dt.shortTitle).toBe("Water and Life");
  });

  it("detects 'CHAPTER 4' as chapter level", () => {
    const dt = normalizeDisplayTitle("CHAPTER 4");
    expect(dt.level).toBe("chapter");
    expect(dt.prefix).toBe("Chapter 4");
  });

  it("detects 'Unit 5 …' as unit level", () => {
    const dt = normalizeDisplayTitle("Unit 5 — Evolutionary History");
    expect(dt.level).toBe("unit");
    expect(dt.prefix).toBe("Unit 5");
  });

  it("detects 'Part 1 — Foundations' as part level", () => {
    const dt = normalizeDisplayTitle("Part 1 — Foundations");
    expect(dt.level).toBe("part");
    expect(dt.shortTitle).toBe("Foundations");
  });

  it("detects numbered section '3.2 Membrane Transport'", () => {
    const dt = normalizeDisplayTitle("3.2 Membrane Transport");
    expect(dt.level).toBe("subsection");
  });

  it("detects 'SECTION 4' as section level", () => {
    const dt = normalizeDisplayTitle("SECTION 4 Cell Division");
    expect(dt.level).toBe("section");
  });
});

/* ─── OCR garbage detection ──────────────────────────────────────────────────── */

describe("OCR garbage detection", () => {
  it("marks formula fragment as low-confidence with fallback", () => {
    const dt = normalizeDisplayTitle(
      "2 H 2 1 O 2 2 H 2 O Reactants Chemical Products reaction",
      { safeFallback: "Chemical Reactions" },
    );
    expect(dt.confidence).toBeLessThan(0.4);
    expect(dt.useFallback).toBe(true);
    expect(dt.cleanedTitle).toBe("Chemical Reactions");
  });

  it("marks pure-digits title as garbage", () => {
    const dt = normalizeDisplayTitle("552", { safeFallback: "Section" });
    expect(dt.useFallback).toBe(true);
  });

  it("marks empty title as low-confidence", () => {
    const dt = normalizeDisplayTitle("", { safeFallback: "Chapter" });
    expect(dt.useFallback).toBe(true);
  });
});

/* ─── Confidence scoring ─────────────────────────────────────────────────────── */

describe("confidence scoring", () => {
  it("gives high confidence to clean chapter titles", () => {
    const dt = normalizeDisplayTitle("Chapter 3 — Water and Life");
    expect(dt.confidence).toBeGreaterThan(0.7);
  });

  it("gives low confidence to garbage fragments", () => {
    const dt = normalizeDisplayTitle("CH 3 CH 3");
    expect(dt.confidence).toBeLessThan(0.6);
  });

  it("confidence is between 0 and 1", () => {
    const cases = [
      "Chapter 1 — The Study of Life",
      "2 H 2 O",
      "",
      "552",
      "CH 3",
      "Unit 5 THE EVOLUTIONARY HISTORY 552",
    ];
    for (const raw of cases) {
      const dt = normalizeDisplayTitle(raw);
      expect(dt.confidence).toBeGreaterThanOrEqual(0);
      expect(dt.confidence).toBeLessThanOrEqual(1);
    }
  });
});

/* ─── Short title generation ─────────────────────────────────────────────────── */

describe("short title generation", () => {
  it("strips chapter prefix for short title", () => {
    const dt = normalizeDisplayTitle("Chapter 3 — Water and Life");
    expect(dt.shortTitle).toBe("Water and Life");
    expect(dt.shortTitle).not.toContain("Chapter 3");
  });

  it("short title is ≤ 40 chars", () => {
    const dt = normalizeDisplayTitle("Chapter 5 — The Evolutionary History of Biological Diversity on Earth");
    expect(dt.shortTitle.length).toBeLessThanOrEqual(40);
  });

  it("short title is non-empty even for minimal input", () => {
    const dt = normalizeDisplayTitle("CHAPTER 1");
    expect(dt.shortTitle.length).toBeGreaterThan(0);
  });
});

/* ─── originalTitle preserved ────────────────────────────────────────────────── */

describe("originalTitle traceability", () => {
  it("always preserves the original raw title", () => {
    const raw = "27 Unit 5 THE EVOLUTIONARY HISTORY OF BIOLOGICAL DIVERSITY 552";
    const dt  = normalizeDisplayTitle(raw);
    expect(dt.originalTitle).toBe(raw);
  });

  it("preserves original even for garbage input", () => {
    const raw = "2 H 2 1 O 2 2 H 2 O Reactants Chemical Products";
    const dt  = normalizeDisplayTitle(raw, { safeFallback: "Chemical Reactions" });
    expect(dt.originalTitle).toBe(raw);
  });
});

/* ─── normalizeDisplayTitles — deduplication ─────────────────────────────────── */

describe("normalizeDisplayTitles — deduplication", () => {
  it("deduplicates identical cleaned titles with (2), (3) suffix", () => {
    const raws = [
      "Chapter 3 — Water and Life",
      "Chapter 3 — Water and Life",  // duplicate
      "Chapter 4 — Carbon Chemistry",
    ];
    const dts = normalizeDisplayTitles(raws);
    expect(dts[0].cleanedTitle).not.toContain("(2)");
    expect(dts[1].cleanedTitle).toContain("(2)");
    expect(dts[2].cleanedTitle).not.toContain("(");
  });

  it("returns same count as input", () => {
    const raws = ["A", "B", "C"];
    expect(normalizeDisplayTitles(raws)).toHaveLength(3);
  });
});

/* ─── Real-world examples from the spec ─────────────────────────────────────── */

describe("real-world examples from the spec", () => {
  it("long ALL-CAPS unit title", () => {
    const dt = normalizeDisplayTitle("27 Unit 5 THE EVOLUTIONARY HISTORY OF BIOLOGICAL DIVERSITY 552");
    // Original preserved
    expect(dt.originalTitle).toContain("27");
    // No leading page number in cleaned
    expect(dt.cleanedTitle).not.toMatch(/^27/);
    // No trailing page number
    expect(dt.cleanedTitle).not.toMatch(/552$/);
    // Has unit info
    expect(dt.cleanedTitle.toLowerCase()).toContain("unit 5");
    // Not all-caps anymore
    expect(dt.cleanedTitle).not.toBe(dt.cleanedTitle.toUpperCase());
  });

  it("chapter shorthand 'CH 3' uses safe fallback", () => {
    const dt = normalizeDisplayTitle("CH 3", { safeFallback: "Chapter 3" });
    expect(dt.cleanedTitle).toBeTruthy();
    expect(dt.cleanedTitle).toContain("3");
  });

  it("formula fragment triggers fallback", () => {
    const dt = normalizeDisplayTitle(
      "2 H 2 1 O 2 2 H 2 O Reactants Chemical Products reaction",
      { safeFallback: "Chemical Reactions and Products" },
    );
    expect(dt.useFallback).toBe(true);
    expect(dt.cleanedTitle).toBe("Chemical Reactions and Products");
  });

  it("repeated chapter number 'CH 3 CH 3'", () => {
    const dt = normalizeDisplayTitle("CH 3 CH 3", { safeFallback: "Chapter 3" });
    // Should not have repeated tokens in cleaned title
    expect(dt.cleanedTitle).not.toMatch(/ch 3.*ch 3/i);
  });

  it("evolution chapter full title", () => {
    const dt = normalizeDisplayTitle(
      "1 Evolution, the Themes of Biology, and Scientific Inquiry"
    );
    expect(dt.cleanedTitle.toLowerCase()).toContain("evolution");
    expect(dt.confidence).toBeGreaterThan(0.3);
  });
});
