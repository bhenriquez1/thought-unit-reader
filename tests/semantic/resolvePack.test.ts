// tests/semantic/resolvePack.test.ts
// Tests for the pack resolver hierarchy and display helpers.

import { resolvePack, resolvePackFromResult, getDisplayLabel, getDisplayIcon } from "../../lib/semantic/resolvePack";
import { GENERAL_PACK } from "../../lib/semantic/packs/general";
import { DENTISTRY_PACK } from "../../lib/semantic/packs/dentistry";
import { GENERAL_CHEMISTRY_PACK } from "../../lib/semantic/packs/generalChemistry";
import { CLASSIFIER_VERSION } from "../../lib/semantic/types";
import type { SemanticDomainAssignment } from "../../lib/semantic/types";

function makeAssignment(
  overrides: Partial<SemanticDomainAssignment> & Pick<SemanticDomainAssignment, "domain" | "source" | "confidence">,
): SemanticDomainAssignment {
  return {
    documentId:        "doc1",
    chapterId:         "",
    classifierVersion: CLASSIFIER_VERSION,
    updatedAt:         0,
    ...overrides,
  };
}

// ── resolvePack fallback ──────────────────────────────────────────────────────

describe("resolvePack — fallback", () => {
  it("returns general pack when no assignments exist", () => {
    const result = resolvePack([]);
    expect(result.source).toBe("fallback");
    expect(result.pack.id).toBe("general");
    expect(result.domain).toBe("general");
    expect(result.tentative).toBe(false);
  });
});

// ── resolvePack — document-level ─────────────────────────────────────────────

describe("resolvePack — document-level detection", () => {
  const assignments = [
    makeAssignment({ domain: "dentistry", source: "classifier", confidence: 0.82 }),
  ];

  it("picks up a detected document assignment", () => {
    const result = resolvePack(assignments);
    expect(result.source).toBe("detected-doc");
    expect(result.pack.id).toBe("dentistry");
    expect(result.domain).toBe("dentistry");
  });

  it("is not tentative when confidence ≥ HIGH (0.80)", () => {
    const result = resolvePack(assignments);
    expect(result.tentative).toBe(false);
  });

  it("is tentative when confidence is in [0.55, 0.80)", () => {
    const low = [makeAssignment({ domain: "dentistry", source: "classifier", confidence: 0.65 })];
    const result = resolvePack(low);
    expect(result.tentative).toBe(true);
  });

  it("falls back when confidence < pack minimumConfidence", () => {
    const low = [makeAssignment({ domain: "dentistry", source: "classifier", confidence: 0.30 })];
    const result = resolvePack(low);
    expect(result.source).toBe("fallback");
    expect(result.pack.id).toBe("general");
  });
});

// ── resolvePack — user overrides ──────────────────────────────────────────────

describe("resolvePack — user override precedence", () => {
  const assignments = [
    makeAssignment({ domain: "dentistry", source: "classifier", confidence: 0.85 }),
    makeAssignment({ domain: "general-chemistry", source: "user", confidence: 1.0 }),
  ];

  it("prefers user-doc over detected-doc", () => {
    const result = resolvePack(assignments);
    expect(result.source).toBe("user-doc");
    expect(result.domain).toBe("general-chemistry");
  });

  it("user override is never tentative regardless of confidence value stored", () => {
    const result = resolvePack(assignments);
    expect(result.tentative).toBe(false);
  });
});

// ── resolvePack — chapter-level hierarchy ─────────────────────────────────────

describe("resolvePack — chapter-level resolution", () => {
  const assignments: SemanticDomainAssignment[] = [
    // doc-level: dentistry
    makeAssignment({ domain: "dentistry", source: "classifier", confidence: 0.85 }),
    // chapter-level: gchem for chapter "ch2"
    makeAssignment({ domain: "general-chemistry", source: "classifier", confidence: 0.80, chapterId: "ch2" }),
    // chapter-level user override for "ch3"
    makeAssignment({ domain: "biology", source: "user", confidence: 1.0, chapterId: "ch3" }),
  ];

  it("chapter detection beats doc detection for that chapter", () => {
    const result = resolvePack(assignments, "ch2");
    expect(result.source).toBe("detected-chapter");
    expect(result.domain).toBe("general-chemistry");
  });

  it("user chapter override beats everything else", () => {
    const result = resolvePack(assignments, "ch3");
    expect(result.source).toBe("user-chapter");
    expect(result.domain).toBe("biology");
  });

  it("falls back to doc-level for a chapter with no specific assignment", () => {
    const result = resolvePack(assignments, "ch99");
    expect(result.source).toBe("detected-doc");
    expect(result.domain).toBe("dentistry");
  });
});

// ── resolvePackFromResult ─────────────────────────────────────────────────────

describe("resolvePackFromResult", () => {
  it("returns general pack when confidence < TENTATIVE (0.55)", () => {
    const result = resolvePackFromResult(
      { domain: "dentistry", confidence: 0.40, evidence: [], classifierVersion: CLASSIFIER_VERSION },
      "detected-doc",
    );
    expect(result.pack.id).toBe("general");
    expect(result.source).toBe("fallback");
  });

  it("returns dentistry pack when confidence ≥ 0.55", () => {
    const result = resolvePackFromResult(
      { domain: "dentistry", confidence: 0.60, evidence: [], classifierVersion: CLASSIFIER_VERSION },
      "detected-chapter",
    );
    expect(result.pack.id).toBe("dentistry");
    expect(result.source).toBe("detected-chapter");
    expect(result.tentative).toBe(true);
  });

  it("is not tentative at HIGH threshold (0.80)", () => {
    const result = resolvePackFromResult(
      { domain: "dentistry", confidence: 0.80, evidence: [], classifierVersion: CLASSIFIER_VERSION },
      "detected-doc",
    );
    expect(result.tentative).toBe(false);
  });
});

// ── getDisplayLabel / getDisplayIcon ─────────────────────────────────────────

describe("getDisplayLabel", () => {
  it("returns domain-specific label for dentistry indication", () => {
    const resolved = resolvePack([
      makeAssignment({ domain: "dentistry", source: "classifier", confidence: 0.85 }),
    ]);
    const label = getDisplayLabel("indication", resolved);
    expect(label).toBe("Indication");
  });

  it("returns domain-specific label for gchem formula", () => {
    const resolved = resolvePack([
      makeAssignment({ domain: "general-chemistry", source: "classifier", confidence: 0.85 }),
    ]);
    const label = getDisplayLabel("formula", resolved);
    expect(label).toBe("Formula");
  });

  it("falls back to canonicalType string for unknown types", () => {
    const resolved = resolvePack([]); // general fallback
    const label = getDisplayLabel("indication", resolved);
    // general pack has no "indication" label — returns the canonical type name
    expect(label).toBe("indication");
  });
});

describe("getDisplayIcon", () => {
  it("returns 🧪 for general-chemistry formula", () => {
    const resolved = resolvePack([
      makeAssignment({ domain: "general-chemistry", source: "classifier", confidence: 0.90 }),
    ]);
    expect(getDisplayIcon("formula", resolved)).toBe("🧪");
  });

  it("returns empty string for unknown canonical type in fallback pack", () => {
    const resolved = resolvePack([]);
    expect(getDisplayIcon("indication", resolved)).toBe("");
  });
});
