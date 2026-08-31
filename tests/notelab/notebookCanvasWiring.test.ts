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

  it("calls composeScene from onMount using the current scene, and stores the editor in a ref for later effects to reach", () => {
    expect(src).toMatch(/const handleMount = useCallback\(\(editor: Editor\) => \{\s*editorRef\.current = editor;/);
    expect(src).toMatch(/loadNotebookPage\(notebookId, pageTruthKey\)/);
    expect(src).toMatch(/loadSnapshot\(editor\.store, saved\.tldrawSnapshot/);
    expect(src).toMatch(/composeScene\(editor, sceneRef\.current\);/);
  });
});

describe("NotebookCanvas.tsx — N4: recomposes on a later scene change (tldraw's onMount only fires once)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: a dedicated effect, not onMount alone, recomposes when `scene` changes after the initial mount", () => {
    const idx = src.indexOf("// Recompose whenever `scene` itself changes");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/useEffect\(\(\) => \{\s*if \(editorRef\.current\) composeScene\(editorRef\.current, scene\);\s*\}, \[scene\]\);/);
  });

  it("REQUIRED: the store.listen selection subscription is torn down and re-subscribed idempotently (mirrors TldrawCanvas.tsx's own storeUnsubRef pattern), and torn down again on unmount", () => {
    expect(src).toMatch(/storeUnsubRef\.current\?\.\(\);\s*storeUnsubRef\.current = editor\.store\.listen\(/);
    expect(src).toMatch(/window\.removeEventListener\("pagehide", flush\);[\s\S]*storeUnsubRef\.current\?\.\(\);/);
  });
});

describe("NotebookCanvas.tsx — N4: provenance-driven selection action panel", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: resolves the selected shape back to its FinalizedNotebookBlock via meta.blockId, not a paraphrase or a guess", () => {
    const fn = src.slice(src.indexOf("const handleMount = useCallback"), src.indexOf("// Recompose whenever"));
    expect(fn).toMatch(/editor\.getSelectedShapes\(\)/);
    expect(fn).toMatch(/selected\.length !== 1/); // never shows a panel for a multi-shape selection
    expect(fn).toMatch(/selected\[0\]\.meta/);
    expect(fn).toMatch(/sceneRef\.current\.blocks\.find\(\(b\) => b\.id === blockId\)/);
  });

  it("REQUIRED: View Source is only offered when the block actually resolved to a real source unit (canonicalUnitId), never guessed", () => {
    const panelFn = src.slice(src.indexOf("function BlockActionPanel"), src.indexOf("export default function NotebookCanvas"));
    expect(panelFn).toMatch(/const showViewSource = !!onViewSource && !!block\.canonicalUnitId;/);
  });

  it("REQUIRED: Jump to Reader is only offered when the block has a page at all", () => {
    const panelFn = src.slice(src.indexOf("function BlockActionPanel"), src.indexOf("export default function NotebookCanvas"));
    expect(panelFn).toMatch(/const showJumpToReader = !!onJumpToReader && block\.page != null;/);
  });

  it("REQUIRED: renders nothing when none of the four actions apply — never an empty floating panel", () => {
    const panelFn = src.slice(src.indexOf("function BlockActionPanel"), src.indexOf("export default function NotebookCanvas"));
    expect(panelFn).toMatch(/if \(!showViewSource && !showJumpToReader && !showAskProfessor && !showPracticeRecall\) return null;/);
  });

  it("REQUIRED: the panel only renders while a block is actually selected", () => {
    expect(src).toMatch(/\{selectedBlock && \(\s*<BlockActionPanel/);
  });
});

describe("UltraNotesList.tsx — Notebook tab wiring", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(LIST_FILE, "utf8"); });

  it("REQUIRED: imports and renders NotebookCanvas", () => {
    expect(src).toMatch(/import NotebookCanvas from "@\/components\/notelab\/NotebookCanvas";/);
    expect(src).toMatch(/<NotebookCanvas\s*\n\s*scene=\{note\.notebookScene\}/);
  });

  it("REQUIRED: a composed visual notebook opens first and the retired Study Sheet tab is absent", () => {
    expect(src).toContain('note.notebookScene ? "notebook" : "page"');
    expect(src).toContain('(["notebook", "page"] as const)');
    expect(src).not.toContain('"studySheet"');
    expect(src).not.toContain("<AdaptiveStudySheetCard");
    expect(src).not.toContain("<DATStudySheetCard");
  });

  it("REQUIRED: the notebook tab body is gated on both the active tab AND the scene actually being present, so it can never render with an undefined scene", () => {
    expect(src).toMatch(/\{noteView === "notebook" && note\.notebookScene && \(/);
  });

  it("REQUIRED: each note gets its own persistenceKey derived from its own id — one note's notebook edits never bleed into another's", () => {
    expect(src).toMatch(/storageKey=\{`notelab-notebook-\$\{note\.id\}`\}/);
  });
});

