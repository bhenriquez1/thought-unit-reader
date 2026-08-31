import { computeChapterProgress, computeCourseProgress, buildChaptersFromToc, type ChapterLike } from "@/lib/syllabus/chapterProgress";
import type { TocNode } from "@/lib/readerContracts";
import type { RecallSet } from "@/lib/recalllab/recallStore";
import type { UltraNote } from "@/lib/notelab/ultraNoteStore";
import type { StudyGuideRecord } from "@/lib/studyguide/types";
import type { KnowledgeNode, KnowledgeNodeProgress } from "@/lib/knowledge/knowledgeGraphSchema";

function makeTopic(overrides: Partial<ChapterLike> = {}): ChapterLike {
  return {
    id: "topic-1",
    title: "Chapter 1: Cell Structure",
    pageRanges: [{ start: 1, end: 10 }],
    ...overrides,
  };
}

// L2 (Learning Hub orchestration correction) — a minimal real KnowledgeNode,
// same discipline as tests/learningHub/knowledgeStateSelectors.test.ts's own
// fixtureNode: only the fields computeChapterProgress's node-based rollup
// actually reads (id, sourcePages, title) need to vary per test.
function makeNode(overrides: Partial<KnowledgeNode> = {}): KnowledgeNode {
  return {
    id: "kn_1",
    documentId: "doc-1",
    bookId: "book-1",
    chapterCandidateId: null,
    canonicalAnchorId: "anchor-1",
    title: "Osmosis",
    summary: "",
    exactSourceText: "",
    sourcePages: [1],
    citations: [],
    profileId: "default",
    role: "Core Concept",
    importance: 50,
    difficulty: 50,
    parentNodeIds: [],
    childNodeIds: [],
    relatedNodeIds: [],
    learningObjectives: [],
    misconceptions: [],
    examples: [],
    applications: [],
    ...overrides,
  };
}

function makeProgress(nodeId: string, overrides: Partial<KnowledgeNodeProgress> = {}): KnowledgeNodeProgress {
  return {
    nodeId,
    documentId: "doc-1",
    pageTruthKey: null,
    understandingScore: 0,
    recallScore: 0,
    memoryStrength: 0,
    masteryScore: 0,
    confidenceScore: 0,
    lastStudiedAt: null,
    lastReviewedAt: null,
    nextReviewAt: null,
    predictedForgetAt: null,
    exposureCount: 0,
    successfulRecallCount: 0,
    failedRecallCount: 0,
    missCount: 0,
    correctCount: 0,
    confusionNodeIds: [],
    observedMisconceptions: [],
    evidence: [],
    whiteboardSnapshotIds: [],
    datPerformance: null,
    ...overrides,
  };
}

