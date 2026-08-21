// tests/reader/professorReturnResume.test.ts
// Stabilization fix — Professor return/resume behavior.
//
// Root cause traced in the verification audit: closing Professor called
// stopAudio() (which does NOT clear thoughtUnitId — see readingFocusStore's
// clearWord()) but nothing then told Current Page speech WHERE to resume.
// The Play button's own idle-resume cascade (StudySpeechPanel.tsx) falls
// through to play(0) — a full restart — whenever mode === "fullPage",
// which it always is for Current Page speech (segments stays [] in that
// mode, so the selectedUnitId lookup that would otherwise find the resume
// position can never match). This file has two parts:
//   1. A REAL behavioral test of useReadingFocusStore proving Professor's
//      own step-advance mechanism (TldrawCanvas's focusDirectorEvidence ->
//      setThoughtUnit) genuinely leaves the LAST-visited unit in the shared
//      store when Professor stops mid-lesson on a multi-unit page — the
//      exact signal closeProfessorWhiteboard (pages/index.tsx) reads.
//   2. Source-inspection wiring guards (pages/index.tsx and
//      StudySpeechPanel.tsx have no jsdom/render harness in this repo) for
//      the parts that can't be exercised as pure functions: the resume
//      cursor is built from the live focusedEvidenceId (never a stale
//      pre-Professor value, never a fallback to the page's first unit),
//      wired through the SAME seekToCursor mechanism a PDF click already
//      uses (never a page restart), and visibleMode always resets off the
//      Professor tab on close.

import fs from "fs";
import path from "path";
import { useReadingFocusStore } from "../../lib/readingFocus/readingFocusStore";

const INDEX_FILE = path.resolve(__dirname, "../../pages/index.tsx");
const PANEL_FILE = path.resolve(__dirname, "../../components/reader/StudySpeechPanel.tsx");

describe("useReadingFocusStore — multi-unit Professor progression (real behavioral test)", () => {
  beforeEach(() => {
    useReadingFocusStore.getState().clearFocus();
  });

  it("REQUIRED (end-to-end, multi-unit page): the store retains the LAST unit Professor visited, not the first or an earlier one, exactly as TldrawCanvas.tsx's focusDirectorEvidence writes it on every step advance", () => {
    // Simulates Professor stepping through 3 Thought Units on one page —
    // the same setThoughtUnit(sourceId) call focusDirectorEvidence makes on
    // every teaching-step advance (components/whiteboard/TldrawCanvas.tsx).
    useReadingFocusStore.getState().setThoughtUnit("tu-1");
    expect(useReadingFocusStore.getState().thoughtUnitId).toBe("tu-1");

    useReadingFocusStore.getState().setThoughtUnit("tu-2");
    useReadingFocusStore.getState().setThoughtUnit("tu-3");

    // Professor is closed here (mid-lesson, before finishing the page) —
    // the store must reflect tu-3, not tu-1 (the unit Current Page speech
    // was on before Professor opened) and not tu-2 (an intermediate unit).
    expect(useReadingFocusStore.getState().thoughtUnitId).toBe("tu-3");
  });

  it("clearWord() (called by StudySpeechPanel's stopAudio(), which fires when Start Professor is pressed) does NOT clear thoughtUnitId — Professor's starting point is preserved, and its own progression is what overwrites it", () => {
    useReadingFocusStore.getState().setThoughtUnit("tu-1");
    useReadingFocusStore.getState().clearWord();
    expect(useReadingFocusStore.getState().thoughtUnitId).toBe("tu-1");
  });
});

