// tests/whiteboard/handwritingReveal.test.ts
// M7 — real behavioral tests for lib/whiteboard/handwritingReveal.ts, the
// pure math behind making handwriting the PRIMARY Whiteboard visual layer:
// a freshly-taught write/draw-freehand shape now visibly writes/draws
// itself in over its own action's durationMs instead of popping into
// existence complete. No tldraw/React dependency here, so unlike
// TldrawCanvas.tsx's own tests (source-inspection only — this repo's jest
// config runs testEnvironment: "node", no jsdom/RTL) this file exercises
// the actual math.

import {
  clampRevealDurationMs, revealFrameIntervalMs, revealFraction,
  sliceTextForReveal, slicePointsForReveal,
  REVEAL_MIN_DURATION_MS, REVEAL_MAX_DURATION_MS, REVEAL_FRAME_COUNT,
} from "@/lib/whiteboard/handwritingReveal";

describe("clampRevealDurationMs", () => {
  it("REQUIRED: clamps a very short action duration up to the minimum — otherwise the reveal would be imperceptible", () => {
    expect(clampRevealDurationMs(10)).toBe(REVEAL_MIN_DURATION_MS);
  });

  it("REQUIRED: clamps a very long action duration down to the maximum — otherwise a long dwell would make the reveal feel sluggish", () => {
    expect(clampRevealDurationMs(10_000)).toBe(REVEAL_MAX_DURATION_MS);
  });

  it("passes a duration already inside the band through unchanged", () => {
    expect(clampRevealDurationMs(500)).toBe(500);
  });

  it("REQUIRED: the band is well-formed — min is strictly below max, both strictly positive", () => {
    expect(REVEAL_MIN_DURATION_MS).toBeGreaterThan(0);
    expect(REVEAL_MIN_DURATION_MS).toBeLessThan(REVEAL_MAX_DURATION_MS);
  });
});

describe("revealFrameIntervalMs", () => {
  it("REQUIRED: divides the clamped duration evenly across the frame count", () => {
    expect(revealFrameIntervalMs(500, 10)).toBeCloseTo(50, 5);
  });

  it("uses the clamped duration, not the raw one, when the raw duration is out of band", () => {
    expect(revealFrameIntervalMs(10, 10)).toBeCloseTo(REVEAL_MIN_DURATION_MS / 10, 5);
    expect(revealFrameIntervalMs(10_000, 10)).toBeCloseTo(REVEAL_MAX_DURATION_MS / 10, 5);
  });

  it("defaults to REVEAL_FRAME_COUNT when no frame count is given", () => {
    expect(revealFrameIntervalMs(500)).toBeCloseTo(clampRevealDurationMs(500) / REVEAL_FRAME_COUNT, 5);
  });

  it("degrades to the full duration rather than dividing by zero for a zero/negative frame count", () => {
    expect(revealFrameIntervalMs(500, 0)).toBe(clampRevealDurationMs(500));
    expect(revealFrameIntervalMs(500, -3)).toBe(clampRevealDurationMs(500));
  });
});

describe("revealFraction", () => {
  it("REQUIRED: frame 0 is 0% revealed, the final frame is 100%", () => {
    expect(revealFraction(0, 10)).toBe(0);
    expect(revealFraction(10, 10)).toBe(1);
  });

  it("REQUIRED: is monotonically increasing across frames — never a later frame showing LESS than an earlier one", () => {
    const fractions = Array.from({ length: 11 }, (_, i) => revealFraction(i, 10));
    for (let i = 1; i < fractions.length; i++) {
      expect(fractions[i]).toBeGreaterThanOrEqual(fractions[i - 1]);
    }
  });

  it("clamps a frameIndex past frameCount to exactly 1, never overshooting", () => {
    expect(revealFraction(15, 10)).toBe(1);
  });

  it("never returns a negative fraction for a negative frameIndex", () => {
    expect(revealFraction(-1, 10)).toBe(0);
  });

  it("degrades to fully-revealed for a zero/negative frame count rather than dividing by zero", () => {
    expect(revealFraction(1, 0)).toBe(1);
  });
});

describe("sliceTextForReveal", () => {
  it("REQUIRED: fraction 0 is empty, fraction 1 is the exact full string", () => {
    expect(sliceTextForReveal("Ionic Bonding", 0)).toBe("");
    expect(sliceTextForReveal("Ionic Bonding", 1)).toBe("Ionic Bonding");
  });

  it("REQUIRED: grows left-to-right — a smaller fraction is always a PREFIX of a larger fraction's result", () => {
    const text = "Electrons transfer between atoms.";
    const half = sliceTextForReveal(text, 0.5);
    const full = sliceTextForReveal(text, 1);
    expect(full.startsWith(half)).toBe(true);
  });

  it("REQUIRED: the final character is never clipped by floating-point fraction arithmetic (ceil, not floor/round)", () => {
    // 9/10 = 0.9 lands a hair under 1 in floating point for some inputs;
    // ceil guarantees the last frame (fraction >= 1, handled above) always
    // gets the WHOLE string, and near-1 fractions still reach the last char.
    const text = "abc";
    expect(sliceTextForReveal(text, 0.99)).toBe("abc");
  });

  it("never grows past the full string's length for any fraction >= 1", () => {
    expect(sliceTextForReveal("abc", 1.5).length).toBe(3);
  });

  it("handles an empty string without throwing", () => {
    expect(sliceTextForReveal("", 0.5)).toBe("");
  });
});

describe("slicePointsForReveal", () => {
  function points(n: number) {
    return Array.from({ length: n }, (_, i) => ({ x: i, y: i, z: 0.5 }));
  }

  it("REQUIRED: fraction 1 returns the exact full array", () => {
    const p = points(20);
    expect(slicePointsForReveal(p, 1)).toEqual(p);
  });

  it("REQUIRED: never drops below 2 points once fraction > 0 — a stroke needs at least 2 points to render as a visible line, not nothing", () => {
    const p = points(20);
    expect(slicePointsForReveal(p, 0).length).toBeGreaterThanOrEqual(2);
    expect(slicePointsForReveal(p, 0.01).length).toBeGreaterThanOrEqual(2);
  });

  it("REQUIRED: grows monotonically — a smaller fraction is always a PREFIX of a larger fraction's result", () => {
    const p = points(20);
    const early = slicePointsForReveal(p, 0.3);
    const later = slicePointsForReveal(p, 0.7);
    expect(later.slice(0, early.length)).toEqual(early);
  });

  it("returns the whole (short) array as-is when it already has fewer than 2 points", () => {
    const p = points(1);
    expect(slicePointsForReveal(p, 0)).toEqual(p);
  });

  it("returns an empty array unchanged regardless of fraction", () => {
    expect(slicePointsForReveal([], 0.5)).toEqual([]);
  });
});
