// tests/library/bookProgressSummary.test.ts
// L7 (Learning Hub orchestration correction, Section 8) — "Every saved book
// should show meaningful progress." Real behavioral tests for
// computeBookProgressSummary, mocking only the IDB-backed store modules
// (same pattern as tests/recalllab/recall2LearningStateSignals.test.ts) and
// exercising the real selectDueForRecall/selectWeakNodes logic against
// fixture nodes/progress.

jest.mock("@/lib/reader/readingProgressStore", () => ({ getReadingProgress: jest.fn() }));
jest.mock("@/lib/notelab/ultraNoteStore", () => ({ getNotesByBookAsync: jest.fn() }));
jest.mock("@/lib/knowledge/knowledgeGraphStore", () => ({ getNodesByBook: jest.fn(), getProgressForNodes: jest.fn() }));

import { computeBookProgressSummary } from "@/lib/library/bookProgressSummary";
import { getReadingProgress } from "@/lib/reader/readingProgressStore";
import { getNotesByBookAsync } from "@/lib/notelab/ultraNoteStore";
import { getNodesByBook, getProgressForNodes } from "@/lib/knowledge/knowledgeGraphStore";
import type { KnowledgeNode, KnowledgeNodeProgress } from "@/lib/knowledge/knowledgeGraphSchema";
import type { UltraNote } from "@/lib/notelab/ultraNoteStore";

const mockGetReadingProgress = getReadingProgress as jest.Mock;
const mockGetNotesByBookAsync = getNotesByBookAsync as jest.Mock;
const mockGetNodesByBook = getNodesByBook as jest.Mock;
const mockGetProgressForNodes = getProgressForNodes as jest.Mock;

function fixtureNode(overrides: Partial<KnowledgeNode> = {}): KnowledgeNode {
  return {
    id: "kn_1", documentId: "doc-a", bookId: "book-a", chapterCandidateId: null, canonicalAnchorId: "anchor-1",
    title: "Osmosis", summary: "", exactSourceText: "", sourcePages: [42], citations: [],
    profileId: "default", role: "Core Concept", importance: 50, difficulty: 50,
    parentNodeIds: [], childNodeIds: [], relatedNodeIds: [],
    learningObjectives: [], misconceptions: [], examples: [], applications: [],
    ...overrides,
  };
}

function fixtureProgress(overrides: Partial<KnowledgeNodeProgress> = {}): KnowledgeNodeProgress {
  return {
    nodeId: "kn_1", documentId: "doc-a", pageTruthKey: null,
    understandingScore: 0, recallScore: 0, memoryStrength: 0, masteryScore: 0, confidenceScore: 0,
    lastStudiedAt: null, lastReviewedAt: null, nextReviewAt: null, predictedForgetAt: null,
    exposureCount: 0, successfulRecallCount: 0, failedRecallCount: 0, missCount: 0, correctCount: 0,
    confusionNodeIds: [], observedMisconceptions: [], evidence: [], whiteboardSnapshotIds: [], datPerformance: null,
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

describe("computeBookProgressSummary", () => {
  it("returns an all-empty summary for a book with no data anywhere, without throwing", async () => {
    mockGetReadingProgress.mockResolvedValue(null);
    mockGetNotesByBookAsync.mockResolvedValue([]);
    mockGetNodesByBook.mockResolvedValue([]);

    const summary = await computeBookProgressSummary("book-a");

    expect(summary).toEqual({
      furthestPageReached: null,
      notesCount: 0,
      conceptsEncountered: 0,
      dueForRecallCount: 0,
      weakConceptsCount: 0,
    });
    expect(mockGetProgressForNodes).not.toHaveBeenCalled();
  });

  it("returns EMPTY_SUMMARY-shaped output for an empty bookId, without calling any store", async () => {
    const summary = await computeBookProgressSummary("");
    expect(summary.furthestPageReached).toBeNull();
    expect(mockGetReadingProgress).not.toHaveBeenCalled();
  });

  it("REQUIRED: reports furthestPageReached from readingProgressStore, not the write-once Firestore field", async () => {
    mockGetReadingProgress.mockResolvedValue({ bookId: "book-a", furthestPageReached: 88, lastPageRead: 80, dailyMaxPage: [], updatedAt: "2026-06-01T00:00:00.000Z" });
    mockGetNotesByBookAsync.mockResolvedValue([]);
    mockGetNodesByBook.mockResolvedValue([]);

    const summary = await computeBookProgressSummary("book-a");
    expect(summary.furthestPageReached).toBe(88);
  });

  it("REQUIRED: counts concepts encountered, due-for-recall, and weak concepts from real KnowledgeNodeProgress data", async () => {
    const dueNode = fixtureNode({ id: "kn_due" });
    const weakNode = fixtureNode({ id: "kn_weak" });
    const healthyNode = fixtureNode({ id: "kn_ok" });
    mockGetReadingProgress.mockResolvedValue(null);
    mockGetNotesByBookAsync.mockResolvedValue([]);
    mockGetNodesByBook.mockResolvedValue([dueNode, weakNode, healthyNode]);
    mockGetProgressForNodes.mockResolvedValue(new Map<string, KnowledgeNodeProgress>([
      ["kn_due", fixtureProgress({ nodeId: "kn_due", nextReviewAt: "2020-01-01T00:00:00.000Z" })],
      ["kn_weak", fixtureProgress({ nodeId: "kn_weak", recallScore: 20, successfulRecallCount: 0, failedRecallCount: 4 })],
      ["kn_ok", fixtureProgress({ nodeId: "kn_ok", recallScore: 90, successfulRecallCount: 5, failedRecallCount: 0 })],
    ]));

    const summary = await computeBookProgressSummary("book-a");

    expect(summary.conceptsEncountered).toBe(3);
    expect(summary.dueForRecallCount).toBe(1);
    expect(summary.weakConceptsCount).toBe(1);
    expect(mockGetProgressForNodes).toHaveBeenCalledWith(["kn_due", "kn_weak", "kn_ok"]);
  });

  it("counts notes from getNotesByBookAsync", async () => {
    mockGetReadingProgress.mockResolvedValue(null);
    mockGetNotesByBookAsync.mockResolvedValue([{ id: "n1" }, { id: "n2" }] as UltraNote[]);
    mockGetNodesByBook.mockResolvedValue([]);

    const summary = await computeBookProgressSummary("book-a");
    expect(summary.notesCount).toBe(2);
  });

  it("degrades to the empty summary rather than throwing when a store rejects", async () => {
    mockGetReadingProgress.mockRejectedValue(new Error("idb unavailable"));
    mockGetNotesByBookAsync.mockRejectedValue(new Error("idb unavailable"));
    mockGetNodesByBook.mockRejectedValue(new Error("idb unavailable"));

    await expect(computeBookProgressSummary("book-a")).resolves.toEqual({
      furthestPageReached: null,
      notesCount: 0,
      conceptsEncountered: 0,
      dueForRecallCount: 0,
      weakConceptsCount: 0,
    });
  });
});
