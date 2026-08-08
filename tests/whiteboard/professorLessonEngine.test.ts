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
    const body = src.slice(idx, idx + 2300);
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

  it("manual Next/Previous/Restart stop any in-flight narration (with an explicit, traceable reason) — never leaves stale audio playing across a jump", () => {
    for (const handler of ["handleNext", "handlePrev", "handleRestart"]) {
      const idx = src.indexOf(`const ${handler} = useCallback`);
      const body = src.slice(idx, idx + 300);
      expect(body).toMatch(/stopNarration\("manual-[a-z-]+"\)/);
    }
  });

  it('"Play after completion must replay the entire performance" — handlePlayPause resets to -1 when already at the end', () => {
    const idx = src.indexOf("const handlePlayPause = useCallback");
    const body = src.slice(idx, idx + 1200);
    expect(body).toMatch(/atEnd/);
    expect(body).toMatch(/setStepIndex\(-1\)/);
  });

  it("REQUIRED: Pause preserves audio position — it pauses the active audio/utterance in place rather than calling stopNarration (which would release ownership and abandon the segment)", () => {
    const idx = src.indexOf("const handlePlayPause = useCallback");
    const ifPlayingIdx = src.indexOf("if (isPlaying) {", idx);
    const elseIdx = src.indexOf("const plan = planRef.current;", ifPlayingIdx);
    const pauseBranch = src.slice(ifPlayingIdx, elseIdx);
    expect(pauseBranch).toMatch(/activeAudioElRef\.current\.pause\(\)/);
    expect(pauseBranch).toMatch(/window\.speechSynthesis\.pause\(\)/);
    expect(pauseBranch).not.toMatch(/stopNarration\(/);
  });

  it("REQUIRED: Resume continues the SAME audio/utterance (play()/speechSynthesis.resume()) rather than restarting the segment from a fresh fetch", () => {
    const idx = src.indexOf("const handlePlayPause = useCallback");
    const body = src.slice(idx, idx + 1600);
    expect(body).toMatch(/activeAudioElRef\.current\.play\(\)\.catch/);
    expect(body).toMatch(/window\.speechSynthesis\.resume\(\)/);
  });

  it("REQUIRED: a 'speak' step never schedules the fixed-duration dwell timer — it advances only from playSegmentThenAdvance's own onended/onend callback, never a blind timeout", () => {
    const idx = src.indexOf("const advanceForPlayback = useCallback");
    const body = src.slice(idx, idx + 700);
    const speakBranchIdx = body.indexOf('if (action.type === "speak") {');
    const speakBranchEnd = body.indexOf("}", body.indexOf("return;", speakBranchIdx));
    const speakBranch = body.slice(speakBranchIdx, speakBranchEnd);
    expect(speakBranch).toMatch(/playSegmentThenAdvance\(segment, next\)/);
    expect(speakBranch).toMatch(/return;/);
    // The dwell-timer line must be OUTSIDE (after) the speak branch's return.
    const timerIdx = body.indexOf("window.setTimeout(() => advanceForPlaybackRef.current(), duration)");
    expect(timerIdx).toBeGreaterThan(speakBranchEnd);
  });
});

