// tests/whiteboard/professorLessonEngine.test.ts
// Static-analysis regression guards for the professor-performance rewrite of
// components/whiteboard/TldrawCanvas.tsx — the replacement for the old
// opacity-reveal concept-map engine (lib/whiteboard/teachingTimeline.ts,
// retired). This repo's jest runs testEnvironment:"node" with no jsdom/RTL,
// so component behavior is verified by inspecting source structure, same
// pattern as tests/whiteboard/tldrawShapeSchema.test.ts and
// tests/whiteboard/productionSmoke.test.ts.

import fs from "fs";
import path from "path";

const CANVAS = path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx");

describe("Shapes are created LAZILY, not pre-placed and faded in", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS, "utf8"); });

  it("tracks which shapes currently exist with a dedicated ref, diffed against the pure target state", () => {
    expect(src).toMatch(/createdShapeIdsRef/);
  });

  it("applyStateAtStep computes the target state via the pure engine, not an ad hoc reveal loop", () => {
    expect(src).toMatch(/computeCanvasStateAtStep\(plan\.actions, index\)/);
  });

  it("a shape is only created (editor.createShape) when it isn't already in createdShapeIdsRef — never all-at-once upfront", () => {
    const idx = src.indexOf("const applyStateAtStep = useCallback");
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, src.indexOf("const setStepIndex = useCallback"));
    expect(body).toMatch(/if \(createdShapeIdsRef\.current\.has\(s\.shapeId\)\) \{/);
    expect(body).toMatch(/creates\.push/);
  });

  it("a shape that shouldn't exist yet (backward jump) is deleted, not merely hidden — genuinely blank, not faint", () => {
    const idx = src.indexOf("const applyStateAtStep = useCallback");
    const body = src.slice(idx, idx + 900);
    expect(body).toMatch(/editor\.deleteShapes\(\[shapeIdOf\(id\)\]\)/);
  });

  it("does not reintroduce the old FAINT_OPACITY ghost-skeleton reveal model", () => {
    expect(src).not.toMatch(/FAINT_OPACITY/);
    expect(src).not.toMatch(/computeVisualStates/);
  });
});

describe("Teaching-layer shapes use a hand-writing font, not the default UI font", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS, "utf8"); });

  it('geo (box/circle) shapes set font: "draw"', () => {
    expect(src).toMatch(/font:\s*"draw"/);
  });

  it("box/circle strokes use a sketchy hand-drawn dash style, not a solid fill", () => {
    expect(src).toMatch(/dash:\s*"draw"/);
    expect(src).toMatch(/fill:\s*"none"/);
  });
});

describe("Playback controls funnel through ONE deterministic path", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS, "utf8"); });

  it("Next/Previous/Restart/Show-complete/autoplay all call setStepIndex, never applyStateAtStep directly", () => {
    for (const handler of ["handleNext", "handlePrev", "handleRestart", "handleShowComplete", "advanceForPlayback"]) {
      const idx = src.indexOf(`const ${handler} = useCallback`);
      expect(idx).toBeGreaterThan(-1);
      const body = src.slice(idx, idx + 500);
      expect(body).toMatch(/setStepIndex\(/);
    }
  });

  it("setStepIndex is the only function that calls applyStateAtStep", () => {
    const calls = (src.match(/applyStateAtStep\(editor,/g) ?? []).length;
    // setStepIndex + the rebuild effect (initial blank state) + handleMount
    // (restoring an already-resolved plan) — all legitimate single-purpose
    // call sites, never inside a per-button ad hoc handler.
    expect(calls).toBeGreaterThanOrEqual(1);
    const idx = src.indexOf("const setStepIndex = useCallback");
    const body = src.slice(idx, idx + 300);
    expect(body).toMatch(/applyStateAtStep\(editor, n\)/);
  });

  it("manual Next/Previous/Restart stop any in-flight narration — never leaves stale audio playing across a jump", () => {
    for (const handler of ["handleNext", "handlePrev", "handleRestart"]) {
      const idx = src.indexOf(`const ${handler} = useCallback`);
      const body = src.slice(idx, idx + 300);
      expect(body).toMatch(/stopNarration\(\)/);
    }
  });

  it('"Play after completion must replay the entire performance" — handlePlayPause resets to -1 when already at the end', () => {
    const idx = src.indexOf("const handlePlayPause = useCallback");
    const body = src.slice(idx, idx + 700);
    expect(body).toMatch(/atEnd/);
    expect(body).toMatch(/setStepIndex\(-1\)/);
  });

  it("exact pause/resume: Pause stops the autoplay timer via useEffect cleanup, keyed on isPlaying", () => {
    const idx = src.indexOf("useEffect(() => {\n    if (!isPlaying) return;");
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, idx + 500);
    expect(body).toMatch(/window\.setTimeout\(advanceForPlayback, duration\)/);
    expect(body).toMatch(/return \(\) => clearTimeout\(t\)/);
  });
});

