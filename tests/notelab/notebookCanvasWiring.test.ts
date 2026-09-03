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
    // The cloud snapshot restore (Firebase durable-persistence PR) runs
    // first when notebookId/documentId/pageTruthKey are available; composeScene
    // still always runs afterward (idempotent — see its own getShape checks),
    // so a restored snapshot and a freshly-composed scene never duplicate shapes.
    expect(src).toMatch(/loadNotebookPage\(notebookId, pageTruthKey\)/);
    expect(src).toMatch(/loadSnapshot\(editor\.store, saved\.tldrawSnapshot/);
    expect(src).toMatch(/const result = composeScene\(editor, sceneRef\.current\);/);
  });
});

describe("NotebookCanvas.tsx — N4: recomposes on a later scene change (tldraw's onMount only fires once)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: a dedicated effect, not onMount alone, recomposes when `scene` changes after the initial mount", () => {
    const idx = src.indexOf("// Recompose whenever `scene` itself changes");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/useEffect\(\(\) => \{\s*const editor = editorRef\.current;\s*if \(!editor\) return;\s*const result = composeScene\(editor, scene\);/);
  });

  it("REQUIRED: the store.listen selection subscription is torn down and re-subscribed idempotently (mirrors TldrawCanvas.tsx's own storeUnsubRef pattern), and torn down again on unmount", () => {
    expect(src).toMatch(/storeUnsubRef\.current\?\.\(\);\s*storeUnsubRef\.current = editor\.store\.listen\(/);
    expect(src).toMatch(/window\.removeEventListener\("pagehide", flush\);[\s\S]*storeUnsubRef\.current\?\.\(\);/);
  });
});

// Correction (NoteLab blank-canvas fix) — components/notelab/NotebookCanvas.tsx
// never called editor.zoomToFit()/zoomToBounds() after composeScene created
// shapes, unlike components/whiteboard/TldrawCanvas.tsx which does — since
// notebookLayout.ts always lays content out growing from the origin,
// tldraw's default camera showed mostly empty space around real content.
// This is the confirmed root cause of "the Visual Notebook area is mostly
// blank."
describe("NotebookCanvas.tsx — camera fits real content on mount and first-populate (blank-canvas fix)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: composeScene now returns real diagnostics instead of void, so callers can react to what actually got composed", () => {
    const fnIdx = src.indexOf("function composeScene(");
    const fn = src.slice(fnIdx, src.indexOf("export const ACTION_BTN") > -1 ? src.indexOf("export const ACTION_BTN") : fnIdx + 1600);
    expect(fn).toMatch(/function composeScene\(editor: Editor, scene: VisualNotebookScene\): ComposeSceneResult/);
    expect(fn).toMatch(/tldrawShapeCountBefore: editor\.getCurrentPageShapeIds\(\)\.size,?|const tldrawShapeCountBefore = editor\.getCurrentPageShapeIds\(\)\.size;/);
    expect(fn).toMatch(/tldrawShapeCountAfter: editor\.getCurrentPageShapeIds\(\)\.size,/);
  });

  it("REQUIRED: handleMount fits the camera to whatever composed on the note's first paint this session", () => {
    const idx = src.indexOf("const handleMount = useCallback");
    const fn = src.slice(idx, src.indexOf("storeUnsubRef.current?.();", idx));
    expect(fn).toMatch(/if \(result\.tldrawShapeCountAfter > 0\) \{\s*editor\.zoomToFit\(\);\s*\}/);
  });

  it("REQUIRED: the recompose effect only fits the camera when content went from NONE to SOME — never yanks the camera away from a student actively looking at/editing existing content on a later scene update", () => {
    const idx = src.indexOf("// Recompose whenever `scene` itself changes");
    const fn = src.slice(idx, idx + 1000);
    expect(fn).toMatch(/if \(result\.tldrawShapeCountBefore === 0 && result\.tldrawShapeCountAfter > 0\) \{\s*editor\.zoomToFit\(\);\s*\}/);
  });

  it("REQUIRED: diagnostics are logged with the correction's own named fields — visualPrimitiveCount, tldrawShapeCountBefore, tldrawShapeCountAfter, renderedNotebookBounds", () => {
    const idx = src.indexOf("interface ComposeSceneResult {");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/visualPrimitiveCount: number;/);
    expect(block).toMatch(/tldrawShapeCountBefore: number;/);
    expect(block).toMatch(/tldrawShapeCountAfter: number;/);
    expect(block).toMatch(/renderedNotebookBounds: \{ x: number; y: number; w: number; h: number \};/);
    expect(src).toMatch(/console\.log\(`\[NOTELAB_CANVAS_\$\{phase\.toUpperCase\(\)\}_DIAGNOSTIC\]`, result\);/);
  });

  it("REQUIRED: a note with real semantic content (visualPrimitiveCount > 0) that composes to zero tldraw shapes is a HARD FAILURE, logged and surfaced — never a silently blank canvas", () => {
    const idx = src.indexOf("const logComposeResult = useCallback");
    const fn = src.slice(idx, idx + 700);
    expect(fn).toMatch(/const hasSemanticContent = result\.visualPrimitiveCount > 0;/);
    expect(fn).toMatch(/const hardFailure = hasSemanticContent && result\.tldrawShapeCountAfter === 0;/);
    expect(fn).toMatch(/console\.error\("\[NOTELAB_CANVAS_RENDER_HARD_FAILURE\]"/);
    expect(fn).toMatch(/setRenderFailure\(hardFailure\);/);
  });

  it("REQUIRED: the hard-failure state renders an explicit, recoverable error UI — not the bare Tldraw canvas, and not a silent blank", () => {
    const idx = src.indexOf("if (renderFailure) {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/data-testid="notebook-render-failure"/);
    expect(block).toMatch(/onClick=\{\(\) => setRenderFailure\(false\)\}/); // a real retry affordance, not a dead end
  });
});

