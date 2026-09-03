// tests/elena/childWhiteboardL19.test.ts
// L19 — Elena Mode's first real Whiteboard integration. L18 (already
// merged) threaded an audience: "adult" | "child" parameter all the way
// through the Professor pipeline's API routes but nothing called it with
// "child" yet. This phase adds the one missing hop — TldrawCanvas forwards
// an audience prop to useProfessorLesson — plus a new light, child-safe
// container (ChildWhiteboard.tsx, skipping WhiteboardPanel's adult-only
// NoteLab/Recall/StudyGuide save machinery) and a toggle inside
// ChildReaderTab.tsx.
//
// No jsdom/render harness for these files in this repo — source inspection,
// matching every other Whiteboard/Elena wiring test in this repo (see
// tests/whiteboard/audienceComplexityPlumbing.test.ts, tests/elena/
// elenaChildWorkspaceE3.test.ts).

import fs from "fs";
import path from "path";

const TLDRAW_CANVAS = fs.readFileSync(path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx"), "utf8");
const CHILD_WHITEBOARD = fs.readFileSync(path.resolve(__dirname, "../../components/elena/ChildWhiteboard.tsx"), "utf8");
const CHILD_READER_TAB = fs.readFileSync(path.resolve(__dirname, "../../components/elena/ChildReaderTab.tsx"), "utf8");

describe("components/whiteboard/TldrawCanvas.tsx — audience prop threading (L19)", () => {
  it("REQUIRED: Props declares an optional audience field", () => {
    const idx = TLDRAW_CANVAS.indexOf("interface Props {");
    const block = TLDRAW_CANVAS.slice(idx, TLDRAW_CANVAS.indexOf("\n}\n", idx));
    expect(block).toMatch(/audience\?:\s*"adult" \| "child";/);
  });

  it("REQUIRED: destructures audience from props", () => {
    const idx = TLDRAW_CANVAS.indexOf("export default function TldrawCanvas({");
    const block = TLDRAW_CANVAS.slice(idx, TLDRAW_CANVAS.indexOf("}: Props) {", idx));
    expect(block).toMatch(/\baudience\b/);
  });

  it("REQUIRED: forwards audience into the useProfessorLesson call, not just declaring it", () => {
    const idx = TLDRAW_CANVAS.indexOf("} = useProfessorLesson({");
    expect(idx).toBeGreaterThan(-1);
    const block = TLDRAW_CANVAS.slice(idx, idx + 300);
    expect(block).toMatch(/audience,/);
  });

  it("audience is optional with no default value — an omitted prop stays undefined, so every existing caller (the adult Reader via WhiteboardPanel) is byte-for-byte unchanged", () => {
    const idx = TLDRAW_CANVAS.indexOf("export default function TldrawCanvas({");
    const block = TLDRAW_CANVAS.slice(idx, TLDRAW_CANVAS.indexOf("}: Props) {", idx));
    expect(block).not.toMatch(/audience = /);
  });
});

describe("components/elena/ChildWhiteboard.tsx — light child-safe Whiteboard container (L19)", () => {
  it("REQUIRED: mounts TldrawCanvas with audience hardcoded to \"child\"", () => {
    expect(CHILD_WHITEBOARD).toMatch(/audience="child"/);
  });

  it("REQUIRED: loads this page's real CanonicalThoughtUnits via getCanonicalUnitsByPage — the same shared canonical store every other product reads from", () => {
    expect(CHILD_WHITEBOARD).toMatch(/import \{ getCanonicalUnitsByPage \} from "@\/lib\/canonical\/store";/);
    expect(CHILD_WHITEBOARD).toMatch(/getCanonicalUnitsByPage\(documentId, currentPage - 1\)/);
  });

  it("REQUIRED: converts units through childCanonicalUnitsToVsgEntries, never inventing its own entry-building logic", () => {
    expect(CHILD_WHITEBOARD).toMatch(/import \{ childCanonicalUnitsToVsgEntries \} from "@\/lib\/elena\/childCanonicalToVsgEntries";/);
  });

  it("REQUIRED: does not import any of WhiteboardPanel's adult-only save machinery (NoteLab/Recall/StudyGuide/Knowledge Graph)", () => {
    const importLines = CHILD_WHITEBOARD.split("\n").filter(line => line.trim().startsWith("import "));
    for (const line of importLines) {
      expect(line).not.toMatch(/notelab|recalllab|studyguide|recordLearningEvent|whiteboardLessonSnapshot/i);
    }
  });

  it("passes noteCards={[]} — driven purely by the VSG, matching WhiteboardPanel's own vsg-based mount pattern", () => {
    expect(CHILD_WHITEBOARD).toMatch(/noteCards=\{\[\]\}/);
  });

  it("shows a friendly non-error message when the page has no VSG yet, rather than a blank or broken canvas", () => {
    const idx = CHILD_WHITEBOARD.indexOf('vsgState.status !== "ready"');
    expect(idx).toBeGreaterThan(-1);
  });
});

describe("components/elena/ChildReaderTab.tsx — Whiteboard toggle (L19)", () => {
  it("REQUIRED: imports and mounts ChildWhiteboard", () => {
    expect(CHILD_READER_TAB).toMatch(/import ChildWhiteboard from "@\/components\/elena\/ChildWhiteboard";/);
    expect(CHILD_READER_TAB).toMatch(/<ChildWhiteboard/);
  });

  it("REQUIRED: a showWhiteboard toggle swaps the SmartPDFViewer for ChildWhiteboard in the same container, rather than adding a new layout region", () => {
    const idx = CHILD_READER_TAB.indexOf("h-[52vh] min-h-[320px]");
    expect(idx).toBeGreaterThan(-1);
    const block = CHILD_READER_TAB.slice(idx, idx + 700);
    expect(block).toMatch(/showWhiteboard \?/);
    expect(block).toMatch(/<ChildWhiteboard/);
    expect(block).toMatch(/<SmartPDFViewer/);
  });

  it("passes the active book's documentId/currentPage/title through to ChildWhiteboard", () => {
    const idx = CHILD_READER_TAB.indexOf("<ChildWhiteboard");
    const block = CHILD_READER_TAB.slice(idx, idx + 300);
    expect(block).toMatch(/documentId=\{activeBook\.documentId\}/);
    expect(block).toMatch(/currentPage=\{activeBook\.currentPage\}/);
    expect(block).toMatch(/bookTitle=\{activeBook\.title\}/);
  });
});
