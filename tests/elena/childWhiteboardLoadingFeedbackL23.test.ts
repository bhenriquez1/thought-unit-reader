// tests/elena/childWhiteboardLoadingFeedbackL23.test.ts
// L23 — L21's retry-poll (up to 5 attempts x 1.5s = ~7.5s) can hold
// ChildWhiteboard's "units === null" loading state for several seconds with
// nothing visibly happening, which reads as frozen rather than working —
// especially to a child. Reuses ReadingBuddy.tsx's established three-dot
// "waiting" indicator (same bg-indigo-400/animate-bounce/staggered-delay
// pattern) instead of inventing a new loading treatment.
//
// No jsdom/render harness for this file in this repo — source inspection,
// matching every other Elena/Whiteboard wiring test in this directory.

import fs from "fs";
import path from "path";

const CHILD_WHITEBOARD = fs.readFileSync(path.resolve(__dirname, "../../components/elena/ChildWhiteboard.tsx"), "utf8");
const READING_BUDDY = fs.readFileSync(path.resolve(__dirname, "../../components/elena/ReadingBuddy.tsx"), "utf8");

describe("components/elena/ChildWhiteboard.tsx — the units===null loading state has a visible pulse (L23)", () => {
  it("REQUIRED: the 'Getting the page ready…' branch renders an animate-bounce indicator, not just static text", () => {
    const idx = CHILD_WHITEBOARD.indexOf("Getting the page ready");
    expect(idx).toBeGreaterThan(-1);
    const before = CHILD_WHITEBOARD.slice(Math.max(0, idx - 500), idx);
    expect(before).toMatch(/animate-bounce/);
  });

  it("REQUIRED: three staggered dots, matching the established three-dot cadence (0ms/150ms/300ms)", () => {
    const idx = CHILD_WHITEBOARD.indexOf("Getting the page ready");
    const before = CHILD_WHITEBOARD.slice(Math.max(0, idx - 500), idx);
    expect((before.match(/animate-bounce/g) ?? []).length).toBe(3);
    expect(before).toMatch(/\[animation-delay:0ms\]/);
    expect(before).toMatch(/\[animation-delay:150ms\]/);
    expect(before).toMatch(/\[animation-delay:300ms\]/);
  });

  it("reuses the SAME dot styling ReadingBuddy.tsx already established for Elena Mode's other 'waiting on something' state — not a one-off new treatment", () => {
    const rbIdx = READING_BUDDY.indexOf("animate-bounce");
    expect(rbIdx).toBeGreaterThan(-1);
    const rbDot = READING_BUDDY.slice(rbIdx - 40, rbIdx + 20);
    expect(rbDot).toMatch(/rounded-full/);
    expect(rbDot).toMatch(/bg-indigo-400/);
    const cwIdx = CHILD_WHITEBOARD.indexOf("animate-bounce");
    const cwDot = CHILD_WHITEBOARD.slice(cwIdx - 40, cwIdx + 60);
    expect(cwDot).toMatch(/rounded-full/);
    expect(cwDot).toMatch(/bg-indigo-400/);
  });

  it("the empty-state and ready-state branches are unaffected — only the null/loading branch changed", () => {
    expect(CHILD_WHITEBOARD).toMatch(/There&apos;s nothing to draw on this page yet — keep reading and check back!/);
    expect(CHILD_WHITEBOARD).toMatch(/audience="child"/);
  });
});
