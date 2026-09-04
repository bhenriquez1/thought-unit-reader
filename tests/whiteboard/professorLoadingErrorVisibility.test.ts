// tests/whiteboard/professorLoadingErrorVisibility.test.ts
// P0 stabilization, Tier 2, item 3 originally fixed a "silent Professor" bug
// by making handleStartProfessor NEVER default professorSurface to "pdf" —
// so TldrawCanvas's own loading/error/retry UI (which lives inside the same
// opacity-gated modal) stayed reachable. The Avrrio Reader correction
// ("Professor does not belong inside Whiteboard") requires the OPPOSITE
// default: Professor Mode must start on the PDF, not an opaque Whiteboard
// modal, regardless of content. Both requirements are satisfied at once by
// moving the "stay visible" guarantee off the default and onto an explicit
// escalation: TldrawCanvas itself now forces the surface to "whiteboard"
// (reason: "diagnostic") the moment there's a REAL license/init/lesson-plan
// failure to show — never by default, only when there's something to see.
//
// No jsdom/render harness for these files in this repo — source inspection.

import fs from "fs";
import path from "path";

const PAGE_SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");
const CANVAS_SRC = fs.readFileSync(path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx"), "utf8");

describe("pages/index.tsx — Professor Mode defaults to the PDF, not an opaque Whiteboard modal", () => {
  it("REQUIRED: professorSurface's own useState default is \"pdf\"", () => {
    expect(PAGE_SRC).toMatch(/useState<"pdf" \| "whiteboard">\("pdf"\)/);
  });

  it("REQUIRED: handleStartProfessor explicitly resets professorSurface to \"pdf\" every session — a previous session left on \"whiteboard\" must never leak into the next", () => {
    const idx = PAGE_SRC.indexOf("const handleStartProfessor = useCallback(() => {");
    expect(idx).toBeGreaterThan(-1);
    const block = PAGE_SRC.slice(idx, idx + 1400);
    expect(block).toMatch(/setProfessorSurface\("pdf"\);/);
    expect(block).toMatch(/setProfessorAutoStart\(true\);/);
    expect(block).toMatch(/setShowWhiteboardPanel\(true\);/);
  });

  it("professorSurface's only OTHER setter is TldrawCanvas's real onProfessorSurfaceChange callback", () => {
    const idx = PAGE_SRC.indexOf('onProfessorSurfaceChange={(surface) => setProfessorSurface(surface)}');
    expect(idx).toBeGreaterThan(-1);
  });

  it("the modal's opacity:0/pointerEvents:none treatment is unchanged in shape — still keyed on professorAutoStart && professorSurface === \"pdf\" — only the DEFAULT value that condition starts from has changed", () => {
    const idx = PAGE_SRC.indexOf('opacity: professorAutoStart && professorSurface === "pdf" ? 0 : 1,');
    expect(idx).toBeGreaterThan(-1);
  });
});

describe("components/whiteboard/TldrawCanvas.tsx — a real loading/error/config state stays visible via explicit escalation, never via the default", () => {
  it("REQUIRED: forces the surface to \"whiteboard\" with reason \"diagnostic\" whenever license/init/lesson-plan failure is real", () => {
    const idx = CANVAS_SRC.indexOf("if (licenseMissingInProduction || canvasInitFailure || lessonStatus === \"error\") {");
    expect(idx).toBeGreaterThan(-1);
    const block = CANVAS_SRC.slice(idx, idx + 300);
    expect(block).toMatch(/onProfessorSurfaceChangeRef\.current\?\.\("whiteboard", \{ stepId: -1, visualNeeded: false, reason: "diagnostic" \}\);/);
  });

  it("REQUIRED: a loading state distinguishes 'loading' vs other pre-plan status with real copy", () => {
    expect(CANVAS_SRC).toContain('{lessonStatus === "loading" ? "Reading the current page…" : "Preparing visual lesson…"}');
  });

  it("REQUIRED: an error state shows the specific error message and a Retry button wired to reanalyze", () => {
    // lessonStatus === "error" also appears in the diagnostic-escalation
    // effect above; the JSX conditional (with its trailing &&) is the one
    // that actually renders the retry UI, so anchor on that exact form.
    const idx = CANVAS_SRC.indexOf('!lessonPlan && lessonStatus === "error" && (');
    expect(idx).toBeGreaterThan(-1);
    const block = CANVAS_SRC.slice(idx, idx + 2200);
    expect(block).toMatch(/lessonErrorMessage/);
    expect(block).toMatch(/<button onClick=\{reanalyze\} style=\{BTN_PRIMARY\}>Retry<\/button>/);
  });
});

describe("lib/whiteboard/professorTimelineEngine.ts — \"diagnostic\" is a real ProfessorSurfaceReason value", () => {
  it("REQUIRED: the reason type includes \"diagnostic\" alongside the plan-resolved reasons", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../lib/whiteboard/professorTimelineEngine.ts"), "utf8");
    expect(src).toMatch(/export type ProfessorSurfaceReason = "source-passage" \| "visual-lesson" \| "return-to-source" \| "summary" \| "diagnostic";/);
  });
});
