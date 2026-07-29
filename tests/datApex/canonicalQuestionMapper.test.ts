// tests/datApex/canonicalQuestionMapper.test.ts
// Tests for lib/datApex/canonicalQuestionMapper.ts

import {
  buildQuestionStem,
  buildDatQuestionStub,
  canonicalUnitsToDatStubs,
  groupStubsBySection,
  type DatQuestionStub,
} from "../../lib/datApex/canonicalQuestionMapper";
import type { CanonicalThoughtUnit, ReaderAnchor } from "../../lib/canonical/types";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeAnchor(overrides: Partial<ReaderAnchor> = {}): ReaderAnchor {
  return {
    pageIndex: 0,
    startChar: 100,
    endChar:   250,
    quote:     "Fluoride incorporates into hydroxyapatite",
    yPct:      42,
    ...overrides,
  };
}

function makeUnit(overrides: Partial<CanonicalThoughtUnit> = {}): CanonicalThoughtUnit {
  return {
    id:                      "doc:0:0",
    documentId:              "doc",
    pageIndex:               0,
    unitIndex:               0,
    text:                    "Fluoride incorporates into hydroxyapatite crystals to strengthen enamel",
    anchor:                  makeAnchor(),
    datSection:              "biology",
    datTopic:                "cell_biology",
    datUnitType:             "mechanism",
    datRelevance:            0.8,
    classificationConfidence: 0.9,
    classificationSource:    "content_lexicon",
    difficulty:              0.5,
    canonicalType:           "mechanism",
    createdAt:               0,
    updatedAt:               0,
    ...overrides,
  };
}

const BIO_MECHANISM  = makeUnit({ id: "doc:0:0", datSection: "biology",           datRelevance: 0.9, canonicalType: "mechanism" });
const CHEM_FORMULA   = makeUnit({ id: "doc:0:1", datSection: "general_chemistry",  datRelevance: 0.85, canonicalType: "formula",    datUnitType: "formula",    text: "pH = -log[H+] describes acid strength" });
const BIO_DEFINITION = makeUnit({ id: "doc:0:2", datSection: "biology",           datRelevance: 0.75, canonicalType: "definition",  datUnitType: "definition", text: "Caries is a microbial disease of dental hard tissue" });
const LOW_RELEVANCE  = makeUnit({ id: "doc:0:3", datSection: "biology",           datRelevance: 0.1,  canonicalType: "evidence",    datUnitType: "fact" });
const NO_SECTION     = makeUnit({ id: "doc:0:4", datSection: "none",              datRelevance: 0.95, canonicalType: "core-concept" });
const ORGO_CAUSE     = makeUnit({ id: "doc:0:5", datSection: "organic_chemistry", datRelevance: 0.7,  canonicalType: "cause",       datUnitType: "mechanism",  text: "Nucleophilic substitution occurs when an electron-rich nucleophile attacks" });
const HIGH_YIELD     = makeUnit({ id: "doc:0:6", datSection: "biology",           datRelevance: 0.6,  canonicalType: "high-yield",  datUnitType: "fact",       text: "Most tested concept: acid-base balance in caries" });

// ── buildQuestionStem ─────────────────────────────────────────────────────────

