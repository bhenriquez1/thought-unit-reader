// tests/datApex/datLearningStateDocumentIdentity.test.ts
// P0 fix — recordDatQuestionAnswered used to key its Learning State write on
// question.sourceBookId (a filename). recordLearningEvent's `documentId`
// argument is an OWNERSHIP GUARD (lib/knowledge/recordLearningEvent.ts):
// it only reuses existing progress when existing.documentId === documentId,
// and KnowledgeNodeProgress.documentId is stamped from the RESOLVED
// identity, never the filename. So any node that already had progress from
// Whiteboard/Recall (written under the real id) had that progress silently
// discarded on the next TestLab write.
//
// This is a REAL behavioral test — recordLearningEvent is mocked so the
// actual argument it's called with can be asserted directly, proving the
// fix passes the resolved id, not the filename.

jest.mock("@/lib/knowledge/recordLearningEvent", () => ({
  recordLearningEvent: jest.fn().mockResolvedValue(undefined),
}));

import { recordDatQuestionAnswered, recordDatAttemptLearningState } from "@/lib/datApex/datLearningState";
import { recordLearningEvent } from "@/lib/knowledge/recordLearningEvent";
import type { DATQuestion } from "@/types/apex-exam";

const mockRecordLearningEvent = recordLearningEvent as jest.Mock;

const FILENAME_BOOK_ID = "campbell-biology";
const RESOLVED_DOCUMENT_ID = "doc-uuid-9f3a1b";

function fixtureQuestion(overrides: Partial<DATQuestion> = {}): DATQuestion {
  return {
    id: "q1",
    sectionId: "biology",
    topic: "Biology",
    difficulty: "medium",
    questionType: "multiple-choice",
    stem: "stem",
    options: { A: "a", B: "b", C: "c", D: "d" },
    correctAnswer: "A",
    explanation: "because",
    keyTerms: [],
    relatedConcepts: [],
    estimatedTime: 90,
    tags: [],
    lastUpdated: new Date(0).toISOString(),
    sourceBookId: FILENAME_BOOK_ID,
    sourceKnowledgeNodeIds: ["kn_1"],
    sourceDocumentId: RESOLVED_DOCUMENT_ID,
    ...overrides,
  } as DATQuestion;
}

beforeEach(() => jest.clearAllMocks());

describe("recordDatQuestionAnswered — documentId identity", () => {
  it("REQUIRED: calls recordLearningEvent with sourceDocumentId (the resolved id), never sourceBookId (a filename)", async () => {
    const q = fixtureQuestion();
    await recordDatQuestionAnswered(q, true, "2026-01-01T00:00:00.000Z");

    expect(mockRecordLearningEvent).toHaveBeenCalledTimes(1);
    const [nodeId, documentId] = mockRecordLearningEvent.mock.calls[0];
    expect(nodeId).toBe("kn_1");
    expect(documentId).toBe(RESOLVED_DOCUMENT_ID);
    expect(documentId).not.toBe(FILENAME_BOOK_ID);
  });

  it("REQUIRED: skips the write entirely (never falls back to sourceBookId) when sourceDocumentId is missing — wrong-id-space write is worse than no write", async () => {
    const q = fixtureQuestion({ sourceDocumentId: undefined });
    await recordDatQuestionAnswered(q, true, "2026-01-01T00:00:00.000Z");
    expect(mockRecordLearningEvent).not.toHaveBeenCalled();
  });

  it("fires one event per node when a question resolves multiple Knowledge Graph nodes, all under the same resolved documentId", async () => {
    const q = fixtureQuestion({ sourceKnowledgeNodeIds: ["kn_1", "kn_2"] });
    await recordDatQuestionAnswered(q, false, "2026-01-01T00:00:00.000Z");

    expect(mockRecordLearningEvent).toHaveBeenCalledTimes(2);
    for (const call of mockRecordLearningEvent.mock.calls) {
      expect(call[1]).toBe(RESOLVED_DOCUMENT_ID);
    }
  });
});

describe("recordDatAttemptLearningState — end-to-end through a full attempt", () => {
  it("REQUIRED: every write in a submitted attempt uses each question's own resolved documentId, not the book's filename", async () => {
    const questions = [
      fixtureQuestion({ id: "q1", sourceKnowledgeNodeIds: ["kn_1"], sourceDocumentId: "doc-a" }),
      fixtureQuestion({ id: "q2", sourceKnowledgeNodeIds: ["kn_2"], sourceDocumentId: "doc-b" }),
    ];
    const responses = [
      { questionId: "q1", selectedChoiceId: "A" },
      { questionId: "q2", selectedChoiceId: "B" },
    ];

    const summary = await recordDatAttemptLearningState(questions, responses, "2026-01-01T00:00:00.000Z");

    expect(summary).toEqual({ written: 2, failed: 0 });
    const documentIds = mockRecordLearningEvent.mock.calls.map((c) => c[1]);
    expect(documentIds.sort()).toEqual(["doc-a", "doc-b"]);
  });
});
