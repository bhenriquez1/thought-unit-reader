// tests/regression/requiredRegressionSuite.test.ts
// The 7 regression guarantees explicitly required by the "no stale visual
// content, no silent fallback, and no AI decision before the full current
// page has been extracted and read" directive for the SurgeonAnnotationPlan
// (PDF highlighting) and Professor Lesson Planner (Whiteboard) pipelines.
// Each of the 7 below corresponds 1:1 to one of the required scenarios, and
// is intentionally self-contained here even where a component test elsewhere
// also covers part of the same behavior — this file is the single place that
// names and verifies each of the 7 explicitly.

import fs from "fs";
import path from "path";
import { groundSurgeonQuotes } from "../../lib/highlights/groundSurgeonQuotes";
import { resolveAnnotationTier } from "../../components/reader/useSurgeonAnnotations";
import { computeCanvasStateAtStep } from "../../lib/whiteboard/professorTimelineEngine";
import type { SurgeonAnnotationPlan } from "../../lib/insights/pageAnnotationPlan";
import type { ProfessorTeachingAction } from "../../lib/whiteboard/professorLessonPlan";

const ANNOTATIONS_HOOK   = path.resolve(__dirname, "../../components/reader/useSurgeonAnnotations.ts");
const LESSON_HOOK        = path.resolve(__dirname, "../../components/whiteboard/useProfessorLesson.ts");
const TLDRAW_CANVAS      = path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx");
const PURE_READER_VIEW   = path.resolve(__dirname, "../../components/PureReaderView.tsx");
const WHITEBOARD_PANEL   = path.resolve(__dirname, "../../components/WhiteboardPanel.tsx");
const DETERMINISTIC_PLAN = path.resolve(__dirname, "../../lib/highlights/deterministicAnnotationPlan.ts");

type Annotation = SurgeonAnnotationPlan["annotations"][number];
function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    canonicalType: "definition",
    exactQuote:    "placeholder",
    reason:        "r",
    importance:    "high",
    treatment:     "definitionBar",
    spanScope:     "fullSentence",
    ...overrides,
  };
}

// ── 1. A page change removes all prior highlights and shapes ────────────────
describe("Required regression 1 — a page change removes all prior highlights and shapes", () => {
  it("useSurgeonAnnotations.ts's Effect A (keyed on page identity plus content identity) clears highlightTargets/groundedAnnotations/plan before anything else runs", () => {
    const src = fs.readFileSync(ANNOTATIONS_HOOK, "utf8");
    const idx = src.indexOf("// ── Effect A:");
    const effectBody = src.slice(idx, src.indexOf("// ── Effect B:"));
    expect(effectBody).toMatch(/setPlan\(null\)/);
    expect(effectBody).toMatch(/setHighlightTargets\(\[\]\)/);
    expect(effectBody).toMatch(/setGroundedAnnotations\(\[\]\)/);
    expect(effectBody).toMatch(/\}, \[pageTruthKey, pageContentHash, documentId\]\);/);
  });

  it("TldrawCanvas.tsx clears every locked teaching-layer shape unconditionally whenever lessonPlan's identity changes — including a transition to null", () => {
    const src = fs.readFileSync(TLDRAW_CANVAS, "utf8");
    const clearIdx = src.indexOf("const clearTeachingLayer = useCallback");
    expect(clearIdx).toBeGreaterThan(-1);
    const clearBody = src.slice(clearIdx, clearIdx + 400);
    expect(clearBody).toMatch(/\.filter\(s => s\.isLocked\)/);
    expect(clearBody).toMatch(/editor\.deleteShapes\(/);

    const rebuildIdx = src.indexOf("useEffect(() => {\n    const editor = editorRef.current;\n    if (!editor) return;\n\n    try {\n      clearTeachingLayer(editor);");
    expect(rebuildIdx).toBeGreaterThan(-1); // clear runs BEFORE the `if (!lessonPlan)` branch, not after
  });

  it("useProfessorLesson.ts's identityKey includes documentId + pageTruthKey + VSG content identity — a page/content change drives the TldrawCanvas clear above", () => {
    const src = fs.readFileSync(LESSON_HOOK, "utf8");
    expect(src).toMatch(/`\$\{args\.documentId\}::\$\{args\.pageTruthKey\}::\$\{args\.activeCanonicalUnitId \?\? "none"\}::\$\{args\.vsgId\}`/);
  });
});

