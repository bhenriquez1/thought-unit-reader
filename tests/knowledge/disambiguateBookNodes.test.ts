// tests/knowledge/disambiguateBookNodes.test.ts
// P1 Launch-Blocker Remediation L8 — real behavioral tests for the pure
// disambiguation function (no IDB/React involved, safe to test directly).
//
// Context: getNodesByBook() groups KnowledgeNodes by the filename-derived
// bookId, which is a DELIBERATE choice (progress continuity across
// re-uploads of the same book) — but it also means two unrelated documents
// sharing a generic filename get their concepts/progress merged in every
// bookId-scoped view (Learning Hub, TestLab's weak-concept exam scope).
// disambiguateBookNodes filters that merged set down to the documentId(s)
// actually corroborated as the same book via page-level text overlap.

import { disambiguateBookNodes } from "../../lib/knowledge/disambiguateBookNodes";
import type { KnowledgeNode } from "../../lib/knowledge/knowledgeGraphSchema";

function node(overrides: Partial<KnowledgeNode> & { id: string; documentId: string; sourcePages: number[]; exactSourceText: string }): KnowledgeNode {
  return {
    bookId: "notes",
    chapterCandidateId: null,
    canonicalAnchorId: `anchor-${overrides.id}`,
    title: "Title",
    summary: "Summary",
    citations: [],
    profileId: "default",
    role: "Core Concept",
    importance: 70,
    difficulty: 50,
    parentNodeIds: [],
    childNodeIds: [],
    relatedNodeIds: [],
    learningObjectives: [],
    misconceptions: [],
    examples: [],
    applications: [],
    ...overrides,
  };
}

