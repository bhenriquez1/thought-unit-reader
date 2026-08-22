// tests/whiteboard/professorLoadingErrorVisibility.test.ts
// P0 stabilization, Tier 2, item 3 — "silent Professor" root cause: the
// centered Whiteboard modal (pages/index.tsx) went opacity:0/pointerEvents:
// none whenever professorAutoStart && professorSurface === "pdf". Because
// handleStartProfessor set professorSurface to "pdf" EAGERLY at click time —
// before any lesson plan existed — TldrawCanvas's own loading/error/retry UI
// (which lives inside this same opacity:0'd modal) was invisible for the
// entire planning window. Any failure or slowness in
// /api/professor-lesson-plan reproduced exactly as "Professor appears to
// start, nothing visible or audible happens, no error."
//
// Fix: professorSurface now only ever leaves its "whiteboard" default via
// TldrawCanvas's own onProfessorSurfaceChange callback — which only fires
// once a real lesson plan has resolved a step to the "pdf" surface. Until
// then the modal stays fully visible/opaque, showing TldrawCanvas's
// pre-existing planning/error/retry states.
//
// No jsdom/render harness for these files in this repo — source inspection.

import fs from "fs";
import path from "path";

const PAGE_SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");
const CANVAS_SRC = fs.readFileSync(path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx"), "utf8");

describe("pages/index.tsx — handleStartProfessor no longer eagerly hides the modal before a lesson plan exists", () => {
  it("REQUIRED: does not set professorSurface to 'pdf' at click time", () => {
    const idx = PAGE_SRC.indexOf("const handleStartProfessor = useCallback(() => {");
    expect(idx).toBeGreaterThan(-1);
    const block = PAGE_SRC.slice(idx, idx + 1200);
    expect(block).not.toMatch(/setProfessorSurface\("pdf"\)/);
    expect(block).toMatch(/setProfessorAutoStart\(true\);/);
    expect(block).toMatch(/setShowWhiteboardPanel\(true\);/);
  });

  it("professorSurface's only setter besides the default/reset effects is TldrawCanvas's real onProfessorSurfaceChange callback", () => {
    const idx = PAGE_SRC.indexOf('onProfessorSurfaceChange={(surface) => setProfessorSurface(surface)}');
    expect(idx).toBeGreaterThan(-1);
  });

  it("the modal's opacity:0/pointerEvents:none treatment is unchanged in shape — still keyed on professorAutoStart && professorSurface === \"pdf\" — only WHEN that condition can become true has changed", () => {
    const idx = PAGE_SRC.indexOf('opacity: professorAutoStart && professorSurface === "pdf" ? 0 : 1,');
    expect(idx).toBeGreaterThan(-1);
  });
});

describe("components/whiteboard/TldrawCanvas.tsx — planning/error/retry UI already exists and is now reachable", () => {
  it("REQUIRED: a loading state distinguishes 'loading' vs other pre-plan status with real copy", () => {
    expect(CANVAS_SRC).toContain('{lessonStatus === "loading" ? "Reading the current page…" : "Preparing visual lesson…"}');
  });

  it("REQUIRED: an error state shows the specific error message and a Retry button wired to reanalyze", () => {
    const idx = CANVAS_SRC.indexOf('lessonStatus === "error"');
    expect(idx).toBeGreaterThan(-1);
    const block = CANVAS_SRC.slice(idx, idx + 1400);
    expect(block).toMatch(/lessonErrorMessage/);
    expect(block).toMatch(/<button onClick=\{reanalyze\} style=\{BTN_PRIMARY\}>Retry<\/button>/);
  });
});