// ── 2. A mismatched pageTruthKey cannot render ───────────────────────────────
describe("Required regression 2 — a mismatched pageTruthKey cannot render", () => {
  it("useSurgeonAnnotations.ts drops a fetch response whose plan.pageTruthKey does not match the current page, before setPlan/setHighlightTargets run", () => {
    const src = fs.readFileSync(ANNOTATIONS_HOOK, "utf8");
    const idx = src.indexOf("if (data.plan.pageTruthKey !== pageTruthKey) {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/return;/);
    // setPlan/setHighlightTargets must appear AFTER this guard, not before.
    const setPlanIdx = src.indexOf("setPlan(data.plan)");
    expect(setPlanIdx).toBeGreaterThan(idx);
  });

  it("useProfessorLesson.ts drops a fetch response whose script.pageTruthKey does not match the current page, before setLessonPlan runs", () => {
    const src = fs.readFileSync(LESSON_HOOK, "utf8");
    const idx = src.indexOf("if (script.pageTruthKey !== pageTruthKey) {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 150);
    expect(block).toMatch(/return;/);
    const setLessonPlanIdx = src.indexOf("setLessonPlan(plan)");
    expect(setLessonPlanIdx).toBeGreaterThan(idx);
  });
});

// ── 3. An upstream failure leaves an empty canvas ────────────────────────────
describe("Required regression 3 — an upstream failure leaves an empty canvas", () => {
  it("no lessonPlan actions (the failure state) reconstructs a canvas with zero shapes at every step, never stale content", () => {
    const state = computeCanvasStateAtStep([], -1);
    expect(state.size).toBe(0);
  });

  it("resolveAnnotationTier on an AI failure (status: 'error', no targets) returns planTier 'failed' with a genuinely empty highlightTargets array, never a substituted set", () => {
    const result = resolveAnnotationTier({
      aiHighlightTargets: [],
      aiGroundedAnnotations: [],
      status: "error",
    });
    expect(result.planTier).toBe("failed");
    expect(result.highlightTargets).toEqual([]);
    expect(result.groundedAnnotations).toEqual([]);
  });

  it("TldrawCanvas.tsx's rebuild effect sets totalSteps to 0 and returns immediately once the canvas is cleared, when there is no lessonPlan", () => {
    const src = fs.readFileSync(TLDRAW_CANVAS, "utf8");
    expect(src).toMatch(/if \(!lessonPlan\) \{[\s\S]{0,260}setTotalSteps\(0\);[\s\S]{0,40}return;/);
  });
});

// ── 4. Legacy automatic overlays never render when the new pipeline is enabled ──
describe("Required regression 4 — legacy automatic overlays never render when the new pipeline is enabled", () => {
  it("the deterministic/AI-free annotation baseline module was deleted, not merely unused", () => {
    expect(fs.existsSync(DETERMINISTIC_PLAN)).toBe(false);
  });

  it("useSurgeonAnnotations.ts has no reference to a baseline/deterministic fallback tier", () => {
    const src = fs.readFileSync(ANNOTATIONS_HOOK, "utf8");
    expect(src).not.toMatch(/deterministicAnnotationPlan/);
    expect(src).not.toMatch(/deterministicBaseline/);
  });

  it("PureReaderView.tsx's highlightTargets is always surgeonHighlightTargets (or []) — never falls back to allHighlightTargets/effectiveHighlightTargets", () => {
    const src = fs.readFileSync(PURE_READER_VIEW, "utf8");
    const idx = src.indexOf("highlightTargets={(() => {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, src.indexOf("})()}", idx));
    expect(block).toMatch(/const targets = surgeonHighlightTargets \?\? \[\];/);
    expect(block).not.toMatch(/return allHighlightTargets;/);
    expect(block).not.toMatch(/return effectiveHighlightTargets;/);
  });

  it("WhiteboardPanel.tsx has no legacy AI-illustration/diagram pipeline left at all — TldrawCanvas's Professor Lesson Planner is the SOLE rendering pipeline", () => {
    const src = fs.readFileSync(WHITEBOARD_PANEL, "utf8");
    expect(src).not.toMatch(/generateAIDrawing/);
    expect(src).not.toMatch(/fetch\(["']\/api\/whiteboard-explain["']/);
    expect(src).not.toMatch(/fetch\(["']\/api\/whiteboard-image["']/);
    expect(src).not.toMatch(/from ["']\.\/Whiteboard["']/);
  });
});

// ── 5. Sentence annotations include final punctuation ────────────────────────
describe("Required regression 5 — sentence annotations include final punctuation", () => {
  const PAGE =
    "Renal Physiology\n\n" +
    "The nephron is the functional unit of the kidney responsible for filtering blood plasma. " +
    "Each kidney contains roughly one million nephrons.";

  it("a mid-sentence fragment expands to the full sentence, ending in terminal punctuation, not a truncated clause", () => {
    const fragment = makeAnnotation({ exactQuote: "functional unit of the kidney" });
    const result = groundSurgeonQuotes([fragment], PAGE);
    expect(result).toHaveLength(1);
    const text = result[0].groundedText;
    expect(text.startsWith("The nephron is")).toBe(true);
    expect(text.endsWith("filtering blood plasma.")).toBe(true);
    expect(/[.!?;:]$/.test(text)).toBe(true);
  });
});

// ── 6. Procedures include all selected numbered steps ────────────────────────
describe("Required regression 6 — procedures include all selected numbered steps", () => {
  const PAGE =
    "Arterial Blood Gas Interpretation\n\n" +
    "Follow these steps to interpret an arterial blood gas result:\n" +
    "1. Measure arterial blood pH using a blood gas analyzer.\n" +
    "2. Compare the pH to the normal range of 7.35 to 7.45.\n" +
    "3. Identify whether the primary disturbance is respiratory or metabolic.";

  it("a procedure annotation grouped as one span (per the 'multi-sentence concepts' rule) preserves every numbered step, not just the first", () => {
    const procedure = makeAnnotation({
      canonicalType: "procedure",
      treatment:     "procedureRail",
      exactQuote:
        "Follow these steps to interpret an arterial blood gas result:\n" +
        "1. Measure arterial blood pH using a blood gas analyzer.\n" +
        "2. Compare the pH to the normal range of 7.35 to 7.45.\n" +
        "3. Identify whether the primary disturbance is respiratory or metabolic.",
    });
    const result = groundSurgeonQuotes([procedure], PAGE);
    expect(result).toHaveLength(1);
    const text = result[0].groundedText;
    expect(text).toMatch(/1\. Measure arterial blood pH using a blood gas analyzer\./);
    expect(text).toMatch(/2\. Compare the pH to the normal range of 7\.35 to 7\.45\./);
    expect(text).toMatch(/3\. Identify whether the primary disturbance is respiratory or metabolic\./);
  });

  it("does NOT fragment a grouped procedure into one annotation per step — a single exactQuote covering all steps stays a single grounded annotation", () => {
    const procedure = makeAnnotation({
      canonicalType: "procedure",
      treatment:     "procedureRail",
      exactQuote:
        "1. Measure arterial blood pH using a blood gas analyzer.\n" +
        "2. Compare the pH to the normal range of 7.35 to 7.45.\n" +
        "3. Identify whether the primary disturbance is respiratory or metabolic.",
    });
    const result = groundSurgeonQuotes([procedure], PAGE);
    expect(result).toHaveLength(1);
  });
});

// ── 7. Play/Pause/Previous/Next restore deterministic Whiteboard states ──────
describe("Required regression 7 — Play/Pause/Previous/Next restore deterministic Whiteboard states", () => {
  const ACTIONS: ProfessorTeachingAction[] = [
    { type: "move-camera", actionId: "a0", targetIds: ["shape:n1"], durationMs: 400, stepId: 1 },
    { type: "draw-shape", actionId: "a1", shapeId: "shape:n1", targetId: "src1", shape: "box", bounds: { x: 0, y: 0, w: 200, h: 56 }, durationMs: 550, stepId: 1 },
    { type: "write", actionId: "a2", shapeId: "shape:n1", targetId: "src1", text: "Rapid assessment", x: 8, y: 20, durationMs: 700, stepId: 1 },
    { type: "emphasize", actionId: "a3", targetId: "shape:n1", treatment: "circle", durationMs: 550, stepId: 1 },
  ];

  it("Play (advancing step by step) then Pause lands on the exact same state as jumping directly to that step", () => {
    // Simulate Play advancing one step at a time, as the UI does.
    let last;
    for (let i = -1; i <= 2; i++) last = computeCanvasStateAtStep(ACTIONS, i); // Pause happens at step 2
    const direct = computeCanvasStateAtStep(ACTIONS, 2);
    expect(last).toEqual(direct);
  });

  it("Next then Previous restores the exact state before Next was pressed", () => {
    const beforeNext = computeCanvasStateAtStep(ACTIONS, 1);
    computeCanvasStateAtStep(ACTIONS, 2); // Next
    const afterPrevious = computeCanvasStateAtStep(ACTIONS, 1); // Previous
    expect(afterPrevious).toEqual(beforeNext);
  });

  it("Restart (stepIndex -1) always reconstructs the same blank state, regardless of how far Play/Next had advanced", () => {
    computeCanvasStateAtStep(ACTIONS, 3);
    const restarted = computeCanvasStateAtStep(ACTIONS, -1);
    expect(restarted.size).toBe(0);
  });
});
