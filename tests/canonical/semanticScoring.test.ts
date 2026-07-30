// tests/canonical/semanticScoring.test.ts
// Phase 1C regression tests:
//   1–8.  classifyCanonicalType — correct type for key signal patterns
//   9.    core-concept fallback for unclassified heading
//  10–12. importanceScore range and ordering
//  13–16. mapToSemanticLabel — legacy label mapping
//  17.    Determinism — same text → identical output across 5 calls
//  18.    scoreChunk — callable with text only
//  19.    Full 23-type label coverage (every canonical type maps to a SemanticLabel)
//  20–25. buildCanonicalUnits integration — all Phase 1C fields populated correctly

import {
  scoreChunk,
  scoreSignal,
  mapToSemanticLabel,
  SCORING_VERSION,
  type SemanticScoreOptions,
} from "../../lib/canonical/semanticScoring";

import { buildCanonicalUnits } from "../../lib/canonical/builder";
import { segmentParagraphs } from "../../lib/paragraphSegmentation";
import { scoreParagraphs } from "../../lib/paragraphScoring";
import type { CanonicalSemanticType } from "../../lib/semantic/types";
import type { SemanticLabel } from "../../lib/canonical/types";
import { TextLayerRegistry } from "../../lib/page-intelligence/textLayerIndex";
import { PageBridgeRegistry } from "../../lib/page-intelligence/pageBridgeRegistry";

// ── Helpers ───────────────────────────────────────────────────────────────────

function signalFor(text: string) {
  const blocks = segmentParagraphs(text);
  const signals = scoreParagraphs(blocks, 0);
  return signals[0];
}

function typeFor(text: string): CanonicalSemanticType {
  return scoreChunk(text).canonicalType;
}

// ── classifyCanonicalType — type selection ─────────────────────────────────────

describe("classifyCanonicalType — type selection", () => {
  it("classifies a definition sentence as 'definition'", () => {
    expect(typeFor("Enamel is defined as the hardest tissue in the human body.")).toBe("definition");
  });

  it("classifies a formula expression as 'formula'", () => {
    expect(typeFor("The equation for pH = -log[H+] is fundamental to acid-base chemistry.")).toBe("formula");
  });

  it("classifies a contraindication statement as 'contraindication'", () => {
    expect(typeFor("Aspirin is contraindicated in patients with active peptic ulcers.")).toBe("contraindication");
  });

  it("classifies a treatment-of-choice sentence as 'treatment'", () => {
    expect(typeFor("Amoxicillin is the treatment of choice for mild dental infections.")).toBe("treatment");
  });

  it("classifies a common-error sentence as 'common-error'", () => {
    expect(typeFor("A common trap is confusing reversible and irreversible pulpitis.")).toBe("common-error");
  });

  it("classifies a warning sentence as 'warning'", () => {
    expect(typeFor("Caution: do not use epinephrine in patients taking non-selective beta-blockers.")).toBe("warning");
  });

  it("classifies a mechanism sentence as 'mechanism'", () => {
    expect(typeFor("Bacteria release toxins that cause inflammation because they activate TLR-4 receptors.")).toBe("mechanism");
  });

  it("classifies a mnemonic sentence as 'memory-anchor'", () => {
    expect(typeFor("A useful mnemonic to remember the cranial nerves is On Old Olympus.")).toBe("memory-anchor");
  });

  it("classifies an ALL-CAPS heading block as 'core-concept'", () => {
    expect(typeFor("CELL BIOLOGY FUNDAMENTALS")).toBe("core-concept");
  });

  it("classifies a clinical-pearl sentence as 'clinical-pearl'", () => {
    expect(typeFor("Pearl: the most common cause of pulpitis is bacterial invasion through caries.")).toBe("clinical-pearl");
  });

  it("classifies an indication sentence as 'indication'", () => {
    expect(typeFor("Pulpotomy is indicated for primary teeth with reversible pulpitis.")).toBe("indication");
  });
});

// ── importanceScore ───────────────────────────────────────────────────────────

