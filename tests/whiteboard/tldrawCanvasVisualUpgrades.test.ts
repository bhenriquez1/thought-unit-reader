// tests/whiteboard/tldrawCanvasVisualUpgrades.test.ts
// Regression guards for components/whiteboard/TldrawCanvas.tsx — this repo's
// jest config runs testEnvironment: "node" (no jsdom/RTL), so a real render
// isn't available here; these are source-level checks for wiring that IS
// otherwise fully unit-testable (the pure toTldrawShapeSpec/colorForTarget
// logic itself is exercised indirectly through this file's string matching,
// same pattern already used throughout tests/whiteboard/).

import fs from "fs";
import path from "path";

const CANVAS_FILE = path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx");

describe("TldrawCanvas.tsx — EDGE_COLOR is actually applied (was dead code)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: colorForTarget checks vsg.edges when no node matches, returning EDGE_COLOR[edge.kind]", () => {
    const idx = src.indexOf("const colorForTarget = useCallback(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/const edge = v\.edges\.find\(e => e\.id === targetId\);/);
    expect(block).toMatch(/if \(edge\) return EDGE_COLOR\[edge\.kind\] \?\? fallback;/);
  });

  it("REQUIRED: registerAnchors registers draw-arrow actions too, not just write/draw-shape — without this, an arrow's targetId (the edge id) never reaches colorForTarget at all", () => {
    const idx = src.indexOf("const registerAnchors = useCallback(");
    const block = src.slice(idx, idx + 550);
    expect(block).toMatch(/a\.type === "write" \|\| a\.type === "draw-shape" \|\| a\.type === "draw-freehand" \|\| a\.type === "draw-arrow"/);
  });
});

