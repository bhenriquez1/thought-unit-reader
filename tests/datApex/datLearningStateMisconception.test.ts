// tests/datApex/datLearningStateMisconception.test.ts
// C7 (Phase 0 audit) — the misconception-observed event kind + reducer
// already existed and were already tested (lib/knowledge/learningStateEvents.ts,
// tests/knowledge/learningStateEvents.test.ts) but nothing in the exam-
// grading path ever fired it. misconceptionTested is generation-time
// metadata (pages/api/exam-question-gen.ts) describing the misconception a
// WRONG answer would reveal — this locks in that a wrong answer now fires
// it, a correct answer never does, and that firing both events for the same
// node applies them sequentially rather than racing two concurrent
// read-modify-write cycles against the same underlying record.
//
// Real behavioral test — recordLearningEvent is mocked so call order/args
// can be asserted directly, same pattern as
// tests/datApex/datLearningStateDocumentIdentity.test.ts.

jest.mock("@/lib/knowledge/recordLearningEvent", () => ({
  recordLearningEvent: jest.fn().mockResolvedValue(undefined),
}));

import { recordDatQuestionAnswered } from "@/lib/datApex/datLearningState";
import { recordLearningEvent } from "@/lib/knowledge/recordLearningEvent";
import type { DATQuestion } from "@/types/apex-exam";

const mockRecordLearningEvent = recordLearningEvent as jest.Mock;

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
    sourceBookId: "campbell-biology",
    sourceKnowledgeNodeIds: ["kn_1"],
    sourceDocumentId: "doc-uuid-9f3a1b",
    ...overrides,
  } as DATQuestion;
}

beforeEach(() => jest.clearAllMocks());

describe("recordDatQuestionAnswered — misconception-observed wiring", () => {
  it("REQUIRED: a wrong answer with misconceptionTested fires both dat-question-answered and misconception-observed, in order", async () => {
    const q = fixtureQuestion({ misconceptionTested: "confuses osmosis with diffusion" });
    await recordDatQuestionAnswered(q, false, "2026-01-01T00:00:00.000Z");

    expect(mockRecordLearningEvent).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = mockRecordLearningEvent.mock.calls;
    expect(firstCall[0]).toBe("kn_1");
    expect(firstCall[2]).toEqual(expect.objectContaining({ kind: "dat-question-answered", correct: false }));
    expect(secondCall[0]).toBe("kn_1");
    expect(secondCall[2]).toEqual(
      expect.objectContaining({ kind: "misconception-observed", misconception: "confuses osmosis with diffusion", sourceId: "q1" }),
    );
  });

  it("REQUIRED: a correct answer never fires misconception-observed, even if misconceptionTested is present — correctness is no evidence of holding the misconception", async () => {
    const q = fixtureQuestion({ misconceptionTested: "confuses osmosis with diffusion" });
    await recordDatQuestionAnswered(q, true, "2026-01-01T00:00:00.000Z");

    expect(mockRecordLearningEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordLearningEvent.mock.calls[0][2]).toEqual(expect.objectContaining({ kind: "dat-question-answered" }));
  });

  it("a wrong answer with no misconceptionTested only fires dat-question-answered — nothing fabricated", async () => {
    const q = fixtureQuestion({ misconceptionTested: undefined });
    await recordDatQuestionAnswered(q, false, "2026-01-01T00:00:00.000Z");

    expect(mockRecordLearningEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordLearningEvent.mock.calls[0][2].kind).toBe("dat-question-answered");
  });

  it("REQUIRED: for a question resolving multiple nodes, both events are applied to EACH node sequentially (not raced) — every node gets its own dat-question-answered before either gets misconception-observed applied out of order", async () => {
    const applyOrder: string[] = [];
    mockRecordLearningEvent.mockImplementation(async (nodeId: string, _docId: string, event: { kind: string }) => {
      applyOrder.push(`${nodeId}:${event.kind}`);
    });
    const q = fixtureQuestion({ sourceKnowledgeNodeIds: ["kn_1", "kn_2"], misconceptionTested: "misreads pH scale" });
    await recordDatQuestionAnswered(q, false, "2026-01-01T00:00:00.000Z");

    expect(mockRecordLearningEvent).toHaveBeenCalledTimes(4);
    // Within each node, dat-question-answered must be applied before
    // misconception-observed (sequential per-node, not Promise.all'd) —
    // two concurrent read-modify-write cycles on the same node would let
    // the second call's save silently clobber the first's update.
    const kn1Order = applyOrder.filter((e) => e.startsWith("kn_1:"));
    const kn2Order = applyOrder.filter((e) => e.startsWith("kn_2:"));
    expect(kn1Order).toEqual(["kn_1:dat-question-answered", "kn_1:misconception-observed"]);
    expect(kn2Order).toEqual(["kn_2:dat-question-answered", "kn_2:misconception-observed"]);
  });
});