describe("computeImportanceScore — range and ordering", () => {
  it("importanceScore is between 0 and 1 for any input", () => {
    const samples = [
      "This is a general sentence with no special signals.",
      "Enamel is defined as the hardest tissue in the human body.",
      "Copyright 2024. All rights reserved. www.publisher.com.",
      "ATP synthesis occurs via oxidative phosphorylation because of the proton gradient.",
      "It is important to remember that most common bacteria are gram-positive.",
    ];
    for (const text of samples) {
      const { importanceScore } = scoreChunk(text);
      expect(importanceScore).toBeGreaterThanOrEqual(0);
      expect(importanceScore).toBeLessThanOrEqual(1);
    }
  });

  it("a definition sentence scores higher than a filler sentence", () => {
    const defScore = scoreChunk("Enamel is defined as the hardest mineralized tissue in the body.").importanceScore;
    const fillerScore = scoreChunk("In general, throughout the years, it is important to remember historically.").importanceScore;
    expect(defScore).toBeGreaterThan(fillerScore);
  });

  it("a mechanism sentence scores higher than a generic paragraph", () => {
    const mechScore = scoreChunk("Bacterial toxins cause inflammation because they activate TLR-4, which leads to cytokine release.").importanceScore;
    const genericScore = scoreChunk("The chapter covers several topics of interest.").importanceScore;
    expect(mechScore).toBeGreaterThan(genericScore);
  });

  it("datRelevance option increases the importance score", () => {
    const text = "ATP is produced by the mitochondria via oxidative phosphorylation.";
    const low  = scoreChunk(text, { datRelevance: 0.1 }).importanceScore;
    const high = scoreChunk(text, { datRelevance: 0.9 }).importanceScore;
    expect(high).toBeGreaterThan(low);
  });

  it("earlier unit positions score higher than later ones (pages front-loaded)", () => {
    const text = "This is a definition of a core concept.";
    const first = scoreChunk(text, { unitIndex: 0, totalUnits: 10 }).importanceScore;
    const last  = scoreChunk(text, { unitIndex: 9, totalUnits: 10 }).importanceScore;
    expect(first).toBeGreaterThan(last);
  });
});

// ── mapToSemanticLabel ────────────────────────────────────────────────────────

describe("mapToSemanticLabel — legacy label mapping", () => {
  it("core-concept → master", () => {
    expect(mapToSemanticLabel("core-concept")).toBe("master" as SemanticLabel);
  });

  it("process → procedure (legacy compat)", () => {
    expect(mapToSemanticLabel("process")).toBe("procedure" as SemanticLabel);
  });

  it("warning → dat-tip (formerly 'failure')", () => {
    expect(mapToSemanticLabel("warning")).toBe("dat-tip" as SemanticLabel);
  });

  it("clinical-pearl → clinical-pearl", () => {
    expect(mapToSemanticLabel("clinical-pearl")).toBe("clinical-pearl" as SemanticLabel);
  });

  it("definition → definition", () => {
    expect(mapToSemanticLabel("definition")).toBe("definition" as SemanticLabel);
  });

  it("formula → formula", () => {
    expect(mapToSemanticLabel("formula")).toBe("formula" as SemanticLabel);
  });

  it("exception → exception", () => {
    expect(mapToSemanticLabel("exception")).toBe("exception" as SemanticLabel);
  });

  it("mechanism → mechanism", () => {
    expect(mapToSemanticLabel("mechanism")).toBe("mechanism" as SemanticLabel);
  });
});

// ── Full canonical type coverage ──────────────────────────────────────────────

const ALL_CANONICAL_TYPES: CanonicalSemanticType[] = [
  "definition", "core-concept", "process", "mechanism", "relationship",
  "classification", "formula", "worked-example", "indication", "contraindication",
  "decision-point", "exception", "warning", "common-error", "material",
  "finding", "treatment", "complication", "clinical-pearl", "high-yield",
  "memory-anchor", "evidence", "cause", "effect",
];

const VALID_SEMANTIC_LABELS: SemanticLabel[] = [
  "master", "definition", "procedure", "mechanism", "formula",
  "worked-example", "exception", "common-error", "clinical-pearl", "dat-tip",
];

describe("mapToSemanticLabel — full 23-type coverage", () => {
  it("every canonical type maps to a valid SemanticLabel", () => {
    for (const type of ALL_CANONICAL_TYPES) {
      const label = mapToSemanticLabel(type);
      expect(VALID_SEMANTIC_LABELS).toContain(label);
    }
  });
});

