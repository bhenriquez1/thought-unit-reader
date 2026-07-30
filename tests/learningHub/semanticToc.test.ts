// tests/learningHub/semanticToc.test.ts
// Tests for lib/learningHub/semanticToc.ts

import {
  buildSemanticToc,
  type SemanticTocChapter,
  type SemanticTocSection,
} from "../../lib/learningHub/semanticToc";
import type { ConceptUnit } from "../../lib/learningHub/conceptLearningPlan";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeUnit(overrides: Partial<ConceptUnit> = {}): ConceptUnit {
  return {
    id: "u1",
    text: "Default unit text for testing purposes.",
    canonicalType: "definition",
    importanceScore: 70,
    pageNumber: 1,
    ...overrides,
  };
}

const DEF_UNIT     = makeUnit({ id: "d1", canonicalType: "definition",    importanceScore: 80, pageNumber: 1  });
const MECH_UNIT    = makeUnit({ id: "m1", canonicalType: "mechanism",     importanceScore: 75, pageNumber: 10 });
const CAUSE_UNIT   = makeUnit({ id: "ca1", canonicalType: "cause",        importanceScore: 90, pageNumber: 15 });
const PEARL_UNIT   = makeUnit({ id: "cp1", canonicalType: "clinical-pearl", importanceScore: 78, pageNumber: 20 });
const WARN_UNIT    = makeUnit({ id: "w1", canonicalType: "warning",       importanceScore: 60, pageNumber: 25 });
const FORMULA_UNIT = makeUnit({ id: "f1", canonicalType: "formula",       importanceScore: 85, pageNumber: 30 });
const MEMORY_UNIT  = makeUnit({ id: "mn1", canonicalType: "memory-anchor", importanceScore: 50, pageNumber: 35 });
const HYIELD_UNIT  = makeUnit({ id: "hy1", canonicalType: "high-yield",   importanceScore: 92, pageNumber: 12 });

const ALL_UNITS = [DEF_UNIT, MECH_UNIT, CAUSE_UNIT, PEARL_UNIT, WARN_UNIT, FORMULA_UNIT, MEMORY_UNIT, HYIELD_UNIT];

const CHAPTERS = [
  { title: "Chapter 1: Basics",    pageStart: 1  },
  { title: "Chapter 2: Advanced",  pageStart: 20 },
];

// ── Output structure ──────────────────────────────────────────────────────────

describe("buildSemanticToc — output structure", () => {
  it("returns empty array for empty input", () => {
    expect(buildSemanticToc([])).toHaveLength(0);
  });

  it("returns a SemanticTocChapter array for non-empty input", () => {
    const toc = buildSemanticToc(ALL_UNITS);
    expect(Array.isArray(toc)).toBe(true);
    expect(toc.length).toBeGreaterThan(0);
  });

  it("each chapter has required fields: title, sections, unitCount", () => {
    const toc = buildSemanticToc(ALL_UNITS);
    for (const ch of toc) {
      expect(ch.title).toBeTruthy();
      expect(Array.isArray(ch.sections)).toBe(true);
      expect(typeof ch.unitCount).toBe("number");
      expect(ch.unitCount).toBeGreaterThan(0);
    }
  });

  it("each section has required fields: label, icon, units, canonicalTypeGroup", () => {
    const toc = buildSemanticToc(ALL_UNITS);
    for (const ch of toc) {
      for (const sec of ch.sections) {
        expect(sec.label).toBeTruthy();
        expect(sec.icon).toBeTruthy();
        expect(Array.isArray(sec.units)).toBe(true);
        expect(sec.canonicalTypeGroup).toBeTruthy();
      }
    }
  });

  it("each unit within a section has required fields", () => {
    const toc = buildSemanticToc(ALL_UNITS);
    for (const ch of toc) {
      for (const sec of ch.sections) {
        for (const u of sec.units) {
          expect(u.id).toBeTruthy();
          expect(u.text).toBeTruthy();
          expect(u.canonicalType).toBeTruthy();
        }
      }
    }
  });
});

// ── Section grouping ──────────────────────────────────────────────────────────