describe("TldrawCanvas.tsx — official-agent-style observe → draw → inspect → correct loop", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("gives Claude both a live viewport screenshot and structured shape data", () => {
    expect(src).toMatch(/captureProfessorAgentCanvas/);
    expect(src).toMatch(/editor\.toImageDataUrl\(visibleShapes/);
    expect(src).toMatch(/semanticRole:/);
    expect(src).toMatch(/sourceTargetId:/);
    expect(src).toMatch(/origin: shapeId\.startsWith\("shape:prof-agent-"\)/);
  });

  it("executes one bounded step, then captures the updated canvas for exactly one inspect\/correction pass", () => {
    const loop = src.slice(src.indexOf("const ensureRuntimeAgentVisualStep"), src.indexOf("// ── Narration: single ordered queue"));
    expect(loop).toMatch(/pass: "execute"/);
    expect(loop).toMatch(/verifyProfessorTldrawAgentResponse\(executeRequest, executeResponse\)/);
    expect(loop).toMatch(/await revealRuntimeAgentActions\(editor, stepId, execute\.actions\)/);
    expect(loop).toMatch(/const updatedCanvas = await captureAgentContext\(editor\)/);
    expect(loop).toMatch(/pass: "inspect"/);
    expect((loop.match(/requestProfessorTldrawAgent\(/g) ?? []).length).toBe(2);
  });

  it("reveals verified tool calls incrementally instead of placing one completed picture", () => {
    const reveal = src.slice(src.indexOf("const revealRuntimeAgentActions"), src.indexOf("const ensureRuntimeAgentVisualStep"));
    expect(reveal).toMatch(/for \(let i = 0; i < nextActions\.length; i\+\+\)/);
    expect(reveal).toMatch(/agentRevealCountByStepRef\.current\.set\(stepId, start \+ i \+ 1\)/);
    expect(reveal).toMatch(/applyStateAtStep\(editor, stepIndexRef\.current\)/);
  });

  it("starts the Professor explanation before waiting on the visual agent, so narration overlaps drawing", () => {
    const branch = src.indexOf('if (action.type === "set-surface" && action.surface === "whiteboard")');
    const advance = src.slice(branch, src.indexOf('if (action.type === "speak")', branch));
    expect(advance.indexOf("maybeEarlyStartVisualNarration")).toBeGreaterThanOrEqual(0);
    expect(advance.indexOf("ensureRuntimeAgentVisualStep")).toBeGreaterThan(advance.indexOf("maybeEarlyStartVisualNarration"));
  });

  it("renders native pressure-sensitive tldraw draw shapes and keeps deterministic visuals as fallback", () => {
    expect(src).toMatch(/type: "draw", x, y/);
    expect(src).toMatch(/b64Vecs\.encodePoints\(points\)/);
    expect(src).toMatch(/isComplete: true, isClosed: s\.closed/);
    expect(src).toMatch(/agent_returned_no_visual_primitives/);
    expect(src).toMatch(/existing deterministic layout; Professor playback never stalls/);
  });

  it("only replaces deterministic fallback concepts that an agent primitive explicitly grounds to the same source target", () => {
    expect(src).toMatch(/coveredSourceTargetsByStep/);
    expect(src).toMatch(/!action\.targetId \|\| !covered\.has\(action\.targetId\)/);
    expect(src).toMatch(/ungrounded decorative stroke can augment/);
  });

  it("returns the visible status to deterministic fallback when the bounded agent loop times out", () => {
    const loop = src.slice(src.indexOf("const ensureRuntimeAgentVisualStep"), src.indexOf("// ── Narration: single ordered queue"));
    expect(loop).toMatch(/let timedOut = false/);
    expect(loop).toMatch(/timedOut = true;\s*controller\.abort\(\)/);
    expect(loop).toMatch(/timedOut \|\| !controller\.signal\.aborted/);
    expect(loop).toMatch(/setAgentVisualStatus\("fallback"\)/);
  });
});

describe("TldrawCanvas.tsx — Phase 3 semantic-role colors", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("prefers stable teaching-role and relationship colors over source-tier fallback colors", () => {
    expect(src).toMatch(/colorForTeachingRole\(s\.teachingRole\)/);
    expect(src).toMatch(/colorForRelationship\(s\.relationshipKind\)/);
    expect(src).toMatch(/semanticColor \?\? sourceColor/);
  });

  it("keeps danger-tier evidence red as a deterministic safety override", () => {
    expect(src).toMatch(/const isDangerTarget = useCallback/);
    expect(src).toMatch(/isDangerTarget\(targetId\) \? "red"/);
  });
});