// ── Determinism ────────────────────────────────────────────────────────────────

describe("scoreChunk — determinism", () => {
  it("produces identical output across 5 calls with the same text", () => {
    const text = "Amoxicillin is indicated for mild-to-moderate dental infections because it inhibits cell wall synthesis.";
    const results = Array.from({ length: 5 }, () => scoreChunk(text));
    const { canonicalType, semanticConfidence, importanceScore, semanticLabel } = results[0];
    for (const r of results.slice(1)) {
      expect(r.canonicalType).toBe(canonicalType);
      expect(r.semanticConfidence).toBe(semanticConfidence);
      expect(r.importanceScore).toBe(importanceScore);
      expect(r.semanticLabel).toBe(semanticLabel);
    }
  });
});

// ── buildCanonicalUnits integration ──────────────────────────────────────────

beforeEach(() => {
  TextLayerRegistry.clear();
  PageBridgeRegistry.clear();
});
afterEach(() => {
  TextLayerRegistry.clear();
  PageBridgeRegistry.clear();
});

const SAMPLE_CHUNKS = [
  {
    text: "Enamel is defined as the hardest mineralized tissue in the human body.",
    startChar: 0,
    endChar: 68,
  },
  {
    text: "Bacteria cause caries because they produce acids that demineralise enamel via glycolysis.",
    startChar: 70,
    endChar: 157,
  },
  {
    text: "Copyright 2024. All rights reserved. ISBN 978-0-000000-00-0.",
    startChar: 159,
    endChar: 218,
  },
];

function buildUnits(chunks = SAMPLE_CHUNKS) {
  return buildCanonicalUnits({
    documentId: "doc1",
    bookId:     "book1",
    pageIndex:  0,
    chunks,
  });
}

describe("buildCanonicalUnits — Phase 1C fields", () => {
  it("canonicalType is populated on every unit", () => {
    const units = buildUnits();
    for (const unit of units) {
      expect(unit.canonicalType).toBeDefined();
    }
  });

  it("semanticLabel is populated on every unit (was previously stale/missing)", () => {
    const units = buildUnits();
    for (const unit of units) {
      expect(unit.semanticLabel).toBeDefined();
      expect(VALID_SEMANTIC_LABELS).toContain(unit.semanticLabel);
    }
  });

  it("semanticConfidence is in [0, 1] on every unit", () => {
    const units = buildUnits();
    for (const unit of units) {
      expect(unit.semanticConfidence).toBeGreaterThanOrEqual(0);
      expect(unit.semanticConfidence).toBeLessThanOrEqual(1);
    }
  });

  it("importanceScore is in [0, 1] on every unit", () => {
    const units = buildUnits();
    for (const unit of units) {
      expect(unit.importanceScore).toBeGreaterThanOrEqual(0);
      expect(unit.importanceScore).toBeLessThanOrEqual(1);
    }
  });

  it("scoringVersion is set to the current SCORING_VERSION constant", () => {
    const units = buildUnits();
    for (const unit of units) {
      expect(unit.scoringVersion).toBe(SCORING_VERSION);
    }
  });

  it("the definition chunk scores higher importance than the filler/copyright chunk", () => {
    const units = buildUnits();
    const defUnit    = units[0]; // definition
    const fillerUnit = units[2]; // copyright/filler
    expect(defUnit.importanceScore!).toBeGreaterThan(fillerUnit.importanceScore!);
  });

  it("the definition chunk gets canonicalType 'definition'", () => {
    const units = buildUnits();
    expect(units[0].canonicalType).toBe("definition");
  });

  it("semanticLabel for the definition chunk is 'definition'", () => {
    const units = buildUnits();
    expect(units[0].semanticLabel).toBe("definition");
  });

  it("importanceScore is stable across two independent builds with identical input", () => {
    const first  = buildUnits();
    const second = buildUnits();
    for (let i = 0; i < first.length; i++) {
      expect(first[i].importanceScore).toBe(second[i].importanceScore);
      expect(first[i].canonicalType).toBe(second[i].canonicalType);
    }
  });
});
