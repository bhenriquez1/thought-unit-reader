// tests/learningHub/knowledgeStateSelectors.test.ts
// C8 (Phase 0 audit) — Learning Hub's live UI ran entirely on
// lib/syllabus/chapterProgress.ts, with zero connection to the shared
// Learning State (KnowledgeNodeProgress) — confirmed via audit:
// getNodeProgress was called exactly once in the whole app, for a small
// Reader-tab banner, never inside Learning Hub. These are the pure
// selectors backing KnowledgeStatePanel, the first real connection.
// Real behavioral tests — both functions are pure, no IO.

import { selectDueForRecall, selectRecentlyMastered } from "@/lib/learningHub/knowledgeStateSelectors";
import type { KnowledgeNode, KnowledgeNodeProgress } from "@/lib/knowledge/knowledgeGraphSchema";

function fixtureNode(overrides: Partial<KnowledgeNode> = {}): KnowledgeNode {
  return {
    id: "kn_1",
    documentId: "doc-a",
    bookId: "book-a",
    chapterCandidateId: null,
    canonicalAnchorId: "anchor-1",
    title: "Osmosis",
    summary: "",
    exactSourceText: "",
    sourcePages: [42],
    citations: [],
    profileId: "default",
    role: "Core Concept",
    importance: 50,
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

function fixtureProgress(overrides: Partial<KnowledgeNodeProgress> = {}): KnowledgeNodeProgress {
  return {
    nodeId: "kn_1",
    documentId: "doc-a",
    pageTruthKey: null,
    understandingScore: 0,
    recallScore: 0,
    memoryStrength: 0,
    masteryScore: 0,
    confidenceScore: 0,
    lastStudiedAt: null,
    lastReviewedAt: null,
    nextReviewAt: null,
    predictedForgetAt: null,
    exposureCount: 0,
    successfulRecallCount: 0,
    failedRecallCount: 0,
    missCount: 0,
    correctCount: 0,
    confusionNodeIds: [],
    observedMisconceptions: [],
    evidence: [],
    whiteboardSnapshotIds: [],
    datPerformance: null,
    ...overrides,
  };
}

const NOW = new Date("2026-06-15T12:00:00.000Z").getTime();

describe("selectDueForRecall", () => {
  it("REQUIRED: includes a node whose nextReviewAt is in the past", () => {
    const node = fixtureNode({ id: "kn_1" });
    const progress = fixtureProgress({ nodeId: "kn_1", nextReviewAt: "2026-06-14T00:00:00.000Z" });
    const result = selectDueForRecall({ nodes: [node], progressByNodeId: new Map([["kn_1", progress]]), now: NOW });
    expect(result.map((n) => n.id)).toEqual(["kn_1"]);
  });

  it("REQUIRED: includes a node whose nextReviewAt is exactly now", () => {
    const node = fixtureNode({ id: "kn_1" });
    const progress = fixtureProgress({ nodeId: "kn_1", nextReviewAt: new Date(NOW).toISOString() });
    const result = selectDueForRecall({ nodes: [node], progressByNodeId: new Map([["kn_1", progress]]), now: NOW });
    expect(result).toHaveLength(1);
  });

  it("REQUIRED: excludes a node whose nextReviewAt is in the future", () => {
    const node = fixtureNode({ id: "kn_1" });
    const progress = fixtureProgress({ nodeId: "kn_1", nextReviewAt: "2026-06-16T00:00:00.000Z" });
    const result = selectDueForRecall({ nodes: [node], progressByNodeId: new Map([["kn_1", progress]]), now: NOW });
    expect(result).toEqual([]);
  });

  it("REQUIRED: excludes a node with no progress record, and a node with nextReviewAt null — never scheduled is not the same as overdue", () => {
    const withNoProgress = fixtureNode({ id: "kn_1" });
    const withNullSchedule = fixtureNode({ id: "kn_2" });
    const result = selectDueForRecall({
      nodes: [withNoProgress, withNullSchedule],
      progressByNodeId: new Map([["kn_2", fixtureProgress({ nodeId: "kn_2", nextReviewAt: null })]]),
      now: NOW,
    });
    expect(result).toEqual([]);
  });

  it("sorts soonest-due first", () => {
    const a = fixtureNode({ id: "kn_a" });
    const b = fixtureNode({ id: "kn_b" });
    const result = selectDueForRecall({
      nodes: [a, b],
      progressByNodeId: new Map([
        ["kn_a", fixtureProgress({ nodeId: "kn_a", nextReviewAt: "2026-06-10T00:00:00.000Z" })],
        ["kn_b", fixtureProgress({ nodeId: "kn_b", nextReviewAt: "2026-06-01T00:00:00.000Z" })],
      ]),
      now: NOW,
    });
    expect(result.map((n) => n.id)).toEqual(["kn_b", "kn_a"]);
  });

  it("caps at maxItems (default 5)", () => {
    const nodes = Array.from({ length: 8 }, (_, i) => fixtureNode({ id: `kn_${i}` }));
    const progressByNodeId = new Map(
      nodes.map((n) => [n.id, fixtureProgress({ nodeId: n.id, nextReviewAt: "2026-06-01T00:00:00.000Z" })]),
    );
    const result = selectDueForRecall({ nodes, progressByNodeId, now: NOW });
    expect(result).toHaveLength(5);
  });
});

describe("selectRecentlyMastered", () => {
  it("REQUIRED: includes a node at or above the mastery threshold", () => {
    const node = fixtureNode({ id: "kn_1" });
    const progress = fixtureProgress({ nodeId: "kn_1", masteryScore: 85 });
    const result = selectRecentlyMastered({ nodes: [node], progressByNodeId: new Map([["kn_1", progress]]) });
    expect(result.map((n) => n.id)).toEqual(["kn_1"]);
  });

  it("REQUIRED: excludes a node below the mastery threshold", () => {
    const node = fixtureNode({ id: "kn_1" });
    const progress = fixtureProgress({ nodeId: "kn_1", masteryScore: 79 });
    const result = selectRecentlyMastered({ nodes: [node], progressByNodeId: new Map([["kn_1", progress]]) });
    expect(result).toEqual([]);
  });

  it("REQUIRED: excludes a node with no progress record — masteryScore defaults to 0, well below threshold", () => {
    const node = fixtureNode({ id: "kn_1" });
    const result = selectRecentlyMastered({ nodes: [node], progressByNodeId: new Map() });
    expect(result).toEqual([]);
  });

  it("sorts most-recently-reviewed first among mastered nodes", () => {
    const a = fixtureNode({ id: "kn_a" });
    const b = fixtureNode({ id: "kn_b" });
    const result = selectRecentlyMastered({
      nodes: [a, b],
      progressByNodeId: new Map([
        ["kn_a", fixtureProgress({ nodeId: "kn_a", masteryScore: 90, lastReviewedAt: "2026-06-01T00:00:00.000Z" })],
        ["kn_b", fixtureProgress({ nodeId: "kn_b", masteryScore: 90, lastReviewedAt: "2026-06-10T00:00:00.000Z" })],
      ]),
    });
    expect(result.map((n) => n.id)).toEqual(["kn_b", "kn_a"]);
  });

  it("respects a custom masteredThreshold", () => {
    const node = fixtureNode({ id: "kn_1" });
    const progress = fixtureProgress({ nodeId: "kn_1", masteryScore: 65 });
    const result = selectRecentlyMastered({
      nodes: [node],
      progressByNodeId: new Map([["kn_1", progress]]),
      masteredThreshold: 60,
    });
    expect(result).toHaveLength(1);
  });

  it("caps at maxItems (default 5)", () => {
    const nodes = Array.from({ length: 8 }, (_, i) => fixtureNode({ id: `kn_${i}` }));
    const progressByNodeId = new Map(nodes.map((n) => [n.id, fixtureProgress({ nodeId: n.id, masteryScore: 90 })]));
    const result = selectRecentlyMastered({ nodes, progressByNodeId });
    expect(result).toHaveLength(5);
  });
});
