// lib/whiteboard/buildProfessorTeachingActions.ts
// Pure converter: VisualSceneGraph (real, laid-out positions) + a
// GroundedProfessorLessonScript (short labels + spoken narration, already
// verified against the same VSG) -> a complete, replayable
// ProfessorLessonPlan. No React, no tldraw Editor, no network — this is the
// deterministic "geometry" half of the pipeline; OpenAI supplied only the
// "meaning" half (lib/whiteboard/groundProfessorLesson.ts already stripped
// anything it invented that isn't a real node/edge id).
//
// Node boxes are resized around their existing CENTER using
// estimateLabelWidth(shortLabel) instead of the VSG's original fixed-width
// box — this is the direct fix for "boxes are too narrow, so sentences wrap
// vertically": labels are now short by construction, and the box grows to
// fit them instead of the reverse. Vertical position/height are left as the
// layout engine computed them, so V_GAP spacing between rows never breaks.

import { createShapeId } from "@tldraw/tldraw";
import type { VisualSceneGraph, VSGNode } from "./visualSceneGraph";
import type { GroundedProfessorLessonScript } from "./groundProfessorLesson";
import type {
  ProfessorLessonPlan, ProfessorTeachingAction, NarrationSegment,
  ProfessorLessonSourceSnapshot, Bounds,
} from "./professorLessonPlan";
import { estimateLabelWidth, estimateLabelHeight, wordCount } from "./textMetrics";

// ── Pacing ────────────────────────────────────────────────────────────────
const STROKE_DURATION_MS = 550;   // drawing a box/circle outline
const WRITE_MS_PER_WORD  = 260;   // "hand writing" a short phrase, word by word
const WRITE_MIN_MS       = 500;
const ARROW_DURATION_MS  = 500;
const EMPHASIZE_DURATION_MS = 550;
const CAMERA_DURATION_MS = 400;
const SPEAK_MS_PER_WORD  = 330;   // ~180wpm spoken pace, used as a pre-audio estimate
const SPEAK_MIN_MS       = 700;

const PAUSE_AFTER_MS_BY_TONE: Record<string, number> = {
  introduce: 400,
  explain:   400,
  connect:   300,
  warn:      700,
  question:  900,
};

let actionCounter = 0;
let segmentCounter = 0;
function nextActionId(): string { return `a${actionCounter++}`; }
function nextSegmentId(): string { return `seg${segmentCounter++}`; }

/** Resets the module-local id counters — call at the start of each
 *  buildProfessorTeachingActions() so ids are stable/deterministic per build
 *  rather than accumulating across calls within one process lifetime. */
function resetIdCounters(): void {
  actionCounter = 0;
  segmentCounter = 0;
}

function writeDurationMs(text: string): number {
  return Math.max(WRITE_MIN_MS, wordCount(text) * WRITE_MS_PER_WORD);
}
function speakDurationMs(text: string): number {
  return Math.max(SPEAK_MIN_MS, wordCount(text) * SPEAK_MS_PER_WORD);
}

interface ResolvedNodeBounds extends Bounds {
  centerWriteX: number;
  centerWriteY: number;
}

function resizeAroundCenter(node: VSGNode, label: string): ResolvedNodeBounds {
  const centerX = node.position.x + node.size.w / 2;
  const w = estimateLabelWidth(label);
  const h = estimateLabelHeight();
  const x = centerX - w / 2;
  const y = node.position.y;
  return { x, y, w, h, centerWriteX: x + w / 2, centerWriteY: y + h / 2 };
}