describe("computeChapterProgress", () => {
  it("returns all-zero progress with not_started status when nothing has happened, including with no Knowledge Graph data at all", () => {
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
    expect(progress.weakTopics).toEqual([]);
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

  it("recallCardCount/recallReviewedCount still count raw RecallCard records — a different question from recallPct below", () => {
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
    // No Knowledge Graph nodes supplied — recallPct is a canonical-state
    // rollup now, entirely independent of these raw cards.
    expect(progress.recallPct).toBe(0);
  });

  // L2 — the actual behavior this phase introduces: understandPct/recallPct
  // are rollups over lib/knowledge/knowledgeGraphSchema.ts's
  // KnowledgeNodeProgress for nodes whose sourcePages fall in the chapter,
  // never a second, independently-computed number.
  describe("understandPct/recallPct — rollups over canonical KnowledgeNodeProgress", () => {
    it("REQUIRED: averages understandingScore/recallScore across every node in the chapter, an untouched node contributing 0 but still counting in the denominator", () => {
      const topic = makeTopic({ pageRanges: [{ start: 1, end: 5 }] });
      const nodeA = makeNode({ id: "kn_a", sourcePages: [1] });
      const nodeB = makeNode({ id: "kn_b", sourcePages: [3] }); // no progress record at all — untouched

      const progress = computeChapterProgress(topic, {
        visitedPages: new Set(),
        recallSets: [],
        notes: [],
        studyGuides: [],
        nodes: [nodeA, nodeB],
        progressByNodeId: new Map([
          ["kn_a", makeProgress("kn_a", { understandingScore: 80, recallScore: 60 })],
        ]),
      });

      expect(progress.understandPct).toBe(40); // (80 + 0) / 2
      expect(progress.recallPct).toBe(30); // (60 + 0) / 2
    });

    it("REQUIRED: ignores nodes whose sourcePages fall outside the chapter's range", () => {
      const topic = makeTopic({ pageRanges: [{ start: 1, end: 5 }] });
      const inChapter = makeNode({ id: "kn_in", sourcePages: [2] });
      const outsideChapter = makeNode({ id: "kn_out", sourcePages: [50] });

      const progress = computeChapterProgress(topic, {
        visitedPages: new Set(),
        recallSets: [],
        notes: [],
        studyGuides: [],
        nodes: [inChapter, outsideChapter],
        progressByNodeId: new Map([
          ["kn_in", makeProgress("kn_in", { understandingScore: 100, recallScore: 100 })],
          ["kn_out", makeProgress("kn_out", { understandingScore: 0, recallScore: 0 })], // would drag the average down if wrongly included
        ]),
      });

      expect(progress.understandPct).toBe(100);
      expect(progress.recallPct).toBe(100);
    });

    it("a node counted as present via ANY of its sourcePages, not just the first", () => {
      const topic = makeTopic({ pageRanges: [{ start: 10, end: 20 }] });
      const spanningNode = makeNode({ id: "kn_span", sourcePages: [3, 15] }); // page 15 is in range, page 3 isn't

      const progress = computeChapterProgress(topic, {
        visitedPages: new Set(),
        recallSets: [],
        notes: [],
        studyGuides: [],
        nodes: [spanningNode],
        progressByNodeId: new Map([["kn_span", makeProgress("kn_span", { understandingScore: 50, recallScore: 50 })]]),
      });

      expect(progress.understandPct).toBe(50);
    });
  });

  describe("weakTopics — the same selectWeakNodes() gate TestLab's own weak-area exam scope uses", () => {
    it("REQUIRED: flags a node with enough graded attempts and a low recallScore, labeled by its real title", () => {
      const topic = makeTopic({ pageRanges: [{ start: 1, end: 5 }] });
      const weakNode = makeNode({ id: "kn_weak", sourcePages: [1], title: "Osmotic Pressure" });

      const progress = computeChapterProgress(topic, {
        visitedPages: new Set(),
        recallSets: [],
        notes: [],
        studyGuides: [],
        nodes: [weakNode],
        progressByNodeId: new Map([
          ["kn_weak", makeProgress("kn_weak", { recallScore: 30, successfulRecallCount: 1, failedRecallCount: 2 })],
        ]),
      });

      expect(progress.weakTopics).toEqual(["Osmotic Pressure"]);
    });

    it("REQUIRED: does not flag a node with too few graded attempts to be meaningful yet, even if its recallScore is low", () => {
      const topic = makeTopic({ pageRanges: [{ start: 1, end: 5 }] });
      const node = makeNode({ id: "kn_new", sourcePages: [1] });

      const progress = computeChapterProgress(topic, {
        visitedPages: new Set(),
        recallSets: [],
        notes: [],
        studyGuides: [],
        nodes: [node],
        progressByNodeId: new Map([
          ["kn_new", makeProgress("kn_new", { recallScore: 10, successfulRecallCount: 0, failedRecallCount: 1 })],
        ]),
      });

      expect(progress.weakTopics).toEqual([]);
    });

    it("caps at 5 weak topics", () => {
      const topic = makeTopic({ pageRanges: [{ start: 1, end: 5 }] });
      const nodes = Array.from({ length: 8 }, (_, i) => makeNode({ id: `kn_${i}`, sourcePages: [1], title: `Concept ${i}` }));
      const progressByNodeId = new Map(
        nodes.map((n) => [n.id, makeProgress(n.id, { recallScore: 10, successfulRecallCount: 1, failedRecallCount: 2 })]),
      );

      const progress = computeChapterProgress(topic, {
        visitedPages: new Set(),
        recallSets: [],
        notes: [],
        studyGuides: [],
        nodes,
        progressByNodeId,
      });

      expect(progress.weakTopics).toHaveLength(5);
    });
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

  it("marks a fully-read chapter with poor recall/understanding as a weak_area, not mastered", () => {
    const topic = makeTopic({ pageRanges: [{ start: 1, end: 2 }] });
    const node = makeNode({ id: "kn_1", sourcePages: [1] });

    const progress = computeChapterProgress(topic, {
      visitedPages: new Set([1, 2]),
      recallSets: [],
      notes: [],
      studyGuides: [],
      nodes: [node],
      progressByNodeId: new Map([["kn_1", makeProgress("kn_1", { understandingScore: 0, recallScore: 0 })]]),
    });

    expect(progress.readPct).toBe(100);
    expect(progress.masteryPct).toBeLessThan(40);
    expect(progress.status).toBe("weak_area");
  });

  it("marks a chapter mastered once mastery crosses the 80% threshold", () => {
    const topic = makeTopic({ pageRanges: [{ start: 1, end: 2 }] });
    const node = makeNode({ id: "kn_1", sourcePages: [1] });

    const progress = computeChapterProgress(topic, {
      visitedPages: new Set([1, 2]),
      recallSets: [],
      notes: [],
      studyGuides: [],
      nodes: [node],
      progressByNodeId: new Map([["kn_1", makeProgress("kn_1", { understandingScore: 90, recallScore: 90 })]]),
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
    const t1Node = makeNode({ id: "kn_t1", sourcePages: [1] });
    const progressList = [
      computeChapterProgress(topics[0], {
        visitedPages: new Set([1, 2]),
        recallSets: [],
        notes: [],
        studyGuides: [],
        nodes: [t1Node],
        progressByNodeId: new Map([["kn_t1", makeProgress("kn_t1", { understandingScore: 90, recallScore: 90 })]]),
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
