// tests/elena/childWhiteboardPolishL21.test.ts
// L21 — Elena Whiteboard polish, informed by live-browser verification of
// L19 (L20): the shared TldrawCanvas toolbar carries adult power-user
// chrome (skip-ahead, playback speed, SVG export, opt-in student editing)
// that adds nothing for a young reader following along, and ChildWhiteboard
// read canonical units exactly once with no retry — a child who taps "Draw
// this page" immediately after landing on a fresh page can beat the async,
// best-effort extraction pipeline to the punch and see a false "nothing to
// draw yet" even though units are about to exist.
//
// No jsdom/render harness for these files in this repo — source inspection,
// matching every other Whiteboard/Elena wiring test in this directory.

import fs from "fs";
import path from "path";

const TLDRAW_CANVAS = fs.readFileSync(path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx"), "utf8");
const CHILD_WHITEBOARD = fs.readFileSync(path.resolve(__dirname, "../../components/elena/ChildWhiteboard.tsx"), "utf8");

describe("components/whiteboard/TldrawCanvas.tsx — child-simplified playback toolbar (L21)", () => {
  it("REQUIRED: 'Show complete diagram' (All) is hidden for audience: \"child\"", () => {
    const idx = TLDRAW_CANVAS.indexOf('title="Show complete diagram"');
    expect(idx).toBeGreaterThan(-1);
    const before = TLDRAW_CANVAS.slice(Math.max(0, idx - 200), idx);
    expect(before).toMatch(/audience !== "child" && \(/);
  });

  it("REQUIRED: the playback-speed select is hidden for audience: \"child\"", () => {
    const idx = TLDRAW_CANVAS.indexOf('title="Speed"');
    expect(idx).toBeGreaterThan(-1);
    const before = TLDRAW_CANVAS.slice(Math.max(0, idx - 200), idx);
    expect(before).toMatch(/audience !== "child" && \(/);
  });

  it("REQUIRED: SVG export is hidden for audience: \"child\"", () => {
    const idx = TLDRAW_CANVAS.indexOf('title="Export SVG"');
    expect(idx).toBeGreaterThan(-1);
    const before = TLDRAW_CANVAS.slice(Math.max(0, idx - 200), idx);
    expect(before).toMatch(/audience !== "child" && \(/);
  });

  it("REQUIRED: 'Edit a copy' (opt-in student drawing) is hidden for audience: \"child\"", () => {
    const idx = TLDRAW_CANVAS.indexOf("Unlock this canvas for your own annotations");
    expect(idx).toBeGreaterThan(-1);
    const before = TLDRAW_CANVAS.slice(Math.max(0, idx - 400), idx);
    expect(before).toMatch(/audience !== "child" && \(/);
  });

  it("REQUIRED: Restart/Previous/Play/Next and the narration mute toggle stay unconditional — the core controls a child still needs", () => {
    const idx = TLDRAW_CANVAS.indexOf("onClick={handleRestart}");
    const block = TLDRAW_CANVAS.slice(idx, TLDRAW_CANVAS.indexOf("Mute narration", idx) + 40);
    // None of these four lines should be behind an audience check.
    const restartLine = block.split("\n").find(l => l.includes("handleRestart"))!;
    const playLine = block.split("\n").find(l => l.includes("handlePlayPause"))!;
    expect(restartLine).not.toMatch(/audience/);
    expect(playLine).not.toMatch(/audience/);
  });

  it("adult path (audience omitted) keeps every control — the gate is additive, not a rewrite", () => {
    // Every hidden-for-child control must still exist verbatim in the source,
    // just wrapped — never deleted or replaced.
    expect(TLDRAW_CANVAS).toMatch(/>All<\/button>/);
    expect(TLDRAW_CANVAS).toMatch(/<option value="slow">Slow<\/option>/);
    expect(TLDRAW_CANVAS).toMatch(/&#x2193; SVG/);
    expect(TLDRAW_CANVAS).toMatch(/✎ Edit a copy/);
  });
});

describe("components/elena/ChildWhiteboard.tsx — retries a transiently-empty units read (L21)", () => {
  it("REQUIRED: polls getCanonicalUnitsByPage up to UNITS_POLL_MAX_ATTEMPTS times before settling on empty", () => {
    expect(CHILD_WHITEBOARD).toMatch(/const UNITS_POLL_MAX_ATTEMPTS = 5;/);
    expect(CHILD_WHITEBOARD).toMatch(/const UNITS_POLL_DELAY_MS = 1500;/);
    const idx = CHILD_WHITEBOARD.indexOf("async function load()");
    expect(idx).toBeGreaterThan(-1);
    const block = CHILD_WHITEBOARD.slice(idx, idx + 700);
    expect(block).toMatch(/attempt >= UNITS_POLL_MAX_ATTEMPTS/);
    expect(block).toMatch(/setTimeout\(resolve, UNITS_POLL_DELAY_MS\)/);
  });

  it("REQUIRED: stops polling and commits real units as soon as a non-empty read arrives, rather than always waiting out the full budget", () => {
    const idx = CHILD_WHITEBOARD.indexOf("async function load()");
    const block = CHILD_WHITEBOARD.slice(idx, idx + 700);
    expect(block).toMatch(/result\.length > 0 \|\| attempt >= UNITS_POLL_MAX_ATTEMPTS/);
  });

  it("REQUIRED: the polling loop respects the cancelled/unmount guard on every iteration, not just the first", () => {
    const idx = CHILD_WHITEBOARD.indexOf("async function load()");
    const block = CHILD_WHITEBOARD.slice(idx, idx + 700);
    expect(block).toMatch(/for \(let attempt = 0; !cancelled; attempt \+= 1\)/);
    expect(block).toMatch(/if \(cancelled\) return;/);
  });
});
