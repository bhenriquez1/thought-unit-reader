// tests/whiteboard/organicOutline.test.ts
// Correction (Whiteboard visual language) — behavioral tests for the pure
// point-path generators buildProfessorTeachingActions.ts now uses to draw
// ordinary/hub concept nodes as genuine hand-drawn outlines instead of a
// pristine tldraw geo rectangle/ellipse. See lib/whiteboard/organicOutline.ts.

import { buildOrganicRectanglePoints, buildOrganicEllipsePoints } from "../../lib/whiteboard/organicOutline";
import type { Bounds } from "../../lib/whiteboard/professorLessonPlan";

const BOUNDS: Bounds = { x: 40, y: 60, w: 240, h: 80 };

describe("buildOrganicRectanglePoints", () => {
  it("REQUIRED: is deterministic — the same (bounds, seed) always produces the same points, required by computeCanvasStateAtStep's recompute-from-scratch guarantee", () => {
    const a = buildOrganicRectanglePoints(BOUNDS, "shape:n1");
    const b = buildOrganicRectanglePoints(BOUNDS, "shape:n1");
    expect(a).toEqual(b);
  });

  it("a different seed produces a different wobble — neighboring shapes don't wobble in lockstep", () => {
    const a = buildOrganicRectanglePoints(BOUNDS, "shape:n1");
    const b = buildOrganicRectanglePoints(BOUNDS, "shape:n2");
    expect(a).not.toEqual(b);
  });

  it("produces enough points to read as a genuine hand-drawn stroke, not a 4-point polygon", () => {
    const points = buildOrganicRectanglePoints(BOUNDS, "shape:n1");
    expect(points.length).toBeGreaterThan(16);
  });

  it("REQUIRED: is organic, not a perfect rectangle — at least one point deviates from the exact mathematical rectangle boundary", () => {
    const points = buildOrganicRectanglePoints(BOUNDS, "shape:n1");
    const onExactBoundary = (p: { x: number; y: number }) =>
      (p.x === BOUNDS.x || p.x === BOUNDS.x + BOUNDS.w) && p.y >= BOUNDS.y && p.y <= BOUNDS.y + BOUNDS.h
      || (p.y === BOUNDS.y || p.y === BOUNDS.y + BOUNDS.h) && p.x >= BOUNDS.x && p.x <= BOUNDS.x + BOUNDS.w;
    expect(points.some(p => !onExactBoundary(p))).toBe(true);
  });

  it("stays roughly within the node's own bounds — never wanders far enough to overlap a neighboring shape", () => {
    const points = buildOrganicRectanglePoints(BOUNDS, "shape:n1");
    const margin = Math.min(BOUNDS.w, BOUNDS.h) * 0.15;
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(BOUNDS.x - margin);
      expect(p.x).toBeLessThanOrEqual(BOUNDS.x + BOUNDS.w + margin);
      expect(p.y).toBeGreaterThanOrEqual(BOUNDS.y - margin);
      expect(p.y).toBeLessThanOrEqual(BOUNDS.y + BOUNDS.h + margin);
    }
  });

  it("every point carries a pressure value in a plausible pen-pressure range", () => {
    const points = buildOrganicRectanglePoints(BOUNDS, "shape:n1");
    for (const p of points) {
      expect(p.z).toBeGreaterThanOrEqual(0);
      expect(p.z).toBeLessThanOrEqual(1);
    }
  });

  it("never produces NaN/Infinity even for a very small or thin bounds", () => {
    const tiny = buildOrganicRectanglePoints({ x: 0, y: 0, w: 4, h: 4 }, "shape:tiny");
    for (const p of tiny) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});

describe("buildOrganicEllipsePoints", () => {
  it("REQUIRED: is deterministic — the same (bounds, seed) always produces the same points", () => {
    const a = buildOrganicEllipsePoints(BOUNDS, "shape:hub");
    const b = buildOrganicEllipsePoints(BOUNDS, "shape:hub");
    expect(a).toEqual(b);
  });

  it("a different seed produces a different wobble", () => {
    const a = buildOrganicEllipsePoints(BOUNDS, "shape:hub1");
    const b = buildOrganicEllipsePoints(BOUNDS, "shape:hub2");
    expect(a).not.toEqual(b);
  });

  it("REQUIRED: is organic — 'organic circles,' never a perfect mathematical ellipse. At least one point deviates measurably from the exact ellipse radius at its angle", () => {
    const points = buildOrganicEllipsePoints(BOUNDS, "shape:hub");
    const cx = BOUNDS.x + BOUNDS.w / 2;
    const cy = BOUNDS.y + BOUNDS.h / 2;
    const rx = BOUNDS.w / 2;
    const ry = BOUNDS.h / 2;
    const onExactEllipse = (p: { x: number; y: number }) => {
      const nx = (p.x - cx) / rx;
      const ny = (p.y - cy) / ry;
      return Math.abs(nx * nx + ny * ny - 1) < 1e-6;
    };
    expect(points.some(p => !onExactEllipse(p))).toBe(true);
  });

  it("traces slightly past a full turn — the classic hand-drawn-circle overshoot where the pencil overlaps its own start", () => {
    const points = buildOrganicEllipsePoints(BOUNDS, "shape:hub");
    // First and last point are both near the 0-degree angle (allowing for
    // wobble), confirming the path goes all the way around and a bit further
    // rather than stopping exactly at the last unique angle.
    const first = points[0];
    const last = points[points.length - 1];
    const cx = BOUNDS.x + BOUNDS.w / 2;
    expect(Math.sign(first.x - cx)).toBe(Math.sign(last.x - cx));
  });

  it("stays roughly within the node's own bounds", () => {
    const points = buildOrganicEllipsePoints(BOUNDS, "shape:hub");
    const margin = Math.min(BOUNDS.w, BOUNDS.h) * 0.2;
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(BOUNDS.x - margin);
      expect(p.x).toBeLessThanOrEqual(BOUNDS.x + BOUNDS.w + margin);
      expect(p.y).toBeGreaterThanOrEqual(BOUNDS.y - margin);
      expect(p.y).toBeLessThanOrEqual(BOUNDS.y + BOUNDS.h + margin);
    }
  });

  it("never produces NaN/Infinity even for a very small bounds", () => {
    const tiny = buildOrganicEllipsePoints({ x: 0, y: 0, w: 2, h: 2 }, "shape:tiny");
    for (const p of tiny) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});
