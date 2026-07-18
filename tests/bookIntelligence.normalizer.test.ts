// tests/bookIntelligence.normalizer.test.ts
// Tests for parseAiResponse — the normalization layer between untrusted model
// output and the canonical BookIntelligence record.
//
// The parser is the highest-risk code in PR A because it accepts free-form
// AI output and must produce a fully-valid, safe BookIntelligence record.

import { parseAiResponse } from "@/pages/api/classify-document";
import { BOOK_INTELLIGENCE_VERSION } from "@/lib/bookIntelligence/types";

const DOC_ID = "test-doc-123";

function validAiOutput(overrides: Record<string, any> = {}): string {
  return JSON.stringify({
    primaryDomain: "medicine",
    secondaryDomains: ["biology"],
    documentType: "textbook",
    instructionalStyle: "textbook",
    confidence: 0.88,
    evidence: [
      { signal: "toc", excerpt: "Chapter 1: Anatomy", weight: 0.9 },
      { signal: "terminology", excerpt: "pathophysiology, diagnosis", weight: 0.8 },
    ],
    learningCharacteristics: {
      prerequisiteHeavy: 0.7,
      conceptDense: 0.8,
      procedureHeavy: 0.3,
      calculationHeavy: 0.2,
      memorizationHeavy: 0.6,
      caseBased: 0.5,
      visualHeavy: 0.4,
      discussionHeavy: 0.2,
    },
    complexity: "advanced",
    complexityConfidence: 0.75,
    ...overrides,
  });
}

// ─── Happy path ──────────────────────────────────────────────────────────────

describe("parseAiResponse — happy path", () => {
  it("parses a valid response correctly", () => {
    const result = parseAiResponse(validAiOutput(), DOC_ID);
    expect(result).not.toBeNull();
    expect(result!.documentId).toBe(DOC_ID);
    expect(result!.classification.primaryDomain).toBe("medicine");
    expect(result!.classification.confidence).toBe(0.88);
    expect(result!.complexity).toBe("advanced");
    expect(result!.version).toBe(BOOK_INTELLIGENCE_VERSION);
    expect(result!.classificationStatus).toBe("classified");
  });

  it("selects the correct reasoning strategy for the domain", () => {
    const result = parseAiResponse(validAiOutput({ primaryDomain: "law" }), DOC_ID);
    expect(result!.reasoningStrategy.id).toBe("law");
    expect(result!.reasoningStrategy.systemBlock).toContain("IRAC");
  });

  it("uses the generic reasoning strategy for unknown domains", () => {
    const result = parseAiResponse(validAiOutput({ primaryDomain: "unknown" }), DOC_ID);
    expect(result!.reasoningStrategy.id).toBe("generic");
  });

  it("uses the generic strategy for a free-form domain not in the registry", () => {
    const result = parseAiResponse(validAiOutput({ primaryDomain: "interpretive-dance-theory" }), DOC_ID);
    expect(result!.reasoningStrategy.id).toBe("generic");
    // But the domain itself is preserved as-is
    expect(result!.classification.primaryDomain).toBe("interpretive-dance-theory");
  });
});

// ─── Confidence clamping ─────────────────────────────────────────────────────

describe("parseAiResponse — confidence clamping", () => {
  it("clamps confidence above 1 to 1", () => {
    const result = parseAiResponse(validAiOutput({ confidence: 1.5 }), DOC_ID);
    expect(result!.classification.confidence).toBe(1);
  });

  it("clamps confidence below 0 to 0", () => {
    const result = parseAiResponse(validAiOutput({ confidence: -0.3 }), DOC_ID);
    expect(result!.classification.confidence).toBe(0);
  });

  it("defaults confidence to 0.5 when not a number", () => {
    const result = parseAiResponse(validAiOutput({ confidence: "high" }), DOC_ID);
    expect(result!.classification.confidence).toBe(0.5);
  });
});

// ─── LearningCharacteristics clamping ────────────────────────────────────────

