// tests/notelab/notebookCanvasWiring.test.ts
// N3 — source-inspection tests for components/notelab/NotebookCanvas.tsx and
// its integration into components/notelab/UltraNotesList.tsx. This repo's
// jest config runs testEnvironment: "node" (no jsdom/RTL), so a real tldraw
// editor render isn't available — same limitation and same pattern
// tests/whiteboard/tldrawCanvasVisualUpgrades.test.ts already documents for
// TldrawCanvas.tsx's own wiring. The pure functions NotebookCanvas calls
// (notebookLayout.ts, notebookShapeSpec.ts) have real behavioral coverage
// elsewhere in this directory.

import fs from "fs";
import path from "path";

const CANVAS_FILE = path.resolve(__dirname, "../../components/notelab/NotebookCanvas.tsx");
const LIST_FILE = path.resolve(__dirname, "../../components/notelab/UltraNotesList.tsx");

describe("NotebookCanvas.tsx — persistent, student-editable, NOT Professor's ephemeral pattern", () => {
  let src: string;
  let code: string; // src minus the leading file-header comment block, which deliberately
                     // DISCUSSES clearTeachingLayer/isLocked in prose while contrasting this
                     // component against Professor's pattern — only the real code below
                     // "use client" should be checked for those strings' actual presence.
  beforeAll(() => {
    src = fs.readFileSync(CANVAS_FILE, "utf8");
    code = src.slice(src.indexOf('"use client"'));
  });

  it("REQUIRED: uses tldraw's real persistenceKey for cross-session storage, keyed by the caller's storageKey", () => {
    expect(src).toMatch(/persistenceKey=\{storageKey\}/);
  });

  it("REQUIRED: never calls clearTeachingLayer or otherwise wipes the canvas on mount — this notebook is the student's persistent copy, not Professor's ephemeral teaching layer", () => {
    // A prose mention (a JSDoc note contrasting this component against
    // Professor's pattern) is fine; an actual invocation is not.
    expect(code).not.toMatch(/clearTeachingLayer\(/);
  });

  it("REQUIRED: never locks shapes it creates (no isLocked: true) — the student must be able to edit AI-composed content", () => {
    expect(code).not.toMatch(/isLocked:\s*true/);
  });

  it("REQUIRED: composeScene checks editor.getShape(id) before createShape, for every shape kind it creates — idempotent re-composition so reopening a note never duplicates content", () => {
    const fn = src.slice(src.indexOf("function composeScene("), src.indexOf("export default function NotebookCanvas"));
    const getShapeChecks = fn.match(/editor\.getShape\(/g) ?? [];
    const createShapeCalls = fn.match(/editor\.createShape\(/g) ?? [];
    expect(getShapeChecks.length).toBeGreaterThanOrEqual(createShapeCalls.length);
    expect(createShapeCalls.length).toBeGreaterThanOrEqual(2); // block shapes + connection arrows
  });

  it("REQUIRED: drops a connection whose from/to block did not survive layout, rather than creating an arrow with a missing endpoint", () => {
    const fn = src.slice(src.indexOf("function composeScene("), src.indexOf("export default function NotebookCanvas"));
    expect(fn).toMatch(/if \(!from \|\| !to\) continue;/);
  });

  it("REQUIRED: every created shape carries the block/connection's meta — the provenance contract N4 will read from selected shapes", () => {
    const fn = src.slice(src.indexOf("function composeScene("), src.indexOf("export default function NotebookCanvas"));
    expect(fn).toMatch(/meta:\s*spec\.meta/);
  });

  it("REQUIRED: guards against a missing tldraw license key in production, same pattern as TldrawCanvas.tsx", () => {
    expect(src).toMatch(/NEXT_PUBLIC_TLDRAW_LICENSE_KEY/);
    expect(src).toMatch(/licenseMissingInProduction/);
  });

  it("calls composeScene from onMount, and re-derives the callback when the scene prop itself changes", () => {
    expect(src).toMatch(/const handleMount = useCallback\(\(editor: Editor\) => \{\s*composeScene\(editor, scene\);/);
    expect(src).toMatch(/\}, \[scene\]\);/);
  });
});

describe("UltraNotesList.tsx — Notebook tab wiring", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(LIST_FILE, "utf8"); });

  it("REQUIRED: imports and renders NotebookCanvas", () => {
    expect(src).toMatch(/import NotebookCanvas from "@\/components\/notelab\/NotebookCanvas";/);
    expect(src).toMatch(/<NotebookCanvas scene=\{note\.notebookScene\}/);
  });

  it("REQUIRED: the Notebook tab only appears when note.notebookScene is present — a note without a composed scene shows exactly the same two tabs as before N3", () => {
    expect(src).toMatch(/note\.notebookScene \? \(\["notes", "studySheet", "notebook"\] as const\) : \(\["notes", "studySheet"\] as const\)/);
  });

  it("REQUIRED: the notebook tab body is gated on both the active tab AND the scene actually being present, so it can never render with an undefined scene", () => {
    expect(src).toMatch(/\{noteView === "notebook" && note\.notebookScene && \(/);
  });

  it("REQUIRED: each note gets its own persistenceKey derived from its own id — one note's notebook edits never bleed into another's", () => {
    expect(src).toMatch(/storageKey=\{`notelab-notebook-\$\{note\.id\}`\}/);
  });
});