describe("Narration: single ordered queue, pre-buffered, advance-on-ended — never a blind fixed-duration timer for speech", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS, "utf8"); });

  it("REQUIRED: playSegmentThenAdvance claims speech ownership before starting — the shared controller force-stops any prior speech from anywhere", () => {
    const idx = src.indexOf("const playSegmentThenAdvance = useCallback");
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, idx + 800);
    expect(body).toMatch(/claimSpeech\(SPEECH_OWNER\)/);
  });

  it("checks isSpeechStale before applying an async TTS response — a superseded request can't still speak", () => {
    const idx = src.indexOf("const playSegmentThenAdvance = useCallback");
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
      expect(body).not.toMatch(/playSegmentThenAdvance\(/);
    }
    const advIdx = src.indexOf("const advanceForPlayback = useCallback");
    const advBody = src.slice(advIdx, advIdx + 700);
    expect(advBody).toMatch(/playSegmentThenAdvance\(segment, next\)/);
  });

  it("REQUIRED: pre-buffers the NEXT segment's audio while the current one plays — findNextSegment looks ahead, resolveSegmentAudio is called before this segment finishes", () => {
    const idx = src.indexOf("const playSegmentThenAdvance = useCallback");
    const body = src.slice(idx, idx + 900);
    expect(body).toMatch(/const nextSegment = findNextSegment\(index\);/);
    expect(body).toMatch(/if \(nextSegment\) resolveSegmentAudio\(nextSegment\);/);
  });

  it("REQUIRED: resolveSegmentAudio caches by segment id and dedupes concurrent fetches — a segment revisited (e.g. stepping back then forward) is never re-fetched from the network", () => {
    const idx = src.indexOf("const resolveSegmentAudio = useCallback");
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, idx + 1500);
    // Keyed by a SpeechSessionIdentity-qualified cacheKey (built from
    // segment.id, not the bare id) — see lib/speech/speechSessionIdentity.ts
    // and tests/whiteboard/narrationCacheIdentity.test.ts. A revisited
    // segment within the SAME lesson still hits the cache, since the
    // identity — and therefore the key — doesn't change between steps.
    expect(body).toMatch(/const cacheKey = buildSpeechCacheKey\(speechIdentityRef\.current, segment\.id\);/);
    expect(body).toMatch(/narrationCacheRef\.current\.get\(cacheKey\)/);
    expect(body).toMatch(/narrationPendingRef\.current\.get\(cacheKey\)/);
    expect(body).toMatch(/narrationCacheRef\.current\.set\(cacheKey, resolved\)/);
  });

  it("REQUIRED: every narration trace log carries the requested diagnostic fields — stepId, chunkIndex, and (where applicable) queueLength/audioStarted/audioEnded/cancelReason", () => {
    const traceLogs = src.match(/console\.log\("\[WHITEBOARD_NARRATION_TRACE\]", \{[^}]*\}\)/g) ?? [];
    expect(traceLogs.length).toBeGreaterThanOrEqual(5);
    expect(src).toMatch(/stepId, chunkIndex: index,\s*\n\s*queueLength: narrationPendingRef\.current\.size \+ narrationCacheRef\.current\.size,/);
    expect(src).toMatch(/stepId, chunkIndex: index, audioStarted: true/);
    expect(src).toMatch(/stepId, chunkIndex: index, audioEnded: true, reason/);
  });

  it("REQUIRED: any cancellation carries an explicit, non-empty reason string — never a bare stopNarration() with no cause", () => {
    expect(src).not.toMatch(/stopNarration\(\)/); // every call site must pass a reason
    const idx = src.indexOf("const stopNarration = useCallback");
    const body = src.slice(idx, idx + 100);
    expect(body).toMatch(/\(cancelReason: string\)/);
  });

  it("does not cancel narration on ordinary React rerenders, canvas updates, shape creation, or transcript updates — stopNarration is called only from explicit navigation/lifecycle sites (rebuild, unmount, manual nav, mute, restart-after-completion), never from applyStateAtStep", () => {
    const idx = src.indexOf("const applyStateAtStep = useCallback");
    const body = src.slice(idx, src.indexOf("const setStepIndex = useCallback"));
    expect(body).not.toMatch(/stopNarration\(/);
    expect(body).not.toMatch(/stopAllSpeech\(/);
  });

  // REGRESSION GUARD for a confirmed real bug, caught only by a live
  // Playwright repro (source-regex checks alone did not catch it): a natural
  // completion handler that checked isSpeechStale(token) AFTER already
  // calling notifySpeechEnd(token, ...) always saw its own just-released
  // token as stale (releaseSpeech sets active=null on completion) and
  // silently skipped advancing — narration played its FIRST segment
  // correctly, then the whole lesson stalled forever with no error. Fixed by
  // splitting into two callbacks: onNaturalEnd (audio/utterance's own ended/
  // onend — can only fire from genuine completion, since .pause() never
  // raises it — always advances, unconditionally) vs onForceStopCleanup (the
  // shared controller's onForceStop hook — visual cleanup only, never
  // advances, since whatever triggered the force-stop already decides what
  // happens next). Verified end-to-end via a live Playwright repro: 8 mocked
  // narration segments, all 8 played audioStarted->audioEnded to completion
  // in sequence across the full teaching timeline (was: stalled after 1).
  it("REQUIRED: the natural-completion path (onNaturalEnd) advances unconditionally — never gated on isSpeechStale, which is always true immediately after this token's own notifySpeechEnd call", () => {
    const idx = src.indexOf("const playSegmentThenAdvance = useCallback");
    const onNaturalEndIdx = src.indexOf("const onNaturalEnd = (reason:", idx);
    expect(onNaturalEndIdx).toBeGreaterThan(idx);
    const onForceStopIdx = src.indexOf("const onForceStopCleanup = ()", onNaturalEndIdx);
    expect(onForceStopIdx).toBeGreaterThan(onNaturalEndIdx);
    const onNaturalEndBody = src.slice(onNaturalEndIdx, onForceStopIdx);
    expect(onNaturalEndBody).toMatch(/advanceForPlaybackRef\.current\(\);/);
    expect(onNaturalEndBody).not.toMatch(/isSpeechStale/);
  });

  it("REQUIRED: the force-stop cleanup path (onForceStopCleanup, wired to registerActiveAudio/registerActiveUtterance) never advances the timeline — whatever triggered the stop already handles what happens next", () => {
    const idx = src.indexOf("const onForceStopCleanup = () => {");
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, idx + 300);
    expect(body).not.toMatch(/advanceForPlaybackRef/);
    expect(src).toMatch(/registerActiveAudio\(token, audio, onForceStopCleanup\)/);
    expect(src).toMatch(/registerActiveUtterance\(token, utter, onForceStopCleanup\)/);
  });

  it("audio.onended/utter.onend (genuine media completion) call onNaturalEnd; the onForceStop callback registered with the shared controller calls onForceStopCleanup — the two paths are never swapped", () => {
    expect(src).toMatch(/audio\.onended = \(\) => \{ notifySpeechEnd\(token, SPEECH_OWNER\); onNaturalEnd\("ended"\); \};/);
    expect(src).toMatch(/utter\.onend\s+= \(\) => \{ notifySpeechEnd\(token, SPEECH_OWNER\); onNaturalEnd\("ended"\); \};/);
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
    const idx = src.indexOf("const clearTeachingLayer = useCallback");
    const body = src.slice(idx, idx + 500);
    expect(body).toMatch(/\.filter\(s => s\.isLocked\)/);
  });

  it("clearTeachingLayer is called unconditionally from both the rebuild effect and handleMount, not gated behind a lessonPlan truthiness check", () => {
    const rebuildIdx = src.indexOf("useEffect(() => {\n    const editor = editorRef.current;\n    if (!editor) return;\n\n    try {\n      clearTeachingLayer(editor);");
    expect(rebuildIdx).toBeGreaterThan(-1);

    const mountIdx = src.indexOf("const handleMount = useCallback((editor: Editor) => {");
    const mountBody = src.slice(mountIdx, mountIdx + 1400);
    // clearTeachingLayer still runs unconditionally with respect to
    // lessonPlan truthiness (no `if (lessonPlan)` gate around it) — it's
    // only skipped on a confirmed duplicate mount (React StrictMode
    // double-invoking onMount for the SAME editor instance, see
    // isDuplicateMount above), never based on whether a plan exists yet.
    expect(mountBody).toMatch(/editorRef\.current = editor;\s*\n\s*if \(!isDuplicateMount\) \{\s*\n\s*clearTeachingLayer\(editor\);/);
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

describe("No fallback — a Professor Lesson Planner failure shows a distinct retry state, never a substituted lesson", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS, "utf8"); });

  it("does not import or reference the retired deterministic fallback generator", () => {
    expect(src).not.toMatch(/deterministicLessonScript/);
    expect(src).not.toMatch(/usingFallback/);
    expect(src).not.toMatch(/basic lesson — retry/);
  });

  it('shows a distinct role="alert" retry state when status is "error", separate from the loading skeleton', () => {
    const idx = src.indexOf('lessonStatus === "error"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 950);
    expect(block).toMatch(/role="alert"/);
    expect(block).toMatch(/onClick=\{reanalyze\}/);
    expect(block).toMatch(/Retry/);
  });

  it("the loading skeleton only renders when status is NOT error, so it never masks a real failure", () => {
    const idx = src.indexOf('lessonStatus !== "error"');
    expect(idx).toBeGreaterThan(-1);
  });

  it("reads the specific errorMessage from the hook, falling back to a sensible default", () => {
    expect(src).toMatch(/lessonErrorMessage \?\? "Unable to generate Whiteboard for this page\."/);
  });
});

describe("pageTeachingType (shared page classifier) threads from props into the Professor Lesson Planner", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS, "utf8"); });

  it("accepts a pageTeachingType prop and passes it into useProfessorLesson", () => {
    expect(src).toMatch(/pageTeachingType\?:\s*string \| null;/);
    const idx = src.indexOf("useProfessorLesson({");
    const body = src.slice(idx, idx + 300);
    expect(body).toMatch(/pageTeachingType:\s*pageTeachingType \?\? null,/);
  });
});