describe("parseAiResponse — LearningCharacteristics clamping", () => {
  it("clamps all characteristics to [0, 1]", () => {
    const lc = {
      prerequisiteHeavy: 2.5,
      conceptDense: -1,
      procedureHeavy: 0.5,
      calculationHeavy: 99,
      memorizationHeavy: -99,
      caseBased: 0.3,
      visualHeavy: 1.1,
      discussionHeavy: 0.0,
    };
    const result = parseAiResponse(validAiOutput({ learningCharacteristics: lc }), DOC_ID);
    const lc2 = result!.learningCharacteristics;
    expect(lc2.prerequisiteHeavy).toBe(1);
    expect(lc2.conceptDense).toBe(0);
    expect(lc2.procedureHeavy).toBe(0.5);
    expect(lc2.calculationHeavy).toBe(1);
    expect(lc2.memorizationHeavy).toBe(0);
    expect(lc2.visualHeavy).toBe(1);
    expect(lc2.discussionHeavy).toBe(0);
  });

  it("defaults missing characteristics to 0.5", () => {
    const result = parseAiResponse(validAiOutput({ learningCharacteristics: {} }), DOC_ID);
    const lc = result!.learningCharacteristics;
    expect(lc.prerequisiteHeavy).toBe(0.5);
    expect(lc.visualHeavy).toBe(0.5);
  });

  it("defaults missing learningCharacteristics object to all 0.5", () => {
    const result = parseAiResponse(
      JSON.stringify({ primaryDomain: "chemistry", confidence: 0.7 }),
      DOC_ID
    );
    expect(result!.learningCharacteristics.conceptDense).toBe(0.5);
  });
});

// ─── Secondary domain deduplication ─────────────────────────────────────────

describe("parseAiResponse — secondary domain deduplication", () => {
  it("removes primaryDomain from secondaryDomains if the model duplicates it", () => {
    const result = parseAiResponse(
      validAiOutput({ primaryDomain: "medicine", secondaryDomains: ["medicine", "biology"] }),
      DOC_ID
    );
    expect(result!.classification.secondaryDomains).not.toContain("medicine");
    expect(result!.classification.secondaryDomains).toContain("biology");
  });

  it("deduplicates repeated secondary domains", () => {
    const result = parseAiResponse(
      validAiOutput({ secondaryDomains: ["biology", "biology", "chemistry"] }),
      DOC_ID
    );
    const secondary = result!.classification.secondaryDomains;
    expect(secondary.filter((d: string) => d === "biology").length).toBe(1);
  });

  it("caps secondary domains at 5", () => {
    const result = parseAiResponse(
      validAiOutput({ secondaryDomains: ["a", "b", "c", "d", "e", "f", "g"] }),
      DOC_ID
    );
    expect(result!.classification.secondaryDomains.length).toBeLessThanOrEqual(5);
  });
});

// ─── classificationStatus derivation ────────────────────────────────────────

describe("parseAiResponse — classificationStatus", () => {
  it("returns 'classified' for high confidence with evidence", () => {
    const result = parseAiResponse(validAiOutput({ confidence: 0.9 }), DOC_ID);
    expect(result!.classificationStatus).toBe("classified");
  });

  it("returns 'provisional' for moderate confidence", () => {
    const result = parseAiResponse(validAiOutput({ confidence: 0.45 }), DOC_ID);
    expect(result!.classificationStatus).toBe("provisional");
  });

  it("returns 'insufficient-evidence' for very low confidence", () => {
    const result = parseAiResponse(validAiOutput({ confidence: 0.1 }), DOC_ID);
    expect(result!.classificationStatus).toBe("insufficient-evidence");
  });

  it("returns 'provisional' not 'classified' when evidence is empty despite high confidence", () => {
    const result = parseAiResponse(
      validAiOutput({ confidence: 0.9, evidence: [] }),
      DOC_ID
    );
    // High confidence but no evidence → provisional, not classified
    expect(result!.classificationStatus).toBe("provisional");
  });
});

// ─── Invalid / missing fields ─────────────────────────────────────────────────

describe("parseAiResponse — missing and invalid fields", () => {
  it("defaults primaryDomain to 'unknown' when missing", () => {
    const result = parseAiResponse(
      JSON.stringify({ confidence: 0.3, documentType: "textbook" }),
      DOC_ID
    );
    expect(result!.classification.primaryDomain).toBe("unknown");
  });

  it("defaults documentType to 'unknown' for unrecognized values", () => {
    const result = parseAiResponse(validAiOutput({ documentType: "made-up-type" }), DOC_ID);
    expect(result!.classification.documentType).toBe("unknown");
  });

  it("defaults instructionalStyle to 'mixed' for unrecognized values", () => {
    const result = parseAiResponse(validAiOutput({ instructionalStyle: "magic" }), DOC_ID);
    expect(result!.classification.instructionalStyle).toBe("mixed");
  });

  it("defaults complexity to 'intermediate' for unrecognized values", () => {
    const result = parseAiResponse(validAiOutput({ complexity: "cosmic" }), DOC_ID);
    expect(result!.complexity).toBe("intermediate");
  });

  it("handles empty secondaryDomains gracefully", () => {
    const result = parseAiResponse(validAiOutput({ secondaryDomains: [] }), DOC_ID);
    expect(result!.classification.secondaryDomains).toEqual([]);
  });

  it("ignores non-string entries in secondaryDomains", () => {
    const result = parseAiResponse(
      validAiOutput({ secondaryDomains: [null, 42, "biology", true] }),
      DOC_ID
    );
    expect(result!.classification.secondaryDomains).toEqual(["biology"]);
  });
});