describe("TldrawCanvas.tsx — Phase B2: draw-while-teaching — narration is early-started at step entry", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: advanceForPlayback calls maybeEarlyStartStepNarration exactly when entering a NEW step (stepStartIndex(...) === next)", () => {
    const idx = src.indexOf("const advanceForPlayback = useCallback");
    const block = src.slice(idx, idx + 1200);
    expect(block).toMatch(/if \(stepStartIndex\(plan\.actions, action\.stepId\) === next\) \{/);
    expect(block).toMatch(/maybeEarlyStartStepNarration\(action\.stepId\);/);
  });

  it("REQUIRED: maybeEarlyStartStepNarration only engages for a step with EXACTLY ONE speak action, preceded by at least one other action", () => {
    const idx = src.indexOf("const maybeEarlyStartStepNarration = useCallback");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 1100);
    expect(block).toMatch(/speakIndices\.length !== 1 \|\| speakIndices\[0\] <= start/);
    expect(block).toMatch(/playSegmentThenAdvance\(segment, speakIndex, \{ earlyStart: true, stepId \}\);/);
  });

  it("REQUIRED: maybeEarlyStartStepNarration never double-starts a segment already recorded in stepNarrationRef", () => {
    const idx = src.indexOf("const maybeEarlyStartStepNarration = useCallback");
    const block = src.slice(idx, idx + 1000);
    expect(block).toMatch(/if \(stepNarrationRef\.current\.has\(segment\.id\)\) return;/);
  });

  it("REQUIRED: when the pointer's own arrival reaches the speak action, it consults stepNarrationRef instead of blindly calling playSegmentThenAdvance — 'done' advances immediately, 'pending' waits without starting a second Audio element", () => {
    const idx = src.indexOf("const advanceForPlayback = useCallback");
    const block = src.slice(idx, idx + 5200);
    const speakIdx = block.indexOf('if (action.type === "speak") {');
    const speakBlock = block.slice(speakIdx, speakIdx + 900);
    expect(speakBlock).toMatch(/narrationState === "done"/);
    expect(speakBlock).toMatch(/narrationState === "pending"/);
    // The "pending" branch must NOT call playSegmentThenAdvance again.
    const pendingIdx = speakBlock.indexOf('narrationState === "pending"');
    const pendingBlock = speakBlock.slice(pendingIdx, pendingIdx + 300);
    expect(pendingBlock).not.toMatch(/playSegmentThenAdvance\(/);
  });

  it("REQUIRED: the earlyStart completion path in playSegmentThenAdvance records 'done' and only advances if the pointer has already caught up (stepIndexRef.current >= index)", () => {
    const idx = src.indexOf("if (opts?.earlyStart) {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/stepNarrationRef\.current\.set\(segment\.id, "done"\);/);
    expect(block).toMatch(/if \(stepIndexRef\.current >= index\) advanceForPlaybackRef\.current\(\);/);
  });

  it("REQUIRED: stopNarration (the single choke point for every navigation action) clears stepNarrationRef — no stale early-start bookkeeping survives a Next/Previous/Restart/rebuild", () => {
    const idx = src.indexOf("const stopNarration = useCallback");
    const block = src.slice(idx, idx + 1100);
    expect(block).toMatch(/stepNarrationRef\.current\.clear\(\);/);
  });

  it("Pause/Resume mechanics are untouched by the early-start change — they still operate on activeAudioElRef/activeUtteranceRef regardless of when playback began, so an early-started segment pauses/resumes exactly like an on-time one", () => {
    const idx = src.indexOf("const handlePlayPause = useCallback");
    const block = src.slice(idx, idx + 2100);
    expect(block).toMatch(/activeAudioElRef\.current\.pause\(\)/);
    expect(block).toMatch(/activeAudioElRef\.current\.play\(\)\.catch/);
  });

  it("REQUIRED: onForceStopCleanup is untouched by earlyStart — it never consults or writes stepNarrationRef, preserving 'whatever caused the force-stop already decides what happens next' for early-started segments too", () => {
    const idx = src.indexOf("const onForceStopCleanup = () => {");
    expect(idx).toBeGreaterThan(-1);
    const endIdx = src.indexOf("if (resolved.kind ===", idx);
    const block = src.slice(idx, endIdx);
    expect(block).not.toMatch(/stepNarrationRef/);
    expect(block).not.toMatch(/advanceForPlaybackRef/);
  });
});