describe("buildSemanticToc — section grouping", () => {
  it("definition type appears in 'Definitions' section", () => {
    const toc = buildSemanticToc([DEF_UNIT]);
    const defSection = findSection(toc, "Definitions");
    expect(defSection).toBeDefined();
    expect(defSection!.units.some((u) => u.id === "d1")).toBe(true);
  });

  it("mechanism type appears in 'Mechanisms' section", () => {
    const toc = buildSemanticToc([MECH_UNIT]);
    const sec = findSection(toc, "Mechanisms");
    expect(sec).toBeDefined();
    expect(sec!.units.some((u) => u.id === "m1")).toBe(true);
  });

  it("cause type appears in 'Causes & Effects' section", () => {
    const toc = buildSemanticToc([CAUSE_UNIT]);
    const sec = findSection(toc, "Causes & Effects");
    expect(sec).toBeDefined();
    expect(sec!.units.some((u) => u.id === "ca1")).toBe(true);
  });

  it("clinical-pearl appears in 'Clinical Pearls' section", () => {
    const toc = buildSemanticToc([PEARL_UNIT]);
    const sec = findSection(toc, "Clinical Pearls");
    expect(sec).toBeDefined();
    expect(sec!.units.some((u) => u.id === "cp1")).toBe(true);
  });

  it("warning type appears in 'Warnings' section", () => {
    const toc = buildSemanticToc([WARN_UNIT]);
    const sec = findSection(toc, "Warnings");
    expect(sec).toBeDefined();
    expect(sec!.units.some((u) => u.id === "w1")).toBe(true);
  });

  it("formula type appears in 'Formulas' section", () => {
    const toc = buildSemanticToc([FORMULA_UNIT]);
    const sec = findSection(toc, "Formulas");
    expect(sec).toBeDefined();
    expect(sec!.units.some((u) => u.id === "f1")).toBe(true);
  });

  it("memory-anchor appears in 'Memory Hooks' section", () => {
    const toc = buildSemanticToc([MEMORY_UNIT]);
    const sec = findSection(toc, "Memory Hooks");
    expect(sec).toBeDefined();
    expect(sec!.units.some((u) => u.id === "mn1")).toBe(true);
  });

  it("high-yield appears in 'High-Yield Facts' section", () => {
    const toc = buildSemanticToc([HYIELD_UNIT]);
    const sec = findSection(toc, "High-Yield Facts");
    expect(sec).toBeDefined();
    expect(sec!.units.some((u) => u.id === "hy1")).toBe(true);
  });

  it("unknown canonical type goes to 'Key Points' section", () => {
    const unknown = makeUnit({ id: "unk", canonicalType: "totally-unknown-type" });
    const toc = buildSemanticToc([unknown]);
    const sec = findSection(toc, "Key Points");
    expect(sec).toBeDefined();
    expect(sec!.units.some((u) => u.id === "unk")).toBe(true);
  });

  it("contraindication type appears in 'Warnings' section", () => {
    const ct = makeUnit({ id: "ct1", canonicalType: "contraindication" });
    const toc = buildSemanticToc([ct]);
    const sec = findSection(toc, "Warnings");
    expect(sec).toBeDefined();
  });
});

// ── Section ordering ──────────────────────────────────────────────────────────

describe("buildSemanticToc — section ordering", () => {
  it("Definitions appears before Mechanisms", () => {
    const toc = buildSemanticToc([MECH_UNIT, DEF_UNIT]);
    const ch = toc[0];
    const defIdx  = ch.sections.findIndex((s) => s.label === "Definitions");
    const mechIdx = ch.sections.findIndex((s) => s.label === "Mechanisms");
    expect(defIdx).toBeLessThan(mechIdx);
  });

  it("Mechanisms appears before Warnings", () => {
    const toc = buildSemanticToc([WARN_UNIT, MECH_UNIT]);
    const ch = toc[0];
    const mechIdx = ch.sections.findIndex((s) => s.label === "Mechanisms");
    const warnIdx = ch.sections.findIndex((s) => s.label === "Warnings");
    expect(mechIdx).toBeLessThan(warnIdx);
  });

  it("Memory Hooks appears after Formulas", () => {
    const toc = buildSemanticToc([MEMORY_UNIT, FORMULA_UNIT]);
    const ch = toc[0];
    const formulaIdx = ch.sections.findIndex((s) => s.label === "Formulas");
    const memIdx     = ch.sections.findIndex((s) => s.label === "Memory Hooks");
    expect(formulaIdx).toBeLessThan(memIdx);
  });
});

