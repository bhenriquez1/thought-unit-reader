// tests/whiteboard/teachingTimeline.test.ts
// Pure-function tests for lib/whiteboard/teachingTimeline.ts — the
// deterministic drawing-performance timeline. No tldraw Editor, no React.

import { createShapeId } from "@tldraw/tldraw";
import {
  buildTeachingTimeline,
  computeVisualStates,
  buildWhiteboardLesson,
  stepDurationMs,
  FAINT_OPACITY,
  type TeachingStep,
} from "../../lib/whiteboard/teachingTimeline";
import type { ShapeDef } from "../../lib/whiteboard/sceneGraphAdapter";
import type { VisualSceneGraph } from "../../lib/whiteboard/visualSceneGraph";

function makeGeoDef(idSuffix: string, sourceId: string, narration: string): ShapeDef {
  return {
    id: createShapeId(idSuffix),
    type: "geo",
    x: 0, y: 0,
    props: {},
    sourceId,
    narration,
    revealOrder: 0,
  };
}

function makeArrowDef(idSuffix: string, narration?: string): ShapeDef {
  return {
    id: createShapeId(idSuffix),
    type: "arrow",
    x: 0, y: 0,
    props: {},
    narration,
    revealOrder: 0,
  };
}

describe("buildTeachingTimeline", () => {
  it("produces one TeachingStep per ShapeDef, preserving order", () => {
    const defs = [makeGeoDef("n1", "src-1", "First node"), makeArrowDef("e1", "connects")];
    const timeline = buildTeachingTimeline(defs);
    expect(timeline.steps).toHaveLength(2);
    expect(timeline.steps[0].canonicalUnitId).toBe("src-1");
    expect(timeline.steps[0].narration).toBe("First node");
    expect(timeline.steps[1].narration).toBe("connects");
  });

  it("a geo node gets draw-stroke then reveal-label actions", () => {
    const defs = [makeGeoDef("n1", "src-1", "text")];
    const timeline = buildTeachingTimeline(defs);
    const types = timeline.steps[0].actions.map(a => a.type);
    expect(types).toEqual(["draw-stroke", "reveal-label"]);
  });

  it("an arrow gets a single draw-arrow action", () => {
    const defs = [makeArrowDef("e1")];
    const timeline = buildTeachingTimeline(defs);
    const types = timeline.steps[0].actions.map(a => a.type);
    expect(types).toEqual(["draw-arrow"]);
  });

  it("every action carries the owning shape's id and a positive duration", () => {
    const defs = [makeGeoDef("n1", "src-1", "text"), makeArrowDef("e1")];
    const timeline = buildTeachingTimeline(defs);
    for (const step of timeline.steps) {
      for (const action of step.actions) {
        expect(action.shapeId).toBeTruthy();
        expect(action.durationMs).toBeGreaterThan(0);
      }
    }
  });

  it("falls back canonicalUnitId to the shape's own id when sourceId is absent", () => {
    const defs = [makeArrowDef("e1", "label")];
    const timeline = buildTeachingTimeline(defs);
    expect(timeline.steps[0].canonicalUnitId).toBe(String(defs[0].id));
  });

  it("is deterministic — the same input always produces the identical timeline", () => {
    const defs = [makeGeoDef("n1", "src-1", "a"), makeGeoDef("n2", "src-2", "b"), makeArrowDef("e1", "c")];
    const t1 = buildTeachingTimeline(defs);
    const t2 = buildTeachingTimeline(defs);
    expect(t1).toEqual(t2);
  });
});

describe("stepDurationMs", () => {
  it("sums all action durations for a step", () => {
    const step: TeachingStep = {
      id: "s1", canonicalUnitId: "c1", narration: "",
      actions: [{ type: "draw-stroke", shapeId: "a", durationMs: 700 }, { type: "reveal-label", shapeId: "a", durationMs: 400 }],
    };
    expect(stepDurationMs(step)).toBe(1100);
  });
});

describe("computeVisualStates — pure, deterministic canvas-state reconstruction", () => {
  const defs = [makeGeoDef("n1", "s1", "one"), makeGeoDef("n2", "s2", "two"), makeArrowDef("e1", "three")];

  it("stepIndex -1: every shape is faint (before step one — 'clean board with faint planning marks')", () => {
    const states = computeVisualStates(defs, -1);
    for (const def of defs) {
      expect(states.get(String(def.id))?.opacity).toBe(FAINT_OPACITY);
    }
  });

  it("stepIndex 0: only the first shape is fully drawn, the rest stay faint", () => {
    const states = computeVisualStates(defs, 0);
    expect(states.get(String(defs[0].id))?.opacity).toBe(1);
    expect(states.get(String(defs[1].id))?.opacity).toBe(FAINT_OPACITY);
    expect(states.get(String(defs[2].id))?.opacity).toBe(FAINT_OPACITY);
  });

  it("stepIndex at the last index: every shape is fully drawn — the complete diagram", () => {
    const states = computeVisualStates(defs, defs.length - 1);
    for (const def of defs) {
      expect(states.get(String(def.id))?.opacity).toBe(1);
    }
  });

  it("REQUIRED: reconstructs the EXACT SAME state for the same stepIndex, called independently and repeatedly — this is what makes Previous/Next/Restart deterministic rather than path-dependent", () => {
    const a = computeVisualStates(defs, 1);
    const b = computeVisualStates(defs, 1);
    expect(a).toEqual(b);
    // Also true after "visiting" other indices first — no hidden incremental state.
    computeVisualStates(defs, 2);
    computeVisualStates(defs, -1);
    const c = computeVisualStates(defs, 1);
    expect(c).toEqual(a);
  });

  it("emphasizeCurrent marks only the shape at stepIndex, and only when requested", () => {
    const withoutEmphasis = computeVisualStates(defs, 1);
    expect(withoutEmphasis.get(String(defs[1].id))?.emphasized).toBe(false);

    const withEmphasis = computeVisualStates(defs, 1, { emphasizeCurrent: true });
    expect(withEmphasis.get(String(defs[0].id))?.emphasized).toBe(false);
    expect(withEmphasis.get(String(defs[1].id))?.emphasized).toBe(true);
    expect(withEmphasis.get(String(defs[2].id))?.emphasized).toBe(false);
  });
});

describe("buildWhiteboardLesson", () => {
  const fakeVsg: VisualSceneGraph = {
    id: "vsg_abc123",
    grammar: "flow",
    drawType: "flow",
    nodes: [],
    edges: [],
    canvas: { width: 460, height: 300 },
    builtAt: 0,
  };

  it("bundles sceneGraph, timeline, and a frozen source snapshot carrying the vsg's content-hash id", () => {
    const defs = [makeGeoDef("n1", "s1", "one")];
    const lesson = buildWhiteboardLesson(fakeVsg, defs, "book::4::t");
    expect(lesson.sceneGraph).toBe(fakeVsg);
    expect(lesson.timeline.steps).toHaveLength(1);
    expect(lesson.sourceSnapshot).toEqual({ pageTruthKey: "book::4::t", vsgId: "vsg_abc123" });
  });

  it("is a pure function — the same vsg/defs always produce an equal (not necessarily identical-reference) lesson", () => {
    const defs = [makeGeoDef("n1", "s1", "one")];
    const l1 = buildWhiteboardLesson(fakeVsg, defs, "book::4::t");
    const l2 = buildWhiteboardLesson(fakeVsg, defs, "book::4::t");
    expect(l1).toEqual(l2);
  });
});
