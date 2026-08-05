// tests/whiteboard/whiteboardTeachingPerformance.test.ts
//
// History: an earlier sprint removed the separate Canvas/Animated tab
// (VisualSceneEngine.tsx, WhiteboardPanel's canvasMode toggle) — one
// Whiteboard, not two. A later sprint then removed ALL playback controls
// from that one remaining canvas (Play/Pause/Next/Previous/Restart/speed/
// narration, plus the Student/Instructor toggle and AvrrioWhiteboard.tsx
// that hosted it), reasoning that opacity-reveal slides added no teaching
// value. That reasoning was overridden: a "recorded professor" who draws
// the lesson while narrating it IS more effective than a static diagram —
// but it must be a deterministic, precomputed drawing PERFORMANCE (a
// TeachingTimeline of draw-stroke/reveal-label/draw-arrow/emphasize
// actions), never the old per-shape opacity-toggle-on-click-handlers hack,
// and never a second canvas/tab.
//
// Current, correct state (this file):
//   - Still exactly one Whiteboard — VisualSceneEngine and the
//     Canvas/Animated tab stay removed; AvrrioWhiteboard.tsx (Student/
//     Instructor toggle) stays removed; TldrawCanvas is rendered directly.
//   - Play/Pause/Previous/Next/Restart/speed/narration ARE present again,
//     but implemented via lib/whiteboard/teachingTimeline.ts's deterministic
//     TeachingTimeline + computeVisualStates — see
//     tests/whiteboard/teachingTimeline.test.ts for the pure-function tests
//     of that module.
//   - Every teaching-layer shape is created isLocked: true — the AI/
//     deterministic drawing is read-only to the student. The student's own
//     annotation layer is simply tldraw's native (unlocked) toolbar,
//     already visible — no separate mode/tab for that either.

import fs from "fs";
import path from "path";

const WHITEBOARD_DIR    = path.resolve(__dirname, "../../components/whiteboard");
const WHITEBOARD_PANEL  = path.resolve(__dirname, "../../components/WhiteboardPanel.tsx");
const VISUAL_ENGINE     = path.join(WHITEBOARD_DIR, "VisualSceneEngine.tsx");
const AVRRIO_WHITEBOARD = path.join(WHITEBOARD_DIR, "AvrrioWhiteboard.tsx");
const TLDRAW_CANVAS     = path.join(WHITEBOARD_DIR, "TldrawCanvas.tsx");

describe("Still one Whiteboard — VisualSceneEngine / Canvas-Animated tab stay removed", () => {
  it("VisualSceneEngine.tsx does NOT exist", () => {
    expect(fs.existsSync(VISUAL_ENGINE)).toBe(false);
  });

  it("WhiteboardPanel does NOT import or render VisualSceneEngine", () => {
    const src = fs.readFileSync(WHITEBOARD_PANEL, "utf8");
    expect(src).not.toMatch(/import VisualSceneEngine/);
    expect(src).not.toMatch(/<VisualSceneEngine/);
  });

  it('WhiteboardPanel has no canvasMode state or "Animated" button', () => {
    const src = fs.readFileSync(WHITEBOARD_PANEL, "utf8");
    expect(src).not.toMatch(/canvasMode/);
    expect(src).not.toMatch(/>Animated</);
    expect(src).not.toMatch(/setCanvasMode/);
  });
});

describe("Still one Whiteboard — no Student/Instructor mode toggle, AvrrioWhiteboard stays deleted", () => {
  it("WhiteboardPanel imports TldrawCanvas directly, not AvrrioWhiteboard", () => {
    const src = fs.readFileSync(WHITEBOARD_PANEL, "utf8");
    expect(src).toMatch(/import\("@\/components\/whiteboard\/TldrawCanvas"\)/);
    expect(src).not.toMatch(/AvrrioWhiteboard/);
  });

  it("AvrrioWhiteboard.tsx does not exist", () => {
    expect(fs.existsSync(AVRRIO_WHITEBOARD)).toBe(false);
  });

  it("TldrawCanvas.tsx has no studentMode prop or Student/Instructor toggle", () => {
    const src = fs.readFileSync(TLDRAW_CANVAS, "utf8");
    expect(src).not.toMatch(/studentMode/);
    expect(src).not.toMatch(/StudentToolbar/);
  });
});

