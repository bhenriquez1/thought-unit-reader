// lib/whiteboard/textMetrics.ts
// Pure text-sizing/shape helpers for the professor-performance whiteboard —
// the direct fix for "boxes are too narrow, so sentences wrap vertically."
// Node width is now DERIVED from label length instead of a fixed constant,
// and "paragraph-shaped" content is detected so it never lands inside a node.

// tldraw's geo-shape label font at size "m" renders considerably wider per
// character than a typical UI font (LABEL_FONT_SIZES.m in
// tldraw/dist-esm/lib/shapes/shared/default-shape-constants.mjs is a large
// multiplier) — verified empirically against a live render: an 8-word/
// ~36-character label needed well over 400px to stop wrapping.
const CHAR_WIDTH_PX = 15;
const HORIZONTAL_PAD_PX = 44; // left+right inner padding
const MIN_LABEL_WIDTH = 140;
// A full 8-word label (the top of the "2-8 words" range) can run ~40-50
// characters — the cap must comfortably fit that on ONE line, or the exact
// "boxes are too narrow, sentences wrap vertically" bug this module exists
// to fix would still happen right at the top of the allowed label length.
const MAX_LABEL_WIDTH = 700;
const LINE_HEIGHT_PX = 26;
const VERTICAL_PAD_PX = 30; // matches HORIZONTAL_PAD_PX's role, but for top+bottom inner padding
const MIN_LABEL_HEIGHT = 56; // previous fixed LABEL_HEIGHT — floor for a single-line label

/** Auto-computed box width from a short label's length — landscape-friendly,
 *  never so narrow that a short phrase wraps onto multiple lines. */
export function estimateLabelWidth(label: string): number {
  const len = label.trim().length;
  const raw = len * CHAR_WIDTH_PX + HORIZONTAL_PAD_PX;
  return Math.round(Math.min(MAX_LABEL_WIDTH, Math.max(MIN_LABEL_WIDTH, raw)));
}

/** Height that actually accounts for wrapping — a label whose natural width
 *  (len * CHAR_WIDTH_PX) exceeds MAX_LABEL_WIDTH gets clamped by
 *  estimateLabelWidth() and wraps onto more than one line; the box must be
 *  tall enough to hold every line, not just the previous fixed 56px. Passing
 *  no label (or an empty one) still returns a sensible single-line floor. */
export function estimateLabelHeight(label = ""): number {
  const trimmed = label.trim();
  if (!trimmed) return MIN_LABEL_HEIGHT;
  const width = estimateLabelWidth(trimmed);
  const charsPerLine = Math.max(1, Math.floor((width - HORIZONTAL_PAD_PX) / CHAR_WIDTH_PX));
  const lines = Math.max(1, Math.ceil(trimmed.length / charsPerLine));
  return Math.max(MIN_LABEL_HEIGHT, lines * LINE_HEIGHT_PX + VERTICAL_PAD_PX);
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** A node label reads as "paragraph-shaped" — and must never render inside a
 *  drawn node — when it runs more than one sentence or is simply long. The
 *  professor's spoken narration carries the detail; the canvas shows structure. */
export function isParagraphShaped(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 60) return true;
  const sentenceEnders = (trimmed.match(/[.!?](?:\s|$)/g) ?? []).length;
  return sentenceEnders > 1;
}

/** Deterministically clamp arbitrary text down to a short, hand-written-style
 *  phrase — word-boundary truncation, default cap 8 words (matches "labels
 *  must normally contain 2-8 words"). Used both to sanitize a too-long
 *  AI-provided shortLabel and to build the AI-free deterministic fallback. */
export function clampToShortLabel(text: string, maxWords = 8): string {
  const words = text.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}