describe("disambiguateBookNodes", () => {
  it("REQUIRED: returns the input unchanged when every node already shares one documentId (the common case)", () => {
    const nodes = [
      node({ id: "1", documentId: "doc-a", sourcePages: [1], exactSourceText: "Mitochondria produce ATP via oxidative phosphorylation." }),
      node({ id: "2", documentId: "doc-a", sourcePages: [2], exactSourceText: "The Krebs cycle occurs in the mitochondrial matrix." }),
    ];
    expect(disambiguateBookNodes(nodes, "doc-a")).toEqual(nodes);
  });

  it("REQUIRED: keeps the active document's nodes and drops an unrelated document sharing the same bookId", () => {
    const activeDoc = [
      node({ id: "1", documentId: "doc-active", sourcePages: [1], exactSourceText: "Mitochondria produce ATP via oxidative phosphorylation in the inner membrane." }),
      node({ id: "2", documentId: "doc-active", sourcePages: [2], exactSourceText: "The citric acid cycle generates NADH and FADH2 for the electron transport chain." }),
    ];
    const unrelatedDoc = [
      node({ id: "3", documentId: "doc-unrelated", sourcePages: [1], exactSourceText: "Contract law requires offer, acceptance, and consideration to form a valid agreement." }),
      node({ id: "4", documentId: "doc-unrelated", sourcePages: [2], exactSourceText: "A tort is a civil wrong that causes a claimant to suffer loss or harm." }),
    ];
    const result = disambiguateBookNodes([...activeDoc, ...unrelatedDoc], "doc-active");
    expect(result.map((n) => n.id).sort()).toEqual(["1", "2"]);
  });

  it("REQUIRED: keeps a re-upload of the same book (high page-level text overlap) merged with the active document", () => {
    const v1 = [
      node({ id: "1", documentId: "doc-v1", sourcePages: [1], exactSourceText: "Mitochondria produce ATP via oxidative phosphorylation in the inner membrane." }),
      node({ id: "2", documentId: "doc-v1", sourcePages: [2], exactSourceText: "The citric acid cycle generates NADH and FADH2 for the electron transport chain." }),
      node({ id: "3", documentId: "doc-v1", sourcePages: [3], exactSourceText: "Glycolysis converts glucose into two molecules of pyruvate in the cytoplasm." }),
    ];
    const v2 = [
      node({ id: "4", documentId: "doc-v2", sourcePages: [1], exactSourceText: "Mitochondria produce ATP through oxidative phosphorylation across the inner membrane." }),
      node({ id: "5", documentId: "doc-v2", sourcePages: [2], exactSourceText: "The citric acid cycle produces NADH and FADH2 that feed the electron transport chain." }),
      node({ id: "6", documentId: "doc-v2", sourcePages: [3], exactSourceText: "Glycolysis converts glucose into two pyruvate molecules within the cytoplasm." }),
    ];
    // Active document is v2 (the freshly re-uploaded copy); v1's prior progress should still show.
    const result = disambiguateBookNodes([...v1, ...v2], "doc-v2");
    expect(result.map((n) => n.id).sort()).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("REQUIRED: a single shared page is not enough corroboration on its own (MIN_SHARED_PAGES_TO_COMPARE)", () => {
    const activeDoc = [
      node({ id: "1", documentId: "doc-active", sourcePages: [1], exactSourceText: "Mitochondria produce ATP via oxidative phosphorylation in the inner membrane." }),
    ];
    const otherDoc = [
      // Only one shared page, even with a verbatim-identical sentence (e.g. a generic definition both books happen to repeat).
      node({ id: "2", documentId: "doc-other", sourcePages: [1], exactSourceText: "Mitochondria produce ATP via oxidative phosphorylation in the inner membrane." }),
      node({ id: "3", documentId: "doc-other", sourcePages: [2], exactSourceText: "The stock market crash of 1929 triggered the Great Depression across the globe." }),
    ];
    const result = disambiguateBookNodes([...activeDoc, ...otherDoc], "doc-active");
    expect(result.map((n) => n.id).sort()).toEqual(["1"]);
  });

  it("falls back to the largest documentId group when no active document is corroborated (e.g. called before the active document has any nodes yet)", () => {
    const small = [node({ id: "1", documentId: "doc-small", sourcePages: [1], exactSourceText: "A short unrelated note." })];
    const large = [
      node({ id: "2", documentId: "doc-large", sourcePages: [1], exactSourceText: "First concept from the larger, more substantial document." }),
      node({ id: "3", documentId: "doc-large", sourcePages: [2], exactSourceText: "Second concept from the larger, more substantial document." }),
      node({ id: "4", documentId: "doc-large", sourcePages: [3], exactSourceText: "Third concept from the larger, more substantial document." }),
    ];
    const result = disambiguateBookNodes([...small, ...large], "doc-not-present-anywhere");
    expect(result.map((n) => n.id).sort()).toEqual(["2", "3", "4"]);
  });

  it("REQUIRED: never drops the active document's own nodes, even when they can't be corroborated against anything (a brand-new upload with nothing else to compare)", () => {
    const nodes = [node({ id: "1", documentId: "doc-active", sourcePages: [1], exactSourceText: "Anything at all." })];
    expect(disambiguateBookNodes(nodes, "doc-active")).toEqual(nodes);
  });

  it("chains corroboration transitively (v1 corroborates v2 via pages 2-3, v2 corroborates v3 via pages 4-5, even though v1 and v3 share no pages at all)", () => {
    const v1 = [
      node({ id: "1", documentId: "doc-v1", sourcePages: [1], exactSourceText: "Mitochondria produce ATP via oxidative phosphorylation in the inner membrane." }),
      node({ id: "2", documentId: "doc-v1", sourcePages: [2], exactSourceText: "The citric acid cycle generates NADH and FADH2 for the electron transport chain." }),
      node({ id: "3", documentId: "doc-v1", sourcePages: [3], exactSourceText: "Glycolysis converts glucose into two molecules of pyruvate in the cytoplasm." }),
    ];
    const v2 = [
      node({ id: "4", documentId: "doc-v2", sourcePages: [2], exactSourceText: "The citric acid cycle produces NADH and FADH2 that feed the electron transport chain." }),
      node({ id: "5", documentId: "doc-v2", sourcePages: [3], exactSourceText: "Glycolysis converts glucose into two pyruvate molecules within the cytoplasm." }),
      node({ id: "6", documentId: "doc-v2", sourcePages: [4], exactSourceText: "The pentose phosphate pathway generates NADPH and ribose-5-phosphate for biosynthesis." }),
      node({ id: "7", documentId: "doc-v2", sourcePages: [5], exactSourceText: "Fatty acid oxidation occurs primarily within the mitochondrial matrix of the cell." }),
    ];
    const v3 = [
      node({ id: "8", documentId: "doc-v3", sourcePages: [4], exactSourceText: "The pentose phosphate pathway produces NADPH and ribose-5-phosphate needed for biosynthesis." }),
      node({ id: "9", documentId: "doc-v3", sourcePages: [5], exactSourceText: "Fatty acid oxidation takes place primarily within the mitochondrial matrix of the cell." }),
    ];
    // v1 and v3 share zero page numbers, so they can never be compared directly —
    // only chaining through v2 (which corroborates against both) should merge all three.
    const result = disambiguateBookNodes([...v1, ...v2, ...v3], "doc-v1");
    expect(result.map((n) => n.id).sort()).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  });
});
