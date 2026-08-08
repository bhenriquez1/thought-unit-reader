// tests/knowledge/learningStateEvents.test.ts
// Behavioral regression coverage for the Learning State Engine's deterministic
// event reducer (Phase A2 of the shared-architecture roadmap). Every test
// passes explicit `occurredAt` timestamps — applyLearningEvent must never
// call Date.now()/new Date() internally, which is what makes state updates
// reproducible and testable (the brief's explicit requirement).

import { applyLearningEvent, emptyProgress, type LearningStateEvent } from "../../lib/knowledge/learningStateEvents";
import type { KnowledgeNodeProgress } from "../../lib/knowledge/knowledgeGraphSchema";

const T1 = "2026-01-01T00:00:00.000Z";
const T2 = "2026-01-02T00:00:00.000Z";

describe("emptyProgress", () => {
  it("seeds documentId and every count/array field to a clean zero/empty state", () => {
    const p = emptyProgress("kn_doc_abc", "doc-1");
    expect(p.nodeId).toBe("kn_doc_abc");
    expect(p.documentId).toBe("doc-1");
    expect(p.pageTruthKey).toBeNull();
    expect(p.exposureCount).toBe(0);
    expect(p.successfulRecallCount).toBe(0);
    expect(p.failedRecallCount).toBe(0);
    expect(p.missCount).toBe(0);
    expect(p.correctCount).toBe(0);
    expect(p.evidence).toEqual([]);
    expect(p.observedMisconceptions).toEqual([]);
    expect(p.whiteboardSnapshotIds).toEqual([]);
    expect(p.datPerformance).toBeNull();
  });
});

describe("applyLearningEvent — determinism", () => {
  it("REQUIRED: the same (progress, event) input always produces the same output — no internal Date.now()/Math.random()", () => {
    const base = emptyProgress("n1", "doc-1");
    const event: LearningStateEvent = { kind: "recall-graded", difficulty: "easy", occurredAt: T1, sourceId: "card-1" };
    const a = applyLearningEvent(base, event);
    const b = applyLearningEvent(base, event);
    expect(a).toEqual(b);
  });

  it("never mutates the input progress object", () => {
    const base = emptyProgress("n1", "doc-1");
    const frozen = JSON.parse(JSON.stringify(base));
    applyLearningEvent(base, { kind: "exposure", sourceType: "read", occurredAt: T1, sourceId: "p1" });
    expect(base).toEqual(frozen);
  });
});

describe("applyLearningEvent — exposure", () => {
  it("increments exposureCount and sets lastStudiedAt, without touching recall/mastery scores", () => {
    const base = emptyProgress("n1", "doc-1");
    const next = applyLearningEvent(base, { kind: "exposure", sourceType: "read", occurredAt: T1, sourceId: "p1" });
    expect(next.exposureCount).toBe(1);
    expect(next.lastStudiedAt).toBe(T1);
    expect(next.recallScore).toBe(0);
    expect(next.evidence).toHaveLength(1);
    expect(next.evidence[0]).toMatchObject({ sourceType: "read", sourceId: "p1", occurredAt: T1 });
  });
});

