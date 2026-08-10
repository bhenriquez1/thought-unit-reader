import fs from "fs";
import path from "path";
import { buildCanonicalRecallModes } from "../../lib/recalllab/canonicalRecallSession";
import { mergeBlueprintProgress, newBlueprint } from "../../lib/recalllab/recall2Store";
import { applyConfidence } from "../../lib/recalllab/recall2Srs";
import {
  buildRecallLearningEvents,
  confidenceToLearningDifficulty,
} from "../../lib/recalllab/recallLearningState";
import type { CanonicalTextbookEvidence } from "../../lib/notelab/conceptEvidenceWorkspace";
import type { WhiteboardLessonSnapshot } from "../../lib/knowledge/whiteboardLessonSnapshotStore";

const IDENTITY = {
  bookId: "same-name.pdf",
  documentId: "resolved-doc-a",
  pageNumber: 7,
  pageTruthKey: "resolved-doc-a::7::truth-v2",
  knowledgeNodeId: "kn-resolved-doc-a-page-7",
};
const CREATED_AT = "2026-08-10T12:00:00.000Z";

function evidence(overrides: Partial<CanonicalTextbookEvidence> = {}): CanonicalTextbookEvidence {
  return {
    id: "surgeon-resolved-doc-a-7-0",
    documentId: IDENTITY.documentId,
    pageNumber: IDENTITY.pageNumber,
    pageTruthKey: IDENTITY.pageTruthKey,
    exactText: "The grounded mechanism moves substrate through the channel.",
    canonicalType: "mechanism",
    reason: "This is the page's causal mechanism.",
    importance: "critical",
    confidence: 1,
    groundingState: "exact",
    ...overrides,
  };
}

function snapshot(overrides: Partial<WhiteboardLessonSnapshot> = {}): WhiteboardLessonSnapshot {
  return {
    lessonId: "professor-lesson-a",
    documentId: IDENTITY.documentId,
    pageNumber: IDENTITY.pageNumber,
    pageTruthKey: IDENTITY.pageTruthKey,
    conceptIds: [IDENTITY.knowledgeNodeId],
    thoughtUnitIds: ["surgeon-resolved-doc-a-7-0"],
    visualGrammar: "mechanism",
    professorPlanVersion: 5,
    sceneGraphVersion: "vsg-a",
    teachingSteps: [
      { stepId: 0, label: "Trigger", narration: "The trigger opens the channel.", misconceptionLabel: null },
      { stepId: 1, label: "Direction", narration: "Flow follows the gradient.", misconceptionLabel: "Flow always opposes the gradient" },
    ],
    createdAt: CREATED_AT,
    ...overrides,
  };
}

