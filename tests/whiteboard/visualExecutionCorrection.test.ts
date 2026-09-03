// tests/whiteboard/visualExecutionCorrection.test.ts
// L12 — Whiteboard visual-execution correction. Brian's live report (with
// screenshots): "mostly empty containers with very little actual drawing,"
// and Professor "should not feel like a separate primary mode the student
// is thrown into."
//
// This repo's own audit (via a read-only Explore pass over
// components/whiteboard/TldrawCanvas.tsx, lib/whiteboard/professorTldrawAgent.ts,
// pages/api/professor-lesson-plan.ts, pages/api/professor-tldraw-agent.ts)
// found: WD3's density diagnostic (meaningfulPrimitiveCount/emptyContainer-
// Count/etc.) was computed every pass but its reject-and-replan checks were
// gated behind PROFESSOR_AGENT_STRICT — an env flag that defaults false and
// is never set true anywhere in this repo — so they never actually rejected
// a live production response. The Director's visualNeeded prompt rule was
// also worded broadly enough ("mechanisms, procedures, spatial relation-
// ships, comparisons... often benefit from a visual") that it likely
// defaulted to true for most substantive teaching content, undermining the
// Reader-primary intent even though the visualNeeded plumbing itself worked.
//
// No jsdom/render harness for these files in this repo — source inspection,
// matching tests/whiteboard/professorVisualRichness.test.ts's own pattern.

import fs from "fs";
import path from "path";