export function buildProfessorTeachingActions(
  vsg: VisualSceneGraph,
  grounded: GroundedProfessorLessonScript,
  sourceSnapshot: ProfessorLessonSourceSnapshot,
): ProfessorLessonPlan {
  resetIdCounters();

  const actions: ProfessorTeachingAction[] = [];
  const segments: NarrationSegment[] = [];
  const nodeBoundsById = new Map<string, ResolvedNodeBounds>();
  let stepSequenceCounter = 0;

  // Pushes a narration segment's speak+pause actions IMMEDIATELY (not
  // batched at the end) so drawing and narration stay interleaved — this is
  // the fix for "the drawing and narration are not tightly synchronized":
  // each teaching point's visual actions are followed right away by the
  // speech that explains them, not by the next point's visuals.
  const pushSegment = (text: string, tone: NarrationSegment["tone"], pace: NarrationSegment["pace"], linkedActionIds: string[]) => {
    const seg: NarrationSegment = {
      id: nextSegmentId(),
      text,
      tone,
      pace,
      pauseAfterMs: PAUSE_AFTER_MS_BY_TONE[tone] ?? 400,
      linkedActionIds,
    };
    segments.push(seg);

    const speakActionId = nextActionId();
    actions.push({ type: "speak", actionId: speakActionId, segmentId: seg.id, text: seg.text, durationMs: speakDurationMs(seg.text) });
    if (seg.pauseAfterMs > 0) {
      actions.push({ type: "pause", actionId: nextActionId(), durationMs: seg.pauseAfterMs });
    }
    return seg;
  };

  // ── Step 1: short hand-written title ───────────────────────────────────
  // Placed comfortably ABOVE the topmost node's own y — a fixed (24, 12)
  // collided with node1's position (VSG layouts start near y=22), which
  // made the title render directly on top of the first box.
  if (grounded.title) {
    const topNodeY = vsg.nodes.length > 0 ? Math.min(...vsg.nodes.map(n => n.position.y)) : 22;
    const titleActionId = nextActionId();
    actions.push({
      type: "write", actionId: titleActionId, shapeId: String(createShapeId("pl-title")),
      text: grounded.title, x: 24, y: topNodeY - 60, durationMs: writeDurationMs(grounded.title),
    });
    pushSegment(`${grounded.title}.`, "introduce", "normal", [titleActionId]);
  }

  // ── Step 1b: learning objective, spoken only — states what the student
  //     should be able to do after this lesson, right up front. ────────────
  if (grounded.learningObjective) {
    pushSegment(grounded.learningObjective, "introduce", "normal", []);
  }

  // ── Step 2..N: one draw-shape + write (+ optional emphasize) per node,
  //     one draw-arrow per edge — in the grounded script's own order, which
  //     IS the teaching sequence the professor performs. ───────────────────
  for (const entry of grounded.nodeScripts) {
    const node = vsg.nodes.find(n => n.id === entry.targetId);
    if (node) {
      const bounds = resizeAroundCenter(node, entry.shortLabel);
      nodeBoundsById.set(node.id, bounds);
      const shapeId = String(createShapeId(`pn-${node.id}`));

      const cameraActionId = nextActionId();
      actions.push({ type: "move-camera", actionId: cameraActionId, targetIds: [shapeId], durationMs: CAMERA_DURATION_MS });

      const drawActionId = nextActionId();
      actions.push({
        type: "draw-shape", actionId: drawActionId, shapeId, targetId: node.sourceId,
        shape: node.role === "hub" ? "circle" : "box", bounds, durationMs: STROKE_DURATION_MS,
      });

      const writeActionId = nextActionId();
      actions.push({
        type: "write", actionId: writeActionId, shapeId, targetId: node.sourceId,
        text: entry.shortLabel, x: bounds.x + 8, y: bounds.y + bounds.h / 2 - 8,
        durationMs: writeDurationMs(entry.shortLabel),
      });

      const linked = [drawActionId, writeActionId];
      if (entry.emphasize) {
        const emphasizeActionId = nextActionId();
        actions.push({
          type: "emphasize", actionId: emphasizeActionId, targetId: shapeId,
          treatment: "circle", durationMs: EMPHASIZE_DURATION_MS,
        });
        linked.push(emphasizeActionId);
      }
      // Deterministic, non-AI treatments derived from data the VSG already
      // carries — "draw the five numbered stages" (sequential step-role
      // nodes get a running number badge) and "add a small warning beside
      // the common diagnostic error" (danger-tier nodes get a highlight)
      // both come from node.role/node.tier, never from the model choosing
      // a treatment.
      if (node.role === "step") {
        stepSequenceCounter += 1;
        const numberActionId = nextActionId();
        actions.push({
          type: "emphasize", actionId: numberActionId, targetId: shapeId,
          treatment: "number", sequenceNumber: stepSequenceCounter, durationMs: EMPHASIZE_DURATION_MS,
        });
        linked.push(numberActionId);
      }
      if (node.tier === "danger") {
        const warnActionId = nextActionId();
        actions.push({
          type: "emphasize", actionId: warnActionId, targetId: shapeId,
          treatment: "highlight", durationMs: EMPHASIZE_DURATION_MS,
        });
        linked.push(warnActionId);
      }

      pushSegment(entry.narration, entry.tone, entry.pace, linked);
      continue;
    }

    const edge = vsg.edges.find(e => e.id === entry.targetId);
    if (edge) {
      const fromBounds = nodeBoundsById.get(edge.fromId);
      const toBounds   = nodeBoundsById.get(edge.toId);
      if (!fromBounds || !toBounds) continue; // endpoint not drawn (density-capped) — skip the arrow, not a crash

      const shapeId = String(createShapeId(`pe-${edge.id}`));
      const from: ResolvedNodeBounds = fromBounds;
      const to: ResolvedNodeBounds   = toBounds;

      const cameraActionId = nextActionId();
      actions.push({ type: "move-camera", actionId: cameraActionId, targetIds: [String(createShapeId(`pn-${edge.fromId}`)), String(createShapeId(`pn-${edge.toId}`))], durationMs: CAMERA_DURATION_MS });

      const arrowActionId = nextActionId();
      actions.push({
        type: "draw-arrow", actionId: arrowActionId, shapeId,
        from: { x: from.centerWriteX, y: from.y + from.h },
        to:   { x: to.centerWriteX,   y: to.y },
        durationMs: ARROW_DURATION_MS,
      });

      pushSegment(entry.narration, entry.tone, entry.pace, [arrowActionId]);
    }
  }

  // ── Final: one synthesis question, spoken only — no new visual object,
  //     keeps the canvas under the primary-object ceiling. ────────────────
  if (grounded.synthesisQuestion) {
    pushSegment(grounded.synthesisQuestion, "question", "slow", []);
  }

  return {
    actions,
    segments,
    visualGrammar:      grounded.visualGrammar,
    title:               grounded.title,
    learningObjective:   grounded.learningObjective,
    synthesisQuestion:   grounded.synthesisQuestion,
    sourceSnapshot,
  };
}