describe("StudySpeechPanel.tsx — returnFromProfessor (stabilization fix)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(PANEL_FILE, "utf8"); });

  it("REQUIRED: returnFromProfessor is part of the exported StudySpeechPanelHandle interface", () => {
    const idx = src.indexOf("export interface StudySpeechPanelHandle");
    const block = src.slice(idx, src.indexOf("}", idx));
    expect(block).toMatch(/returnFromProfessor: \(cursor: ReadingCursor \| null\) => void;/);
  });

  it("REQUIRED: delegates to seekToCursor when a cursor is available — the SAME resume mechanism a PDF click already uses, never a separate play(0) restart", () => {
    const idx = src.indexOf("function returnFromProfessor(cursor: ReadingCursor | null) {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/if \(cursor\) \{\s*seekToCursor\(cursor\);/);
    expect(block).not.toMatch(/play\(0\)/);
  });

  it("REQUIRED: always resets visibleMode back to currentPage even when no cursor is available — never leaves the panel stuck on the inactive Professor tab", () => {
    const idx = src.indexOf("function returnFromProfessor(cursor: ReadingCursor | null) {");
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/else \{\s*setVisibleMode\("currentPage"\);/);
  });

  it("is wired into the imperative handle alongside the existing methods", () => {
    expect(src).toMatch(/useImperativeHandle\(ref, \(\) => \(\{ playFromSnippet, seekToCursor, triggerPlay, returnFromProfessor \}\)/);
  });
});

describe("pages/index.tsx — closeProfessorWhiteboard (stabilization fix)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(INDEX_FILE, "utf8"); });

  it("REQUIRED: builds the resume cursor from the LIVE focusedEvidenceId at close time, not a value captured before Professor opened", () => {
    const idx = src.indexOf("const closeProfessorWhiteboard = useCallback(() => {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, src.indexOf("}, [professorAutoStart, canonicalLeftPanelUnits, focusedEvidenceId, currentPage]);", idx));
    expect(block).toMatch(/u\.evidenceRefId === focusedEvidenceId \|\| u\.id === focusedEvidenceId/);
  });

  it("REQUIRED: does NOT fall back to canonicalLeftPanelUnits[0] the way activeCanonicalThoughtUnit does — never resumes into an arbitrary/earlier unrelated Thought Unit when nothing resolves", () => {
    const idx = src.indexOf("const closeProfessorWhiteboard = useCallback(() => {");
    const block = src.slice(idx, src.indexOf("}, [professorAutoStart, canonicalLeftPanelUnits, focusedEvidenceId, currentPage]);", idx));
    expect(block).not.toMatch(/canonicalLeftPanelUnits\[0\]/);
    expect(block).toMatch(/const cursor: ReadingCursor \| null = unit\?\.exactText/);
  });

  it("REQUIRED: only attempts a resume when Professor (not a plain manual Whiteboard session) was active", () => {
    const idx = src.indexOf("const closeProfessorWhiteboard = useCallback(() => {");
    const block = src.slice(idx, src.indexOf("}, [professorAutoStart, canonicalLeftPanelUnits, focusedEvidenceId, currentPage]);", idx));
    expect(block).toMatch(/const wasProfessor = professorAutoStart;/);
    expect(block).toMatch(/if \(wasProfessor\) \{/);
  });

  it("calls speechPanelRef.current?.returnFromProfessor(cursor), not a raw setVisibleMode or play() call from pages/index.tsx itself", () => {
    const idx = src.indexOf("const closeProfessorWhiteboard = useCallback(() => {");
    const block = src.slice(idx, src.indexOf("}, [professorAutoStart, canonicalLeftPanelUnits, focusedEvidenceId, currentPage]);", idx));
    expect(block).toMatch(/speechPanelRef\.current\?\.returnFromProfessor\(cursor\);/);
  });

  it("REQUIRED: all three Whiteboard/Professor close sites (backdrop click, the floating Stop chip, and the modal's own close button) call closeProfessorWhiteboard — none still does its own raw setShowWhiteboardPanel(false) reset", () => {
    const occurrences = (src.match(/closeProfessorWhiteboard/g) ?? []).length;
    // 1 declaration + 1 in the useCallback dep comment/name + 3 call sites = at least 4 usages.
    expect(occurrences).toBeGreaterThanOrEqual(4);
    // No remaining inline three-call reset pattern outside the shared function itself.
    const inlineResets = (src.match(/setShowWhiteboardPanel\(false\); setProfessorAutoStart\(false\);/g) ?? []).length;
    expect(inlineResets).toBe(0);
  });
});
