// lib/whiteboard/organicOutline.ts
// Correction (Whiteboard visual language) — pure, deterministic point-path
// generators for hand-drawn-looking rectangle/ellipse outlines. Used by
// buildProfessorTeachingActions.ts to draw ordinary concept nodes as
// genuine pencil strokes (via the SAME draw-freehand action + M7 progressive
// reveal pipeline every other freehand stroke already uses) instead of a
// pristine tldraw geo rectangle/ellipse — "organic circles," not perfect
// ones, per the correction's own visual-language mandate: "If removing the
// labels makes the visualization almost meaningless, the agent probably
// did not visualize the concept deeply enough."
//
// Deterministic (no Math.random) so the SAME (bounds, seed) always produces
// the SAME points — required by computeCanvasStateAtStep's "recompute from
// scratch on every call, must be idempotent" guarantee.

import type { Bounds, ProfessorFreehandPoint } from "./professorLessonPlan";

/** A tiny deterministic string hash — not for security, only to derive a
 *  stable per-shape jitter phase so neighboring shapes don't all wobble in
 *  visual lockstep with each other. */
function seedPhase(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return ((hash % 1000) / 1000) * Math.PI * 2;
}

/** Smooth, deterministic "hand tremor" — a sum of two low-frequency sine
 *  waves so the wobble reads as an unsteady pencil, not a single ripple. */
function tremor(phase: number, t: number, amplitude: number): number {
  return amplitude * (0.65 * Math.sin(t * 2.4 + phase) + 0.35 * Math.sin(t * 5.3 + phase * 1.7));
}

const RECTANGLE_POINTS_PER_SIDE = 5;
const ELLIPSE_STEP_COUNT = 24;

/** A hand-drawn-looking closed rectangle outline — edges bow slightly
 *  instead of running perfectly straight, with a small pencil "overshoot"
 *  past the starting corner where a real hand rarely lifts exactly on the
 *  mark it started at. */
export function buildOrganicRectanglePoints(bounds: Bounds, seed: string): ProfessorFreehandPoint[] {
  const phase = seedPhase(seed);
  const amplitude = Math.max(2, Math.min(bounds.w, bounds.h) * 0.035);
  const corners: Array<[number, number]> = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.w, bounds.y],
    [bounds.x + bounds.w, bounds.y + bounds.h],
    [bounds.x, bounds.y + bounds.h],
  ];

  const points: ProfessorFreehandPoint[] = [];
  let t = 0;
  for (let side = 0; side < 4; side++) {
    const [x1, y1] = corners[side];
    const [x2, y2] = corners[(side + 1) % 4];
    const isHorizontalSide = side === 0 || side === 2;
    for (let step = 0; step < RECTANGLE_POINTS_PER_SIDE; step++) {
      const f = step / RECTANGLE_POINTS_PER_SIDE;
      const baseX = x1 + (x2 - x1) * f;
      const baseY = y1 + (y2 - y1) * f;
      // Wobble perpendicular to the side's own direction, not along it, so
      // the rectangle stays recognizably rectangular while its edges bow
      // slightly like a hand-drawn line.
      const offset = tremor(phase, t, amplitude);
      points.push({
        x: baseX + (isHorizontalSide ? 0 : offset),
        y: baseY + (isHorizontalSide ? offset : 0),
        z: 0.45 + 0.25 * Math.abs(Math.sin(t * 3.1 + phase)),
      });
      t += 1;
    }
  }
  const [startX, startY] = corners[0];
  points.push({ x: startX - amplitude * 0.4, y: startY + amplitude * 0.4, z: 0.5 });
  return points;
}

/** A hand-drawn-looking closed ellipse outline — "organic circles," never
 *  a perfect mathematical ellipse. Traces slightly past a full turn, the
 *  classic hand-drawn-circle overshoot where the pencil overlaps its own
 *  start rather than meeting it exactly. */
export function buildOrganicEllipsePoints(bounds: Bounds, seed: string): ProfessorFreehandPoint[] {
  const phase = seedPhase(seed);
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  const rx = bounds.w / 2;
  const ry = bounds.h / 2;
  const amplitude = Math.max(1.5, Math.min(rx, ry) * 0.06);
  const maxRadius = Math.max(rx, ry, 1);

  const points: ProfessorFreehandPoint[] = [];
  const totalSteps = ELLIPSE_STEP_COUNT + 2;
  for (let i = 0; i <= totalSteps; i++) {
    const angle = (i / ELLIPSE_STEP_COUNT) * Math.PI * 2;
    const wobble = 1 + tremor(phase, i, amplitude) / maxRadius;
    points.push({
      x: cx + Math.cos(angle) * rx * wobble,
      y: cy + Math.sin(angle) * ry * wobble,
      z: 0.45 + 0.25 * Math.abs(Math.sin(i * 2.7 + phase)),
    });
  }
  return points;
}
