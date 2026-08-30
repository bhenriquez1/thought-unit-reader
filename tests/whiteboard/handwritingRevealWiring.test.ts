// tests/whiteboard/handwritingRevealWiring.test.ts
// M7 — source-level regression guards for components/whiteboard/TldrawCanvas.tsx's
// wiring of the "being handwritten" progressive reveal (real behavioral
// coverage for the underlying math lives in tests/whiteboard/handwritingReveal.test.ts).
// Same convention as tests/whiteboard/tldrawCanvasVisualUpgrades.test.ts: this
// repo's jest config runs testEnvironment: "node" (no jsdom/RTL), so a real
// render of a 2000+ line tldraw-wrapping component isn't available here.

import fs from "fs";
import path from "path";

const CANVAS_FILE = path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx");
let src: string;
beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

describe("TldrawCanvas.tsx — imports the pure reveal math, doesn't reimplement it", () => {
  it("REQUIRED: imports clampRevealDurationMs/revealFrameIntervalMs/revealFraction/sliceTextForReveal/slicePointsForReveal/REVEAL_FRAME_COUNT from lib/whiteboard/handwritingReveal", () => {
    expect(src).toMatch(/import \{\s*clampRevealDurationMs, revealFrameIntervalMs, revealFraction,\s*sliceTextForReveal, slicePointsForReveal, REVEAL_FRAME_COUNT,\s*\} from "@\/lib\/whiteboard\/handwritingReveal";/);
  });
});

describe("TldrawCanvas.tsx — toTldrawShapeSpec exposes raw reveal content, not just tldraw props", () => {
  it("REQUIRED: freehand strokes carry their already-offset-relative points as revealPoints", () => {
    const idx = src.indexOf('if (s.kind === "freehand") {');
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/revealPoints: points,/);
  });

  it("REQUIRED: the bare text-only shape (the 'hand-written title') carries its raw string as revealText", () => {
    const idx = src.lastIndexOf('type: "text", x: s.x ?? 0, y: s.y ?? 0,');
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/revealText: s\.text \?\? "",/);
  });

  it("does NOT extend the boxed-node geo branch's richText label with a reveal field — only the bare title text/freehand strokes animate, not every labeled shape", () => {
    const geoIdx = src.indexOf('if (s.kind === "box" || s.kind === "circle"');
    const geoBlock = src.slice(geoIdx, geoIdx + 700);
    expect(geoBlock).not.toMatch(/revealText/);
  });
});

describe("TldrawCanvas.tsx — applyStateAtStep only animates on genuine forward playback", () => {
  it("REQUIRED: accepts an animate opt and cancels any in-flight reveal whenever this call is NOT the animated forward-playback path", () => {
    const idx = src.indexOf("const applyStateAtStep = useCallback((editor: Editor, index: number, opts?: { animate?: boolean }) => {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/if \(!opts\?\.animate\) cancelAllReveals\(\);/);
  });

  it("REQUIRED: derives the one reveal-eligible shapeId strictly from the SPECIFIC action at this index — never guessed from the broader recomputed state", () => {
    const idx = src.indexOf("const applyStateAtStep = useCallback(");
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/const revealAction = opts\?\.animate && index >= 0 && index < plan\.actions\.length \? plan\.actions\[index\] : null;/);
    expect(block).toMatch(/revealAction\.type === "write" \|\| revealAction\.type === "draw-freehand"/);
  });

  it("REQUIRED: a newly-created reveal-target shape is committed as a near-empty, UNLOCKED stub, never its full content", () => {
    const idx = src.indexOf("const isRevealTarget = revealTargetShapeId === s.shapeId");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/richText: toRichText\(""\)/);
    expect(block).toMatch(/slicePointsForReveal\(shapeSpec\.revealPoints!, 0\)/);
    expect(block).toMatch(/isLocked: false/);
  });

  it("REQUIRED: schedules the actual reveal only AFTER the stub has been committed via editor.createShape", () => {
    const createIdx = src.indexOf("for (const c of creates) editor.createShape(c as any);");
    const scheduleIdx = src.indexOf("for (const reveal of pendingReveals) scheduleShapeReveal(reveal);", createIdx);
    expect(createIdx).toBeGreaterThan(-1);
    expect(scheduleIdx).toBeGreaterThan(createIdx);
  });

  it("REQUIRED: a shape NOT selected for reveal still commits its full content and locks immediately, exactly as before M7", () => {
    const idx = src.indexOf("} else {\n          creates.push({ id: shapeIdOf(s.shapeId), type: shapeSpec.type, x: shapeSpec.x, y: shapeSpec.y, props: shapeSpec.props, opacity: s.opacity ?? 1, isLocked: true });");
    expect(idx).toBeGreaterThan(-1);
  });
});

