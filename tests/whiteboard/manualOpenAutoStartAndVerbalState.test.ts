// tests/whiteboard/manualOpenAutoStartAndVerbalState.test.ts
// P0 stabilization, Tier 2, items 1-3 — the "blank Whiteboard" root causes:
//
//   1. The manual "🎨 Whiteboard" button set autoStartProfessor=false, and
//      TldrawCanvas's auto-start effect was gated on that same flag — so a
//      manually-opened Whiteboard mounted a canvas with zero shapes and sat
//      there until the student noticed and pressed Play. Fix: auto-start
//      playback once a lesson plan is ready, regardless of which entry
//      point opened the panel (explicit Play/Pause is preserved for
//      pause/restart either way).
//   2. A valid lesson whose Director legitimately decided every step is
//      verbal-only (expository/definitional page — "don't force every
//      paragraph onto the Whiteboard") left the canvas blank for the whole
//      lesson with no indication this was intentional. Fix: an explicit
//      "teaching verbally, no diagram needed" message instead of silence.
//
// No jsdom/render harness for these files in this repo — source inspection,
// matching this repo's established pattern.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx"), "utf8");

describe("components/whiteboard/TldrawCanvas.tsx — manual Whiteboard open auto-starts a ready lesson (item 1)", () => {
  it("REQUIRED: the auto-start effect no longer gates on autoStartProfessor — only on canvasReady && lessonPlan", () => {
    const idx = SRC.indexOf("const autoStartedPlanRef = useRef<string | null>(null);");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/if \(!canvasReady \|\| !lessonPlan\) return;/);
    expect(block).not.toMatch(/if \(!autoStartProfessor \|\|/);
    // Effect dependency array must not gate re-triggering on autoStartProfessor either.
    expect(block).toMatch(/\}, \[canvasReady, lessonPlan\]\);/);
  });

  it("the explicit Play/Pause control is untouched — still present, still able to pause/restart regardless of how playback started", () => {
    expect(SRC).toContain('<button onClick={handlePlayPause} style={BTN_PRIMARY}>{isPlaying ? "⏸ Pause" : "▶ Play"}</button>');
  });
});

describe("components/whiteboard/TldrawCanvas.tsx — an all-verbal lesson shows an explicit state, not a silent blank canvas (item 2)", () => {
  it("REQUIRED: derives allStepsVerbalOnly from every directorStep having visualNeeded:false", () => {
    const idx = SRC.indexOf("const allStepsVerbalOnly =");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 300);
    expect(block).toMatch(/lessonPlan\?\.directorSteps\?\.length/);
    expect(block).toMatch(/lessonPlan\.directorSteps\.every\(\(step\) => !step\.visualNeeded\)/);
  });

  it("REQUIRED: renders the verbal-teaching message when allStepsVerbalOnly is true and the lesson is otherwise healthy", () => {
    const idx = SRC.indexOf("!licenseMissingInProduction && !canvasInitFailure && lessonPlan && allStepsVerbalOnly && (");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 700);
    expect(block).toContain("Professor is teaching this page verbally — no diagram is needed for this section.");
  });

  it("does not fabricate a diagram — no drawing/shape-creation call appears near the verbal-only message block", () => {
    const idx = SRC.indexOf("!licenseMissingInProduction && !canvasInitFailure && lessonPlan && allStepsVerbalOnly && (");
    const block = SRC.slice(idx, idx + 400);
    expect(block).not.toMatch(/createShape/);
  });
});

describe("Deterministic Whiteboard fallback (item 12) — unchanged, still the base rendering layer", () => {
  const BUILD_SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/whiteboard/buildProfessorTeachingActions.ts"), "utf8");

  it("directorSteps still carry drawInstructions computed synchronously from the Director script, no new AI dependency introduced by this pass", () => {
    expect(BUILD_SRC).toMatch(/drawInstructions/);
    expect(BUILD_SRC).toMatch(/visualNeeded/);
  });

  it("TldrawCanvas still applies plan.actions as the base layer regardless of the Claude visual agent's outcome", () => {
    expect(SRC).toMatch(/applyStateAtStep/);
    expect(SRC).toMatch(/editor\.createShape/);
  });
});