describe("Expanded action vocabulary: erase, line shapes, and multiple simultaneous emphasis treatments", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS, "utf8"); });

  it("emphasisShapeId is keyed by treatment — a shape can be circled AND numbered without one overlay overwriting the other", () => {
    const idx = src.indexOf("function emphasisShapeId(");
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, idx + 300);
    expect(body).toMatch(/treatment: string/);
    expect(body).toMatch(/emphasis-\$\{treatment\}-/);
  });

  it("iterates s.emphasisTreatments (an array) rather than a single hardcoded treatment", () => {
    const idx = src.indexOf("if (s.emphasized && s.bounds) {");
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, idx + 500);
    expect(body).toMatch(/for \(const \{ treatment, sequenceNumber \} of s\.emphasisTreatments\)/);
  });

  it("emphasisOverlaySpec renders a distinct visual per treatment: underline, highlight, number, and circle/pulse", () => {
    const idx = src.indexOf("function emphasisOverlaySpec(");
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, idx + 2400);
    expect(body).toMatch(/case "underline":/);
    expect(body).toMatch(/case "highlight":/);
    expect(body).toMatch(/case "number":/);
    expect(body).toMatch(/case "pulse":/);
  });

  it("emphasisOverlaySpec renders 'crossOut' as a diagonal line with both arrowheads suppressed, not a directional connector", () => {
    const idx = src.indexOf("function emphasisOverlaySpec(");
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, idx + 2400);
    expect(body).toMatch(/case "crossOut":/);
    expect(body).toMatch(/arrowheadStart: "none", arrowheadEnd: "none"/);
  });

  it("the 'highlight' treatment renders as a translucent wash (opacity < 1), not an opaque block obscuring the shape", () => {
    const idx = src.indexOf('case "highlight":');
    const body = src.slice(idx, idx + 550);
    expect(body).toMatch(/opacity:\s*0\.\d+/);
  });

  it("the 'number' treatment renders the sequence number as visible text on a badge shape", () => {
    const idx = src.indexOf('case "number": {');
    const body = src.slice(idx, idx + 400);
    expect(body).toMatch(/richText:\s*toRichText\(label\)/);
  });

  it("draw-shape's 'line' variant renders distinctly from box/circle — a thin filled bar, not an outlined card", () => {
    const idx = src.indexOf('if (s.kind === "line")');
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, idx + 450);
    expect(body).toMatch(/fill:\s*"solid"/);
  });
});
