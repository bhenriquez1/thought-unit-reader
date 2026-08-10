// tests/knowledge/whiteboardLessonSnapshotStore.test.ts
// Phase B3-3 — persistence for the reusable, semantic Whiteboard lesson.
//
// This repo's jest config runs testEnvironment:"node" with no IndexedDB
// polyfill (no fake-indexeddb dependency — see
// tests/canonical/surgeonAnnotationPlanStore.test.ts's header comment for the
// established precedent). Everything reachable WITHOUT touching indexedDB —
// the pure builder functions and the two identity predicates that guard
// save/load — gets real behavioral coverage below. The actual IDB read/write
// plumbing gets static-analysis (source-regex) coverage, matching that same
// precedent.

import fs from "fs";
import path from "path";
import {
  buildTeachingStepsSummary, buildWhiteboardLessonSnapshot,
  identityMatches, snapshotBelongsToDocument,
  saveWhiteboardLessonSnapshot,
  type WhiteboardLessonSnapshot,
} from "../../lib/knowledge/whiteboardLessonSnapshotStore";
import type { ProfessorLessonPlan } from "../../lib/whiteboard/professorLessonPlan";

const STORE_FILE = path.resolve(__dirname, "../../lib/knowledge/whiteboardLessonSnapshotStore.ts");

function fixturePlan(): ProfessorLessonPlan {
  return {
    visualGrammar: "mechanism",
    title: "Test Lesson",
    centralQuestion: "Why does the test mechanism matter?",
    learningObjective: "Understand the test mechanism.",
    synthesisQuestion: "Why does the test mechanism matter?",
    sourceSnapshot: {
      documentId: "doc-a",
      pageNumber: 3,
      pageTruthKey: "doc-a::3::t",
      activeCanonicalUnitId: "kn_doc-a_1",
      vsgId: "vsg-hash-123",
      plannerVersion: 5,
    },
    segments: [
      { id: "seg0", text: "This is the trigger.", tone: "introduce", pace: "normal", pauseAfterMs: 300, linkedActionIds: ["a1"], contentRole: "PROFESSOR_EXPLANATION" },
      { id: "seg1", text: "A common mistake is confusing X with Y.", tone: "warn", pace: "normal", pauseAfterMs: 300, linkedActionIds: ["a4"], contentRole: "PROFESSOR_EXPLANATION" },
    ],
    actions: [
      { type: "write", actionId: "a0", shapeId: "s-trigger", text: "Trigger", x: 0, y: 0, durationMs: 400, stepId: 0 },
      { type: "speak", actionId: "a1", segmentId: "seg0", text: "This is the trigger.", durationMs: 1200, stepId: 0 },
      { type: "write", actionId: "a2", shapeId: "s-misconception", text: "X causes Y directly", x: 100, y: 0, durationMs: 400, stepId: 1 },
      { type: "emphasize", actionId: "a3", targetId: "s-misconception", treatment: "crossOut", durationMs: 300, stepId: 1 },
      { type: "speak", actionId: "a4", segmentId: "seg1", text: "A common mistake is confusing X with Y.", durationMs: 1400, stepId: 1 },
    ],
  };
}

describe("buildTeachingStepsSummary", () => {
  it("produces one summary per distinct stepId, in order, with the step's first write() text as the label", () => {
    const steps = buildTeachingStepsSummary(fixturePlan());
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ stepId: 0, label: "Trigger", misconceptionLabel: null });
    expect(steps[0].narration).toBe("This is the trigger.");
  });

  it("REQUIRED: surfaces the misconceptionLabel for a step whose emphasis treatment is crossOut (Phase B1's own signal)", () => {
    const steps = buildTeachingStepsSummary(fixturePlan());
    expect(steps[1]).toMatchObject({ stepId: 1, misconceptionLabel: "X causes Y directly" });
    expect(steps[1].narration).toBe("A common mistake is confusing X with Y.");
  });
});

