// tests/whiteboard/tldrawCanvasVisualUpgrades.test.ts
// Regression guards for components/whiteboard/TldrawCanvas.tsx — this repo's
// jest config runs testEnvironment: "node" (no jsdom/RTL), so a real render
// isn't available here; these are source-level checks for wiring that IS
// otherwise fully unit-testable (the pure toTldrawShapeSpec/colorForTarget
// logic itself is exercised indirectly through this file's string matching,
// same pattern already used throughout tests/whiteboard/).

import fs from "fs";
import path from "path";

const CANVAS_FILE = path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx");

describe("TldrawCanvas.tsx — EDGE_COLOR is actually applied (was dead code)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: colorForTarget checks vsg.edges when no node matches, returning EDGE_COLOR[edge.kind]", () => {
    const idx = src.indexOf("const colorForTarget = useCallback(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/const edge = v\.edges\.find\(e => e\.id === targetId\);/);
    expect(block).toMatch(/if \(edge\) return EDGE_COLOR\[edge\.kind\] \?\? fallback;/);
  });

  it("REQUIRED: registerAnchors registers draw-arrow actions too, not just write/draw-shape — without this, an arrow's targetId (the edge id) never reaches colorForTarget at all", () => {
    const idx = src.indexOf("const registerAnchors = useCallback(");
    const block = src.slice(idx, idx + 550);
    expect(block).toMatch(/a\.type === "write" \|\| a\.type === "draw-shape" \|\| a\.type === "draw-arrow"/);
  });
});

describe("TldrawCanvas.tsx — richer geo shape vocabulary (diamond/hexagon/cloud), not just rectangle/ellipse", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: toTldrawShapeSpec's geo branch now accepts diamond/hexagon/cloud shape kinds", () => {
    const idx = src.indexOf("function toTldrawShapeSpec(");
    const block = src.slice(idx, idx + 1200);
    expect(block).toMatch(/s\.kind === "diamond" \|\| s\.kind === "hexagon" \|\| s\.kind === "cloud"/);
  });

  it("maps each new kind to tldraw's own built-in geo shape name 1:1 (diamond/hexagon/cloud are real tldraw geo values)", () => {
    const idx = src.indexOf("const GEO_FOR_KIND: Record<string, string> = {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/diamond: "diamond"/);
    expect(block).toMatch(/hexagon: "hexagon"/);
    expect(block).toMatch(/cloud: "cloud"/);
  });
});

describe("TldrawCanvas.tsx — per-step camera padding scales with content, floor raised well above the old flat 40px", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: padding is no longer a flat 40px constant", () => {
    expect(src).not.toMatch(/x: merged\.x - 40, y: merged\.y - 40, w: merged\.w \+ 80, h: merged\.h \+ 80/);
  });

  it("REQUIRED: padX/padY floors are well above the old 40px — the concrete fix for 'the camera zooms in too tight (209%) on a single small box'", () => {
    const idx = src.indexOf("const padX = Math.max(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/const padX = Math\.max\(100, merged\.w \* 0\.3\);/);
    expect(block).toMatch(/const padY = Math\.max\(140, merged\.h \* 1\.2\);/);
  });

  it("padding is still applied via the same zoomToBounds API already used elsewhere in this file (no new/unproven tldraw API surface)", () => {
    const idx = src.indexOf("const padX = Math.max(");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/editor\.zoomToBounds\(/);
  });

  it("a full zoomToFit still happens before any step has run (index === -1) — only the PER-STEP crop changed, not the initial whole-scene view", () => {
    expect(src).toMatch(/else if \(index === -1\) \{\s*\n\s*editor\.zoomToFit\(\);/);
  });
});

describe("TldrawCanvas.tsx — read-only teaching canvas + explicit 'Edit a copy' opt-in", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: editingEnabled defaults to false — the canvas is read-only until an explicit opt-in, not just during active playback", () => {
    expect(src).toMatch(/const \[editingEnabled, setEditingEnabled\] = useState\(false\);/);
  });

  it("REQUIRED: the editor's readonly flag is isPlaying OR NOT editingEnabled — locked during playback, and locked by default even while paused/finished until the student opts in", () => {
    const idx = src.indexOf("editor.updateInstanceState({ isReadonly: isPlaying || !editingEnabled });");
    expect(idx).toBeGreaterThan(-1);
  });

  it("REQUIRED: handleMount sets isReadonly:true immediately — the canvas is never briefly editable on first paint before the sync effect catches up", () => {
    const idx = src.indexOf("const handleMount = useCallback((editor: Editor) => {");
    const block = src.slice(idx, idx + 500);
    expect(block).toMatch(/editor\.updateInstanceState\(\{ isReadonly: true \}\)/);
  });

  it("REQUIRED: a new lesson (lessonPlan reference change) resets editingEnabled back to false and re-locks the canvas — editing access from a prior page's lesson never carries over", () => {
    const idx = src.indexOf("// A new lesson always starts read-only");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 160);
    expect(block).toMatch(/setEditingEnabled\(false\);/);
    expect(block).toMatch(/editor\.updateInstanceState\(\{ isReadonly: true \}\)/);
  });

  it("REQUIRED: the 'Edit a copy' button exists, is disabled while playing, and is disabled once already enabled", () => {
    const idx = src.indexOf('onClick={() => setEditingEnabled(true)}');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 250);
    expect(block).toMatch(/disabled=\{isPlaying \|\| editingEnabled\}/);
  });
});

describe("TldrawCanvas.tsx — a pageTruthKey/lessonPlan change cancels narration AND clears the scene immediately, not just one or the other", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: the rebuild effect (fires on every lessonPlan reference change) both clears the teaching layer AND stops all speech, in the same synchronous block — before the 'nothing to draw yet' early return", () => {
    const idx = src.indexOf("useEffect(() => {\n    const editor = editorRef.current;\n    if (!editor) return;\n\n    try {\n      clearTeachingLayer(editor);");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 500);
    expect(block).toMatch(/clearTeachingLayer\(editor\);/);
    expect(block).toMatch(/stopAllSpeech\("whiteboard-rebuild"\);/);
    // Both must run BEFORE the null-plan early return, so a page change with
    // no new plan yet (loading, or a failed generation) still clears the OLD
    // page's shapes/narration instead of leaving them visible.
    const clearIdx = block.indexOf("clearTeachingLayer(editor);");
    const stopIdx  = block.indexOf('stopAllSpeech("whiteboard-rebuild");');
    const returnIdx = block.indexOf("if (!lessonPlan) {");
    expect(clearIdx).toBeLessThan(returnIdx);
    expect(stopIdx).toBeLessThan(returnIdx);
  });

  it("the rebuild effect is keyed on [lessonPlan] alone — a page/concept change is a lessonPlan identity change (useProfessorLesson.ts is the single owner of when a NEW plan object is produced)", () => {
    const idx = src.indexOf("// eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [lessonPlan]);");
    expect(idx).toBeGreaterThan(-1);
  });
});
