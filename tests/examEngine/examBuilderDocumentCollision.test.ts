// tests/examEngine/examBuilderDocumentCollision.test.ts
// P1 fix — flagged by automated review on #664/#665. examBuilder.ts's
// per-page Knowledge Graph node lookup (getNodesByBookAndPage) is scoped
// to the filename-derived bookId, which multiple *different* documentIds
// can share (a re-upload, or two PDFs that happen to have the same
// filename). The old code took nodes[0]'s documentId arbitrarily and
// stamped EVERY node's id (across all colliding documents) as belonging
// to that one document — misattributing learning-state writes to a
// document the student never actually answered a question about.
//
// This is a REAL behavioral test — dependencies are mocked so the actual
// pickDominantDocumentNodes resolution logic runs for real.

jest.mock("@/lib/notelab/ultraNoteStore", () => ({
  getNotesByBookAsync: jest.fn(),
}));
jest.mock("@/lib/examEngine/questionGenerator", () => ({
  getOrGenerateQuestions: jest.fn(),
}));
jest.mock("@/lib/canonical/store", () => ({
  getCanonicalUnitsByPage: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/lib/knowledge/knowledgeGraphStore", () => ({
  getNodesByBookAndPage: jest.fn(),
}));
jest.mock("@/lib/datApex/canonicalQuestionMapper", () => ({
  canonicalUnitsToDatStubs: jest.fn().mockReturnValue([]),
}));

import { buildExam } from "@/lib/examEngine/examBuilder";
import { getNotesByBookAsync } from "@/lib/notelab/ultraNoteStore";
import { getOrGenerateQuestions } from "@/lib/examEngine/questionGenerator";
import { getNodesByBookAndPage } from "@/lib/knowledge/knowledgeGraphStore";
import { DAT_EXAM_PROFILE } from "@/lib/examEngine/profiles/datProfile";

const mockGetNotes = getNotesByBookAsync as jest.Mock;
const mockGetOrGenerate = getOrGenerateQuestions as jest.Mock;
const mockGetNodes = getNodesByBookAndPage as jest.Mock;

const SHARED_BOOK_ID = "biology-notes"; // same filename-derived bookId for both uploads
const DOCUMENT_A = "doc-uuid-aaa"; // the re-upload with fewer nodes on this page
const DOCUMENT_B = "doc-uuid-bbb"; // the document the student actually has open — more nodes

beforeEach(() => {
  jest.clearAllMocks();
  mockGetNotes.mockResolvedValue([
    { id: "note-1", bookId: SHARED_BOOK_ID, pageNumber: 10, topic: "Biology", coreIdea: "x", concepts: [], memoryShortcuts: [], subject: "Biology", createdAt: Date.now() },
  ]);
  mockGetOrGenerate.mockImplementation(async (opts: { sourceKnowledgeNodeIds?: string[]; sourceDocumentId?: string }) => [{
    id: "q1",
    examProfileId: DAT_EXAM_PROFILE.id,
    section: "biology",
    subject: "Biology",
    unit: "unit",
    topic: "Biology",
    concept: "concept",
    difficulty: "simulation",
    questionType: "recognition",
    skillTested: "recall",
    sourceBookId: SHARED_BOOK_ID,
    sourcePageNumber: 10,
    sourceThoughtUnitIds: [],
    sourceKnowledgeNodeIds: opts.sourceKnowledgeNodeIds ?? [],
    sourceDocumentId: opts.sourceDocumentId,
    stem: "stem",
    choices: ["A", "B", "C", "D"],
    correctIndex: 0,
    whyCorrect: "because",
    whyWrong: ["", "", "", ""],
    createdAt: new Date(0).toISOString(),
  }]);
});

describe("examBuilder.ts — two documents sharing a filename-derived bookId", () => {
  it("REQUIRED: picks the document with the most nodes on this page, not whichever node happened to come first", async () => {
    // Document A's node happens to be first in the array; document B has
    // more nodes for this page and is the one that should win.
    mockGetNodes.mockResolvedValue([
      { id: "kn_a1", documentId: DOCUMENT_A, bookId: SHARED_BOOK_ID, sourcePages: [10] },
      { id: "kn_b1", documentId: DOCUMENT_B, bookId: SHARED_BOOK_ID, sourcePages: [10] },
      { id: "kn_b2", documentId: DOCUMENT_B, bookId: SHARED_BOOK_ID, sourcePages: [10] },
    ]);

    const built = await buildExam({
      bookId: SHARED_BOOK_ID,
      profile: DAT_EXAM_PROFILE,
      difficulty: "simulation",
      questionCount: 10,
    });

    expect(built.questions[0].sourceDocumentId).toBe(DOCUMENT_B);
  });

  it("REQUIRED: sourceKnowledgeNodeIds only ever contains node ids from the chosen document — never a mix across colliding documents", async () => {
    mockGetNodes.mockResolvedValue([
      { id: "kn_a1", documentId: DOCUMENT_A, bookId: SHARED_BOOK_ID, sourcePages: [10] },
      { id: "kn_b1", documentId: DOCUMENT_B, bookId: SHARED_BOOK_ID, sourcePages: [10] },
      { id: "kn_b2", documentId: DOCUMENT_B, bookId: SHARED_BOOK_ID, sourcePages: [10] },
    ]);

    const built = await buildExam({
      bookId: SHARED_BOOK_ID,
      profile: DAT_EXAM_PROFILE,
      difficulty: "simulation",
      questionCount: 10,
    });

    expect(built.questions[0].sourceKnowledgeNodeIds).toEqual(["kn_b1", "kn_b2"]);
    expect(built.questions[0].sourceKnowledgeNodeIds).not.toContain("kn_a1");
  });

  it("when only one document has ever created nodes for this page, behavior is unchanged (the single-document case is unaffected)", async () => {
    mockGetNodes.mockResolvedValue([
      { id: "kn_1", documentId: DOCUMENT_A, bookId: SHARED_BOOK_ID, sourcePages: [10] },
    ]);

    const built = await buildExam({
      bookId: SHARED_BOOK_ID,
      profile: DAT_EXAM_PROFILE,
      difficulty: "simulation",
      questionCount: 10,
    });

    expect(built.questions[0].sourceDocumentId).toBe(DOCUMENT_A);
    expect(built.questions[0].sourceKnowledgeNodeIds).toEqual(["kn_1"]);
  });

  it("no nodes for this page at all — sourceDocumentId and sourceKnowledgeNodeIds stay empty, not a guess", async () => {
    mockGetNodes.mockResolvedValue([]);

    const built = await buildExam({
      bookId: SHARED_BOOK_ID,
      profile: DAT_EXAM_PROFILE,
      difficulty: "simulation",
      questionCount: 10,
    });

    expect(built.questions[0].sourceDocumentId).toBeUndefined();
    expect(built.questions[0].sourceKnowledgeNodeIds).toEqual([]);
  });
});