// ─── Evidence normalization ──────────────────────────────────────────────────

describe("parseAiResponse — evidence normalization", () => {
  it("truncates evidence excerpts to 80 characters", () => {
    const longExcerpt = "A".repeat(200);
    const result = parseAiResponse(
      validAiOutput({ evidence: [{ signal: "toc", excerpt: longExcerpt, weight: 0.8 }] }),
      DOC_ID
    );
    expect(result!.classification.evidence[0].excerpt.length).toBeLessThanOrEqual(80);
  });

  it("caps evidence array at 8 entries", () => {
    const manyEvidence = Array.from({ length: 20 }, (_, i) => ({
      signal: "toc",
      excerpt: `entry ${i}`,
      weight: 0.5,
    }));
    const result = parseAiResponse(validAiOutput({ evidence: manyEvidence }), DOC_ID);
    expect(result!.classification.evidence.length).toBeLessThanOrEqual(8);
  });

  it("defaults missing signal to 'page-sample'", () => {
    const result = parseAiResponse(
      validAiOutput({ evidence: [{ excerpt: "some text", weight: 0.7 }] }),
      DOC_ID
    );
    expect(result!.classification.evidence[0].signal).toBe("page-sample");
  });
});

// ─── Malformed JSON ───────────────────────────────────────────────────────────

describe("parseAiResponse — malformed input", () => {
  it("returns null for non-JSON input", () => {
    expect(parseAiResponse("this is not json", DOC_ID)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseAiResponse("", DOC_ID)).toBeNull();
  });

  it("handles completely empty JSON object with safe defaults", () => {
    const result = parseAiResponse("{}", DOC_ID);
    expect(result).not.toBeNull();
    expect(result!.classification.primaryDomain).toBe("unknown");
    expect(result!.classification.confidence).toBe(0.5);
    expect(result!.complexity).toBe("intermediate");
    expect(result!.classificationStatus).toBe("provisional");
  });

  it("handles a JSON array (wrong type) as an empty object", () => {
    // JSON.parse("[]") produces an array, not an object.
    // The parser should not crash — it normalizes missing fields.
    const result = parseAiResponse("[]", DOC_ID);
    // Array has no .primaryDomain etc., so all fields default
    expect(result).not.toBeNull();
    expect(result!.classification.primaryDomain).toBe("unknown");
  });

  it("handles strings-instead-of-numbers in all numeric fields", () => {
    const result = parseAiResponse(
      validAiOutput({
        confidence: "very high",
        complexityConfidence: "low",
        learningCharacteristics: {
          prerequisiteHeavy: "yes",
          conceptDense: "no",
          procedureHeavy: "maybe",
          calculationHeavy: "sometimes",
          memorizationHeavy: "often",
          caseBased: "rarely",
          visualHeavy: "always",
          discussionHeavy: "never",
        },
      }),
      DOC_ID
    );
    expect(result!.classification.confidence).toBe(0.5);
    expect(result!.complexityConfidence).toBe(0.5);
    Object.values(result!.learningCharacteristics).forEach((v) => {
      expect(v).toBe(0.5);
    });
  });
});

// ─── Learning Profile independence ───────────────────────────────────────────

describe("parseAiResponse — profile independence", () => {
  it("classifies a Python book as computer-science regardless of any profile framing", () => {
    // The parser never receives a learningProfile — it only parses the AI's
    // document-driven response. This test confirms that even if a dental
    // profile were somehow injected into the AI prompt (it isn't), the
    // normalized output still reflects what the AI said about the document.
    const result = parseAiResponse(
      validAiOutput({ primaryDomain: "computer-science", secondaryDomains: [] }),
      DOC_ID
    );
    expect(result!.classification.primaryDomain).toBe("computer-science");
    expect(result!.reasoningStrategy.id).toBe("computer-science");
    // Reasoning strategy is computational, not dental
    expect(result!.reasoningStrategy.systemBlock).not.toContain("dental");
    expect(result!.reasoningStrategy.systemBlock).not.toContain("oral");
  });
});
