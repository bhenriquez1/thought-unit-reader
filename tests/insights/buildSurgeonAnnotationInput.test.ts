// tests/insights/buildSurgeonAnnotationInput.test.ts
// Regression guard: the SurgeonAnnotationPlan input builder must never feed
// pageThesis/pageObjective/pageSummary (locally-derived summaries of the current
// page) back into OpenAI as context — that's the confirmed staleness bug in
// synthesizeTeachingOutput.ts's buildUserPrompt(). It also must send the real
// SemanticPack object, not just a preset id string.

import { buildSurgeonAnnotationInput } from "../../lib/insights/buildSurgeonAnnotationInput";
import type { SemanticPack } from "../../lib/semantic/types";

const STUB_PACK: SemanticPack = {
  id: "general",
  label: "General",
  labels: [
    {
      id: "general:definition",
      canonicalType: "definition",
      label: "Definition",
      shortLabel: "DEF",
      icon: "📖",
      priority: 1,
      requiresExactSourceSpan: true,
      allowPageSynthesis: true,
    },
  ],
  promptInstructions: ["Prefer verbatim definitions."],
  rankingRules: [{ canonicalType: "definition", boostFactor: 1.5 }],
  minimumConfidence: 0.5,
  fallbackPackId: "general",
  tierLabels: { master: "CORE", step: "STEP", decision: "APPLY", danger: "TRAP", pearl: "PEARL" },
  whiteboardGrammar: "flow",
};

const BASE_ARGS = {
  pageTruthKey: "doc-1::5::t",
  documentId: "doc-1",
  pageNumber: 5,
  pageImageDataUrl: "data:image/jpeg;base64,AAAA",
  pageText: "Cellular Respiration\n\nGlycolysis converts glucose into pyruvate in the cytosol.",
  previousPageText: "Chapter 3 Overview\n\nThis chapter introduces metabolism.",
  nextPageText: "The Krebs Cycle\n\nThe Krebs cycle occurs in the mitochondrial matrix.",
  domain: "science" as const,
  semanticPack: STUB_PACK,
  existingCanonicalUnits: [{ id: "u1", text: "Glycolysis occurs in the cytosol.", canonicalType: "mechanism" }],
};

describe("buildSurgeonAnnotationInput — staleness-bug regression guard", () => {
  it("never includes a pageThesis, pageObjective, or pageSummary key anywhere in its output", () => {
    const input = buildSurgeonAnnotationInput(BASE_ARGS);
    const serialized = JSON.stringify(input);
    expect(serialized).not.toMatch(/"pageThesis"/);
    expect(serialized).not.toMatch(/"pageObjective"/);
    expect(serialized).not.toMatch(/"pageSummary"/);
  });

  it("sends the real semanticPack as an object, not a bare preset id string", () => {
    const input = buildSurgeonAnnotationInput(BASE_ARGS);
    expect(typeof input.semanticPack).toBe("object");
    expect(input.semanticPack.id).toBe("general");
    expect(input.semanticPack.promptInstructions).toEqual(["Prefer verbatim definitions."]);
    expect(input.semanticPack.labels[0]).toEqual({ canonicalType: "definition", label: "Definition", shortLabel: "DEF" });
  });

  it("derives the current page heading from the page's own text", () => {
    const input = buildSurgeonAnnotationInput(BASE_ARGS);
    expect(input.headings.current).toMatch(/Cellular Respiration/i);
  });

  it("derives previous/next headings from neighbor page text, not the current page", () => {
    // cleanActivePageText strips leading chapter-number-style prefixes ("Chapter 3 ")
    // as header noise — the remaining "Overview" is still correctly the previous
    // page's own heading, not anything from the current or next page.
    const input = buildSurgeonAnnotationInput(BASE_ARGS);
    expect(input.headings.previous).toMatch(/Overview/i);
    expect(input.headings.next).toMatch(/Krebs Cycle/i);
  });

  it("returns null headings when neighbor page text is not provided", () => {
    const input = buildSurgeonAnnotationInput({ ...BASE_ARGS, previousPageText: null, nextPageText: null });
    expect(input.headings.previous).toBeNull();
    expect(input.headings.next).toBeNull();
  });

  it("includes paragraph boundaries derived from the page text", () => {
    const input = buildSurgeonAnnotationInput(BASE_ARGS);
    expect(input.paragraphs.length).toBeGreaterThanOrEqual(1);
  });

  it("caps existingCanonicalUnits and passes them through as light context, not primary content", () => {
    const manyUnits = Array.from({ length: 30 }, (_, i) => ({ id: `u${i}`, text: `unit ${i}` }));
    const input = buildSurgeonAnnotationInput({ ...BASE_ARGS, existingCanonicalUnits: manyUnits });
    expect(input.existingCanonicalUnits.length).toBeLessThanOrEqual(20);
  });

  it("passes pageImageDataUrl through unchanged when provided", () => {
    const input = buildSurgeonAnnotationInput(BASE_ARGS);
    expect(input.pageImageDataUrl).toBe("data:image/jpeg;base64,AAAA");
  });

  it("defaults pageImageDataUrl to null when not provided", () => {
    const input = buildSurgeonAnnotationInput({ ...BASE_ARGS, pageImageDataUrl: null });
    expect(input.pageImageDataUrl).toBeNull();
  });
});

describe("buildSurgeonAnnotationInput — structured blocks + content-derived integrity key", () => {
  it("includes a structured blocks[] decomposition of the current page text", () => {
    const input = buildSurgeonAnnotationInput(BASE_ARGS);
    expect(Array.isArray(input.blocks)).toBe(true);
    expect(input.blocks.length).toBeGreaterThan(0);
    expect(input.blocks[0]).toHaveProperty("type");
    expect(input.blocks[0]).toHaveProperty("readingOrder");
  });

  it("derives blocks from the CURRENT page's text only, never previous/next page text", () => {
    const input = buildSurgeonAnnotationInput(BASE_ARGS);
    const serializedBlocks = JSON.stringify(input.blocks);
    expect(serializedBlocks).not.toMatch(/Krebs Cycle/i);
    expect(serializedBlocks).not.toMatch(/Chapter 3 Overview/i);
  });

  it("computes a content-derived pageContentHash from documentId + pageNumber + current page text", () => {
    const input = buildSurgeonAnnotationInput(BASE_ARGS);
    expect(typeof input.pageContentHash).toBe("string");
    expect(input.pageContentHash.length).toBeGreaterThan(0);
  });

  it("pageContentHash changes when the current page text changes, holding documentId/pageNumber fixed", () => {
    const a = buildSurgeonAnnotationInput(BASE_ARGS);
    const b = buildSurgeonAnnotationInput({ ...BASE_ARGS, pageText: "An entirely different page about a different topic." });
    expect(a.pageContentHash).not.toBe(b.pageContentHash);
  });

  it("pageContentHash is stable across repeated calls with identical inputs", () => {
    const a = buildSurgeonAnnotationInput(BASE_ARGS);
    const b = buildSurgeonAnnotationInput(BASE_ARGS);
    expect(a.pageContentHash).toBe(b.pageContentHash);
  });

  it("passes documentId through unchanged", () => {
    const input = buildSurgeonAnnotationInput(BASE_ARGS);
    expect(input.documentId).toBe("doc-1");
  });
});
