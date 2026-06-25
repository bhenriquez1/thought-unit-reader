import { computeChapterProgress, computeCourseProgress, buildChaptersFromToc, type ChapterLike } from "@/lib/syllabus/chapterProgress";
import type { TocNode } from "@/lib/readerContracts";
import type { RecallSet } from "@/lib/recalllab/recallStore";
import type { UltraNote } from "@/lib/notelab/ultraNoteStore";
import type { StudyGuideRecord } from "@/lib/studyguide/types";

function makeTopic(overrides: Partial<ChapterLike> = {}): ChapterLike {
  return {
    id: "topic-1",
    title: "Chapter 1: Cell Structure",
    pageRanges: [{ start: 1, end: 10 }],
    ...overrides,
  };
}

describe("computeChapterProgress", () => {
  it("returns all-zero progress with not_started status when nothing has happened", () => {
    const topic = makeTopic();
    const progress = computeChapterProgress(topic, {
      visitedPages: new Set(),
      recallSets: [],
      notes: [],
      studyGuides: [],
    });

    expect(progress.readPct).toBe(0);
    expect(progress.understandPct).toBe(0);
    expect(progress.recallPct).toBe(0);
    expect(progress.masteryPct).toBe(0);
    expect(progress.status).toBe("not_started");
  });

  it("computes readPct from visited pages within the chapter's page range only", () => {
    const topic = makeTopic({ pageRanges: [{ start: 1, end: 10 }] });
    const progress = computeChapterProgress(topic, {
      visitedPages: new Set([1, 2, 3, 4, 5, 99]), // page 99 is outside the range
      recallSets: [],
      notes: [],
      studyGuides: [],
    });

    expect(progress.visitedPageCount).toBe(5);
    expect(progress.readPct).toBe(50); // 5 of 10 pages
  });

  it("computes recallPct from card review state, weighting unreviewed cards as 0", () => {
    const topic = makeTopic({ pageRanges: [{ start: 1, end: 5 }] });
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

    const progress = computeChapterProgress(topic, {
      visitedPages: new Set([1, 2]),
      recallSets,
      notes: [],
      studyGuides: [],
    });

    expect(progress.recallCardCount).toBe(2);
    expect(progress.recallReviewedCount).toBe(1);
    expect(progress.recallPct).toBe(50); // (100 + 0) / 2
  });

  it("ignores recall sets and notes from pages outside the chapter's range", () => {
    const topic = makeTopic({ pageRanges: [{ start: 1, end: 5 }] });
    const recallSets: RecallSet[] = [
      {
        id: "rs-1",
        bookId: "book-1",
        pageNumber: 50, // outside range
        subject: "General Notes",
        topic: "Unrelated",
        createdAt: Date.now(),
        cards: [{ id: "c1", type: "concept", front: "Q", back: "A", reviewCount: 5, isMissed: false, difficulty: "easy" }],
      },
    ];
    const notes: UltraNote[] = [
      { id: "n1", bookId: "book-1", pageNumber: 50, topic: "Unrelated", subject: "General Notes" } as UltraNote,
    ];

    const progress = computeChapterProgress(topic, {
      visitedPages: new Set([1]),
      recallSets,
      notes,
      studyGuides: [],
    });

    expect(progress.recallCardCount).toBe(0);
    expect(progress.noteCount).toBe(0);
  });

  it("matches study guides to the chapter by loose title containment", () => {
    const topic = makeTopic({ title: "Cell Structure" });
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

    const progress = computeChapterProgress(topic, {
      visitedPages: new Set(),
      recallSets: [],
      notes: [],
      studyGuides,
    });

    expect(progress.studyGuideCount).toBe(1);
  });

  it("marks a fully-read chapter with poor recall as a weak_area, not mastered", () => {
    const topic = makeTopic({ pageRanges: [{ start: 1, end: 2 }] });
    const recallSets: RecallSet[] = [
      {
        id: "rs-1",
        bookId: "book-1",
        pageNumber: 1,
        subject: "General Notes",
        topic: "X",
        createdAt: Date.now(),
        cards: [
          { id: "c1", type: "concept", front: "Q1", back: "A1", reviewCount: 1, isMissed: true, difficulty: "hard" },
          { id: "c2", type: "concept", front: "Q2", back: "A2", reviewCount: 1, isMissed: true, difficulty: "hard" },
        ],
      },
    ];

    const progress = computeChapterProgress(topic, {
      visitedPages: new Set([1, 2]),
      recallSets,
      notes: [],
      studyGuides: [],
    });

    expect(progress.readPct).toBe(100);
    expect(progress.status).toBe("weak_area");
  });

  it("marks a chapter mastered once mastery crosses the 80% threshold", () => {
    const topic = makeTopic({ pageRanges: [{ start: 1, end: 2 }] });
    const recallSets: RecallSet[] = [
      {
        id: "rs-1",
        bookId: "book-1",
        pageNumber: 1,
        subject: "General Notes",
        topic: "X",
        createdAt: Date.now(),
        cards: [{ id: "c1", type: "concept", front: "Q1", back: "A1", reviewCount: 1, isMissed: false, difficulty: "easy" }],
      },
    ];
    const notes: UltraNote[] = [
      { id: "n1", bookId: "book-1", pageNumber: 1, topic: "X", subject: "General Notes" } as UltraNote,
    ];

    const progress = computeChapterProgress(topic, {
      visitedPages: new Set([1, 2]),
      recallSets,
      notes,
      studyGuides: [],
    });

    expect(progress.masteryPct).toBeGreaterThanOrEqual(80);
    expect(progress.status).toBe("mastered");
  });
});