describe("TldrawCanvas.tsx — Phase B2: Learning-State extension hooks (stable, no persistence)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: Props accepts onTeachingStepStarted/onTeachingStepCompleted/onLessonCompleted, all optional", () => {
    const idx = src.indexOf("interface Props {");
    const block = src.slice(idx, idx + 4200);
    expect(block).toMatch(/onTeachingStepStarted\?:\s*\(stepId: number\) => void;/);
    expect(block).toMatch(/onTeachingStepCompleted\?:\s*\(stepId: number, info\?: \{ misconceptionLabel\?: string \}\) => void;/);
    expect(block).toMatch(/onLessonCompleted\?:\s*\(snapshotId: string, plan: ProfessorLessonPlan\) => void;/);
  });

  it("REQUIRED: onTeachingStepStarted fires exactly when a NEW step begins in advanceForPlayback, alongside the early-start check", () => {
    const idx = src.indexOf("const advanceForPlayback = useCallback");
    const block = src.slice(idx, idx + 1200);
    expect(block).toMatch(/onTeachingStepStartedRef\.current\?\.\(action\.stepId\);/);
    expect(block).toMatch(/focusDirectorEvidence\(action\.stepId\);/);
  });

  it("keeps source-follow highlighting on the Director step's canonical current-page evidence", () => {
    const idx = src.indexOf("const focusDirectorEvidence = useCallback");
    const block = src.slice(idx, idx + 600);
    expect(block).toMatch(/directorSteps\?\.find/);
    expect(block).toMatch(/sourceEvidence\[0\]\?\.sourceId/);
    expect(block).toMatch(/setThoughtUnit\(sourceId\)/);
  });

  it("REQUIRED: onTeachingStepCompleted fires for the PREVIOUS step when a new one begins, carrying a misconception label when the step's own crossOut emphasis flags one", () => {
    const idx = src.indexOf("const advanceForPlayback = useCallback");
    const block = src.slice(idx, idx + 1200);
    expect(block).toMatch(/const previousStepId = plan\.actions\[next - 1\]\.stepId;/);
    expect(block).toMatch(/onTeachingStepCompletedRef\.current\?\.\(previousStepId, misconceptionLabel \? \{ misconceptionLabel \} : undefined\);/);
  });

  it("REQUIRED: onLessonCompleted fires from a single atEnd-transition effect, not scattered across every navigation handler", () => {
    const idx = src.indexOf("const atEnd = totalSteps");
    const block = src.slice(idx, idx + 1300);
    expect(block).toMatch(/useEffect\(\(\) => \{/);
    expect(block).toMatch(/if \(!atEnd \|\| !lessonPlan\) return;/);
    expect(block).toMatch(/onLessonCompletedRef\.current\?\.\(buildProfessorLessonCacheKey\(lessonPlan\.sourceSnapshot\), lessonPlan\);/);
    expect(block).toMatch(/\}, \[atEnd\]\);/);
  });

  it("this component never itself calls into Knowledge Graph / Learning State persistence — B3's job, not B2's", () => {
    expect(src).not.toMatch(/resolveOrCreateNode|applyLearningEvent|knowledgeGraphStore/);
  });
});

describe("TldrawCanvas.tsx — Phase B1: 'brace' renders as a real bracket, not a rectangle fallback", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: toTldrawShapeSpec special-cases 'brace' BEFORE the generic geo-shape branch", () => {
    const braceIdx = src.indexOf('if (s.kind === "brace") {');
    const genericIdx = src.indexOf('if (s.kind === "box" || s.kind === "circle"');
    expect(braceIdx).toBeGreaterThan(-1);
    expect(genericIdx).toBeGreaterThan(-1);
    expect(braceIdx).toBeLessThan(genericIdx);
  });

  it('REQUIRED: the generic geo-shape branch no longer lists "brace" — it must not fall back to a plain rectangle', () => {
    const genericIdx = src.indexOf('if (s.kind === "box" || s.kind === "circle"');
    const block = src.slice(genericIdx, genericIdx + 200);
    expect(block).not.toMatch(/s\.kind === "brace"/);
  });

  it('REQUIRED: "brace" returns a real tldraw "line" shape with 4 points (a squared bracket), not a "geo" rectangle', () => {
    const braceIdx = src.indexOf('if (s.kind === "brace") {');
    const block = src.slice(braceIdx, braceIdx + 1300);
    expect(block).toMatch(/type: "line", x: s\.bounds\.x, y: s\.bounds\.y,/);
    expect(block).toMatch(/points: \{/);
    expect(block).toMatch(/p1: \{ id: "p1", index: "a1", x: 0, y: 0 \}/);
    expect(block).toMatch(/p4: \{ id: "p4", index: "a4", x: 0, y: h \}/);
  });

  it("the function's return type now includes \"line\" alongside geo/arrow/text", () => {
    const idx = src.indexOf("function toTldrawShapeSpec(");
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/type: "geo" \| "arrow" \| "text" \| "line"/);
  });
});

