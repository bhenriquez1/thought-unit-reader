// tests/examEngine/examScopeNoLeak.test.ts
// TestLab-Reader progress integration — the core product guarantee: when a
// student picks "Completed material only" (or any other narrowed exam
// scope), buildExam() must never hand back questions sourced from pages
// outside that scope. This is a REAL behavioral test (not source
// inspection) — examBuilder.ts's IDB/AI dependencies are mocked so the
// actual filtering logic runs for real against fixture notes spanning
// both inside and outside the allowed range.
//
// Concretely: a student who has read up through page 100 of a book selects
// "What I've completed" (lib/examEngine/examScope.ts's "completed" scope,
// which resolves to chapterPageRanges [{start:1,end:100}] + strictScope)
// must never receive a question generated from page 200.

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
  getNodesByBookAndPage: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/lib/datApex/canonicalQuestionMapper", () => ({
  canonicalUnitsToDatStubs: jest.fn().mockReturnValue([]),
}));

import { buildExam } from "@/lib/examEngine/examBuilder";
import { getNotesByBookAsync } from "@/lib/notelab/ultraNoteStore";
import { getOrGenerateQuestions } from "@/lib/examEngine/questionGenerator";
import { DAT_EXAM_PROFILE } from "@/lib/examEngine/profiles/datProfile";
import { resolveExamScope } from "@/lib/examEngine/examScope";
import type { EngineQuestion } from "@/lib/examEngine/types";

const mockGetNotes = getNotesByBookAsync as jest.Mock;
const mockGetOrGenerate = getOrGenerateQuestions as jest.Mock;

function fixtureNote(id: string, pageNumber: number) {
  return {
    id,
    bookId: "campbell-biology",
    pageNumber,
    topic: "Biology",
    coreIdea: `Core idea for page ${pageNumber}`,
    concepts: [],
    memoryShortcuts: [],
    subject: "Biology",
    createdAt: Date.now(),
  };
}

/** Fake question generator — echoes back the page it was asked to cover,
 *  so the test can assert on which pages actually made it into the exam. */
function fakeQuestionFor(page: number, sourcePageNumber: number): EngineQuestion {
  return {
    id: `q-${page}`,
    examProfileId: DAT_EXAM_PROFILE.id,
    section: "biology",
    subject: "Biology",
    unit: "unit",
    topic: "Biology",
    concept: "concept",
    difficulty: "simulation",
    questionType: "recognition",
    skillTested: "recall",
    sourceBookId: "campbell-biology",
    sourcePageNumber,
    stem: `Question grounded on page ${sourcePageNumber}`,
    choices: ["A", "B", "C", "D"],
    correctIndex: 0,
    whyCorrect: "because",
    whyWrong: ["", "", "", ""],
    createdAt: new Date(0).toISOString(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetNotes.mockResolvedValue([
    fixtureNote("n-50", 50),
    fixtureNote("n-90", 90),
    fixtureNote("n-200", 200),
  ]);
  mockGetOrGenerate.mockImplementation(async (opts: { sourcePageNumber: number }) => [
    fakeQuestionFor(opts.sourcePageNumber, opts.sourcePageNumber),
  ]);
});

describe("TestLab-Reader progress integration — 'Completed material only' never leaks unread pages", () => {
  it("REQUIRED: a student at page 100 requesting 'Completed material only' never receives page-200 material", async () => {
    const scope = resolveExamScope({
      scope: "completed",
      progress: { bookId: "campbell-biology", furthestPageReached: 100, lastPageRead: 100, dailyMaxPage: [], updatedAt: new Date(0).toISOString() },
    });
    expect(scope.blocked).toBe(false);
    expect(scope.pageRanges).toEqual([{ start: 1, end: 100 }]);

    const built = await buildExam({
      bookId: "campbell-biology",
      profile: DAT_EXAM_PROFILE,
      difficulty: "simulation",
      questionCount: 10,
      chapterPageRanges: scope.pageRanges,
      strictScope: true,
    });

    expect(built.questions.length).toBeGreaterThan(0);
    for (const q of built.questions) {
      expect(q.sourcePageNumber).toBeLessThanOrEqual(100);
    }
    expect(built.questions.some((q) => q.sourcePageNumber === 200)).toBe(false);
  });

  it("REQUIRED: strictScope produces an EMPTY exam (never a silent fallback to the whole book) when the scope matches zero notes", async () => {
    mockGetNotes.mockResolvedValue([fixtureNote("n-200", 200)]); // only unread material exists
    const built = await buildExam({
      bookId: "campbell-biology",
      profile: DAT_EXAM_PROFILE,
      difficulty: "simulation",
      questionCount: 10,
      chapterPageRanges: [{ start: 1, end: 100 }],
      strictScope: true,
    });
    expect(built.questions.length).toBe(0);
    expect(mockGetOrGenerate).not.toHaveBeenCalled();
  });

  it("without strictScope, chapterPageRanges keeps its original lenient behavior (documents the DISTINCT, pre-existing manual-chapter-picker semantics — not the guarantee this suite is about)", async () => {
    mockGetNotes.mockResolvedValue([fixtureNote("n-200", 200)]);
    const built = await buildExam({
      bookId: "campbell-biology",
      profile: DAT_EXAM_PROFILE,
      difficulty: "simulation",
      questionCount: 10,
      chapterPageRanges: [{ start: 1, end: 100 }],
      // strictScope omitted — old lenient fallback applies
    });
    expect(built.questions.length).toBeGreaterThan(0);
    expect(built.questions[0].sourcePageNumber).toBe(200);
  });

  it("'Entire book' scope is the only one allowed to include page 200 — and only when explicitly selected", () => {
    const entire = resolveExamScope({ scope: "entire-book", progress: null });
    expect(entire.pageRanges).toBeUndefined();
    expect(entire.blocked).toBe(false);

    const completedNoProgress = resolveExamScope({ scope: "completed", progress: null });
    expect(completedNoProgress.blocked).toBe(true);
  });

  it("REQUIRED: 'Today's reading' scope also never exceeds today's furthest page", async () => {
    const scope = resolveExamScope({
      scope: "today",
      progress: {
        bookId: "campbell-biology",
        furthestPageReached: 200,
        lastPageRead: 200,
        dailyMaxPage: [{ date: "2026-08-22", maxPage: 90 }],
        updatedAt: "2026-08-22T00:00:00.000Z",
      },
      now: "2026-08-22T12:00:00.000Z",
    });
    expect(scope.pageRanges).toEqual([{ start: 1, end: 90 }]);

    const built = await buildExam({
      bookId: "campbell-biology",
      profile: DAT_EXAM_PROFILE,
      difficulty: "simulation",
      questionCount: 10,
      chapterPageRanges: scope.pageRanges,
      strictScope: true,
    });
    expect(built.questions.every((q) => (q.sourcePageNumber ?? 0) <= 90)).toBe(true);
  });
});
