// tests/learningHub/nextBestAction.test.ts
// L6 (Learning Hub orchestration correction, Section 9) — "Learning Hub
// should recommend actions ('What should I do next?'), not just show
// stats." Real behavioral tests for buildNextBestAction, the single ranked
// recommendation that replaces Learning Hub's previous always-"read the
// next unread page" CTA.

import { buildNextBestAction } from "@/lib/learningHub/nextBestAction";
import type { KnowledgeNode, KnowledgeNodeProgress } from "@/lib/knowledge/knowledgeGraphSchema";
import type { NextTopicRecommendation } from "@/lib/syllabus/chapterProgress";

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
const NEXT_TOPIC: NextTopicRecommendation = { chapterId: "ch1", chapterTitle: "Chapter 3: Cell Biology", page: 51, reason: "next unread page" };

describe("buildNextBestAction", () => {
  it("returns null when there's no due/weak node and no next-topic recommendation", () => {
    const result = buildNextBestAction({ nodes: [], progressByNodeId: new Map(), nextTopicRecommendation: null, bookId: "book-a" });
    expect(result).toBeNull();
  });

  it("falls back to the next-topic recommendation (Reader) when nothing is due or weak", () => {
    const result = buildNextBestAction({ nodes: [], progressByNodeId: new Map(), nextTopicRecommendation: NEXT_TOPIC, bookId: "book-a" });
    expect(result).not.toBeNull();
    expect(result!.recommendedModule).toBe("reader");
    expect(result!.priority).toBe("medium");
    expect(result!.deepLinkTarget).toEqual({ module: "reader", bookId: "book-a", page: 51 });
    expect(result!.conceptIds).toEqual([]);
  });

  it("REQUIRED: a node due for recall outranks the next-topic fallback and targets Recall", () => {
    const node = fixtureNode({ id: "kn_due", title: "Photosynthesis" });
    const progress = fixtureProgress({ nodeId: "kn_due", nextReviewAt: "2026-06-14T00:00:00.000Z" });
    const result = buildNextBestAction({
      nodes: [node],
      progressByNodeId: new Map([["kn_due", progress]]),
      nextTopicRecommendation: NEXT_TOPIC,
      bookId: "book-a",
    });
    expect(result!.recommendedModule).toBe("recall");
    expect(result!.priority).toBe("high");
    expect(result!.conceptIds).toEqual(["kn_due"]);
    expect(result!.deepLinkTarget).toEqual({ module: "recall", bookId: "book-a", knowledgeNodeId: "kn_due" });
    expect(result!.reason).toContain("Photosynthesis");
  });

  it("REQUIRED: a weak node (no due node) outranks the next-topic fallback and targets NoteLab", () => {
    const node = fixtureNode({ id: "kn_weak", title: "Krebs Cycle" });
    const progress = fixtureProgress({ nodeId: "kn_weak", recallScore: 30, successfulRecallCount: 1, failedRecallCount: 3 });
    const result = buildNextBestAction({
      nodes: [node],
      progressByNodeId: new Map([["kn_weak", progress]]),
      nextTopicRecommendation: NEXT_TOPIC,
      bookId: "book-a",
    });
    expect(result!.recommendedModule).toBe("notelab");
    expect(result!.priority).toBe("high");
    expect(result!.conceptIds).toEqual(["kn_weak"]);
    expect(result!.deepLinkTarget).toEqual({ module: "notelab", bookId: "book-a", knowledgeNodeId: "kn_weak" });
    expect(result!.reason).toContain("Krebs Cycle");
  });

  it("prioritizes a due-for-recall node over a weak node when both exist", () => {
    const dueNode = fixtureNode({ id: "kn_due", title: "Due Concept" });
    const dueProgress = fixtureProgress({ nodeId: "kn_due", nextReviewAt: "2026-06-14T00:00:00.000Z" });
    const weakNode = fixtureNode({ id: "kn_weak", title: "Weak Concept" });
    const weakProgress = fixtureProgress({ nodeId: "kn_weak", recallScore: 20, successfulRecallCount: 0, failedRecallCount: 4 });
    const result = buildNextBestAction({
      nodes: [dueNode, weakNode],
      progressByNodeId: new Map([["kn_due", dueProgress], ["kn_weak", weakProgress]]),
      nextTopicRecommendation: NEXT_TOPIC,
      bookId: "book-a",
    });
    expect(result!.recommendedModule).toBe("recall");
    expect(result!.conceptIds).toEqual(["kn_due"]);
  });

  it("pulls sourceEvidence from the node's own evidence log when present, never fabricating it", () => {
    const node = fixtureNode({ id: "kn_due", title: "Osmosis" });
    const progress = fixtureProgress({
      nodeId: "kn_due",
      nextReviewAt: "2026-06-14T00:00:00.000Z",
      evidence: [{ sourceType: "recall", sourceId: "card-1", occurredAt: "2026-06-13T00:00:00.000Z", detail: "rated hard" }],
    });
    const result = buildNextBestAction({
      nodes: [node],
      progressByNodeId: new Map([["kn_due", progress]]),
      nextTopicRecommendation: null,
      bookId: "book-a",
    });
    expect(result!.sourceEvidence).toEqual(["rated hard"]);
  });

  it("falls back to a synthesized evidence string when the node has no evidence log entries with detail text", () => {
    const node = fixtureNode({ id: "kn_due", title: "Osmosis" });
    const progress = fixtureProgress({ nodeId: "kn_due", nextReviewAt: "2026-06-14T00:00:00.000Z", evidence: [] });
    const result = buildNextBestAction({
      nodes: [node],
      progressByNodeId: new Map([["kn_due", progress]]),
      nextTopicRecommendation: null,
      bookId: "book-a",
    });
    expect(result!.sourceEvidence).toHaveLength(1);
    expect(result!.sourceEvidence[0]).toMatch(/scheduled for review/);
  });
});