describe("applyLearningEvent — recall-graded", () => {
  function grade(base: KnowledgeNodeProgress, difficulty: "easy" | "medium" | "hard", occurredAt = T1, sourceId = "card-1") {
    return applyLearningEvent(base, { kind: "recall-graded", difficulty, occurredAt, sourceId });
  }

  it("easy: raises recallScore/memoryStrength, increments successfulRecallCount AND the deprecated correctCount alias identically", () => {
    const next = grade(emptyProgress("n1", "doc-1"), "easy");
    expect(next.recallScore).toBe(10);
    expect(next.memoryStrength).toBe(5);
    expect(next.successfulRecallCount).toBe(1);
    expect(next.correctCount).toBe(1);
    expect(next.failedRecallCount).toBe(0);
    expect(next.missCount).toBe(0);
    expect(next.lastReviewedAt).toBe(T1);
  });

  it("hard: lowers recallScore/memoryStrength (never below 0), increments failedRecallCount AND the deprecated missCount alias identically", () => {
    const next = grade(emptyProgress("n1", "doc-1"), "hard");
    expect(next.recallScore).toBe(0); // clamped — started at 0, -10 clamps to 0
    expect(next.memoryStrength).toBe(0);
    expect(next.failedRecallCount).toBe(1);
    expect(next.missCount).toBe(1);
    expect(next.successfulRecallCount).toBe(0);
    expect(next.correctCount).toBe(0);
  });

  it("scores clamp at 100 on repeated easy ratings, never overflow", () => {
    let p = emptyProgress("n1", "doc-1");
    for (let i = 0; i < 20; i++) p = grade(p, "easy", T1, `card-${i}`);
    expect(p.recallScore).toBeLessThanOrEqual(100);
    expect(p.memoryStrength).toBeLessThanOrEqual(100);
    expect(p.successfulRecallCount).toBe(20);
  });

  it("every grading event appends an evidence entry citing the card id and rating", () => {
    const next = grade(emptyProgress("n1", "doc-1"), "medium", T2, "card-77");
    expect(next.evidence).toHaveLength(1);
    expect(next.evidence[0]).toMatchObject({ sourceType: "recall", sourceId: "card-77", occurredAt: T2, detail: "rated medium" });
  });

  it("exposureCount increments on every grading event too, not just plain exposure events", () => {
    const next = grade(emptyProgress("n1", "doc-1"), "easy");
    expect(next.exposureCount).toBe(1);
  });
});

describe("applyLearningEvent — whiteboard-lesson-completed", () => {
  it("raises understandingScore and records the snapshot id exactly once even if repeated", () => {
    let p = emptyProgress("n1", "doc-1");
    p = applyLearningEvent(p, { kind: "whiteboard-lesson-completed", occurredAt: T1, sourceId: "lesson-1", snapshotId: "snap-1" });
    p = applyLearningEvent(p, { kind: "whiteboard-lesson-completed", occurredAt: T2, sourceId: "lesson-2", snapshotId: "snap-1" });
    expect(p.understandingScore).toBe(16);
    expect(p.whiteboardSnapshotIds).toEqual(["snap-1"]);
  });
});

describe("applyLearningEvent — dat-question-answered", () => {
  it("tracks attempts/correct/averageTimeMs as a running aggregate", () => {
    let p = emptyProgress("n1", "doc-1");
    p = applyLearningEvent(p, { kind: "dat-question-answered", correct: true, timeMs: 4000, occurredAt: T1, sourceId: "q1" });
    p = applyLearningEvent(p, { kind: "dat-question-answered", correct: false, timeMs: 6000, occurredAt: T2, sourceId: "q2" });
    expect(p.datPerformance).toEqual({ attempts: 2, correct: 1, lastAttemptedAt: T2, averageTimeMs: 5000 });
    expect(p.successfulRecallCount).toBe(1);
    expect(p.failedRecallCount).toBe(1);
  });
});

describe("applyLearningEvent — confidence-reported and misconception-observed", () => {
  it("confidence-reported sets confidenceScore, clamped 0-100", () => {
    const next = applyLearningEvent(emptyProgress("n1", "doc-1"), { kind: "confidence-reported", confidence: 130, occurredAt: T1, sourceId: "c1" });
    expect(next.confidenceScore).toBe(100);
  });

  it("misconception-observed appends a deduped list of misconception strings", () => {
    let p = emptyProgress("n1", "doc-1");
    p = applyLearningEvent(p, { kind: "misconception-observed", misconception: "confuses X with Y", occurredAt: T1 });
    p = applyLearningEvent(p, { kind: "misconception-observed", misconception: "confuses X with Y", occurredAt: T2 });
    p = applyLearningEvent(p, { kind: "misconception-observed", misconception: "thinks Z is reversible", occurredAt: T2 });
    expect(p.observedMisconceptions).toEqual(["confuses X with Y", "thinks Z is reversible"]);
  });
});
