// tests/examEngine/examScope.test.ts
// Unit coverage for lib/examEngine/examScope.ts's pure scope-resolution
// logic — the "completed"/"today" page-range math is covered end-to-end
// (through buildExam) by tests/examEngine/examScopeNoLeak.test.ts; this
// file covers the remaining scopes (selected-chapters, weak-areas,
// custom-concepts) and the default-scope-picking rule in isolation.

import { resolveExamScope, defaultScopeFor, selectWeakNodes, DEFAULT_LINKED_SCOPE, DEFAULT_UNLINKED_SCOPE } from "@/lib/examEngine/examScope";
import type { KnowledgeNode, KnowledgeNodeProgress } from "@/lib/knowledge/knowledgeGraphSchema";

function node(id: string, page: number): KnowledgeNode {
  return {
    id,
    documentId: "doc1",
    bookId: "book1",
    chapterCandidateId: null,
    canonicalAnchorId: `anchor-${id}`,
    title: `Node ${id}`,
    summary: "",
    exactSourceText: "",
    sourcePages: [page],
    citations: [],
    profileId: "general",
    role: "coreIdea",
    importance: 80,
    difficulty: 50,
    parentNodeIds: [],
    childNodeIds: [],
    relatedNodeIds: [],
    learningObjectives: [],
    misconceptions: [],
    examples: [],
    applications: [],
  };
}

function progress(nodeId: string, recallScore: number, attempts: number): KnowledgeNodeProgress {
  return {
    nodeId,
    documentId: "doc1",
    pageTruthKey: null,
    understandingScore: 0,
    recallScore,
    memoryStrength: 0,
    masteryScore: 0,
    confidenceScore: 0,
    lastStudiedAt: null,
    lastReviewedAt: null,
    nextReviewAt: null,
    predictedForgetAt: null,
    exposureCount: attempts,
    successfulRecallCount: 0,
    failedRecallCount: attempts,
    missCount: attempts,
    correctCount: 0,
    confusionNodeIds: [],
    observedMisconceptions: [],
    evidence: [],
    whiteboardSnapshotIds: [],
    datPerformance: null,
  };
}

describe("defaultScopeFor", () => {
  it(`defaults to "${DEFAULT_LINKED_SCOPE}" when a Reader progress record exists`, () => {
    expect(defaultScopeFor({ bookId: "b", furthestPageReached: 10, lastPageRead: 10, dailyMaxPage: [], updatedAt: "" })).toBe(DEFAULT_LINKED_SCOPE);
  });

  it(`defaults to "${DEFAULT_UNLINKED_SCOPE}" when there is no Reader progress record — never silently narrows to zero pages`, () => {
    expect(defaultScopeFor(null)).toBe(DEFAULT_UNLINKED_SCOPE);
  });
});

describe("resolveExamScope — selected-chapters", () => {
  it("uses the manual page ranges when provided", () => {
    const r = resolveExamScope({ scope: "selected-chapters", progress: null, manualPageRanges: [{ start: 10, end: 20 }] });
    expect(r.pageRanges).toEqual([{ start: 10, end: 20 }]);
    expect(r.blocked).toBe(false);
  });

  it("is blocked when nothing is selected — never falls through to entire book silently", () => {
    const r = resolveExamScope({ scope: "selected-chapters", progress: null });
    expect(r.blocked).toBe(true);
  });
});

describe("selectWeakNodes", () => {
  const nodes = [node("a", 5), node("b", 15), node("c", 25)];

  it("a node below the weak threshold WITH enough attempts counts as weak", () => {
    const progressByNodeId = new Map([["a", progress("a", 40, 5)]]);
    const weak = selectWeakNodes({ nodes, progressByNodeId, weakAccuracyThreshold: 60, minAttemptsForSignal: 3 });
    expect(weak.map((n) => n.id)).toEqual(["a"]);
  });

  it("a node below the threshold but with too FEW attempts is not yet weak — avoids a false signal from one unlucky guess", () => {
    const progressByNodeId = new Map([["a", progress("a", 40, 1)]]);
    const weak = selectWeakNodes({ nodes, progressByNodeId, weakAccuracyThreshold: 60, minAttemptsForSignal: 3 });
    expect(weak).toEqual([]);
  });

  it("a node at or above the threshold is never weak regardless of attempt count", () => {
    const progressByNodeId = new Map([["a", progress("a", 75, 10)]]);
    const weak = selectWeakNodes({ nodes, progressByNodeId, weakAccuracyThreshold: 60, minAttemptsForSignal: 3 });
    expect(weak).toEqual([]);
  });

  it("a node with no progress record at all is never weak — no evidence, no claim", () => {
    const weak = selectWeakNodes({ nodes, progressByNodeId: new Map(), weakAccuracyThreshold: 60, minAttemptsForSignal: 3 });
    expect(weak).toEqual([]);
  });
});

describe("resolveExamScope — weak-areas", () => {
  it("maps weak nodes to single-page ranges at their source pages", () => {
    const nodes = [node("a", 42), node("b", 99)];
    const progressByNodeId = new Map([["a", progress("a", 30, 5)], ["b", progress("b", 90, 5)]]);
    const r = resolveExamScope({ scope: "weak-areas", progress: null, allNodes: nodes, progressByNodeId, weakAccuracyThreshold: 60, minAttemptsForSignal: 3 });
    expect(r.pageRanges).toEqual([{ start: 42, end: 42 }]);
    expect(r.blocked).toBe(false);
  });

  it("is blocked (not entire-book) when no weak concepts are identified yet", () => {
    const r = resolveExamScope({ scope: "weak-areas", progress: null, allNodes: [], progressByNodeId: new Map() });
    expect(r.blocked).toBe(true);
  });
});

describe("resolveExamScope — custom-concepts", () => {
  it("maps only the selected node ids to page ranges", () => {
    const nodes = [node("a", 5), node("b", 15), node("c", 25)];
    const r = resolveExamScope({ scope: "custom-concepts", progress: null, allNodes: nodes, selectedNodeIds: new Set(["b"]) });
    expect(r.pageRanges).toEqual([{ start: 15, end: 15 }]);
  });

  it("is blocked when nothing is selected", () => {
    const nodes = [node("a", 5)];
    const r = resolveExamScope({ scope: "custom-concepts", progress: null, allNodes: nodes, selectedNodeIds: new Set() });
    expect(r.blocked).toBe(true);
  });
});
