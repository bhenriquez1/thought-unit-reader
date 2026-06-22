import { buildUnitPlan } from "@/lib/studyplan/buildUnitPlan";
import { computeChapterProgress, type ChapterLike } from "@/lib/syllabus/chapterProgress";
import type { RecallSet } from "@/lib/recalllab/recallStore";

function makeChapter(overrides: Partial<ChapterLike> = {}): ChapterLike {
  return {
    id: "ch-1",
    title: "Chapter 1",
    pageRanges: [{ start: 1, end: 5 }],
    ...overrides,
  };
}

describe("buildUnitPlan", () => {
  it("creates one daily block per chapter, in page order, plus a trailing review block", () => {
    const ch1 = makeChapter({ id: "ch-1", title: "Chapter 1", pageRanges: [{ start: 6, end: 10 }] });
    const ch2 = makeChapter({ id: "ch-2", title: "Chapter 2", pageRanges: [{ start: 1, end: 5 }] });
    const entries = [
      { chapter: ch1, progress: computeChapterProgress(ch1, { visitedPages: new Set(), recallSets: [], notes: [], studyGuides: [] }) },
      { chapter: ch2, progress: computeChapterProgress(ch2, { visitedPages: new Set(), recallSets: [], notes: [], studyGuides: [] }) },
    ];

    const plan = buildUnitPlan("book-1", entries, { visitedPages: new Set(), notes: [], recallSets: [], studyGuides: [] });

    expect(plan.blocks).toHaveLength(3);
    // ch2 starts on page 1, so it should come first despite being passed second.
    expect(plan.blocks[0].title).toBe("Day 1 — Chapter 2");
    expect(plan.blocks[1].title).toBe("Day 2 — Chapter 1");
    expect(plan.blocks[2].title).toBe("Weekly Review");
    expect(plan.title).toBe("Chapter 2 → Chapter 1");
  });

  it("lists every weak/needs-review chapter by name in the review block", () => {
    const ch1 = makeChapter({ id: "ch-1", title: "Weak Chapter", pageRanges: [{ start: 1, end: 2 }] });
    const recallSets: RecallSet[] = [
      {
        id: "rs-1", bookId: "book-1", pageNumber: 1, subject: "General Notes", topic: "X", createdAt: Date.now(),
        cards: [
          { id: "c1", type: "concept", front: "Q1", back: "A1", reviewCount: 1, isMissed: true, difficulty: "hard" },
          { id: "c2", type: "concept", front: "Q2", back: "A2", reviewCount: 1, isMissed: true, difficulty: "hard" },
        ],
      },
    ];
    const progress = computeChapterProgress(ch1, { visitedPages: new Set([1, 2]), recallSets, notes: [], studyGuides: [] });
    expect(progress.status).toBe("weak_area");

    const plan = buildUnitPlan("book-1", [{ chapter: ch1, progress }], { visitedPages: new Set([1, 2]), notes: [], recallSets, studyGuides: [] });

    const reviewBlock = plan.blocks[plan.blocks.length - 1];
    expect(reviewBlock.actions.some((a) => a.label.includes("Weak Chapter"))) .toBe(true);
  });

  it("falls back to a generic mixed-practice review action when no chapter is weak", () => {
    const ch1 = makeChapter({ id: "ch-1", title: "Chapter 1" });
    const progress = computeChapterProgress(ch1, { visitedPages: new Set(), recallSets: [], notes: [], studyGuides: [] });

    const plan = buildUnitPlan("book-1", [{ chapter: ch1, progress }], { visitedPages: new Set(), notes: [], recallSets: [], studyGuides: [] });

    const reviewBlock = plan.blocks[plan.blocks.length - 1];
    expect(reviewBlock.actions).toHaveLength(1);
    expect(reviewBlock.actions[0].label).toContain("mixed practice");
  });

  it("carries unit-level aggregate %s computed across the selected chapters only", () => {
    const ch1 = makeChapter({ id: "ch-1", pageRanges: [{ start: 1, end: 2 }] });
    const ch2 = makeChapter({ id: "ch-2", title: "Chapter 2", pageRanges: [{ start: 3, end: 4 }] });
    const p1 = computeChapterProgress(ch1, { visitedPages: new Set([1, 2]), recallSets: [], notes: [], studyGuides: [] });
    const p2 = computeChapterProgress(ch2, { visitedPages: new Set(), recallSets: [], notes: [], studyGuides: [] });

    const plan = buildUnitPlan("book-1", [{ chapter: ch1, progress: p1 }, { chapter: ch2, progress: p2 }], {
      visitedPages: new Set([1, 2]),
      notes: [],
      recallSets: [],
      studyGuides: [],
    });

    expect(plan.unitReadPct).toBe(Math.round((p1.readPct + p2.readPct) / 2));
  });
});