// Correction (NoteLab blank-canvas fix) — components/notelab/NotebookCanvas.tsx
// never called editor.zoomToFit()/zoomToBounds() after composeScene created
// shapes, unlike components/whiteboard/TldrawCanvas.tsx which does — since
// notebookLayout.ts always lays content out growing from the origin,
// tldraw's default camera showed mostly empty space around real content.
// This is the confirmed root cause of "the Visual Notebook area is mostly
// blank."
describe("NotebookCanvas.tsx — camera fits real content on mount and first-populate (blank-canvas fix)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: composeScene now returns real diagnostics instead of void, so callers can react to what actually got composed", () => {
    const fnIdx = src.indexOf("function composeScene(");
    const fn = src.slice(fnIdx, src.indexOf("export const ACTION_BTN") > -1 ? src.indexOf("export const ACTION_BTN") : fnIdx + 1600);
    expect(fn).toMatch(/function composeScene\(editor: Editor, scene: VisualNotebookScene\): ComposeSceneResult/);
    expect(fn).toMatch(/tldrawShapeCountBefore: editor\.getCurrentPageShapeIds\(\)\.size,?|const tldrawShapeCountBefore = editor\.getCurrentPageShapeIds\(\)\.size;/);
    expect(fn).toMatch(/tldrawShapeCountAfter: editor\.getCurrentPageShapeIds\(\)\.size,/);
  });

  it("REQUIRED: handleMount fits the camera to whatever composed on the note's first paint this session", () => {
    const idx = src.indexOf("const handleMount = useCallback");
    const fn = src.slice(idx, src.indexOf("storeUnsubRef.current?.();", idx));
    expect(fn).toMatch(/if \(result\.tldrawShapeCountAfter > 0\) \{\s*editor\.zoomToFit\(\);\s*\}/);
  });

  it("REQUIRED: the recompose effect only fits the camera when content went from NONE to SOME — never yanks the camera away from a student actively looking at/editing existing content on a later scene update", () => {
    const idx = src.indexOf("// Recompose whenever `scene` itself changes");
    const fn = src.slice(idx, idx + 1000);
    expect(fn).toMatch(/if \(result\.tldrawShapeCountBefore === 0 && result\.tldrawShapeCountAfter > 0\) \{\s*editor\.zoomToFit\(\);\s*\}/);
  });

  it("REQUIRED: diagnostics are logged with the correction's own named fields — visualPrimitiveCount, tldrawShapeCountBefore, tldrawShapeCountAfter, renderedNotebookBounds", () => {
    const idx = src.indexOf("interface ComposeSceneResult {");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/visualPrimitiveCount: number;/);
    expect(block).toMatch(/tldrawShapeCountBefore: number;/);
    expect(block).toMatch(/tldrawShapeCountAfter: number;/);
    expect(block).toMatch(/renderedNotebookBounds: \{ x: number; y: number; w: number; h: number \};/);
    expect(src).toMatch(/console\.log\(`\[NOTELAB_CANVAS_\$\{phase\.toUpperCase\(\)\}_DIAGNOSTIC\]`, result\);/);
  });

  it("REQUIRED: a note with real semantic content (visualPrimitiveCount > 0) that composes to zero tldraw shapes is a HARD FAILURE, logged and surfaced — never a silently blank canvas", () => {
    const idx = src.indexOf("const logComposeResult = useCallback");
    const fn = src.slice(idx, idx + 700);
    expect(fn).toMatch(/const hasSemanticContent = result\.visualPrimitiveCount > 0;/);
    expect(fn).toMatch(/const hardFailure = hasSemanticContent && result\.tldrawShapeCountAfter === 0;/);
    expect(fn).toMatch(/console\.error\("\[NOTELAB_CANVAS_RENDER_HARD_FAILURE\]"/);
    expect(fn).toMatch(/setRenderFailure\(hardFailure\);/);
  });

  it("REQUIRED: the hard-failure state renders an explicit, recoverable error UI — not the bare Tldraw canvas, and not a silent blank", () => {
    const idx = src.indexOf("if (renderFailure) {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/data-testid="notebook-render-failure"/);
    expect(block).toMatch(/onClick=\{\(\) => setRenderFailure\(false\)\}/); // a real retry affordance, not a dead end
  });
});