describe("computeCourseProgress", () => {
  it("aggregates chapter count, completion, and current chapter across the course", () => {
    const topics = [
      makeTopic({ id: "t1", pageRanges: [{ start: 1, end: 2 }] }),
      makeTopic({ id: "t2" }),
      makeTopic({ id: "t3" }),
    ];
    const progressList = [
      computeChapterProgress(topics[0], {
        visitedPages: new Set([1, 2]),
        recallSets: [
          {
            id: "rs-1", bookId: "b", pageNumber: 1, subject: "General Notes", topic: "X", createdAt: Date.now(),
            cards: [{ id: "c1", type: "concept", front: "Q", back: "A", reviewCount: 1, isMissed: false, difficulty: "easy" }],
          },
        ],
        notes: [
          { id: "n1", bookId: "b", pageNumber: 1, topic: "X", subject: "General Notes" } as UltraNote,
          { id: "n2", bookId: "b", pageNumber: 2, topic: "X", subject: "General Notes" } as UltraNote,
        ],
        studyGuides: [],
      }),
      computeChapterProgress(topics[1], { visitedPages: new Set([1]), recallSets: [], notes: [], studyGuides: [] }),
      computeChapterProgress(topics[2], { visitedPages: new Set(), recallSets: [], notes: [], studyGuides: [] }),
    ];

    const course = computeCourseProgress(topics, progressList);

    expect(course.totalChapters).toBe(3);
    expect(course.completedChapters).toBe(1); // topic[0] is mastered
    expect(course.currentChapterId).toBe("t2"); // first non-mastered, non-not_started chapter
    expect(course.remainingChapters).toBe(2);
    expect(course.estimatedRemainingMinutes).toBeGreaterThan(0);
  });

  it("returns zeroed-out progress for an empty topic list", () => {
    const course = computeCourseProgress([], []);
    expect(course.totalChapters).toBe(0);
    expect(course.completedChapters).toBe(0);
    expect(course.currentChapterId).toBeNull();
    expect(course.estimatedRemainingMinutes).toBe(0);
  });
});

describe("buildChaptersFromToc", () => {
  it("derives a page range for each chapter node, ending right before the next chapter", () => {
    const toc: TocNode[] = [
      { id: "c1", title: "Chapter 1", page: 1, kind: "chapter" },
      { id: "s1", title: "1.1 Intro", page: 3, kind: "section" },
      { id: "c2", title: "Chapter 2", page: 11, kind: "chapter" },
      { id: "c3", title: "Chapter 3", page: 25, kind: "chapter" },
    ];

    const chapters = buildChaptersFromToc(toc, 40);

    expect(chapters).toHaveLength(3);
    expect(chapters[0]).toMatchObject({ id: "c1", pageRanges: [{ start: 1, end: 10 }] });
    expect(chapters[1]).toMatchObject({ id: "c2", pageRanges: [{ start: 11, end: 24 }] });
    expect(chapters[2]).toMatchObject({ id: "c3", pageRanges: [{ start: 25, end: 40 }] });
  });

  it("falls back to treating every top-level node as a chapter when none are tagged 'chapter'", () => {
    const toc: TocNode[] = [
      { id: "w1", title: "Week 1", page: 1, kind: "week" },
      { id: "w2", title: "Week 2", page: 8, kind: "week" },
    ];

    const chapters = buildChaptersFromToc(toc, 15);

    expect(chapters).toHaveLength(2);
    expect(chapters[0].pageRanges).toEqual([{ start: 1, end: 7 }]);
    expect(chapters[1].pageRanges).toEqual([{ start: 8, end: 15 }]);
  });

  it("sorts nodes by page before deriving ranges, regardless of input order", () => {
    const toc: TocNode[] = [
      { id: "c2", title: "Chapter 2", page: 11, kind: "chapter" },
      { id: "c1", title: "Chapter 1", page: 1, kind: "chapter" },
    ];

    const chapters = buildChaptersFromToc(toc, 20);

    expect(chapters.map((c) => c.id)).toEqual(["c1", "c2"]);
  });
});
