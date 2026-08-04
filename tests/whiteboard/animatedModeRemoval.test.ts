// tests/whiteboard/animatedModeRemoval.test.ts
//
// Regression guard: the Canvas / Animated toggle and VisualSceneEngine render
// path were removed in an earlier stabilization sprint. This test ensures
// neither creeps back without a deliberate decision.
//
// A second, later sprint removed ALL slideshow/reveal machinery from the
// remaining tldraw canvas itself: Student/Instructor mode toggle, Play,
// Pause, Previous, Next, Restart, Reveal All, speed controls, slide
// counters, and narration tied to slide advancement (AvrrioWhiteboard.tsx,
// which existed only to host the Student/Instructor toggle, was deleted
// entirely — WhiteboardPanel now renders TldrawCanvas directly). The
// whiteboard now has exactly one canvas: one editable tldraw canvas that
// opens already fully populated with the complete diagram — no reveal
// sequence, no mode toggle.

import fs from "fs";
import path from "path";

const WHITEBOARD_DIR    = path.resolve(__dirname, "../../components/whiteboard");
const WHITEBOARD_PANEL  = path.resolve(__dirname, "../../components/WhiteboardPanel.tsx");
const VISUAL_ENGINE     = path.join(WHITEBOARD_DIR, "VisualSceneEngine.tsx");
const AVRRIO_WHITEBOARD = path.join(WHITEBOARD_DIR, "AvrrioWhiteboard.tsx");
const NARRATION_CTRL    = path.join(WHITEBOARD_DIR, "NarrationController.ts");
const TLDRAW_CANVAS     = path.join(WHITEBOARD_DIR, "TldrawCanvas.tsx");

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

describe("Canvas preserved — TldrawCanvas rendered directly (AvrrioWhiteboard deleted)", () => {
  it("WhiteboardPanel imports TldrawCanvas directly, not AvrrioWhiteboard", () => {
    const src = fs.readFileSync(WHITEBOARD_PANEL, "utf8");
    expect(src).toMatch(/import\("@\/components\/whiteboard\/TldrawCanvas"\)/);
    expect(src).not.toMatch(/AvrrioWhiteboard/);
  });

  it("WhiteboardPanel renders <TldrawCanvas", () => {
    const src = fs.readFileSync(WHITEBOARD_PANEL, "utf8");
    expect(src).toMatch(/<TldrawCanvas/);
  });

  it("AvrrioWhiteboard.tsx no longer exists — it only ever hosted the removed Student/Instructor toggle", () => {
    expect(fs.existsSync(AVRRIO_WHITEBOARD)).toBe(false);
  });
});

describe("Slideshow/reveal machinery removed from TldrawCanvas.tsx", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(TLDRAW_CANVAS, "utf8"); });

  it("no Student/Instructor mode toggle or studentMode prop", () => {
    expect(src).not.toMatch(/studentMode/);
    expect(src).not.toMatch(/StudentToolbar/);
  });

  it("no play/pause/step/restart/reveal-all controller functions", () => {
    expect(src).not.toMatch(/handleNext/);
    expect(src).not.toMatch(/handlePrev/);
    expect(src).not.toMatch(/handleRestart/);
    expect(src).not.toMatch(/handleRevealAll/);
    expect(src).not.toMatch(/isPlaying/);
  });

  it("no speed controls or slide counter", () => {
    expect(src).not.toMatch(/SPEED_DELAY/);
    expect(src).not.toMatch(/RevealSpeed/);
    expect(src).not.toMatch(/revealIndex/);
  });

  it("no narration-tied-to-slide-advancement state", () => {
    expect(src).not.toMatch(/narrationEnabled/);
    expect(src).not.toMatch(/narrationText/);
    expect(src).not.toMatch(/NarrationController/);
  });

  it("shapes are created without a hidden (opacity: 0) reveal state — visible immediately", () => {
    // Exact opacity: 0 (the reveal-hidden state) — not opacity: 0.35 etc.
    // (the unrelated loading-skeleton shimmer), so the regex requires a
    // non-digit immediately after the 0.
    expect(src).not.toMatch(/opacity:\s*0(?!\.\d)/);
  });

  it("NarrationController.ts was deleted (confirmed zero other consumers before removal)", () => {
    expect(fs.existsSync(NARRATION_CTRL)).toBe(false);
  });

  it("still exports a default TldrawCanvas component and keeps the license gate + canvas-init-failure guard", () => {
    expect(src).toMatch(/export default function TldrawCanvas/);
    expect(src).toMatch(/licenseMissingInProduction/);
    expect(src).toMatch(/canvasInitFailure/);
  });
});