describe("Phase 4B canonical retrieval assembly", () => {
  it("builds concept, exact Professor replay, and misconception-repair modes with full canonical identity", () => {
    const modes = buildCanonicalRecallModes({
      identity: IDENTITY,
      evidence: [evidence(), evidence({ id: "surgeon-resolved-doc-a-7-1", canonicalType: "trap", reason: "Do not reverse the gradient." })],
      snapshots: [snapshot()],
      createdAt: CREATED_AT,
    });

    expect(modes.map(mode => [mode.mode, mode.cards.length])).toEqual([
      ["concept", 2],
      ["professor-snapshot", 2],
      ["misconception-repair", 2],
    ]);
    for (const card of modes.flatMap(mode => mode.cards)) {
      expect(card).toMatchObject({
        documentId: IDENTITY.documentId,
        pageNumber: IDENTITY.pageNumber,
        pageTruthKey: IDENTITY.pageTruthKey,
        knowledgeNodeId: IDENTITY.knowledgeNodeId,
      });
    }
    expect(modes[1].cards[0]).toMatchObject({
      sourceKind: "professor-snapshot",
      sourceSnapshotId: "professor-lesson-a",
      back: "The trigger opens the channel.",
    });
    expect(modes[2].cards[1]).toMatchObject({
      sourceKind: "misconception-repair",
      misconception: "Flow always opposes the gradient",
    });
  });

  it("rejects stale pageTruthKey and same-filename/different-document artifacts without fallback", () => {
    const modes = buildCanonicalRecallModes({
      identity: IDENTITY,
      evidence: [
        evidence({ pageTruthKey: "resolved-doc-a::7::STALE" }),
        evidence({ documentId: "resolved-doc-b" }),
      ],
      snapshots: [
        snapshot({ pageTruthKey: "resolved-doc-a::7::STALE" }),
        snapshot({ documentId: "resolved-doc-b" }),
      ],
      createdAt: CREATED_AT,
    });
    expect(modes.every(mode => mode.cards.length === 0)).toBe(true);
  });

  it("uses stable ids for the same canonical artifact", () => {
    const input = { identity: IDENTITY, evidence: [evidence()], snapshots: [snapshot()], createdAt: CREATED_AT };
    const a = buildCanonicalRecallModes(input).flatMap(mode => mode.cards).map(card => card.id);
    const b = buildCanonicalRecallModes(input).flatMap(mode => mode.cards).map(card => card.id);
    expect(a).toEqual(b);
  });

  it("is a pure artifact assembler with no fetch/API path", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../lib/recalllab/canonicalRecallSession.ts"), "utf8");
    expect(source).not.toMatch(/fetch\s*\(/);
    expect(source).not.toMatch(/\/api\//);
  });
});

describe("Phase 4B scheduling and progress preservation", () => {
  it("applies SM-2 deterministically from the explicit review timestamp", () => {
    const initial = newBlueprint("Question", "Answer", "understanding", {
      bookId: IDENTITY.bookId,
      documentId: IDENTITY.documentId,
      pageNumber: IDENTITY.pageNumber,
      pageTruthKey: IDENTITY.pageTruthKey,
    });
    const a = applyConfidence(initial, "easy", CREATED_AT);
    const b = applyConfidence(initial, "easy", CREATED_AT);
    expect(a).toEqual(b);
    expect(a.lastReviewedAt).toBe("2026-08-10");
    expect(a.dueDate).toBe("2026-08-11");
  });

  it("hydrates regenerated canonical cards with existing review history", () => {
    const fresh = buildCanonicalRecallModes({ identity: IDENTITY, evidence: [evidence()], snapshots: [], createdAt: CREATED_AT })[0].cards[0];
    const reviewed = { ...fresh, interval: 12, easeFactor: 2.15, dueDate: "2026-08-22", reviewCount: 4, consecutiveCorrect: 3, confidenceHistory: ["easy" as const] };
    const regenerated = { ...fresh, front: `${fresh.front} Updated grounded wording` };
    const [merged] = mergeBlueprintProgress([regenerated], [reviewed]);
    expect(merged.front).toBe(regenerated.front);
    expect(merged).toMatchObject({ interval: 12, easeFactor: 2.15, dueDate: "2026-08-22", reviewCount: 4, consecutiveCorrect: 3 });
  });

  it("does not hydrate progress from a stale extraction with the same prompt hash", () => {
    const fresh = buildCanonicalRecallModes({ identity: IDENTITY, evidence: [evidence()], snapshots: [], createdAt: CREATED_AT })[0].cards[0];
    const stale = { ...fresh, pageTruthKey: "resolved-doc-a::7::STALE", interval: 30, reviewCount: 8 };
    const [merged] = mergeBlueprintProgress([fresh], [stale]);
    expect(merged.interval).toBe(1);
    expect(merged.reviewCount).toBe(0);
  });

  it("maps real confidence ratings into Learning State scheduling and misconception evidence", () => {
    expect(confidenceToLearningDifficulty("easy")).toBe("easy");
    expect(confidenceToLearningDifficulty("unsure")).toBe("medium");
    expect(confidenceToLearningDifficulty("guessed")).toBe("hard");

    const card = {
      ...buildCanonicalRecallModes({
        identity: IDENTITY,
        evidence: [evidence({ canonicalType: "trap", reason: "Do not reverse the gradient." })],
        snapshots: [],
        createdAt: CREATED_AT,
      })[2].cards[0],
      interval: 3,
      easeFactor: 2,
      dueDate: "2026-08-13",
    };
    const events = buildRecallLearningEvents(card, "blank", CREATED_AT);
    expect(events[0]).toMatchObject({
      kind: "recall-graded",
      difficulty: "hard",
      nextReviewAt: "2026-08-13T00:00:00.000Z",
      predictedForgetAt: "2026-08-16T12:00:00.000Z",
    });
    expect(events[1]).toMatchObject({
      kind: "misconception-observed",
      misconception: "Do not reverse the gradient.",
    });
  });
});
