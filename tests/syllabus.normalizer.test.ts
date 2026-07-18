// tests/syllabus.normalizer.test.ts
// Tests for parseSyllabusResponse — the normalization layer between untrusted
// AI syllabus output and the canonical UniversalSyllabus record.

import { parseSyllabusResponse } from "@/lib/syllabus/normalizer";
import { SYLLABUS_VERSION } from "@/lib/syllabus/types";
import type { BookIntelligence } from "@/lib/bookIntelligence/types";
import type { StructureCandidate } from "@/lib/syllabus/syllabusSchema";

const DOC_ID = "test-doc-abc";

const MOCK_INTELLIGENCE: BookIntelligence = {
  documentId: DOC_ID,
  classification: {
    primaryDomain: "medicine",
    secondaryDomains: ["biology"],
    documentType: "textbook",
    instructionalStyle: "textbook",
    confidence: 0.88,
    evidence: [{ signal: "toc", excerpt: "Chapter 1: Anatomy", weight: 0.9 }],
  },
  learningCharacteristics: {
    prerequisiteHeavy: 0.7, conceptDense: 0.8, procedureHeavy: 0.3,
    calculationHeavy: 0.2, memorizationHeavy: 0.6, caseBased: 0.5,
    visualHeavy: 0.4,       discussionHeavy: 0.2,
  },
  complexity: "advanced",
  complexityConfidence: 0.75,
  reasoningStrategy: { id: "medicine", label: "Medicine", systemBlock: "Use SOAP note framework." },
  classificationStatus: "classified",
  computedAt: 1000000,
  version: 1,
};

const MOCK_CANDIDATES: StructureCandidate[] = [
  { id: "c0", title: "Introduction", level: 1, startPage: 1,  endPage: 20,  source: "toc",      confidence: 0.95 },
  { id: "c1", title: "Cell Biology",  level: 1, startPage: 21, endPage: 60,  source: "bookmark", confidence: 0.90 },
  { id: "c2", title: "Biochemistry",  level: 1, startPage: 61, endPage: 100, source: "heading",  confidence: 0.80 },
];

