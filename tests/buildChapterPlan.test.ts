import { buildChapterPlan } from "@/lib/studyplan/buildChapterPlan";
import { computeChapterProgress, type ChapterLike } from "@/lib/syllabus/chapterProgress";
import type { RecallSet } from "@/lib/recalllab/recallStore";
import type { UltraNote } from "@/lib/notelab/ultraNoteStore";
import type { StudyGuideRecord } from "@/lib/studyguide/types";

function makeChapter(overrides: Partial<ChapterLike> = {}): ChapterLike {
  return {
    id: "ch-1",
    title: "Chapter 1: Cell Structure",
    pageRanges: [{ start: 1, end: 10 }],
    ...overrides,
  };
}

describe("buildChapterPlan", () => {
  it("leads with a read_page action pointing at the first unvisited page", () => {
    const chapter = makeChapter();
    const progress = computeChapterProgress(chapter, {
      visitedPages: new Set([1, 2, 3]),
      recallSets: [],
      notes: [],
      studyGuides: [],
    });

    const plan = buildChapterPlan("book-1", chapter, progress, {
      visitedPages: new Set([1, 2, 3]),
      notes: [],
      recallSets: [],
      studyGuides: [],
    });

    expect(plan.blocks).toHaveLength(1);
    const readAction = plan.blocks[0].actions.find((a) => a.type === "read_page");
    expect(readAction?.page).toBe(4);
    expect(readAction?.label).toContain("7 unread");
  });

  it("omits the read_page action once every page in the chapter has been visited", () => {
    const chapter = makeChapter({ pageRanges: [{ start: 1, end: 2 }] });
    const progress = computeChapterProgress(chapter, {
      visitedPages: new Set([1, 2]),
      recallSets: [],
      notes: [],
      studyGuides: [],
    });

    const plan = buildChapterPlan("book-1", chapter, progress, {
      visitedPages: new Set([1, 2]),
      notes: [],
      recallSets: [],
      studyGuides: [],
    });

    expect(plan.blocks[0].actions.some((a) => a.type === "read_page")).toBe(false);
  });

  it("surfaces a review_recall action only when the chapter's recall set has unreviewed or missed cards", () => {
    const chapter = makeChapter({ pageRanges: [{ start: 1, end: 5 }] });
    const recallSets: RecallSet[] = [
      {
        id: "rs-1",
        bookId: "book-1",
        pageNumber: 2,
        subject: "General Notes",
        topic: "Cell Membrane",
        createdAt: Date.now(),
        cards: [
          { id: "c1", type: "concept", front: "Q1", back: "A1", reviewCount: 1, isMissed: false, difficulty: "easy" },
          { id: "c2", type: "concept", front: "Q2", back: "A2", reviewCount: 0, isMissed: false },
        ],
      },
    ];
    const progress = computeChapterProgress(chapter, {
      visitedPages: new Set([1, 2]),
      recallSets,
      notes: [],
      studyGuides: [],
    });

    const plan = buildChapterPlan("book-1", chapter, progress, {
      visitedPages: new Set([1, 2]),
      notes: [],
      recallSets,
      studyGuides: [],
    });

    const recallAction = plan.blocks[0].actions.find((a) => a.type === "review_recall");
    expect(recallAction?.label).toContain("1 card");
    expect(recallAction?.refId).toBe("rs-1");
  });

  it("matches a study guide to the chapter by loose title containment and links it", () => {
    const chapter = makeChapter({ title: "Cell Structure" });
    const progress = computeChapterProgress(chapter, {
      visitedPages: new Set(),
      recallSets: [],
      notes: [],
      studyGuides: [],
    });
    const studyGuides: StudyGuideRecord[] = [
      {
        id: "sg-1",
        bookId: "book-1",
        mode: "highyield",
        sourceLabels: [],
        createdAt: Date.now(),
        chapterTitle: "Chapter 1: Cell Structure",
        topic: "Cell Structure",
        priority: "High",
        mustKnow: [],
        datFacts: [],
        mechanisms: [],
        traps: [],
        recallQuestions: [],
        memoryHooks: [],
        dailyTasks: [],
      },
    ];

    const plan = buildChapterPlan("book-1", chapter, progress, {
      visitedPages: new Set(),
      notes: [],
      recallSets: [],
      studyGuides,
    });

    const guideAction = plan.blocks[0].actions.find((a) => a.type === "review_guide");
    expect(guideAction?.refId).toBe("sg-1");
  });

  it("always ends with a practice action and carries the chapter's progress %s", () => {
    const chapter = makeChapter();
    const notes: UltraNote[] = [
      { id: "n1", bookId: "book-1", pageNumber: 1, topic: "X", subject: "General Notes" } as UltraNote,
    ];
    const progress = computeChapterProgress(chapter, {
      visitedPages: new Set([1, 2]),
      recallSets: [],
      notes,
      studyGuides: [],
    });

    const plan = buildChapterPlan("book-1", chapter, progress, {
      visitedPages: new Set([1, 2]),
      notes,
      recallSets: [],
      studyGuides: [],
    });

    const lastAction = plan.blocks[0].actions[plan.blocks[0].actions.length - 1];
    expect(lastAction.type).toBe("practice");
    expect(plan.readPct).toBe(progress.readPct);
    expect(plan.masteryPct).toBe(progress.masteryPct);
  });
});