const CANVAS_SRC = fs.readFileSync(path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx"), "utf8");
const DIRECTOR_SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/api/professor-lesson-plan.ts"), "utf8");
const AGENT_PROMPT_SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/api/professor-tldraw-agent.ts"), "utf8");

describe("TldrawCanvas.tsx — empty-container/richness rejection is unconditional, not STRICT-only (L12)", () => {
  it("REQUIRED: no 'PROFESSOR_AGENT_STRICT &&' guard remains anywhere in the file", () => {
    expect(CANVAS_SRC).not.toMatch(/PROFESSOR_AGENT_STRICT\s*&&/);
  });

  it("REQUIRED: the pass-0 richness/empty-container block is gated only on passIndex === 0", () => {
    expect(CANVAS_SRC).toMatch(/if \(passIndex === 0\) \{\s*\n\s*const richnessRatio/);
  });

  it("REQUIRED: PROFESSOR_AGENT_STRICT is still read and still passed to resolveProfessorAgentFailure — it now controls only stop-vs-fallback behavior, not reachability of the checks", () => {
    expect(CANVAS_SRC).toMatch(/const PROFESSOR_AGENT_STRICT = process\.env\.NEXT_PUBLIC_PROFESSOR_AGENT_STRICT === "true";/);
    expect(CANVAS_SRC).toMatch(/resolveProfessorAgentFailure\(PROFESSOR_AGENT_STRICT, fallbackReason\)/);
  });

  it("a rejection here does not throw out of ensureRuntimeAgentVisualStep in production — it's caught, and playback continues on the deterministic fallback layout", () => {
    // resolveProfessorAgentFailure(strict=false, reason) => shouldStopPlayback: false,
    // so the catch block's `if (failure.shouldStopPlayback) { ...; throw error; }`
    // is skipped in production, and the function falls through to its own
    // documented "existing deterministic layout; Professor playback never stalls" comment.
    const densitySrc = fs.readFileSync(path.resolve(__dirname, "../../lib/whiteboard/professorTldrawAgent.ts"), "utf8");
    expect(densitySrc).toMatch(/shouldStopPlayback: strict/);
    expect(CANVAS_SRC).toMatch(/if \(failure\.shouldStopPlayback\) \{/);
    expect(CANVAS_SRC).toMatch(/existing deterministic layout; Professor playback never stalls/);
  });
});

describe("pages/api/professor-lesson-plan.ts — visualNeeded defaults to false, Reader-primary (L12)", () => {
  it("REQUIRED: rule 20's visualNeeded guidance explicitly defaults to false", () => {
    expect(DIRECTOR_SRC).toMatch(/visualNeeded: default to false\./);
  });

  it("REQUIRED: states the Whiteboard is an occasional tool, not Professor's default destination", () => {
    expect(DIRECTOR_SRC).toMatch(/the Whiteboard is a tool Professor reaches\s*\n\s*for occasionally, not its default destination/);
  });

  it("REQUIRED: the old, broader 'often benefit from a visual' framing that made most content default to true is gone", () => {
    expect(DIRECTOR_SRC).not.toMatch(/true only when a progressive visual materially helps/);
    expect(DIRECTOR_SRC).not.toMatch(/often\s*\n\s*benefit from a visual\. Do not force every paragraph onto the Whiteboard\./);
  });

  it("REQUIRED: instructs judging the step, not the topic category, to avoid a mechanism/comparison TOPIC defaulting true regardless of whether THIS step needs drawing", () => {
    expect(DIRECTOR_SRC).toMatch(/judge whether THIS step needs drawing,\s*\n\s*not whether its topic belongs to a category that sometimes does\./);
  });
});

describe("pages/api/professor-tldraw-agent.ts — the runtime agent is told the exact empty-container contract (L12)", () => {
  it("REQUIRED: states unlabeled drawSymbol shapes are empty containers and get rejected", () => {
    expect(AGENT_PROMPT_SRC).toMatch(/EMPTY CONTAINERS ARE REJECTED\./);
    expect(AGENT_PROMPT_SRC).toMatch(/is an empty container/);
  });

  it("REQUIRED: names the exact fix — attach a writeLabel via attachToLocalId, or use drawCallout instead", () => {
    expect(AGENT_PROMPT_SRC).toMatch(/attach a writeLabel to every drawSymbol shape you create in the SAME pass, or use drawCallout/);
  });

  it("REQUIRED: names drawPressureZone/highlightRegion/circleFeature as the only shapes allowed to stay unlabeled — matching computeVisualDensityDiagnostic's own DELIBERATELY_UNLABELED_ROLES set for the tools this prompt currently exposes to the agent", () => {
    expect(AGENT_PROMPT_SRC).toMatch(/The only shapes allowed to stay unlabeled are drawPressureZone, highlightRegion, and circleFeature/);
    const densitySrc = fs.readFileSync(path.resolve(__dirname, "../../lib/whiteboard/professorTldrawAgent.ts"), "utf8");
    // L15 added "circleFeature" to this same DELIBERATELY_UNLABELED_ROLES
    // set; L16 (this phase) is what actually tells the agent circleFeature
    // exists and wires it into this exact sentence, so prompt and set now
    // match precisely instead of the prompt lagging behind the schema.
    expect(densitySrc).toMatch(/"drawPressureZone", "highlightRegion", "circleFeature"/);
  });
});

// L16 — wires L15's composable primitives (schema + verifier plumbing only,
// no prompt changes) into the runtime agent's own prompt and the Director's
// visualIntent guidance, so the AI actually starts using drawCrossSection/
// shadeRegion/circleFeature/crossOutMisconception. Generic guidance toward
// progressive, mechanism-revealing compositions (Brian's chemistry-ion and
// denture-cross-section examples), not a hardcoded template.
describe("pages/api/professor-tldraw-agent.ts — L16: composable primitives wired into the runtime agent's own prompt", () => {
  it("REQUIRED: all 4 new tools are named in the tool list with real teaching guidance, not just added to a JSON form", () => {
    expect(AGENT_PROMPT_SRC).toMatch(/- drawCrossSection: a closed contour cutaway/);
    expect(AGENT_PROMPT_SRC).toMatch(/- shadeRegion: a closed, filled area/);
    expect(AGENT_PROMPT_SRC).toMatch(/- circleFeature: a hand-drawn ring around content ALREADY on the canvas/);
    expect(AGENT_PROMPT_SRC).toMatch(/- crossOutMisconception: strike an X through a wrong-answer or misconception region/);
  });

  it("REQUIRED: drawFlowArrow guidance now distinguishes a causal/process arrow from a force/directional one — the composable substitute for separate drawForceArrow/drawProcessArrow tools", () => {
    expect(AGENT_PROMPT_SRC).toMatch(/drawFlowArrow: causal, procedural, comparison, or force\/directional relation/);
    expect(AGENT_PROMPT_SRC).toMatch(/vary color and\s*\n\s*weight to distinguish a causal\/process step from a physical force or pressure direction/);
  });

  it("REQUIRED: all 4 new tools appear in the tool-call JSON forms with correct shapes — freehand-based (drawCrossSection/shadeRegion) join the existing stroke union, circleFeature/crossOutMisconception get bounds-based forms", () => {
    expect(AGENT_PROMPT_SRC).toMatch(/"tool":"drawFreehandStroke\|drawAnatomySketch\|drawMuscle\|drawBone\|drawNerve\|drawHatching\|drawBrace\|drawBracket\|drawCrossSection\|shadeRegion"/);
    expect(AGENT_PROMPT_SRC).toMatch(/"tool":"circleFeature","localId":"\.\.\.","sourceTargetId":null,"bounds":/);
    expect(AGENT_PROMPT_SRC).toMatch(/"tool":"crossOutMisconception","localId":"\.\.\.","sourceTargetId":null,"bounds":/);
  });

  it("REQUIRED: gives a generic (not hardcoded) progressive-staging pattern with illustrative, non-mandatory examples — 'illustrations of the PATTERN, not a template to force onto every page'", () => {
    expect(AGENT_PROMPT_SRC).toMatch(/Build understanding in stages across a step's own action sequence/);
    expect(AGENT_PROMPT_SRC).toMatch(/illustrations of the\s*\n\s*PATTERN, not a template to force onto every page — infer the actual stages from this step's own\s*\n\s*teachingGoal and narration\./);
  });

  it("does not accidentally break drawSymbol's own bare-shape empty-container framing — the new tools sit alongside it, not replacing it", () => {
    expect(AGENT_PROMPT_SRC).toMatch(/drawSymbol shape \(rectangle\/ellipse\/diamond\/hexagon\/cloud\/line\) with no writeLabel ever attached/);
  });
});

describe("pages/api/professor-lesson-plan.ts — L16: Director's visualIntent guidance mentions the new primitives", () => {
  it("REQUIRED: rule 20's visualIntent bullet lists cross-sections/cutaways, shaded fills, circled features, and struck-through misconceptions alongside the existing primitives", () => {
    expect(DIRECTOR_SRC).toMatch(/cross-sections\/cutaways, shaded fills,/);
    expect(DIRECTOR_SRC).toMatch(/circled features, arrows, numbered sequences, braces,\s*\n\s*handwritten callouts, or a struck-through misconception/);
  });

  it("REQUIRED: rule 22 lists the same expanded primitive set and gives non-templated examples using them", () => {
    expect(DIRECTOR_SRC).toMatch(/cross-sections\/cutaways, shaded fills, spatial symbols, circled features, causal\/force\//);
    expect(DIRECTOR_SRC).toMatch(/a mechanism can reveal a causal or force\s*\n\s*arrow plus a shaded region showing what's actually moving or changing/);
    expect(DIRECTOR_SRC).toMatch(/a comparison can\s*\n\s*juxtapose two labeled sketches divided by a brace/);
  });

  it("REQUIRED (Brian's acceptance criterion, generically encoded ahead of L17's enforcement): the drawing's own shapes/arrows must carry real teaching meaning, not rely only on labels", () => {
    expect(DIRECTOR_SRC).toMatch(/Build the drawing so its own shapes and arrows carry real teaching meaning/);
    expect(DIRECTOR_SRC).toMatch(/Labels\s*\n\s*confirm what's drawn; they should not be the only thing making it mean anything\./);
  });

  it("still frames these as examples, not subject templates — the composable-primitives philosophy applies to the Director's own guidance too", () => {
    expect(DIRECTOR_SRC).toMatch(/These are examples, not subject templates\. Infer the composition from the current\s*\n\s*page's semantic structure/);
  });
});
