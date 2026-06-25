import { buildExamPlan } from "@/lib/studyplan/buildExamPlan";
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

describe("buildExamPlan", () => {
  it("orders blocks weakest-mastery-first regardless of input order", () => {
    const strong = makeChapter({ id: "ch-strong", title: "Strong Chapter", pageRanges: [{ start: 1, end: 2 }] });
    const weak = makeChapter({ id: "ch-weak", title: "Weak Chapter", pageRanges: [{ start: 3, end: 4 }] });

    const recallSets: RecallSet[] = [
      {
        id: "rs-1", bookId: "book-1", pageNumber: 1, subject: "General Notes", topic: "X", createdAt: Date.now(),
        cards: [{ id: "c1", type: "concept", front: "Q", back: "A", reviewCount: 3, isMissed: false, difficulty: "easy" }],
      },
    ];

    const strongProgress = computeChapterProgress(strong, { visitedPages: new Set([1, 2]), recallSets, notes: [], studyGuides: [] });
    const weakProgress = computeChapterProgress(weak, { visitedPages: new Set(), recallSets: [], notes: [], studyGuides: [] });

    // Pass strong first, weak second — output should flip them.
    const plan = buildExamPlan("book-1", "midterm", [
      { chapter: strong, progress: strongProgress },
      { chapter: weak, progress: weakProgress },
    ], { visitedPages: new Set([1, 2]), notes: [], recallSets, studyGuides: [] });

    expect(plan.blocks).toHaveLength(2);
    expect(plan.blocks[0].title).toContain("Weak Chapter");
    expect(plan.blocks[1].title).toContain("Strong Chapter");
  });

  it("labels weak and strong chapters by mastery thresholds", () => {
    const weak = makeChapter({ id: "ch-weak", title: "Weak Chapter", pageRanges: [{ start: 1, end: 2 }] });
    const weakProgress = computeChapterProgress(weak, { visitedPages: new Set(), recallSets: [], notes: [], studyGuides: [] });

    const plan = buildExamPlan("book-1", "final", [{ chapter: weak, progress: weakProgress }], {
      visitedPages: new Set(), notes: [], recallSets: [], studyGuides: [],
    });

    expect(plan.weakChapterTitles).toContain("Weak Chapter");
    expect(plan.strongChapterTitles).not.toContain("Weak Chapter");
  });

  it("titles the plan by kind and chapter count", () => {
    const ch1 = makeChapter({ id: "ch-1" });
    const progress = computeChapterProgress(ch1, { visitedPages: new Set(), recallSets: [], notes: [], studyGuides: [] });

    const midterm = buildExamPlan("book-1", "midterm", [{ chapter: ch1, progress }], { visitedPages: new Set(), notes: [], recallSets: [], studyGuides: [] });
    const final = buildExamPlan("book-1", "final", [{ chapter: ch1, progress }], { visitedPages: new Set(), notes: [], recallSets: [], studyGuides: [] });

    expect(midterm.title).toBe("Midterm Review — 1 Chapter");
    expect(final.title).toBe("Final Exam Review — 1 Chapter");
  });

  it("carries exam-level aggregate %s computed across the selected chapters only", () => {
    const ch1 = makeChapter({ id: "ch-1", pageRanges: [{ start: 1, end: 2 }] });
    const ch2 = makeChapter({ id: "ch-2", title: "Chapter 2", pageRanges: [{ start: 3, end: 4 }] });
    const p1 = computeChapterProgress(ch1, { visitedPages: new Set([1, 2]), recallSets: [], notes: [], studyGuides: [] });
    const p2 = computeChapterProgress(ch2, { visitedPages: new Set(), recallSets: [], notes: [], studyGuides: [] });

    const plan = buildExamPlan("book-1", "final", [{ chapter: ch1, progress: p1 }, { chapter: ch2, progress: p2 }], {
      visitedPages: new Set([1, 2]),
      notes: [],
      recallSets: [],
      studyGuides: [],
    });

    expect(plan.examReadPct).toBe(Math.round((p1.readPct + p2.readPct) / 2));
  });
});
