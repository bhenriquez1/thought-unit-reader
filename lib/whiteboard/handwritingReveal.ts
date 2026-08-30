// lib/whiteboard/handwritingReveal.ts
// M7 — makes handwriting the PRIMARY visual layer on the live Professor
// Whiteboard: a freshly-taught write/draw-freehand shape now visibly writes
// or draws itself in over its own action's durationMs, instead of the whole
// label/stroke simply popping into existence complete. Pure math only (no
// tldraw/React import) so this stays real behavioral-test coverage, not the
// source-inspection convention the rest of TldrawCanvas.tsx's tests use for
// that file itself (testEnvironment: "node", no jsdom/RTL available there).
//
// Scope is deliberately narrow: only NEWLY created "write" (text) and
// "draw-freehand" (pen stroke) shapes reveal progressively, and only during
// genuine forward autoplay (TldrawCanvas.tsx's own `animate` flag on
// applyStateAtStep) — never on a jump/restart/Previous, which stay the
// existing exact-state-instantly contract ("manual controls always instant,
// exact-state jumps"). Structural geo/arrow shapes are unaffected; they're
// framing, not handwriting.

/** Reveal runs over a clamped slice of the action's own durationMs — long
 *  enough to actually read as writing, never so short to be imperceptible
 *  for a very quick action. Doesn't need to line up exactly with
 *  advanceForPlayback's own dwell timer for the same action: if the reveal
 *  is still finishing when the timeline moves on, applyStateAtStep's very
 *  next call (whichever shape it's for) recomputes this shape's state from
 *  scratch and pushes its exact full content as a plain update — the same
 *  self-healing that already makes Next/Previous/Restart exact-state jumps
 *  correct regardless of what was on screen before. */
export const REVEAL_MIN_DURATION_MS = 220;
export const REVEAL_MAX_DURATION_MS = 900;

/** Discrete frames rather than true 60fps rAF — enough to read as smooth
 *  handwriting without hammering the tldraw store with a per-frame commit. */
export const REVEAL_FRAME_COUNT = 10;

export function clampRevealDurationMs(durationMs: number): number {
  return Math.min(REVEAL_MAX_DURATION_MS, Math.max(REVEAL_MIN_DURATION_MS, durationMs));
}

/** Delay in ms between reveal ticks for a given action duration. */
export function revealFrameIntervalMs(durationMs: number, frameCount: number = REVEAL_FRAME_COUNT): number {
  if (frameCount <= 0) return clampRevealDurationMs(durationMs);
  return clampRevealDurationMs(durationMs) / frameCount;
}

/** frameIndex is 1-based (the Nth tick, 1..frameCount) — frame 0 is never
 *  scheduled as a tick; it's the stub already rendered at creation time. */
export function revealFraction(frameIndex: number, frameCount: number = REVEAL_FRAME_COUNT): number {
  if (frameCount <= 0) return 1;
  return Math.min(1, Math.max(0, frameIndex / frameCount));
}

/** Grows left-to-right, character by character — reads as "being written."
 *  Ceil (not round/floor) so the LAST character is never clipped by
 *  floating-point fraction arithmetic landing a hair under 1, and fraction
 *  >= 1 always returns the exact full string rather than a computed slice. */
export function sliceTextForReveal(fullText: string, fraction: number): string {
  if (fraction >= 1) return fullText;
  if (fraction <= 0) return "";
  return fullText.slice(0, Math.ceil(fullText.length * fraction));
}

/** Same idea for a freehand stroke's point path. A pen stroke needs at
 *  least 2 points to render as a visible line at all, so the floor is 2 (or
 *  the full array, if it's already shorter than that) rather than 0 — the
 *  very first frame already shows a pen touching down, not nothing. */
export function slicePointsForReveal<T>(fullPoints: T[], fraction: number): T[] {
  if (fraction >= 1) return fullPoints;
  const floor = Math.min(fullPoints.length, 2);
  const count = Math.max(floor, Math.ceil(fullPoints.length * fraction));
  return fullPoints.slice(0, count);
}