describe("UltraNotesList.tsx — N4: provenance-driven block actions wired to NotebookCanvas", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(LIST_FILE, "utf8"); });

  it("REQUIRED: all four action callbacks are passed to NotebookCanvas", () => {
    const idx = src.indexOf("<NotebookCanvas");
    const jsx = src.slice(idx, idx + 650);
    expect(jsx).toMatch(/onViewSource=\{handleViewSourceBlock\}/);
    expect(jsx).toMatch(/onJumpToReader=\{handleJumpToReaderBlock\}/);
    expect(jsx).toMatch(/onAskProfessor=\{onAskProfessorAboutBlock \? \(block\) => onAskProfessorAboutBlock\(note, block\) : undefined\}/);
    expect(jsx).toMatch(/onPracticeRecall=\{handlePracticeRecallBlock\}/);
  });

  it("REQUIRED: View Source focuses the exact source thought unit via useReadingFocusStore before navigating — the precise action, not just a page jump", () => {
    const idx = src.indexOf("function handleViewSourceBlock");
    const fn = src.slice(idx, idx + 300);
    expect(fn).toMatch(/if \(block\.canonicalUnitId\) useReadingFocusStore\.getState\(\)\.setThoughtUnit\(block\.canonicalUnitId\);/);
    expect(fn).toMatch(/onNavigate\?\.\(block\.page \?\? note\.pageNumber\)/);
  });

  it("REQUIRED: Practice in Recall builds and saves a recall set scoped to just the selected block, then reports it via onCardsGenerated — same pattern as the existing per-NoteCard recall action", () => {
    const idx = src.indexOf("async function handlePracticeRecallBlock");
    const fn = src.slice(idx, idx + 400);
    expect(fn).toMatch(/buildRecallSetFromNotebookBlock\(note, block, \{ sourceLabel: "notelab" \}\)/);
    expect(fn).toMatch(/await saveRecallSet\(set\);/);
    expect(fn).toMatch(/onCardsGenerated\?\.\(set\.id\);/);
  });

  it("REQUIRED: the new onAskProfessorAboutBlock prop threads all the way from UltraNotesListProps down through NoteCard's own props", () => {
    expect(src).toMatch(/onAskProfessorAboutBlock\?: \(note: UltraNote, block: FinalizedNotebookBlock\) => void;/);
    const noteCardFn = src.slice(src.indexOf("function NoteCard({"), src.indexOf("function NoteCard({") + 1100);
    expect(noteCardFn).toMatch(/onAskProfessorAboutBlock,/); // destructured from props
    expect(noteCardFn).toMatch(/onAskProfessorAboutBlock\?: \(note: UltraNote, block: FinalizedNotebookBlock\) => void;/); // its own type
  });
});

describe("pages/index.tsx — N4: Ask Professor wiring for the live NoteLab mount", () => {
  const INDEX_FILE = path.resolve(__dirname, "../../pages/index.tsx");
  let src: string;
  beforeAll(() => { src = fs.readFileSync(INDEX_FILE, "utf8"); });

  it("REQUIRED: passes onAskProfessorAboutBlock at UltraNotesList's live mount, seeding Professor Whiteboard with the BLOCK's own content — not the whole note", () => {
    const idx = src.indexOf("<UltraNotesList");
    const jsx = src.slice(idx, src.indexOf("</div>", idx) + 6);
    expect(jsx).toMatch(/onAskProfessorAboutBlock=\{\(note, block\) => \{/);
    expect(jsx).toMatch(/setWbConcept\(truncate\(`\$\{note\.topic\} — \$\{block\.primitive\.replace\(\/_\/g, " "\)\}`, 600\)\);/);
    expect(jsx).toMatch(/setWbContext\(truncate\(\[block\.content, block\.detail\]\.filter\(Boolean\)\.join\("\\n\\n"\), 1200\)\);/);
    expect(jsx).toMatch(/setShowWhiteboardPanel\(true\);/);
  });
});
