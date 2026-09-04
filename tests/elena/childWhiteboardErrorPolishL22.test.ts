// tests/elena/childWhiteboardErrorPolishL22.test.ts
// L22 — live-browser testing of L19/L21 (screenshots taken during those
// phases' own verification) surfaced a rough edge nothing had fixed yet:
// the Whiteboard's failure/retry screen shows raw developer diagnostics —
// "code: PROVIDER_CONFIGURATION", "stage: provider_configuration · request:
// req_..." — unconditionally, to a child exactly as to an adult. The
// top-line message was already generic and non-technical on every failure
// path (useProfessorLesson.ts's GENERIC_ERROR_MESSAGE, unconditional
// regardless of audience); only the code/stage/request-id detail underneath
// it is developer/troubleshooting information a child has no use for.
//
// No jsdom/render harness for this file in this repo — source inspection,
// matching every other Whiteboard/Elena wiring test in this directory.

import fs from "fs";
import path from "path";

const TLDRAW_CANVAS = fs.readFileSync(path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx"), "utf8");

describe("components/whiteboard/TldrawCanvas.tsx — error-state diagnostics hidden from children (L22)", () => {
  it("REQUIRED: the error code line is gated on audience !== \"child\"", () => {
    const idx = TLDRAW_CANVAS.indexOf("code: {lessonErrorCode}");
    expect(idx).toBeGreaterThan(-1);
    const before = TLDRAW_CANVAS.slice(Math.max(0, idx - 500), idx);
    expect(before).toMatch(/audience !== "child" && lessonErrorCode && \(/);
  });

  it("REQUIRED: the stage/model/request-id diagnostic line is gated on audience !== \"child\"", () => {
    const idx = TLDRAW_CANVAS.indexOf("stage: {lessonErrorDiagnostics.failureStage}");
    expect(idx).toBeGreaterThan(-1);
    const before = TLDRAW_CANVAS.slice(Math.max(0, idx - 500), idx);
    expect(before).toMatch(/audience !== "child" && lessonErrorDiagnostics && \(/);
  });

  it("the top-line error message and Retry button stay unconditional — every audience still sees a clear, actionable failure state", () => {
    const idx = TLDRAW_CANVAS.indexOf('lessonStatus === "error"');
    const block = TLDRAW_CANVAS.slice(idx, TLDRAW_CANVAS.indexOf("Retry</button>", idx) + 20);
    const messageLine = block.split("\n").find(l => l.includes("lessonErrorMessage ??"))!;
    expect(messageLine).not.toMatch(/audience/);
    expect(block).toMatch(/<button onClick=\{reanalyze\} style=\{BTN_PRIMARY\}>Retry<\/button>/);
  });

  it("adult path keeps the full diagnostics verbatim — the gate is additive, not a rewrite", () => {
    expect(TLDRAW_CANVAS).toMatch(/code: \{lessonErrorCode\}/);
    expect(TLDRAW_CANVAS).toMatch(/stage: \{lessonErrorDiagnostics\.failureStage\}/);
    expect(TLDRAW_CANVAS).toMatch(/request: \$\{lessonErrorDiagnostics\.requestId\}/);
  });
});