// ── Unit ordering within sections ─────────────────────────────────────────────

describe("buildSemanticToc — unit ordering by importance", () => {
  it("critical unit appears before medium unit in same section", () => {
    const critUnit = makeUnit({ id: "crit", canonicalType: "definition", importanceScore: 90 });
    const medUnit  = makeUnit({ id: "med",  canonicalType: "definition", importanceScore: 40 });
    const toc = buildSemanticToc([medUnit, critUnit]);
    const sec = findSection(toc, "Definitions")!;
    const critIdx = sec.units.findIndex((u) => u.id === "crit");
    const medIdx  = sec.units.findIndex((u) => u.id === "med");
    expect(critIdx).toBeLessThan(medIdx);
  });
});

// ── Chapter assignment ─────────────────────────────────────────────────────────

describe("buildSemanticToc — chapter assignment", () => {
  it("units are distributed into correct chapters by pageNumber", () => {
    const toc = buildSemanticToc(ALL_UNITS, CHAPTERS);
    const ch1 = toc.find((c) => c.title.includes("Basics"));
    const ch2 = toc.find((c) => c.title.includes("Advanced"));
    expect(ch1).toBeDefined();
    expect(ch2).toBeDefined();
    // DEF (p1), MECH (p10), CAUSE (p15), HYIELD (p12) → ch1 (pageStart=1)
    // PEARL (p20), WARN (p25), FORMULA (p30), MEMORY (p35) → ch2 (pageStart=20)
    const ch1Ids = allUnitIds(ch1!);
    const ch2Ids = allUnitIds(ch2!);
    expect(ch1Ids).toContain("d1");
    expect(ch1Ids).toContain("m1");
    expect(ch2Ids).toContain("cp1");
    expect(ch2Ids).toContain("w1");
  });

  it("chapters with no assigned units are omitted", () => {
    const toc = buildSemanticToc(
      [DEF_UNIT],
      [{ title: "Chapter 1", pageStart: 1 }, { title: "Chapter 2", pageStart: 100 }],
    );
    expect(toc.some((c) => c.title === "Chapter 2")).toBe(false);
  });

  it("units with no pageNumber go to overflow General chapter", () => {
    const noPage: ConceptUnit = { id: "np1", text: "No page unit", canonicalType: "definition" };
    const toc = buildSemanticToc([noPage], CHAPTERS);
    const overflow = toc.find((c) => c.title === "General");
    expect(overflow).toBeDefined();
    expect(allUnitIds(overflow!)).toContain("np1");
  });

  it("without chapters all units go into 'All Content' chapter", () => {
    const toc = buildSemanticToc(ALL_UNITS);
    expect(toc).toHaveLength(1);
    expect(toc[0].title).toBe("All Content");
    expect(toc[0].unitCount).toBe(ALL_UNITS.length);
  });

  it("unitCount equals number of units in that chapter", () => {
    const toc = buildSemanticToc(ALL_UNITS, CHAPTERS);
    for (const ch of toc) {
      const count = allUnitIds(ch).length;
      expect(ch.unitCount).toBe(count);
    }
  });

  it("each chapter carries the correct pageStart", () => {
    const toc = buildSemanticToc([DEF_UNIT, PEARL_UNIT], CHAPTERS);
    const ch1 = toc.find((c) => c.title.includes("Basics"));
    const ch2 = toc.find((c) => c.title.includes("Advanced"));
    expect(ch1?.pageStart).toBe(1);
    expect(ch2?.pageStart).toBe(20);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function findSection(toc: SemanticTocChapter[], label: string): SemanticTocSection | undefined {
  for (const ch of toc) {
    const sec = ch.sections.find((s) => s.label === label);
    if (sec) return sec;
  }
  return undefined;
}

function allUnitIds(chapter: SemanticTocChapter): string[] {
  return chapter.sections.flatMap((s) => s.units.map((u) => u.id));
}