describe("TldrawCanvas.tsx — richer geo shape vocabulary (diamond/hexagon/cloud), not just rectangle/ellipse", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: toTldrawShapeSpec's geo branch now accepts diamond/hexagon/cloud shape kinds", () => {
    const idx = src.indexOf("function toTldrawShapeSpec(");
    const block = src.slice(idx, idx + 5200);
    expect(block).toMatch(/s\.kind === "diamond" \|\| s\.kind === "hexagon" \|\| s\.kind === "cloud"/);
  });

  it("maps each new kind to tldraw's own built-in geo shape name 1:1 (diamond/hexagon/cloud are real tldraw geo values)", () => {
    const idx = src.indexOf("const GEO_FOR_KIND: Record<string, string> = {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/diamond: "diamond"/);
    expect(block).toMatch(/hexagon: "hexagon"/);
    expect(block).toMatch(/cloud: "cloud"/);
  });
});

describe("TldrawCanvas.tsx — per-step camera padding scales with content, floor raised well above the old flat 40px", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: padding is no longer a flat 40px constant", () => {
    expect(src).not.toMatch(/x: merged\.x - 40, y: merged\.y - 40, w: merged\.w \+ 80, h: merged\.h \+ 80/);
  });

  it("REQUIRED: padX/padY floors are well above the old 40px — the concrete fix for 'the camera zooms in too tight (209%) on a single small box'", () => {
    const idx = src.indexOf("const padX = Math.max(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/const padX = Math\.max\(100, merged\.w \* 0\.3\);/);
    expect(block).toMatch(/const padY = Math\.max\(140, merged\.h \* 1\.2\);/);
  });

  it("padding is still applied via the same zoomToBounds API already used elsewhere in this file (no new/unproven tldraw API surface)", () => {
    const idx = src.indexOf("const padX = Math.max(");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/editor\.zoomToBounds\(/);
  });

  it("a full zoomToFit still happens before any step has run (index === -1) — only the PER-STEP crop changed, not the initial whole-scene view", () => {
    expect(src).toMatch(/else if \(index === -1\) \{[\s\S]*?editor\.zoomToFit\(\);/);
  });
});

describe("TldrawCanvas.tsx — read-only teaching canvas + explicit 'Edit a copy' opt-in", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: editingEnabled defaults to false — the canvas is read-only until an explicit opt-in, not just during active playback", () => {
    expect(src).toMatch(/const \[editingEnabled, setEditingEnabled\] = useState\(false\);/);
  });

  it("REQUIRED: the editor's readonly flag is isPlaying OR NOT editingEnabled — locked during playback, and locked by default even while paused/finished until the student opts in", () => {
    const idx = src.indexOf("editor.updateInstanceState({ isReadonly: isPlaying || !editingEnabled });");
    expect(idx).toBeGreaterThan(-1);
  });

  it("REQUIRED: handleMount sets isReadonly:true immediately — the canvas is never briefly editable on first paint before the sync effect catches up", () => {
    const idx = src.indexOf("const handleMount = useCallback((editor: Editor) => {");
    const block = src.slice(idx, idx + 1700);
    expect(block).toMatch(/editor\.updateInstanceState\(\{ isReadonly: true \}\)/);
  });

  it("REQUIRED: a new lesson (lessonPlan reference change) resets editingEnabled back to false and re-locks the canvas — editing access from a prior page's lesson never carries over", () => {
    const idx = src.indexOf("// A new lesson always starts read-only");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 160);
    expect(block).toMatch(/setEditingEnabled\(false\);/);
    expect(block).toMatch(/editor\.updateInstanceState\(\{ isReadonly: true \}\)/);
  });

  it("REQUIRED: the 'Edit a copy' button exists, is disabled while playing, and is disabled once already enabled", () => {
    const idx = src.indexOf('onClick={() => setEditingEnabled(true)}');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 250);
    expect(block).toMatch(/disabled=\{isPlaying \|\| editingEnabled\}/);
  });
});