function validAiOutput(overrides: Record<string, any> = {}): string {
  return JSON.stringify({
    nodes: [
      {
        id: "c0", title: "Introduction", nodeType: "chapter",
        pageStart: 1, pageEnd: 20, source: "toc", inferred: false,
        sourceConfidence: 0.95, importance: 0.6, difficulty: 0.3,
        estimatedMinutes: 45, recommendedOrder: 1,
        concepts: ["overview", "fundamentals"],
        enrichmentConfidence: 0.85,
        canonicalAnchorIds: ["a0"],
        chapterCandidateId: "c0",
      },
      {
        id: "c1", title: "Cell Biology", nodeType: "chapter",
        pageStart: 21, pageEnd: 60, source: "bookmark", inferred: false,
        sourceConfidence: 0.90, importance: 0.8, difficulty: 0.7,
        estimatedMinutes: 120, recommendedOrder: 2,
        concepts: ["cell structure", "membrane transport", "mitosis"],
        enrichmentConfidence: 0.88,
        canonicalAnchorIds: ["a0", "a1"],
        chapterCandidateId: "c1",
      },
      {
        id: "c2", title: "Biochemistry", nodeType: "chapter",
        pageStart: 61, pageEnd: 100, source: "heading", inferred: false,
        sourceConfidence: 0.80, importance: 0.9, difficulty: 0.9,
        estimatedMinutes: 180, recommendedOrder: 3,
        concepts: ["enzymes", "metabolism", "ATP synthesis"],
        enrichmentConfidence: 0.82,
        canonicalAnchorIds: ["a1"],
        chapterCandidateId: "c2",
      },
    ],
    anchors: [
      { id: "a0", title: "Cell", type: "concept", description: "Basic unit of life.", nodeIds: ["c0", "c1"], confidence: 0.9 },
      { id: "a1", title: "Enzyme", type: "definition", description: "Biological catalyst.", nodeIds: ["c1", "c2"], confidence: 0.85 },
      { id: "a2", title: "ATP Synthesis", type: "mechanism", description: "Energy production pathway.", nodeIds: ["c2"], confidence: 0.8 },
    ],
    edges: [
      { fromNodeId: "c0", toNodeId: "c1", type: "temporal", strength: "required", reason: "Intro first" },
      { fromNodeId: "c1", toNodeId: "c2", type: "concept-prerequisite", strength: "recommended", reason: "Cell biology before biochemistry" },
    ],
    recommendedOrder: ["c0", "c1", "c2"],
    studyRoadmap: ["Foundation", "Core", "Advanced"],
    ...overrides,
  });
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("parseSyllabusResponse — happy path", () => {
  it("parses a valid response and returns a UniversalSyllabus", () => {
    const result = parseSyllabusResponse(validAiOutput(), DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES);
    expect(result).not.toBeNull();
    expect(result!.documentId).toBe(DOC_ID);
    expect(result!.version).toBe(SYLLABUS_VERSION);
    expect(result!.primaryDomain).toBe("medicine");
    expect(result!.bookIntelligenceVersion).toBe(1);
  });

  it("preserves node count and order", () => {
    const result = parseSyllabusResponse(validAiOutput(), DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES);
    expect(result!.nodes).toHaveLength(3);
    expect(result!.nodes[0].id).toBe("c0");
    expect(result!.nodes[1].id).toBe("c1");
    expect(result!.nodes[2].id).toBe("c2");
  });

  it("preserves anchors", () => {
    const result = parseSyllabusResponse(validAiOutput(), DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES);
    expect(result!.anchors).toHaveLength(3);
    expect(result!.anchors[0].id).toBe("a0");
    expect(result!.anchors[0].type).toBe("concept");
  });

  it("preserves edges", () => {
    const result = parseSyllabusResponse(validAiOutput(), DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES);
    expect(result!.edges).toHaveLength(2);
    expect(result!.edges[0].fromNodeId).toBe("c0");
    expect(result!.edges[0].toNodeId).toBe("c1");
    expect(result!.edges[0].type).toBe("temporal");
    expect(result!.edges[0].strength).toBe("required");
  });

  it("preserves recommendedOrder and studyRoadmap", () => {
    const result = parseSyllabusResponse(validAiOutput(), DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES);
    expect(result!.recommendedOrder).toEqual(["c0", "c1", "c2"]);
    expect(result!.studyRoadmap).toEqual(["Foundation", "Core", "Advanced"]);
  });

  it("derives quality as 'canonical' when anchors ≥ 3 and edges ≥ 2", () => {
    const result = parseSyllabusResponse(validAiOutput(), DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES);
    expect(result!.quality).toBe("canonical");
  });

  it("initializes knowledgeNodeIds as empty array on all nodes", () => {
    const result = parseSyllabusResponse(validAiOutput(), DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES);
    for (const node of result!.nodes) {
      expect(node.knowledgeNodeIds).toEqual([]);
    }
  });

  it("initializes knowledgeNodeIds as empty array on all anchors", () => {
    const result = parseSyllabusResponse(validAiOutput(), DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES);
    for (const anchor of result!.anchors) {
      expect(anchor.knowledgeNodeIds).toEqual([]);
    }
  });
});

// ─── Node normalization ───────────────────────────────────────────────────────

describe("parseSyllabusResponse — node normalization", () => {
  it("clamps importance to [0, 1]", () => {
    const result = parseSyllabusResponse(
      validAiOutput({
        nodes: [{ id: "c0", title: "T", nodeType: "chapter", source: "toc",
                  importance: 2.5, difficulty: -1, estimatedMinutes: 10,
                  recommendedOrder: 1, concepts: [], enrichmentConfidence: 0.5,
                  canonicalAnchorIds: [], chapterCandidateId: "c0" }],
      }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.nodes[0].importance).toBe(1);
    expect(result!.nodes[0].difficulty).toBe(0);
  });

  it("defaults missing importance to 0.5", () => {
    const result = parseSyllabusResponse(
      validAiOutput({
        nodes: [{ id: "c0", title: "T", nodeType: "chapter", source: "toc",
                  estimatedMinutes: 10, recommendedOrder: 1, concepts: [],
                  enrichmentConfidence: 0.5, canonicalAnchorIds: [],
                  chapterCandidateId: "c0" }],
      }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.nodes[0].importance).toBe(0.5);
    expect(result!.nodes[0].difficulty).toBe(0.5);
  });

  it("defaults unrecognized nodeType to 'section'", () => {
    const result = parseSyllabusResponse(
      validAiOutput({
        nodes: [{ id: "c0", title: "T", nodeType: "made-up-type", source: "toc",
                  importance: 0.5, difficulty: 0.5, estimatedMinutes: 30,
                  recommendedOrder: 1, concepts: [], enrichmentConfidence: 0.5,
                  canonicalAnchorIds: [], chapterCandidateId: "c0" }],
      }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.nodes[0].nodeType).toBe("section");
  });

  it("defaults unrecognized source to 'ai-inferred' and sets inferred = true", () => {
    const result = parseSyllabusResponse(
      validAiOutput({
        nodes: [{ id: "c0", title: "T", nodeType: "chapter", source: "made-up-source",
                  importance: 0.5, difficulty: 0.5, estimatedMinutes: 30,
                  recommendedOrder: 1, concepts: [], enrichmentConfidence: 0.5,
                  canonicalAnchorIds: [], chapterCandidateId: "c0" }],
      }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.nodes[0].source).toBe("ai-inferred");
    expect(result!.nodes[0].inferred).toBe(true);
  });

  it("rejects chapterCandidateId that is not in candidates list", () => {
    const result = parseSyllabusResponse(
      validAiOutput({
        nodes: [{ id: "c0", title: "T", nodeType: "chapter", source: "toc",
                  importance: 0.5, difficulty: 0.5, estimatedMinutes: 30,
                  recommendedOrder: 1, concepts: [], enrichmentConfidence: 0.5,
                  canonicalAnchorIds: [], chapterCandidateId: "cx999" }],
      }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.nodes[0].chapterCandidateId).toBeUndefined();
  });

  it("truncates title to 200 characters", () => {
    const longTitle = "A".repeat(300);
    const result = parseSyllabusResponse(
      validAiOutput({
        nodes: [{ id: "c0", title: longTitle, nodeType: "chapter", source: "toc",
                  importance: 0.5, difficulty: 0.5, estimatedMinutes: 30,
                  recommendedOrder: 1, concepts: [], enrichmentConfidence: 0.5,
                  canonicalAnchorIds: [], chapterCandidateId: "c0" }],
      }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.nodes[0].title.length).toBeLessThanOrEqual(200);
  });

  it("clamps estimatedMinutes to positive, defaults to 30 for invalid", () => {
    const result = parseSyllabusResponse(
      validAiOutput({
        nodes: [{ id: "c0", title: "T", nodeType: "chapter", source: "toc",
                  importance: 0.5, difficulty: 0.5, estimatedMinutes: -10,
                  recommendedOrder: 1, concepts: [], enrichmentConfidence: 0.5,
                  canonicalAnchorIds: [], chapterCandidateId: "c0" }],
      }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.nodes[0].estimatedMinutes).toBe(30);
  });

  it("caps concepts array at 8 entries", () => {
    const manyConcepts = Array.from({ length: 20 }, (_, i) => `concept-${i}`);
    const result = parseSyllabusResponse(
      validAiOutput({
        nodes: [{ id: "c0", title: "T", nodeType: "chapter", source: "toc",
                  importance: 0.5, difficulty: 0.5, estimatedMinutes: 30,
                  recommendedOrder: 1, concepts: manyConcepts, enrichmentConfidence: 0.5,
                  canonicalAnchorIds: [], chapterCandidateId: "c0" }],
      }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.nodes[0].concepts.length).toBeLessThanOrEqual(8);
  });

  it("filters non-string entries out of concepts", () => {
    const result = parseSyllabusResponse(
      validAiOutput({
        nodes: [{ id: "c0", title: "T", nodeType: "chapter", source: "toc",
                  importance: 0.5, difficulty: 0.5, estimatedMinutes: 30,
                  recommendedOrder: 1, concepts: [null, 42, "valid", true],
                  enrichmentConfidence: 0.5, canonicalAnchorIds: [],
                  chapterCandidateId: "c0" }],
      }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.nodes[0].concepts).toEqual(["valid"]);
  });
});

// ─── Duplicate node ID deduplication ─────────────────────────────────────────

describe("parseSyllabusResponse — node deduplication", () => {
  it("deduplicates nodes with the same ID, keeping first occurrence", () => {
    const result = parseSyllabusResponse(
      validAiOutput({
        nodes: [
          { id: "c0", title: "First", nodeType: "chapter", source: "toc",
            importance: 0.5, difficulty: 0.5, estimatedMinutes: 30,
            recommendedOrder: 1, concepts: [], enrichmentConfidence: 0.5,
            canonicalAnchorIds: [], chapterCandidateId: "c0" },
          { id: "c0", title: "Duplicate", nodeType: "chapter", source: "toc",
            importance: 0.8, difficulty: 0.8, estimatedMinutes: 60,
            recommendedOrder: 2, concepts: [], enrichmentConfidence: 0.5,
            canonicalAnchorIds: [], chapterCandidateId: "c0" },
        ],
      }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.nodes.filter(n => n.id === "c0")).toHaveLength(1);
    expect(result!.nodes.find(n => n.id === "c0")!.title).toBe("First");
  });
});

// ─── Candidate-based fallback ─────────────────────────────────────────────────

describe("parseSyllabusResponse — candidate fallback", () => {
  it("synthesizes nodes from candidates when AI returns no nodes", () => {
    const result = parseSyllabusResponse(
      JSON.stringify({ anchors: [], edges: [], recommendedOrder: [], studyRoadmap: [] }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.nodes).toHaveLength(3);
    expect(result!.nodes[0].id).toBe("c0");
    expect(result!.nodes[0].chapterCandidateId).toBe("c0");
    expect(result!.nodes[0].inferred).toBe(false);
    expect(result!.nodes[1].nodeType).toBe("chapter");
  });

  it("fallback nodes have pageStart/pageEnd from candidates", () => {
    const result = parseSyllabusResponse(
      JSON.stringify({}),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.nodes[0].pageStart).toBe(1);
    expect(result!.nodes[0].pageEnd).toBe(20);
    expect(result!.nodes[1].pageStart).toBe(21);
  });

  it("quality is 'structural' for candidate-only fallback with page ranges", () => {
    const result = parseSyllabusResponse(
      JSON.stringify({}),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.quality).toBe("structural");
  });

  it("generates default recommendedOrder from fallback nodes", () => {
    const result = parseSyllabusResponse(
      JSON.stringify({}),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.recommendedOrder).toEqual(["c0", "c1", "c2"]);
  });
});

// ─── Edge validation ──────────────────────────────────────────────────────────

describe("parseSyllabusResponse — edge validation", () => {
  it("rejects edges that reference unknown node IDs", () => {
    const result = parseSyllabusResponse(
      validAiOutput({
        edges: [
          { fromNodeId: "c0", toNodeId: "cx999", type: "temporal", strength: "required", reason: "" },
          { fromNodeId: "cx0", toNodeId: "c1",   type: "temporal", strength: "required", reason: "" },
        ],
      }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.edges).toHaveLength(0);
  });

  it("rejects self-loop edges (fromNodeId === toNodeId)", () => {
    const result = parseSyllabusResponse(
      validAiOutput({
        edges: [
          { fromNodeId: "c0", toNodeId: "c0", type: "temporal", strength: "required", reason: "" },
        ],
      }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.edges).toHaveLength(0);
  });

  it("deduplicates edges with the same fromNodeId+toNodeId pair", () => {
    const result = parseSyllabusResponse(
      validAiOutput({
        edges: [
          { fromNodeId: "c0", toNodeId: "c1", type: "temporal", strength: "required", reason: "first" },
          { fromNodeId: "c0", toNodeId: "c1", type: "concept-prerequisite", strength: "helpful", reason: "second" },
        ],
      }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.edges.filter(e => e.fromNodeId === "c0" && e.toNodeId === "c1")).toHaveLength(1);
  });

  it("defaults unrecognized edge type to 'temporal'", () => {
    const result = parseSyllabusResponse(
      validAiOutput({
        edges: [{ fromNodeId: "c0", toNodeId: "c1", type: "made-up", strength: "required", reason: "" }],
      }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.edges[0].type).toBe("temporal");
  });

  it("defaults unrecognized strength to 'recommended'", () => {
    const result = parseSyllabusResponse(
      validAiOutput({
        edges: [{ fromNodeId: "c0", toNodeId: "c1", type: "temporal", strength: "strongly-required", reason: "" }],
      }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.edges[0].strength).toBe("recommended");
  });

  it("truncates edge reason to 200 characters", () => {
    const longReason = "R".repeat(300);
    const result = parseSyllabusResponse(
      validAiOutput({
        edges: [{ fromNodeId: "c0", toNodeId: "c1", type: "temporal", strength: "required", reason: longReason }],
      }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.edges[0].reason.length).toBeLessThanOrEqual(200);
  });
});

// ─── Anchor normalization ─────────────────────────────────────────────────────

describe("parseSyllabusResponse — anchor normalization", () => {
  it("defaults unrecognized anchor type to 'concept'", () => {
    const result = parseSyllabusResponse(
      validAiOutput({
        anchors: [{ id: "a0", title: "X", type: "weird-type", description: "desc", nodeIds: ["c0"], confidence: 0.8 }],
      }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.anchors[0].type).toBe("concept");
  });

  it("truncates anchor description to 300 characters", () => {
    const result = parseSyllabusResponse(
      validAiOutput({
        anchors: [{ id: "a0", title: "X", type: "concept", description: "D".repeat(400), nodeIds: [], confidence: 0.8 }],
      }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.anchors[0].description.length).toBeLessThanOrEqual(300);
  });

  it("truncates anchor title to 120 characters", () => {
    const result = parseSyllabusResponse(
      validAiOutput({
        anchors: [{ id: "a0", title: "T".repeat(200), type: "concept", description: "", nodeIds: [], confidence: 0.8 }],
      }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.anchors[0].title.length).toBeLessThanOrEqual(120);
  });

  it("caps anchors array at 100 entries", () => {
    const manyAnchors = Array.from({ length: 150 }, (_, i) => ({
      id: `a${i}`, title: `Anchor ${i}`, type: "concept", description: "", nodeIds: [], confidence: 0.7,
    }));
    const result = parseSyllabusResponse(
      validAiOutput({ anchors: manyAnchors }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.anchors.length).toBeLessThanOrEqual(100);
  });

  it("clamps anchor confidence to [0, 1]", () => {
    const result = parseSyllabusResponse(
      validAiOutput({
        anchors: [{ id: "a0", title: "X", type: "concept", description: "", nodeIds: [], confidence: 1.5 }],
      }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.anchors[0].confidence).toBe(1);
  });
});

// ─── Recommended order validation ────────────────────────────────────────────

describe("parseSyllabusResponse — recommendedOrder", () => {
  it("strips node IDs not present in the nodes list", () => {
    const result = parseSyllabusResponse(
      validAiOutput({ recommendedOrder: ["c0", "cX", "c1", "cY", "c2"] }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.recommendedOrder).toEqual(["c0", "c1", "c2"]);
  });

  it("defaults to document order when recommendedOrder is missing", () => {
    const result = parseSyllabusResponse(
      JSON.stringify({ nodes: JSON.parse(validAiOutput()).nodes }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.recommendedOrder).toEqual(["c0", "c1", "c2"]);
  });
});

// ─── Quality derivation ───────────────────────────────────────────────────────

describe("parseSyllabusResponse — quality", () => {
  it("derives 'structural' when anchors < 3", () => {
    const result = parseSyllabusResponse(
      validAiOutput({ anchors: [{ id: "a0", title: "X", type: "concept", description: "", nodeIds: [], confidence: 0.8 }] }),
      DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES
    );
    expect(result!.quality).toBe("structural");
  });

  it("derives 'minimal' when no page information exists on nodes", () => {
    const result = parseSyllabusResponse(
      JSON.stringify({
        nodes: [
          { id: "n0", title: "T", nodeType: "section", source: "ai-inferred",
            importance: 0.5, difficulty: 0.5, estimatedMinutes: 30,
            recommendedOrder: 1, concepts: [], enrichmentConfidence: 0.5,
            canonicalAnchorIds: [] },
        ],
        anchors: [], edges: [],
      }),
      DOC_ID, MOCK_INTELLIGENCE, []
    );
    expect(result!.quality).toBe("minimal");
  });

  it("derives 'canonical' when anchors ≥ 3 and edges ≥ 2", () => {
    const result = parseSyllabusResponse(validAiOutput(), DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES);
    expect(result!.quality).toBe("canonical");
  });
});

// ─── Malformed JSON ───────────────────────────────────────────────────────────

describe("parseSyllabusResponse — malformed input", () => {
  it("returns null for non-JSON input", () => {
    expect(parseSyllabusResponse("this is not json", DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseSyllabusResponse("", DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES)).toBeNull();
  });

  it("falls back to candidate nodes for empty JSON object", () => {
    const result = parseSyllabusResponse("{}", DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES);
    expect(result).not.toBeNull();
    expect(result!.nodes).toHaveLength(3);
    expect(result!.quality).toBe("structural");
  });

  it("handles a JSON array (wrong type) as an empty object", () => {
    const result = parseSyllabusResponse("[]", DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES);
    expect(result).not.toBeNull();
    expect(result!.nodes).toHaveLength(3);
  });

  it("handles null values in nodes array without crashing", () => {
    const result = parseSyllabusResponse(
      JSON.stringify({ nodes: [null, undefined, 42, "string"] }),
      DOC_ID, MOCK_INTELLIGENCE, []
    );
    expect(result).not.toBeNull();
  });

  it("returns empty edges and anchors when those fields are absent", () => {
    const result = parseSyllabusResponse(
      JSON.stringify({ nodes: [], recommendedOrder: [], studyRoadmap: [] }),
      DOC_ID, MOCK_INTELLIGENCE, []
    );
    expect(result!.edges).toEqual([]);
    expect(result!.anchors).toEqual([]);
  });
});

// ─── BookIntelligence passthrough ────────────────────────────────────────────

describe("parseSyllabusResponse — intelligence integration", () => {
  it("carries the intelligence version through to bookIntelligenceVersion", () => {
    const result = parseSyllabusResponse(validAiOutput(), DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES);
    expect(result!.bookIntelligenceVersion).toBe(MOCK_INTELLIGENCE.version);
  });

  it("carries the primaryDomain from intelligence", () => {
    const result = parseSyllabusResponse(validAiOutput(), DOC_ID, MOCK_INTELLIGENCE, MOCK_CANDIDATES);
    expect(result!.primaryDomain).toBe(MOCK_INTELLIGENCE.classification.primaryDomain);
  });

  it("uses computer-science domain from a CS book intelligence", () => {
    const csIntelligence: BookIntelligence = {
      ...MOCK_INTELLIGENCE,
      classification: { ...MOCK_INTELLIGENCE.classification, primaryDomain: "computer-science" },
    };
    const result = parseSyllabusResponse(validAiOutput(), DOC_ID, csIntelligence, MOCK_CANDIDATES);
    expect(result!.primaryDomain).toBe("computer-science");
  });
});
