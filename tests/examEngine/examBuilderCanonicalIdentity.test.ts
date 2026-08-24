// tests/examEngine/examBuilderCanonicalIdentity.test.ts
// P0 fix — examBuilder.ts used to call getCanonicalUnitsByPage(opts.bookId, ...),
// the filename, against an index keyed by the resolved documentId
// (lib/canonical/store.ts's byDocumentPage index). Since pages/index.tsx
// stamps CanonicalThoughtUnit.documentId with the RESOLVED identity (the
// canonicalDocumentId param to startBookProcessing), not the filename
// bookId, this lookup silently returned nothing for any book uploaded
// through the normal Reader flow — sourceThoughtUnitIds was always empty
// and canonicalQuestionMapper's grounded stems never fired.
//
// This is a REAL behavioral test — canonical-store/knowledge-graph
// dependencies are mocked so the actual resolution logic runs for real,
// proving the fix resolves the correct id before the lookup rather than
// just asserting the source text changed.

jest.mock("@/lib/notelab/ultraNoteStore", () => ({
  getNotesByBookAsync: jest.fn(),
}));
jest.mock("@/lib/examEngine/questionGenerator", () => ({
  getOrGenerateQuestions: jest.fn(),
}));
jest.mock("@/lib/canonical/store", () => ({
  getCanonicalUnitsByPage: jest.fn(),
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
import { getCanonicalUnitsByPage } from "@/lib/canonical/store";
import { getNodesByBookAndPage } from "@/lib/knowledge/knowledgeGraphStore";
import { DAT_EXAM_PROFILE } from "@/lib/examEngine/profiles/datProfile";

const mockGetNotes = getNotesByBookAsync as jest.Mock;
const mockGetOrGenerate = getOrGenerateQuestions as jest.Mock;
const mockGetCanonicalUnits = getCanonicalUnitsByPage as jest.Mock;
const mockGetNodes = getNodesByBookAndPage as jest.Mock;

const FILENAME_BOOK_ID = "campbell-biology"; // what TestLab's UI knows the book as
const RESOLVED_DOCUMENT_ID = "doc-uuid-9f3a1b"; // what CanonicalThoughtUnit.documentId actually is

beforeEach(() => {
  jest.clearAllMocks();
  mockGetNotes.mockResolvedValue([
    {
      id: "note-1",
      bookId: FILENAME_BOOK_ID,
      pageNumber: 42,
      topic: "Biology",
      coreIdea: "Core idea",
      concepts: [],
      memoryShortcuts: [],
      subject: "Biology",
      createdAt: Date.now(),
    },
  ]);
  // The Knowledge Graph node for this page carries the REAL resolved
  // documentId — this is the only place examBuilder can learn it from.
  mockGetNodes.mockResolvedValue([
    { id: "kn_1", documentId: RESOLVED_DOCUMENT_ID, bookId: FILENAME_BOOK_ID, sourcePages: [42] },
  ]);
  // The canonical store only ever has units under the RESOLVED id — exactly
  // matching how pages/index.tsx's startBookProcessing actually persists
  // them. A call with the filename must return nothing, proving the old
  // bug's exact failure mode is reproduced here if the fix regresses.
  mockGetCanonicalUnits.mockImplementation(async (documentId: string) => {
    if (documentId === RESOLVED_DOCUMENT_ID) {
      return [{ id: "cu_1", documentId, pageIndex: 41, unitIndex: 0, text: "unit text" }];
    }
    return [];
  });
  mockGetOrGenerate.mockImplementation(async (opts: { sourceThoughtUnitIds?: string[] }) => [{
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
    sourceBookId: FILENAME_BOOK_ID,
    sourcePageNumber: 42,
    sourceThoughtUnitIds: opts.sourceThoughtUnitIds ?? [],
    stem: "stem",
    choices: ["A", "B", "C", "D"],
    correctIndex: 0,
    whyCorrect: "because",
    whyWrong: ["", "", "", ""],
    createdAt: new Date(0).toISOString(),
  }]);
});

describe("examBuilder.ts — canonical-unit lookup resolves the real documentId, not the filename bookId", () => {
  it("REQUIRED: sourceThoughtUnitIds is populated when a Knowledge Graph node resolves the real documentId for that page", async () => {
    const built = await buildExam({
      bookId: FILENAME_BOOK_ID,
      profile: DAT_EXAM_PROFILE,
      difficulty: "simulation",
      questionCount: 10,
    });

    expect(built.questions.length).toBeGreaterThan(0);
    expect(built.questions[0].sourceThoughtUnitIds).toEqual(["cu_1"]);
    // Proves the resolved id, not the filename, was actually used.
    expect(mockGetCanonicalUnits).toHaveBeenCalledWith(RESOLVED_DOCUMENT_ID, 41);
    expect(mockGetCanonicalUnits).not.toHaveBeenCalledWith(FILENAME_BOOK_ID, expect.anything());
  });

  it("falls back to bookId (and legitimately finds nothing) when no Knowledge Graph node exists yet for that page", async () => {
    mockGetNodes.mockResolvedValue([]); // page was never actually read in Reader
    const built = await buildExam({
      bookId: FILENAME_BOOK_ID,
      profile: DAT_EXAM_PROFILE,
      difficulty: "simulation",
      questionCount: 10,
    });

    expect(mockGetCanonicalUnits).toHaveBeenCalledWith(FILENAME_BOOK_ID, 41);
    expect(built.questions[0].sourceThoughtUnitIds).toEqual([]);
  });

  it("the Knowledge Graph node lookup itself still queries by bookId — unaffected by this fix, that half was already correct", async () => {
    await buildExam({
      bookId: FILENAME_BOOK_ID,
      profile: DAT_EXAM_PROFILE,
      difficulty: "simulation",
      questionCount: 10,
    });
    expect(mockGetNodes).toHaveBeenCalledWith(FILENAME_BOOK_ID, 42);
  });
});