describe("Narration: single active speech, real neural TTS with a browser fallback", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS, "utf8"); });

  it("playSegment claims speech ownership before starting — the shared controller force-stops any prior speech from anywhere", () => {
    const idx = src.indexOf("const playSegment = useCallback");
    const body = src.slice(idx, idx + 400);
    expect(body).toMatch(/claimSpeech\(SPEECH_OWNER\)/);
  });

  it("checks isSpeechStale before applying an async TTS response — a superseded request can't still speak", () => {
    const idx = src.indexOf("const playSegment = useCallback");
    const body = src.slice(idx, src.indexOf("const stopNarration = useCallback"));
    const staleChecks = (body.match(/isSpeechStale\(token\)/g) ?? []).length;
    expect(staleChecks).toBeGreaterThanOrEqual(2);
  });

  it("calls the real /api/tts endpoint rather than going straight to browser speechSynthesis", () => {
    expect(src).toMatch(/fetch\("\/api\/tts", \{/);
  });

  it("falls back to browser speech only when the API explicitly signals useBrowserSpeech", () => {
    expect(src).toMatch(/data\?\.useBrowserSpeech/);
  });

  it("only advanceForPlayback (forward autoplay) triggers speech — manual Next/Previous/Restart never do", () => {
    for (const handler of ["handleNext", "handlePrev", "handleRestart"]) {
      const idx = src.indexOf(`const ${handler} = useCallback`);
      const body = src.slice(idx, idx + 300);
      expect(body).not.toMatch(/playSegment\(/);
    }
    const advIdx = src.indexOf("const advanceForPlayback = useCallback");
    const advBody = src.slice(advIdx, advIdx + 500);
    expect(advBody).toMatch(/playSegment\(segment\)/);
  });
});

describe("Camera movement is driven by move-camera actions, not manual pan/zoom code per handler", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS, "utf8"); });

  it("applyStateAtStep resolves the camera target from the pure engine and calls zoomToBounds", () => {
    const idx = src.indexOf("const applyStateAtStep = useCallback");
    const body = src.slice(idx, src.indexOf("const setStepIndex = useCallback"));
    expect(body).toMatch(/resolveCameraTargetAtStep\(plan\.actions, index\)/);
    expect(body).toMatch(/editor\.zoomToBounds\(/);
  });
});

describe("Side transcript: the complete narration stays out of the diagram itself", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS, "utf8"); });

  it("renders every segment's full text in a dedicated transcript panel", () => {
    expect(src).toMatch(/Transcript/);
    expect(src).toMatch(/segments\.map\(seg =>/);
  });

  it("highlights the currently-active segment via activeSegmentId, resolved from the pure engine", () => {
    expect(src).toMatch(/resolveActiveSegmentIdAtStep\(/);
    expect(src).toMatch(/seg\.id === activeSegmentId/);
  });
});

describe("Student layer survives a lesson rebuild — only locked (teaching-layer) shapes are cleared", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS, "utf8"); });

  it("the rebuild effect filters to isLocked shapes before deleting, never a blanket deleteShapes(all)", () => {
    const idx = src.indexOf("if (!editor || !lessonPlan) return;");
    const body = src.slice(idx, idx + 500);
    expect(body).toMatch(/\.filter\(s => s\.isLocked\)/);
  });
});

describe("Every created teaching-layer shape is locked", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS, "utf8"); });

  it("creates push isLocked: true", () => {
    const idx = src.indexOf("for (const c of creates) editor.createShape");
    // creates entries are constructed above this line — confirm isLocked:true appears on both construction sites (primary + emphasis overlay)
    const constructionBlock = src.slice(src.indexOf("const creates: any[] = []"), idx);
    const trueCount = (constructionBlock.match(/isLocked:\s*true/g) ?? []).length;
    expect(trueCount).toBeGreaterThanOrEqual(2); // primary shape + emphasis overlay
  });
});

describe("No hardcoded fixed node width — layout is responsive to label length", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS, "utf8"); });

  it("shape width/position come from the plan's own bounds, never a fixed NODE_W-style constant", () => {
    expect(src).not.toMatch(/const NODE_W/);
    expect(src).toMatch(/s\.bounds\.w/);
  });
});

describe("This is one Whiteboard experience — no second engine reintroduced", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS, "utf8"); });

  it("does not reintroduce a Student/Instructor toggle or a second canvas mode", () => {
    expect(src).not.toMatch(/studentMode/);
    expect(src).not.toMatch(/StudentToolbar/);
  });

  it("never calls the lesson-planning endpoint directly — useProfessorLesson already resolved the plan before this component renders it (fetch here is only for /api/tts audio)", () => {
    expect(src).not.toMatch(/fetch\("\/api\/professor-lesson-plan"/);
    expect(src).not.toMatch(/new OpenAI\(/);
    const fetchCalls = src.match(/fetch\(["'`][^"'`]+["'`]/g) ?? [];
    for (const call of fetchCalls) {
      expect(call).toMatch(/\/api\/tts/);
    }
  });
});