describe("buildWhiteboardLessonSnapshot", () => {
  it("REQUIRED: assembles the full persistence contract — lessonId/documentId/pageNumber/pageTruthKey/conceptIds/thoughtUnitIds/visualGrammar/professorPlanVersion/sceneGraphVersion/teachingSteps/createdAt", () => {
    const plan = fixturePlan();
    const snapshot = buildWhiteboardLessonSnapshot({
      lessonId: "plesson:v5:doc-a:doc-a::3::t:kn_doc-a_1",
      documentId: "doc-a",
      pageNumber: 3,
      pageTruthKey: "doc-a::3::t",
      conceptIds: ["kn_doc-a_1"],
      thoughtUnitIds: ["tu-1", "tu-2"],
      plan,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(snapshot).toEqual<WhiteboardLessonSnapshot>({
      lessonId: "plesson:v5:doc-a:doc-a::3::t:kn_doc-a_1",
      documentId: "doc-a",
      pageNumber: 3,
      pageTruthKey: "doc-a::3::t",
      conceptIds: ["kn_doc-a_1"],
      thoughtUnitIds: ["tu-1", "tu-2"],
      visualGrammar: "mechanism",
      professorPlanVersion: 5,
      sceneGraphVersion: "vsg-hash-123",
      teachingSteps: buildTeachingStepsSummary(plan),
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });
});

describe("identityMatches — REQUIRED: stale pageTruthKey cannot persist (Phase B3-3)", () => {
  const snapshot = { documentId: "doc-a", pageTruthKey: "doc-a::3::t" };

  it("true when the live identity still matches the snapshot's own identity", () => {
    expect(identityMatches(snapshot, { documentId: "doc-a", pageTruthKey: "doc-a::3::t" })).toBe(true);
  });

  it("REQUIRED: false when pageTruthKey has changed (e.g. a re-extraction produced a different pageTruthKey for the same page slot)", () => {
    expect(identityMatches(snapshot, { documentId: "doc-a", pageTruthKey: "doc-a::3::STALE" })).toBe(false);
  });

  it("false when documentId has changed", () => {
    expect(identityMatches(snapshot, { documentId: "doc-b", pageTruthKey: "doc-a::3::t" })).toBe(false);
  });
});

describe("snapshotBelongsToDocument — REQUIRED: Document A's snapshot cannot attach to Document B (Phase B3-3)", () => {
  it("true when the record's own documentId matches the document asking for it", () => {
    expect(snapshotBelongsToDocument({ documentId: "doc-a" }, "doc-a")).toBe(true);
  });

  it("REQUIRED: false when a record saved under Document A is requested under Document B", () => {
    expect(snapshotBelongsToDocument({ documentId: "doc-a" }, "doc-b")).toBe(false);
  });
});

describe("saveWhiteboardLessonSnapshot — rejects a stale save WITHOUT touching IndexedDB", () => {
  it("REQUIRED: resolves { saved: false, reason: 'stale-identity' } and never reaches the IDB layer when getCurrentIdentity() disagrees with the snapshot — provable because this repo's Node test environment has no indexedDB global at all, yet this call does not throw/reject", async () => {
    const snapshot = buildWhiteboardLessonSnapshot({
      lessonId: "plesson:v5:doc-a:doc-a::3::t:kn_doc-a_1",
      documentId: "doc-a",
      pageNumber: 3,
      pageTruthKey: "doc-a::3::t",
      conceptIds: [],
      thoughtUnitIds: [],
      plan: fixturePlan(),
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const result = await saveWhiteboardLessonSnapshot(snapshot, () => ({ documentId: "doc-b", pageTruthKey: "doc-a::3::t" }));
    expect(result).toEqual({ saved: false, reason: "stale-identity" });
  });
});

describe("lib/knowledge/whiteboardLessonSnapshotStore.ts — IDB persistence shape", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(STORE_FILE, "utf8"); });

  it("uses a dedicated DB/store name, keyed by lessonId", () => {
    expect(src).toMatch(/IDB_NAME\s*=\s*"avrrio_whiteboard_lessons_v1"/);
    expect(src).toMatch(/keyPath:\s*"lessonId"/);
  });

  it("has a documentId secondary index for per-document listing", () => {
    expect(src).toMatch(/createIndex\("documentId",\s*"documentId"/);
  });

  it("REQUIRED: saveWhiteboardLessonSnapshot checks identityMatches BEFORE opening the IDB connection — the stale-save guard must be a cheap synchronous-style short-circuit, not a wasted write attempt", () => {
    const idx = src.indexOf("export async function saveWhiteboardLessonSnapshot");
    const openIdx = src.indexOf("openLessonSnapshotIDB()", idx);
    const guardIdx = src.indexOf("identityMatches(", idx);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(openIdx).toBeGreaterThan(guardIdx);
  });

  it("getWhiteboardLessonSnapshot uses snapshotBelongsToDocument to guard the loaded record before returning it", () => {
    const idx = src.indexOf("export async function getWhiteboardLessonSnapshot");
    const block = src.slice(idx, idx + 800);
    expect(block).toMatch(/snapshotBelongsToDocument\(record, documentId\)/);
  });
});