describe("TldrawCanvas.tsx — a pageTruthKey/lessonPlan change cancels narration AND clears the scene immediately, not just one or the other", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: the rebuild effect (fires on every lessonPlan reference change) both clears the teaching layer AND stops all speech, in the same synchronous block — before the 'nothing to draw yet' early return", () => {
    const idx = src.indexOf("useEffect(() => {\n    const editor = editorRef.current;\n    if (!editor) return;\n\n    try {\n      clearTeachingLayer(editor);");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 1800);
    expect(block).toMatch(/clearTeachingLayer\(editor\);/);
    expect(block).toMatch(/stopNarration\("rebuild"\);/);
    // Both must run BEFORE the null-plan early return, so a page change with
    // no new plan yet (loading, or a failed generation) still clears the OLD
    // page's shapes/narration instead of leaving them visible.
    const clearIdx = block.indexOf("clearTeachingLayer(editor);");
    const stopIdx  = block.indexOf('stopNarration("rebuild");');
    const returnIdx = block.indexOf("if (!lessonPlan) {");
    expect(clearIdx).toBeLessThan(returnIdx);
    expect(stopIdx).toBeLessThan(returnIdx);
  });

  it("the rebuild effect is keyed on [lessonPlan] alone — a page/concept change is a lessonPlan identity change (useProfessorLesson.ts is the single owner of when a NEW plan object is produced)", () => {
    const idx = src.indexOf("// eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [lessonPlan]);");
    expect(idx).toBeGreaterThan(-1);
  });
});

describe("TldrawCanvas.tsx — [WHITEBOARD_STEP_DIAGNOSTIC] per-step logging, privacy-safe", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: logs every field the diagnosis brief asked for — pageTruthKey, sceneGraphId, currentTeachingStep, totalTeachingSteps, nodeCount, edgeCount, shapeRecordsGenerated, shapeRecordsCreated, currentStepShapeIds, editorShapeCount, visibleShapeCount", () => {
    const idx = src.indexOf('console.log("[WHITEBOARD_STEP_DIAGNOSTIC]"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 1300);
    for (const field of [
      "pageTruthKey:", "sceneGraphId:", "currentTeachingStep:", "totalTeachingSteps:",
      "nodeCount:", "edgeCount:", "shapeRecordsGenerated:", "shapeRecordsCreated:",
      "currentStepShapeIds:", "editorShapeCount:", "visibleShapeCount:",
    ]) {
      expect(block).toContain(field);
    }
  });

  it("REQUIRED: editorShapeCount is queried directly from tldraw's own store (ground truth), not from this component's own bookkeeping — a real create/store discrepancy must be visible, not just inferred", () => {
    const idx = src.indexOf('console.log("[WHITEBOARD_STEP_DIAGNOSTIC]"');
    const block = src.slice(idx, idx + 1300);
    expect(block).toMatch(/editorShapeCount:\s*editor\.getCurrentPageShapeIds\(\)\.size,/);
  });

  it("REQUIRED: never logs narration/label/quote text — only ids and counts", () => {
    const idx = src.indexOf('console.log("[WHITEBOARD_STEP_DIAGNOSTIC]"');
    const block = src.slice(idx, idx + 1300);
    expect(block).not.toMatch(/text:/);
    expect(block).not.toMatch(/narration/i);
    expect(block).not.toMatch(/shortLabel/i);
  });

  it("REQUIRED: camera diagnostics capture the requested bounds plus actual editor viewport before and after the animation settles", () => {
    const idx = src.indexOf('console.log("[WHITEBOARD_CAMERA_DIAGNOSTIC]"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 1400);
    expect(block).toMatch(/cameraBounds:/);
    expect(block).toMatch(/actualEditorViewport:/);
    expect(src).toContain("const before = editor.getViewportPageBounds();");
    expect(src).toContain("const settled = editor.getViewportPageBounds();");
    expect(src).toContain('phase: "transition-settled"');
  });
});

