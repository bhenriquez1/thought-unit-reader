// tests/whiteboard/animatedModeRemoval.test.ts
//
// Regression guard: the Canvas / Animated toggle and VisualSceneEngine render
// path were removed in the stabilization sprint. This test ensures neither
// creeps back without a deliberate decision.
//
// The whiteboard now has exactly one canvas: the editable tldraw canvas with
// progressive reveal controls (Play / Pause / Previous / Next / Restart /
// speed). There is no separate "Animated" renderer or slideshow path.

import fs from "fs";
import path from "path";

const WHITEBOARD_DIR   = path.resolve(__dirname, "../../components/whiteboard");
const WHITEBOARD_PANEL = path.resolve(__dirname, "../../components/WhiteboardPanel.tsx");
const VISUAL_ENGINE    = path.join(WHITEBOARD_DIR, "VisualSceneEngine.tsx");

describe("Animated mode removal — VisualSceneEngine", () => {
  it("VisualSceneEngine.tsx does NOT exist (intentional deletion)", () => {
    expect(fs.existsSync(VISUAL_ENGINE)).toBe(false);
  });

  it("WhiteboardPanel does NOT import VisualSceneEngine", () => {
    const src = fs.readFileSync(WHITEBOARD_PANEL, "utf8");
    expect(src).not.toMatch(/import VisualSceneEngine/);
  });

  it("WhiteboardPanel does NOT render <VisualSceneEngine", () => {
    const src = fs.readFileSync(WHITEBOARD_PANEL, "utf8");
    expect(src).not.toMatch(/<VisualSceneEngine/);
  });
});

describe("Animated mode removal — canvasMode toggle", () => {
  it('WhiteboardPanel has no canvasMode state ("tldraw" | "visual")', () => {
    const src = fs.readFileSync(WHITEBOARD_PANEL, "utf8");
    expect(src).not.toMatch(/canvasMode/);
  });

  it('WhiteboardPanel has no "Animated" button label', () => {
    const src = fs.readFileSync(WHITEBOARD_PANEL, "utf8");
    // The button labelled "Animated" must be gone
    expect(src).not.toMatch(/>Animated</);
  });

  it("WhiteboardPanel has no setCanvasMode call", () => {
    const src = fs.readFileSync(WHITEBOARD_PANEL, "utf8");
    expect(src).not.toMatch(/setCanvasMode/);
  });
});

describe("Canvas preserved — AvrrioWhiteboard still rendered", () => {
  it("WhiteboardPanel still imports AvrrioWhiteboard", () => {
    const src = fs.readFileSync(WHITEBOARD_PANEL, "utf8");
    expect(src).toMatch(/AvrrioWhiteboard/);
  });

  it("WhiteboardPanel still renders <AvrrioWhiteboard", () => {
    const src = fs.readFileSync(WHITEBOARD_PANEL, "utf8");
    expect(src).toMatch(/<AvrrioWhiteboard/);
  });
});
