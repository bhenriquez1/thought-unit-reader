// tests/examEngine/questionCacheProvenanceBackfill.test.ts
// P1 fix — flagged by automated review on #665 (unresolved discussion on
// lib/examEngine/questionGenerator.ts:134, posted just after merge).
//
// A question cached before sourceKnowledgeNodeIds/sourceDocumentId existed
// — or cached from a call where examBuilder had no Knowledge Graph node
// yet for that page — permanently lacked those fields, because a cache
// hit used to return the stored object unmodified.
// lib/datApex/datLearningState.ts's recordDatQuestionAnswered deliberately
// SKIPS its learning-state write when sourceDocumentId is missing (a
// wrong-id-space write is worse than no write), so a stale cached question
// silently never recorded progress, forever — even once examBuilder had a
// real documentId to offer on every later call for that same concept.
//
// This is a REAL behavioral test — IDB/fetch dependencies are mocked so
// the actual applyProvenance backfill logic runs for real.

jest.mock("@/lib/canonical/store", () => ({
  linkQuestionToUnit: jest.fn().mockResolvedValue(undefined),
}));

import { applyProvenance, getOrGenerateQuestions } from "@/lib/examEngine/questionGenerator";
import type { EngineQuestion } from "@/lib/examEngine/types";

function baseQuestion(overrides: Partial<EngineQuestion> = {}): EngineQuestion {
  return {
    id: "q1",
    examProfileId: "dat",
    section: "biology",
    subject: "Biology",
    unit: "unit",
    topic: "Biology",
    concept: "concept",
    difficulty: "simulation",
    questionType: "recognition",
    skillTested: "recall",
    sourceBookId: "book-1",
    sourcePageNumber: 10,
    stem: "stem",
    choices: ["A", "B", "C", "D"],
    correctIndex: 0,
    whyCorrect: "because",
    whyWrong: ["", "", "", ""],
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe("applyProvenance", () => {
  it("REQUIRED: fills in sourceDocumentId when the cached question predates it, using the current call's value", () => {
    const stale = baseQuestion({ sourceDocumentId: undefined, sourceKnowledgeNodeIds: undefined });
    const result = applyProvenance(stale, { sourceDocumentId: "doc-real", sourceKnowledgeNodeIds: ["kn_1"] });
    expect(result.sourceDocumentId).toBe("doc-real");
    expect(result.sourceKnowledgeNodeIds).toEqual(["kn_1"]);
  });

  it("does not overwrite a good cached value with an empty/missing current value", () => {
    const good = baseQuestion({ sourceDocumentId: "doc-original", sourceKnowledgeNodeIds: ["kn_original"] });
    const result = applyProvenance(good, { sourceDocumentId: undefined, sourceKnowledgeNodeIds: [] });
    expect(result.sourceDocumentId).toBe("doc-original");
    expect(result.sourceKnowledgeNodeIds).toEqual(["kn_original"]);
  });

  it("prefers the current call's non-empty value over a stale cached one — the page's provenance can legitimately change (e.g. a re-upload resolves a new documentId)", () => {
    const stale = baseQuestion({ sourceDocumentId: "doc-old", sourceKnowledgeNodeIds: ["kn_old"] });
    const result = applyProvenance(stale, { sourceDocumentId: "doc-new", sourceKnowledgeNodeIds: ["kn_new"] });
    expect(result.sourceDocumentId).toBe("doc-new");
    expect(result.sourceKnowledgeNodeIds).toEqual(["kn_new"]);
  });

  it("does not mutate the input question", () => {
    const stale = baseQuestion({ sourceDocumentId: undefined });
    applyProvenance(stale, { sourceDocumentId: "doc-real" });
    expect(stale.sourceDocumentId).toBeUndefined();
  });
});

describe("getOrGenerateQuestions — cache-hit path re-stamps provenance instead of returning stale objects as-is", () => {
  const originalIndexedDB = (global as unknown as { indexedDB?: unknown }).indexedDB;

  afterEach(() => {
    (global as unknown as { indexedDB?: unknown }).indexedDB = originalIndexedDB;
  });

  it("REQUIRED: a full cache hit (no fetch needed) still backfills sourceDocumentId from the current opts", async () => {
    const stored = [baseQuestion({ id: "cached-1", sourceDocumentId: undefined, sourceKnowledgeNodeIds: undefined })];
    const store = new Map<string, unknown>();
    store.set("dat::book-1::concept-1::recognition::simulation", { questions: stored });

    (global as unknown as { indexedDB: unknown }).indexedDB = {
      open: () => {
        const req: Record<string, unknown> = {};
        setTimeout(() => {
          req.result = {
            transaction: () => ({
              objectStore: () => ({
                get: (key: string) => {
                  const getReq: Record<string, unknown> = { result: store.get(key) };
                  setTimeout(() => (getReq.onsuccess as () => void)?.(), 0);
                  return getReq;
                },
              }),
            }),
            objectStoreNames: { contains: () => true },
          };
          (req.onsuccess as () => void)?.();
        }, 0);
        return req;
      },
    };

    const result = await getOrGenerateQuestions({
      examProfileId: "dat",
      bookId: "book-1",
      conceptId: "concept-1",
      conceptText: "text",
      questionType: "recognition",
      difficulty: "simulation",
      count: 1,
      sourceDocumentId: "doc-real",
      sourceKnowledgeNodeIds: ["kn_1"],
    });

    expect(result).toHaveLength(1);
    expect(result[0].sourceDocumentId).toBe("doc-real");
    expect(result[0].sourceKnowledgeNodeIds).toEqual(["kn_1"]);
  });
});