describe("TldrawCanvas.tsx — dev-only visible step readout (never rendered in production)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: renders 'Step N/total · X scene nodes · Y generated shapes · Z visible', gated on DEV", () => {
    const idx = src.indexOf("{DEV && stepDiagnostic && (");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/Step \{stepDiagnostic\.step\}\/\{stepDiagnostic\.total\} · \{stepDiagnostic\.nodeCount\} scene nodes · \{stepDiagnostic\.generated\} generated shapes · \{stepDiagnostic\.visible\} visible/);
  });

  it("stepDiagnostic state is populated inside applyStateAtStep, from the SAME values as the console log (never a second, independently-computed source that could drift)", () => {
    const idx = src.indexOf("if (DEV) {\n      setStepDiagnostic({");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 250);
    expect(block).toMatch(/generated: wantedIds\.size, visible: createdShapeIdsRef\.current\.size,/);
  });

  it("DEV is a real NODE_ENV check, not a hardcoded true — this must never render in production", () => {
    expect(src).toMatch(/const DEV = process\.env\.NODE_ENV === "development";/);
  });
});

describe("TldrawCanvas.tsx — handleMount is idempotent against React StrictMode's double-invocation", () => {
  // Found via direct Playwright reproduction: next.config.js sets
  // reactStrictMode: true, and instrumenting handleMount showed it firing
  // twice for the SAME editor instance on every normal mount (mountCount
  // reaches 2, editorIdentity: "same"). Re-running the full clear+rebuild
  // sequence (clearTeachingLayer + registerAnchors + applyStateAtStep(-1))
  // a second time for an editor already fully initialized is unnecessary
  // risk in an async, multi-step process — this guards that it's skipped.
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: detects a duplicate mount by reference-comparing the incoming editor against editorRef.current, BEFORE reassigning it", () => {
    const idx = src.indexOf("const handleMount = useCallback((editor: Editor) => {");
    const block = src.slice(idx, idx + 1200);
    const compareIdx = block.indexOf("const isDuplicateMount = editor === editorRef.current;");
    const assignIdx = block.indexOf("editorRef.current = editor;");
    expect(compareIdx).toBeGreaterThan(-1);
    expect(assignIdx).toBeGreaterThan(compareIdx); // compared BEFORE the ref is overwritten
  });

  it("REQUIRED: clearTeachingLayer/registerAnchors/applyStateAtStep(-1) are all skipped on a duplicate mount", () => {
    const idx = src.indexOf("if (!isDuplicateMount) {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/clearTeachingLayer\(editor\);/);
    expect(block).toMatch(/registerAnchors\(lessonPlan\.actions\);/);
    expect(block).toMatch(/applyStateAtStep\(editor, -1\);/);
  });

  it("the store-listener (re-)subscription runs on EVERY mount, including duplicates — it's idempotent (no async sequence to race) unlike the full rebuild above", () => {
    const guardEndIdx = src.indexOf("if (!isDuplicateMount) {");
    const guardCloseIdx = src.indexOf("\n    }\n", guardEndIdx);
    const afterGuard = src.slice(guardCloseIdx, guardCloseIdx + 400);
    expect(afterGuard).toMatch(/storeUnsubRef\.current\?\.\(\);/);
    expect(afterGuard).toMatch(/storeUnsubRef\.current = editor\.store\.listen\(/);
  });

  it("the mount is logged with a running count and whether the editor identity matched — the exact evidence that revealed this bug", () => {
    const idx = src.indexOf('console.log("[WHITEBOARD_MOUNT_DIAGNOSTIC]"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/mountCount: mountCountRef\.current/);
    expect(block).toMatch(/editorIdentity: isDuplicateMount \? "same" : "different"/);
  });
});

describe("TldrawCanvas.tsx — applyStateAtStep lifts the editor-wide readonly lock around its own mutations", () => {
  // ROOT CAUSE, confirmed against the installed tldraw source
  // (node_modules/@tldraw/editor): Editor.createShapes/_updateShapes/
  // deleteShapes each do `if (this.getIsReadonly()) return` as an
  // unconditional, silent no-op — no thrown error, no console warning.
  // This component keeps the editor readonly for most of its lifecycle
  // (isPlaying || !editingEnabled) specifically to stop the STUDENT from
  // dragging/editing the professor's shapes — but that editor-wide flag
  // doesn't distinguish "a user is blocked" from "our own drawing engine is
  // calling the API," so every draw action fired during autoplay (exactly
  // when applyStateAtStep needs to create shapes) was being silently
  // swallowed by tldraw itself. Per-shape isLocked: true (already set on
  // every created shape) is what actually keeps the student from editing —
  // the editor-wide flag was redundant for that purpose and actively broke
  // programmatic drawing. Confirmed via a live Playwright repro: before this
  // fix, editorShapeCount (editor.getCurrentPageShapeIds().size, tldraw's
  // own store) stayed 0 across every autoplay step despite
  // shapeRecordsCreated climbing normally; after, they match exactly.
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: captures wasReadonly and lifts it to false BEFORE the delete/create/update mutations run", () => {
    const stepIdx = src.indexOf("const applyStateAtStep = useCallback((editor: Editor, index: number) => {");
    expect(stepIdx).toBeGreaterThan(-1);
    const wasReadonlyIdx = src.indexOf("const wasReadonly = editor.getIsReadonly();", stepIdx);
    expect(wasReadonlyIdx).toBeGreaterThan(stepIdx);
    const liftIdx = src.indexOf("if (wasReadonly) editor.updateInstanceState({ isReadonly: false });", wasReadonlyIdx);
    expect(liftIdx).toBeGreaterThan(wasReadonlyIdx);

    const deleteIdx = src.indexOf("editor.deleteShapes([shapeIdOf(id)]);", stepIdx);
    const createIdx = src.indexOf("for (const c of creates) editor.createShape(c as any);", stepIdx);
    expect(deleteIdx).toBeGreaterThan(liftIdx);
    expect(createIdx).toBeGreaterThan(liftIdx);
  });

  it("REQUIRED: restores isReadonly back to true AFTER the create/update mutations, before the step diagnostic log", () => {
    const stepIdx = src.indexOf("const applyStateAtStep = useCallback((editor: Editor, index: number) => {");
    const createIdx = src.indexOf("for (const c of creates) editor.createShape(c as any);", stepIdx);
    const restoreIdx = src.indexOf("if (wasReadonly) editor.updateInstanceState({ isReadonly: true });", createIdx);
    const diagnosticIdx = src.indexOf('console.log("[WHITEBOARD_STEP_DIAGNOSTIC]"', createIdx);
    expect(restoreIdx).toBeGreaterThan(createIdx);
    expect(diagnosticIdx).toBeGreaterThan(restoreIdx);
  });

  it("only touches isReadonly when it was actually true — never force-unlocks an editor that was already writable (e.g. editingEnabled)", () => {
    const stepIdx = src.indexOf("const applyStateAtStep = useCallback((editor: Editor, index: number) => {");
    const block = src.slice(stepIdx, stepIdx + 10000);
    const liftCount = (block.match(/if \(wasReadonly\) editor\.updateInstanceState\(\{ isReadonly: (?:false|true) \}\);/g) ?? []).length;
    expect(liftCount).toBe(2); // one lift, one restore — both gated on wasReadonly
  });
});