describe("buildQuestionStem", () => {
  it("uses canonicalType template when available", () => {
    const stem = buildQuestionStem(BIO_MECHANISM);
    expect(stem).toMatch(/mechanism/i);
  });

  it("definition stem starts with 'Which of the following best defines'", () => {
    const stem = buildQuestionStem(BIO_DEFINITION);
    expect(stem).toMatch(/best defines/i);
  });

  it("formula stem mentions formula", () => {
    const stem = buildQuestionStem(CHEM_FORMULA);
    expect(stem).toMatch(/formula/i);
  });

  it("cause canonicalType uses 'primary cause' stem", () => {
    const stem = buildQuestionStem(ORGO_CAUSE);
    expect(stem).toMatch(/primary cause/i);
  });

  it("high-yield canonicalType uses 'most important fact' stem", () => {
    const stem = buildQuestionStem(HIGH_YIELD);
    expect(stem).toMatch(/most important fact/i);
  });

  it("falls back to datUnitType when canonicalType is absent", () => {
    const unit = makeUnit({ canonicalType: undefined, datUnitType: "clinical_application" });
    const stem = buildQuestionStem(unit);
    expect(stem).toMatch(/clinical/i);
  });

  it("falls back to generic stem when both canonicalType and datUnitType are unknown", () => {
    const unit = makeUnit({ canonicalType: "totally-unknown-type" as any, datUnitType: "unknown" });
    const stem = buildQuestionStem(unit);
    expect(stem).toBeTruthy();
    expect(stem.length).toBeGreaterThan(10);
  });

  it("includes a label derived from the unit text", () => {
    const unit = makeUnit({ text: "Enamel demineralization is caused by acid attacks", canonicalType: "cause" });
    const stem = buildQuestionStem(unit);
    expect(stem.length).toBeGreaterThan(15);
    // stem should reference the text content
    expect(stem).toContain("Enamel");
  });

  it("stem is a question ending with '?' or ':'", () => {
    const stem = buildQuestionStem(BIO_MECHANISM);
    expect(stem).toMatch(/[?:]$/);
  });
});

// ── buildDatQuestionStub ──────────────────────────────────────────────────────

describe("buildDatQuestionStub", () => {
  it("copies canonicalUnitId", () => {
    const stub = buildDatQuestionStub(BIO_MECHANISM);
    expect(stub.canonicalUnitId).toBe("doc:0:0");
  });

  it("copies sourceAnchor verbatim", () => {
    const stub = buildDatQuestionStub(BIO_MECHANISM);
    expect(stub.sourceAnchor.pageIndex).toBe(0);
    expect(stub.sourceAnchor.startChar).toBe(100);
    expect(stub.sourceAnchor.endChar).toBe(250);
    expect(stub.sourceAnchor.quote).toBe("Fluoride incorporates into hydroxyapatite");
  });

  it("sourceAnchor is a copy — mutations do not affect the unit", () => {
    const unit = makeUnit();
    const stub = buildDatQuestionStub(unit);
    stub.sourceAnchor.pageIndex = 99;
    expect(unit.anchor.pageIndex).toBe(0);
  });

  it("carries datSection, datTopic, datUnitType from unit", () => {
    const stub = buildDatQuestionStub(BIO_MECHANISM);
    expect(stub.datSection).toBe("biology");
    expect(stub.datTopic).toBe("cell_biology");
    expect(stub.datUnitType).toBe("mechanism");
  });

  it("carries datRelevance from unit", () => {
    const stub = buildDatQuestionStub(BIO_MECHANISM);
    expect(stub.datRelevance).toBe(0.9);
  });

  it("carries difficulty from unit", () => {
    const stub = buildDatQuestionStub(BIO_MECHANISM);
    expect(stub.difficulty).toBe(0.5);
  });

  it("carries canonicalType from unit", () => {
    const stub = buildDatQuestionStub(BIO_MECHANISM);
    expect(stub.canonicalType).toBe("mechanism");
  });

  it("uses documentId as sourceBookId when no opt provided", () => {
    const stub = buildDatQuestionStub(BIO_MECHANISM);
    expect(stub.sourceBookId).toBe("doc");
  });

  it("uses opts.sourceBookId when provided", () => {
    const stub = buildDatQuestionStub(BIO_MECHANISM, { sourceBookId: "my-book-123" });
    expect(stub.sourceBookId).toBe("my-book-123");
  });

  it("formula → suggestedType 'short-answer'", () => {
    const stub = buildDatQuestionStub(CHEM_FORMULA);
    expect(stub.suggestedType).toBe("short-answer");
  });

  it("mechanism → suggestedType 'multiple-choice'", () => {
    const stub = buildDatQuestionStub(BIO_MECHANISM);
    expect(stub.suggestedType).toBe("multiple-choice");
  });

  it("questionStem is non-empty", () => {
    const stub = buildDatQuestionStub(BIO_MECHANISM);
    expect(stub.questionStem.length).toBeGreaterThan(10);
  });
});

// ── canonicalUnitsToDatStubs ──────────────────────────────────────────────────