describe("TldrawCanvas.tsx — scheduleShapeReveal grows a shape's content over discrete frames", () => {
  const idx = () => src.indexOf("const scheduleShapeReveal = useCallback(");
  const fn = () => src.slice(idx(), idx() + 2600);

  it("REQUIRED: the function exists", () => {
    expect(idx()).toBeGreaterThan(-1);
  });

  it("REQUIRED: text frames grow the richText via sliceTextForReveal/revealFraction, draw frames grow the encoded points via slicePointsForReveal/revealFraction", () => {
    const block = fn();
    expect(block).toMatch(/sliceTextForReveal\(target\.fullText, revealFraction\(frameIndex\)\)/);
    expect(block).toMatch(/slicePointsForReveal\(target\.fullPoints, revealFraction\(frameIndex\)\)/);
    expect(block).toMatch(/b64Vecs\.encodePoints\(sliced\)/);
  });

  it("REQUIRED: schedules exactly REVEAL_FRAME_COUNT timers, one per frame", () => {
    const block = fn();
    expect(block).toMatch(/for \(let frame = 1; frame <= REVEAL_FRAME_COUNT; frame\+\+\)/);
  });

  it("REQUIRED: locks the shape only on the FINAL frame, not every frame — it starts unlocked at stub-creation time", () => {
    const block = fn();
    expect(block).toMatch(/if \(isFinal\) editorNow\.updateShapes\(\[\{ id: tldrawId, type: target\.type, isLocked: true \} as any\]\);/);
  });

  it("REQUIRED: lifts and restores the editor's own readonly flag around every mutation — the exact bug applyStateAtStep's own comment documents (a locked/readonly-blocked update is silently swallowed by tldraw, not an error)", () => {
    const block = fn();
    expect(block).toMatch(/const wasReadonly = editorNow\.getIsReadonly\(\);/);
    expect(block).toMatch(/if \(wasReadonly\) editorNow\.updateInstanceState\(\{ isReadonly: false \}\);/);
    expect(block).toMatch(/if \(wasReadonly\) editorNow\.updateInstanceState\(\{ isReadonly: true \}\);/);
  });

  it("REQUIRED: never resurrects a reveal that a jump/restart/unmount has already cancelled — checks revealTimersRef before touching the editor", () => {
    const block = fn();
    expect(block).toMatch(/if \(!editorNow \|\| !revealTimersRef\.current\.has\(target\.shapeId\)\) return;/);
  });

  it("REQUIRED: never throws out of a stale tick — the whole mutation sequence is wrapped so a disposed editor or deleted shape can't produce an unhandled exception", () => {
    const block = fn();
    expect(block).toMatch(/} catch \{ \/\* shape already gone, or editor disposed/);
  });
});

describe("TldrawCanvas.tsx — cancelAllReveals clears every pending timer", () => {
  it("REQUIRED: clears every timer for every shapeId and empties the map", () => {
    const idx = src.indexOf("const cancelAllReveals = useCallback(");
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/window\.clearTimeout\(t\)/);
    expect(block).toMatch(/revealTimersRef\.current\.clear\(\);/);
  });
});

describe("TldrawCanvas.tsx — only genuine forward playback asks for the animated reveal", () => {
  it("REQUIRED: advanceForPlayback's own setStepIndex call passes animate: true", () => {
    expect(src).toMatch(/setStepIndex\(next, \{ animate: true \}\);/);
  });

  it("REQUIRED: every OTHER setStepIndex call site (manual Next/Previous/Restart/mount jumps) is untouched — still bare index, no opts, still instant", () => {
    const calls = Array.from(src.matchAll(/setStepIndex\(([^)]*)\);/g)).map(m => m[1].trim());
    expect(calls).toContain("next, { animate: true }");
    const instantCalls = calls.filter(c => c !== "next, { animate: true }");
    expect(instantCalls.length).toBeGreaterThan(0);
    for (const call of instantCalls) {
      expect(call).not.toMatch(/animate/);
    }
  });

  it("REQUIRED: setStepIndex forwards its opts through to applyStateAtStep unchanged", () => {
    const idx = src.indexOf("const setStepIndex = useCallback((n: number, opts?: { animate?: boolean }) => {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 250);
    expect(block).toMatch(/if \(editor\) applyStateAtStep\(editor, n, opts\);/);
  });
});