// Correction (NoteLab blank-canvas fix) — components/notelab/NotebookCanvas.tsx
// never called editor.zoomToFit()/zoomToBounds() after composeScene created
// shapes, unlike components/whiteboard/TldrawCanvas.tsx which does — since
// notebookLayout.ts always lays content out growing from the origin,
// tldraw's default camera showed mostly empty space around real content.
// This is the confirmed root cause of "the Visual Notebook area is mostly
// blank."
describe("NotebookCanvas.tsx — camera fits real content on mount and first-populate (blank-canvas fix)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: composeScene now returns real diagnostics instead of void, so callers can react to what actually got composed", () => {
    const fnIdx = src.indexOf("function composeScene(");
    const fn = src.slice(fnIdx, src.indexOf("export const ACTION_BTN") > -1 ? src.indexOf("export const ACTION_BTN") : fnIdx + 1600);
    expect(fn).toMatch(/function composeScene\(editor: Editor, scene: VisualNotebookScene\): ComposeSceneResult/);
    expect(fn).toMatch(/tldrawShapeCountBefore: editor\.getCurrentPageShapeIds\(\)\.size,?|const tldrawShapeCountBefore = editor\.getCurrentPageShapeIds\(\)\.size;/);
    expect(fn).toMatch(/tldrawShapeCountAfter: editor\.getCurrentPageShapeIds\(\)\.size,/);
  });

  it("REQUIRED: handleMount fits the camera to whatever composed on the note's first paint this session", () => {
    const idx = src.indexOf("const handleMount = useCallback");
    const fn = src.slice(idx, src.indexOf("storeUnsubRef.current?.();", idx));
    expect(fn).toMatch(/if \(result\.tldrawShapeCountAfter > 0\) \{\s*editor\.zoomToFit\(\);\s*\}/);
  });

  it("REQUIRED: the recompose effect only fits the camera when content went from NONE to SOME — never yanks the camera away from a student actively looking at/editing existing content on a later scene update", () => {
    const idx = src.indexOf("// Recompose whenever `scene` itself changes");
    const fn = src.slice(idx, idx + 1000);
    expect(fn).toMatch(/if \(result\.tldrawShapeCountBefore === 0 && result\.tldrawShapeCountAfter > 0\) \{\s*editor\.zoomToFit\(\);\s*\}/);
  });

  it("REQUIRED: diagnostics are logged with the correction's own named fields — visualPrimitiveCount, tldrawShapeCountBefore, tldrawShapeCountAfter, renderedNotebookBounds", () => {
    const idx = src.indexOf("interface ComposeSceneResult {");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/visualPrimitiveCount: number;/);
    expect(block).toMatch(/tldrawShapeCountBefore: number;/);
    expect(block).toMatch(/tldrawShapeCountAfter: number;/);
    expect(block).toMatch(/renderedNotebookBounds: \{ x: number; y: number; w: number; h: number \};/);
    expect(src).toMatch(/console\.log\(`\[NOTELAB_CANVAS_\$\{phase\.toUpperCase\(\)\}_DIAGNOSTIC\]`, result\);/);
  });

  it("REQUIRED: a note with real semantic content (visualPrimitiveCount > 0) that composes to zero tldraw shapes is a HARD FAILURE, logged and surfaced — never a silently blank canvas", () => {
    const idx = src.indexOf("const logComposeResult = useCallback");
    const fn = src.slice(idx, idx + 700);
    expect(fn).toMatch(/const hasSemanticContent = result\.visualPrimitiveCount > 0;/);
    expect(fn).toMatch(/const hardFailure = hasSemanticContent && result\.tldrawShapeCountAfter === 0;/);
    expect(fn).toMatch(/console\.error\("\[NOTELAB_CANVAS_RENDER_HARD_FAILURE\]"/);
    expect(fn).toMatch(/setRenderFailure\(hardFailure\);/);
  });

  it("REQUIRED: the hard-failure state renders an explicit, recoverable error UI — not the bare Tldraw canvas, and not a silent blank", () => {
    const idx = src.indexOf("if (renderFailure) {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/data-testid="notebook-render-failure"/);
    expect(block).toMatch(/onClick=\{\(\) => setRenderFailure\(false\)\}/); // a real retry affordance, not a dead end
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

describe("UltraNotesList.tsx — Notebook wiring (NU4 — Study Page tab split retired)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(LIST_FILE, "utf8"); });

  it("REQUIRED: imports and renders NotebookCanvas", () => {
    expect(src).toMatch(/import NotebookCanvas from "@\/components\/notelab\/NotebookCanvas";/);
    expect(src).toMatch(/<NotebookCanvas\s*\n\s*scene=\{note\.notebookScene\}/);
  });

  it("REQUIRED: the Visual notebook/Study page tab split no longer exists — there is one notebook, not two views to choose between", () => {
    expect(src).not.toMatch(/noteView/);
    expect(src).not.toContain('data-testid="notebook-view-switcher"');
    expect(src).not.toContain("🖊️ Visual notebook");
    expect(src).not.toContain("📄 Study page");
    expect(src).not.toContain('(["notebook", "page"] as const)');
  });

  it("REQUIRED: the old card-based SectionsView (and its now-dead siblings ConceptMiniTable/ConceptBlock/ProfessorSection) are gone — content was migrated to real notebook primitives in NU3, not kept as a fallback renderer", () => {
    expect(src).not.toMatch(/function SectionsView/);
    expect(src).not.toMatch(/function ConceptMiniTable/);
    expect(src).not.toMatch(/function ConceptBlock/);
    expect(src).not.toMatch(/function ProfessorSection/);
    expect(src).not.toContain('data-testid="adaptive-notebook-sections"');
  });

  it("REQUIRED: also removed the standalone SOURCE REFERENCES accordion — per-object provenance (View Source/Jump to Reader) on the notebook canvas is now the only path, per the correction's evidence-as-metadata rule", () => {
    expect(src).not.toContain("SOURCE REFERENCES");
  });

  it("REQUIRED: the notebook renders whenever a scene exists — no tab state gating it, so it can never render with an undefined scene", () => {
    expect(src).toMatch(/\{note\.notebookScene \? \(\s*<NotebookCanvas/);
  });

  // L13 (NoteLab visual-execution correction) — "'Nothing composed here yet'
  // should almost never appear after the user has already saved material
  // from Reader... either render the visual note or explicitly say
  // generation failed and give Retry." notebookSceneStatus now tells apart
  // "still composing" (pending), "genuinely nothing to compose" (empty/
  // legacy undefined — the ONLY case this generic copy is still accurate
  // for), and "composition failed" (its own banner + Retry, below).
  it("REQUIRED (L13): a genuinely empty note (no notebookScene, status 'empty' or legacy-undefined) shows the explicit empty-state prompt, never the retired card dashboard as a fallback", () => {
    const idx = src.indexOf("{note.notebookScene ? (");
    const block = src.slice(idx, src.indexOf(")}", idx) + 2);
    expect(block).toMatch(/Nothing composed here yet\. Write your own notes below/);
  });

  it("REQUIRED (L13): a note with no notebookScene but status 'pending' shows a composing indicator, not the generic empty-state prompt", () => {
    const idx = src.indexOf("{note.notebookScene ? (");
    const block = src.slice(idx, src.indexOf(")}", idx) + 2);
    expect(block).toMatch(/note\.notebookSceneStatus === "pending"/);
    expect(block).toMatch(/Composing your visual notebook/);
  });

  it("REQUIRED (L13): a note with status 'failed' (or a legacy note with notebookSceneError and no status) renders neither the composing indicator nor the generic empty-state prompt below the canvas — the amber banner above already covers it, including Retry", () => {
    const idx = src.indexOf("{note.notebookScene ? (");
    const block = src.slice(idx, src.indexOf(")}", idx) + 2);
    expect(block).toMatch(
      /\(note\.notebookSceneStatus === "failed" \|\| \(!note\.notebookSceneStatus && note\.notebookSceneError\)\) \? null/,
    );
  });

  it("REQUIRED (L13): a failed composition (status 'failed', or a legacy note with notebookSceneError and no status) is surfaced as a banner with an explicit Retry action — no longer 'no retry action here', since UltraNotesList.tsx can now call the same shared composeNoteNotebookSceneInBackground RightPanel.tsx's save uses", () => {
    const idx = src.indexOf('note.notebookSceneStatus === "failed" || (!note.notebookSceneStatus && note.notebookSceneError)');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, src.indexOf(")}", idx) + 2);
    expect(block).toMatch(/AI enhancement of this notebook didn't finish/);
    expect(block).toMatch(/onClick=\{handleRetryCompose\}/);
    expect(block).toMatch(/🔁 Retry/);
  });

  it("REQUIRED (L13): handleRetryCompose sets notebookSceneStatus 'pending' first, then calls the shared composeNoteNotebookSceneInBackground with the note's own documentId (falling back to bookId)", () => {
    const idx = src.indexOf("async function handleRetryCompose()");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 500);
    expect(block).toMatch(/notebookSceneStatus: "pending"/);
    expect(block).toMatch(/composeNoteNotebookSceneInBackground\(note, note\.documentId \?\? note\.bookId\)/);
  });

  it("REQUIRED (L13): imports composeNoteNotebookSceneInBackground from the shared lib module, not a local re-implementation", () => {
    expect(src).toMatch(/import \{ composeNoteNotebookSceneInBackground \} from "@\/lib\/notelab\/composeNotebookScene";/);
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