describe("Playback controls are restored, driven by the deterministic TeachingTimeline", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(TLDRAW_CANVAS, "utf8"); });

  it("imports the pure timeline module rather than reimplementing reveal logic inline", () => {
    expect(src).toMatch(/import \{\s*\n?\s*buildTeachingTimeline, computeVisualStates, stepDurationMs, FAINT_OPACITY,/);
    expect(src).toMatch(/from "@\/lib\/whiteboard\/teachingTimeline"/);
  });

  it("Play/Pause/Previous/Next/Restart/Show-complete-diagram handlers exist", () => {
    expect(src).toMatch(/const handlePlayPause = useCallback/);
    expect(src).toMatch(/const handleNext = useCallback/);
    expect(src).toMatch(/const handlePrev = useCallback/);
    expect(src).toMatch(/const handleRestart = useCallback/);
    expect(src).toMatch(/const handleShowComplete = useCallback/);
  });

  it("speed and narration-mute controls exist", () => {
    expect(src).toMatch(/SPEED_FACTOR/);
    expect(src).toMatch(/narrationEnabled/);
  });

  it("REQUIRED: Next/Previous/Restart/autoplay all call the SAME setStepIndex -> applyVisualStates -> computeVisualStates path, never an ad hoc per-button opacity mutation", () => {
    // applyVisualStates is the ONLY function that calls editor.updateShapes
    // with opacity — every control funnels through setStepIndex, which calls
    // applyVisualStates, which calls the pure computeVisualStates. One
    // batched editor.updateShapes([...]) call, not N individual updateShape
    // calls in a loop.
    const updateShapesOpacityCalls = (src.match(/editor\.updateShapes\(updates\)/g) ?? []).length;
    expect(updateShapesOpacityCalls).toBe(1);
    expect(src).not.toMatch(/editor\.updateShape\(\{[^}]*opacity/s);
    expect(src).toMatch(/const applyVisualStates = useCallback/);
    expect(src).toMatch(/computeVisualStates\(defs, index/);

    for (const handler of ["handleNext", "handlePrev", "handleRestart", "handleShowComplete", "advanceForPlayback"]) {
      const idx = src.indexOf(`const ${handler} = useCallback`);
      expect(idx).toBeGreaterThan(-1);
      const body = src.slice(idx, idx + 500);
      expect(body).toMatch(/setStepIndex\(/);
    }
  });

  it("the timeline is built ONCE per shape-rebuild (buildTeachingTimeline called only where shapes are (re)built), never inside a play/pause/next/previous handler", () => {
    const timelineBuildCalls = (src.match(/timelineRef\.current = buildTeachingTimeline\(/g) ?? []).length;
    expect(timelineBuildCalls).toBeGreaterThanOrEqual(2); // VSG path + noteCards fallback path
    for (const handler of ["handleNext", "handlePrev", "handleRestart", "handleShowComplete", "handlePlayPause", "advanceForPlayback"]) {
      const idx = src.indexOf(`const ${handler} = useCallback`);
      const body = src.slice(idx, idx + 500);
      expect(body).not.toMatch(/buildTeachingTimeline/);
    }
  });

  it("no OpenAI/network call anywhere in this file — buildTeachingTimeline and computeVisualStates are pure, non-network", () => {
    expect(src).not.toMatch(/fetch\(/);
    expect(src).not.toMatch(/openai/i);
  });

  it('"Play after completion must replay the entire teaching performance" — handlePlayPause resets to step -1 when already at the end', () => {
    const idx = src.indexOf("const handlePlayPause = useCallback");
    const body = src.slice(idx, idx + 700);
    expect(body).toMatch(/atEnd/);
    expect(body).toMatch(/setStepIndex\(-1\)/);
  });

  it("Restart resets to step -1 and begins playing (does not merely reset and wait)", () => {
    const idx = src.indexOf("const handleRestart = useCallback");
    const body = src.slice(idx, idx + 300);
    expect(body).toMatch(/setStepIndex\(-1\)/);
    expect(body).toMatch(/setIsPlaying\(true\)/);
  });
});

describe("Teaching layer is locked; student annotation layer is tldraw's own native (unlocked) toolset", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(TLDRAW_CANVAS, "utf8"); });

  it("every editor.createShape call for teaching-layer content passes isLocked: true", () => {
    const createShapeCalls = src.match(/editor\.createShape\(\{[^;]*?\}\s*(?:as any)?\);/gs) ?? [];
    expect(createShapeCalls.length).toBeGreaterThan(0);
    for (const call of createShapeCalls) {
      expect(call).toMatch(/isLocked:\s*true/);
    }
  });

  it("no custom student toolbar is reintroduced — the student layer is tldraw's own native UI (hideUi is never set to hide it)", () => {
    expect(src).not.toMatch(/StudentToolbar/);
    expect(src).not.toMatch(/hideUi=\{?true\}?/);
  });

  it("teaching shapes start at FAINT_OPACITY (faint planning marks), not opacity 0 (invisible) or 1 (already complete)", () => {
    const createShapeCalls = src.match(/editor\.createShape\(\{[^;]*?\}\s*(?:as any)?\);/gs) ?? [];
    for (const call of createShapeCalls) {
      expect(call).toMatch(/opacity:\s*FAINT_OPACITY/);
    }
  });
});

describe("Provenance is preserved on every teaching-layer shape", () => {
  it("ShapeDef still carries sourceId (canonicalUnitId / ReaderAnchor linkage) and revealOrder", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../lib/whiteboard/sceneGraphAdapter.ts"), "utf8");
    expect(src).toMatch(/sourceId\?:\s*string;/);
    expect(src).toMatch(/revealOrder:\s*number;/);
  });

  it("registerAnchors (One Brain sync) still runs after every shape build, keyed by the same sourceId provenance", () => {
    const src = fs.readFileSync(TLDRAW_CANVAS, "utf8");
    const registerCalls = (src.match(/registerAnchors\(defs\);/g) ?? []).length;
    expect(registerCalls).toBeGreaterThanOrEqual(2);
  });
});
