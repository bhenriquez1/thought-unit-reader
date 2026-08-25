// tests/recalllab/recall2LearningStateSignals.test.ts
// C3 (Phase 0 audit) — real behavioral test for fetchRecallWeaknessSignals,
// the thin bridge from Recall blueprints to the shared Learning State
// Engine. Confirms it reads directly off KnowledgeNodeProgress (no second
// mastery computation), dedupes lookups by node id, and degrades to "no
// signal" rather than throwing when a lookup fails or finds nothing.

jest.mock("@/lib/knowledge/knowledgeGraphStore", () => ({ getNodeProgress: jest.fn() }));

import { fetchRecallWeaknessSignals } from "@/lib/recalllab/recall2LearningStateSignals";
import { getNodeProgress } from "@/lib/knowledge/knowledgeGraphStore";
import type { RecallBlueprint } from "@/lib/recalllab/recall2Types";
import type { KnowledgeNodeProgress } from "@/lib/knowledge/knowledgeGraphSchema";

const mockGetNodeProgress = getNodeProgress as jest.Mock;

function makeBlueprint(id: string, knowledgeNodeId?: string): RecallBlueprint {
  return {
    id, bookId: "book-1", category: "understanding", front: "f", back: "b",
    canonicalHash: `hash-${id}`, interval: 1, easeFactor: 2.5, dueDate: "2099-01-01",
    reviewCount: 0, consecutiveCorrect: 0, confidenceHistory: [],
    knowledgeNodeId,
  };
}

function makeProgress(overrides: Partial<KnowledgeNodeProgress> = {}): KnowledgeNodeProgress {
  return {
    nodeId: "kn-1", documentId: "doc-1", pageTruthKey: null,
    understandingScore: 50, recallScore: 50, memoryStrength: 50, masteryScore: 50, confidenceScore: 50,
    lastStudiedAt: null, lastReviewedAt: null, nextReviewAt: null, predictedForgetAt: null,
    exposureCount: 0, datPerformance: null,
    ...overrides,
  } as KnowledgeNodeProgress;
}

beforeEach(() => jest.clearAllMocks());

describe("fetchRecallWeaknessSignals", () => {
  it("REQUIRED: reads masteryScore and datPerformance straight off KnowledgeNodeProgress, no re-derivation", async () => {
    mockGetNodeProgress.mockResolvedValue(makeProgress({ nodeId: "kn-1", masteryScore: 33, datPerformance: { attempts: 3, correct: 1, lastAttemptedAt: null, averageTimeMs: null } }));

    const signals = await fetchRecallWeaknessSignals([makeBlueprint("bp-1", "kn-1")]);

    expect(signals.get("kn-1")).toEqual({ masteryScore: 33, datPerformance: { attempts: 3, correct: 1 } });
  });

  it("REQUIRED: dedupes by knowledgeNodeId — two cards sharing a node only trigger one lookup", async () => {
    mockGetNodeProgress.mockResolvedValue(makeProgress({ nodeId: "kn-shared" }));

    await fetchRecallWeaknessSignals([
      makeBlueprint("bp-1", "kn-shared"),
      makeBlueprint("bp-2", "kn-shared"),
    ]);

    expect(mockGetNodeProgress).toHaveBeenCalledTimes(1);
  });

  it("cards with no knowledgeNodeId never trigger a lookup", async () => {
    await fetchRecallWeaknessSignals([makeBlueprint("bp-1", undefined)]);
    expect(mockGetNodeProgress).not.toHaveBeenCalled();
  });

  it("REQUIRED: a node with no progress record yet is simply absent from the result, not an error", async () => {
    mockGetNodeProgress.mockResolvedValue(null);
    const signals = await fetchRecallWeaknessSignals([makeBlueprint("bp-1", "kn-never-studied")]);
    expect(signals.has("kn-never-studied")).toBe(false);
  });

  it("REQUIRED: a lookup failure for one node doesn't fail the whole batch or throw", async () => {
    mockGetNodeProgress.mockImplementation(async (nodeId: string) => {
      if (nodeId === "kn-bad") throw new Error("IDB read failed");
      return makeProgress({ nodeId, masteryScore: 70 });
    });

    const signals = await fetchRecallWeaknessSignals([
      makeBlueprint("bp-1", "kn-bad"),
      makeBlueprint("bp-2", "kn-good"),
    ]);

    expect(signals.has("kn-bad")).toBe(false);
    expect(signals.get("kn-good")?.masteryScore).toBe(70);
  });
});
