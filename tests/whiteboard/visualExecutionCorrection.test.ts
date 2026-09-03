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

  it("REQUIRED: names drawPressureZone/highlightRegion as the only shapes allowed to stay unlabeled — matching computeVisualDensityDiagnostic's own DELIBERATELY_UNLABELED_ROLES set exactly", () => {
    expect(AGENT_PROMPT_SRC).toMatch(/The only shapes allowed to stay unlabeled are drawPressureZone and highlightRegion/);
    const densitySrc = fs.readFileSync(path.resolve(__dirname, "../../lib/whiteboard/professorTldrawAgent.ts"), "utf8");
    expect(densitySrc).toMatch(/new Set\(\["drawPressureZone", "highlightRegion"\]\)/);
  });
});