describe("canonicalUnitsToDatStubs", () => {
  const ALL_UNITS = [BIO_MECHANISM, CHEM_FORMULA, BIO_DEFINITION, LOW_RELEVANCE, NO_SECTION, ORGO_CAUSE, HIGH_YIELD];

  it("returns empty array for empty input", () => {
    expect(canonicalUnitsToDatStubs([])).toHaveLength(0);
  });

  it("excludes units with datSection 'none'", () => {
    const stubs = canonicalUnitsToDatStubs(ALL_UNITS);
    expect(stubs.every((s) => s.datSection !== "none")).toBe(true);
  });

  it("excludes units below minRelevance threshold (default 0.3)", () => {
    const stubs = canonicalUnitsToDatStubs(ALL_UNITS);
    expect(stubs.every((s) => s.datRelevance >= 0.3)).toBe(true);
    expect(stubs.some((s) => s.canonicalUnitId === "doc:0:3")).toBe(false);
  });

  it("respects custom minRelevance", () => {
    const stubs = canonicalUnitsToDatStubs(ALL_UNITS, { minRelevance: 0.8 });
    expect(stubs.every((s) => s.datRelevance >= 0.8)).toBe(true);
  });

  it("sorts by datRelevance descending", () => {
    const stubs = canonicalUnitsToDatStubs(ALL_UNITS);
    for (let i = 1; i < stubs.length; i++) {
      expect(stubs[i].datRelevance).toBeLessThanOrEqual(stubs[i - 1].datRelevance);
    }
  });

  it("respects maxStubs cap", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      makeUnit({ id: `doc:0:${i}`, datRelevance: 0.5 + i * 0.01 })
    );
    const stubs = canonicalUnitsToDatStubs(many, { maxStubs: 5 });
    expect(stubs).toHaveLength(5);
  });

  it("filters by datSection when provided", () => {
    const stubs = canonicalUnitsToDatStubs(ALL_UNITS, { datSection: "organic_chemistry" });
    expect(stubs.every((s) => s.datSection === "organic_chemistry")).toBe(true);
    expect(stubs).toHaveLength(1);
  });

  it("passes sourceBookId through to each stub", () => {
    const stubs = canonicalUnitsToDatStubs([BIO_MECHANISM], { sourceBookId: "custom-book" });
    expect(stubs[0].sourceBookId).toBe("custom-book");
  });

  it("each stub has a sourceAnchor with pageIndex", () => {
    const stubs = canonicalUnitsToDatStubs(ALL_UNITS);
    for (const s of stubs) {
      expect(typeof s.sourceAnchor.pageIndex).toBe("number");
    }
  });
});

// ── groupStubsBySection ───────────────────────────────────────────────────────

describe("groupStubsBySection", () => {
  it("returns empty map for empty input", () => {
    expect(groupStubsBySection([])).toEqual(new Map());
  });

  it("groups stubs by datSection", () => {
    const stubs = canonicalUnitsToDatStubs([BIO_MECHANISM, CHEM_FORMULA, BIO_DEFINITION, ORGO_CAUSE, HIGH_YIELD]);
    const groups = groupStubsBySection(stubs);
    expect(groups.has("biology")).toBe(true);
    expect(groups.has("general_chemistry")).toBe(true);
    expect(groups.has("organic_chemistry")).toBe(true);
  });

  it("biology group contains only biology stubs", () => {
    const stubs = canonicalUnitsToDatStubs([BIO_MECHANISM, CHEM_FORMULA, BIO_DEFINITION]);
    const groups = groupStubsBySection(stubs);
    const bioStubs = groups.get("biology") ?? [];
    expect(bioStubs.every((s) => s.datSection === "biology")).toBe(true);
  });

  it("all stubs appear in exactly one group", () => {
    const stubs = canonicalUnitsToDatStubs([BIO_MECHANISM, CHEM_FORMULA, BIO_DEFINITION, ORGO_CAUSE, HIGH_YIELD]);
    const groups = groupStubsBySection(stubs);
    const total = Array.from(groups.values()).reduce((sum, arr) => sum + arr.length, 0);
    expect(total).toBe(stubs.length);
  });
});
