// tests/whiteboard/professorVisualRichness.test.ts
// Stabilization item 6 — Whiteboard visual richness, originally measure-
// only. L12 (Whiteboard visual-execution correction) made the richness-ratio
// and empty-container checks below enforce unconditionally in every
// environment — they used to be gated behind PROFESSOR_AGENT_STRICT (default
// false, never set true anywhere in the repo), so they were computed but
// never actually rejected a live production response.
//
// components/whiteboard/TldrawCanvas.tsx's ensureRuntimeAgentVisualStep
// tracks, per agent run: totalActions, trivialActions, freehandCount (in
// addition to the existing executeActions/correctionActions/cameraCommands/
// nontrivialVisualCount/actualTldrawShapeDelta/fallbackReason), and a
// calculated visualRichnessRatio = nontrivialVisualCount / totalActions.
// This file:
//   1. Proves the metrics are actually wired (source-inspection — no
//      jsdom/tldraw-editor harness in this repo for a real render).
//   2. REPORTS, with real behavioral fixtures against the actual exported
//      isNontrivialProfessorAgentAction predicate, whether the CURRENT
//      pass-0 acceptance gate (`nontrivialVisualCount === 0` -> reject)
//      would still accept a response dominated by generic boxes as long as
//      exactly one real primitive is mixed in — the specific weakness the
//      task asked to check for before proposing any threshold.

import fs from "fs";
import path from "path";
import { isNontrivialProfessorAgentAction } from "../../lib/whiteboard/professorTldrawAgent";
import type { ProfessorTeachingAction } from "../../lib/whiteboard/professorLessonPlan";

const CANVAS_FILE = path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx");

// ── Part 1: wiring guards ───────────────────────────────────────────────────

describe("TldrawCanvas.tsx — visual richness instrumentation is wired (stabilization item 6)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: ProfessorAgentDiagnostic carries totalActions, trivialActions, freehandCount, and visualRichnessRatio", () => {
    const idx = src.indexOf("interface ProfessorAgentDiagnostic {");
    const block = src.slice(idx, src.indexOf("}", idx + 200));
    expect(block).toMatch(/totalActions: number; trivialActions: number; freehandCount: number;/);
    expect(block).toMatch(/visualRichnessRatio: number;/);
  });

  it("REQUIRED: totalActions/trivialActions/freehandCount accumulate every pass, not just pass 0", () => {
    const idx = src.indexOf("totalActions += verified.actions.length;");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/trivialActions \+= verified\.actions\.filter\(action => !isNontrivialProfessorAgentAction\(action\)\)\.length;/);
    expect(block).toMatch(/freehandCount \+= verified\.actions\.filter\(action => action\.type === "draw-freehand"\)\.length;/);
  });

  it("REQUIRED: visualRichnessRatio is computed as nontrivialVisualCount / totalActions, guarded against divide-by-zero, in BOTH the success and fallback diagnostic updates", () => {
    const occurrences = (src.match(/visualRichnessRatio: totalActions > 0 \? nontrivialVisualCount \/ totalActions : 0,/g) ?? []).length;
    expect(occurrences).toBe(2);
  });

  // R2 — the richness ratio is enforced, closing exactly the gap this
  // file's Part 2 fixtures below documented ("9 boxes + 1 arrow" used to
  // pass at a ratio of 0.10).
  //
  // L12 (Whiteboard visual-execution correction) — this and empty_containers
  // used to be gated behind PROFESSOR_AGENT_STRICT (default false, never set
  // true anywhere in the repo), so neither ever actually rejected a live
  // production response — WD3's density diagnostic was computed every pass
  // but never acted on. Both now run unconditionally in every environment;
  // PROFESSOR_AGENT_STRICT continues to control only whether a rejection
  // stops playback outright (dev/test) or degrades to the deterministic
  // fallback layout (production) — see resolveProfessorAgentFailure.
  it("REQUIRED (R2): a new low_visual_richness rejection site exists, unconditional (not STRICT-gated), applied only after the zero-nontrivial case is already ruled out", () => {
    // Correction (Whiteboard density) added a 6th site: empty_containers,
    // same unconditional gating, right alongside this one. L17 added a 7th:
    // label_dependent_only — see the dedicated describe blocks below.
    const rejectionSites = (src.match(/throw new ProfessorAgentRequestError\(/g) ?? []).length;
    expect(rejectionSites).toBe(7); // the pre-existing 4, this one, empty_containers, and label_dependent_only
    expect(src).toMatch(/throw new ProfessorAgentRequestError\("low_visual_richness"\);/);
    const idx = src.indexOf('throw new ProfessorAgentRequestError("no_visual_actions");');
    const block = src.slice(idx, idx + 600);
    expect(block).toMatch(/if \(passIndex === 0\) \{/);
  });

  it("REQUIRED (R2): the richness floor matches this file's own original proposal — ratio >= 0.3 OR nontrivialVisualCount >= 3, whichever is looser", () => {
    expect(src).toMatch(/const VISUAL_RICHNESS_RATIO_FLOOR = 0\.3;/);
    expect(src).toMatch(/const VISUAL_RICHNESS_COUNT_FLOOR = 3;/);
    expect(src).toMatch(
      /richnessRatio >= VISUAL_RICHNESS_RATIO_FLOOR \|\| nontrivialVisualCount >= VISUAL_RICHNESS_COUNT_FLOOR/,
    );
  });

  it("REQUIRED (L12): the richness/empty-container block is reachable regardless of PROFESSOR_AGENT_STRICT — no 'PROFESSOR_AGENT_STRICT &&' guard remains on it", () => {
    const idx = src.indexOf("if (passIndex === 0) {");
    expect(idx).toBeGreaterThan(-1);
    expect(src).not.toMatch(/if \(PROFESSOR_AGENT_STRICT && passIndex === 0\)/);
  });

  it("the DEV debug strip surfaces the new metrics for a developer inspecting a real run", () => {
    const idx = src.indexOf('data-testid="professor-agent-debug-strip"');
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/total=\{agentDiagnostic\.totalActions\} trivial=\{agentDiagnostic\.trivialActions\} freehand=\{agentDiagnostic\.freehandCount\} richness=\{agentDiagnostic\.visualRichnessRatio\.toFixed\(2\)\}/);
  });
});

// ── Part 2: diverse fixtures — does the CURRENT gate accept a low-richness response? ──

function box(id: string, visualRole?: string): ProfessorTeachingAction {
  return { type: "draw-shape", actionId: `draw-${id}`, shapeId: `shape:${id}`, targetId: `source-${id}`, shape: "box", bounds: { x: 0, y: 0, w: 80, h: 40 }, durationMs: 1, stepId: 1, ...(visualRole ? { visualRole } : {}) };
}
function label(id: string): ProfessorTeachingAction {
  return { type: "write", actionId: `write-${id}`, shapeId: `shape:${id}`, targetId: `source-${id}`, text: `Label ${id}`, x: 0, y: 0, durationMs: 1, stepId: 1 };
}
function arrow(id: string): ProfessorTeachingAction {
  return { type: "draw-arrow", actionId: `arrow-${id}`, shapeId: `shape:${id}`, targetId: `source-${id}`, from: { x: 0, y: 0 }, to: { x: 10, y: 10 }, durationMs: 1, stepId: 1 };
}
function freehand(id: string): ProfessorTeachingAction {
  return { type: "draw-freehand", actionId: `fh-${id}`, shapeId: `shape:${id}`, targetId: `source-${id}`, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], durationMs: 1, stepId: 1 };
}

/** Mirrors the exact formula in TldrawCanvas.tsx's ensureRuntimeAgentVisualStep. */
function richness(actions: ProfessorTeachingAction[]): { total: number; nontrivial: number; ratio: number; passesCurrentGate: boolean } {
  const total = actions.length;
  const nontrivial = actions.filter(isNontrivialProfessorAgentAction).length;
  return {
    total,
    nontrivial,
    ratio: total > 0 ? nontrivial / total : 0,
    // The CURRENT production gate (TldrawCanvas.tsx): only pass-0 with ZERO
    // nontrivial actions is rejected. Anything >= 1 passes, regardless of ratio.
    passesCurrentGate: nontrivial > 0,
  };
}

describe("Visual richness — diverse fixtures reporting the current acceptance rule's actual behavior", () => {
  it("REPORT: 9 generic boxes + 1 real arrow — the CURRENT gate ACCEPTS this (nontrivial=1 > 0), despite a richness ratio of only 0.10", () => {
    const actions = [...Array.from({ length: 9 }, (_, i) => box(String(i))), arrow("hero")];
    const r = richness(actions);
    expect(r.passesCurrentGate).toBe(true);
    expect(r.nontrivial).toBe(1);
    expect(r.ratio).toBeCloseTo(0.1, 5);
    // CONFIRMED WEAKNESS: exactly the scenario the task asked to check for.
    // The binary floor (>=1 nontrivial action) does not distinguish this
    // from a genuinely rich 10-action response — visualRichnessRatio is the
    // only place that distinction is now visible, and nothing acts on it yet.
  });

  it("REPORT: 4 boxes + 4 labels (8 total, all trivial, zero arrows/freehand) — the CURRENT gate REJECTS this correctly (nontrivial=0)", () => {
    const actions = [...Array.from({ length: 4 }, (_, i) => box(String(i))), ...Array.from({ length: 4 }, (_, i) => label(String(i)))];
    const r = richness(actions);
    expect(r.passesCurrentGate).toBe(false);
    expect(r.ratio).toBe(0);
  });

  it("REPORT: a genuinely rich response (freehand sketch + arrow + a few labels) scores a high ratio and passes", () => {
    const actions = [freehand("sketch"), arrow("flow"), label("a"), label("b")];
    const r = richness(actions);
    expect(r.passesCurrentGate).toBe(true);
    expect(r.ratio).toBeCloseTo(0.5, 5); // 2 nontrivial (freehand, arrow) / 4 total
  });

  it("REPORT: a pressureZone/highlightRegion/callout-role box counts as nontrivial even though shape === 'box' — one such box mixed with many plain boxes also passes the current gate at a low ratio", () => {
    const actions = [...Array.from({ length: 6 }, (_, i) => box(String(i))), box("zone", "drawPressureZone")];
    const r = richness(actions);
    expect(r.passesCurrentGate).toBe(true);
    expect(r.ratio).toBeCloseTo(1 / 7, 5);
  });

  it("REPORT: a large all-boxes response (12 generic boxes, 0 arrows/freehand/roled boxes) is correctly rejected regardless of volume", () => {
    const actions = Array.from({ length: 12 }, (_, i) => box(String(i)));
    const r = richness(actions);
    expect(r.passesCurrentGate).toBe(false);
    expect(r.ratio).toBe(0);
  });
});

// ── Part 3 (R2): the proposal above is now implemented, strict-mode-only ────
//
// TldrawCanvas.tsx's ensureRuntimeAgentVisualStep now applies exactly this
// file's own original proposal — visualRichnessRatio >= 0.3 OR
// nontrivialVisualCount >= 3, whichever is looser — as a SEPARATE check
// alongside the pre-existing nontrivialVisualCount === 0 check, gated
// behind PROFESSOR_AGENT_STRICT (the same rollout flag this file's Part 1
// wiring guards already reference). Non-strict/production behavior is
// unchanged: only the original binary floor applies there. These fixtures
// mirror the SAME formula (not re-derived) so a change to the real
// constants in TldrawCanvas.tsx is caught here too.

/** Mirrors the R2 strict-mode gate in TldrawCanvas.tsx exactly — same
 *  constants, same OR condition. richnessStrict !== passesCurrentGate for
 *  a response that clears the binary floor but stays low-ratio (the
 *  documented weakness above) — that's the point of this second gate. */
function richnessStrict(actions: ProfessorTeachingAction[]): boolean {
  const total = actions.length;
  const nontrivial = actions.filter(isNontrivialProfessorAgentAction).length;
  const ratio = total > 0 ? nontrivial / total : 0;
  return ratio >= 0.3 || nontrivial >= 3;
}

describe("Visual richness — the R2 strict-mode gate correctly rejects what the binary floor let through", () => {
  it("REQUIRED: 9 generic boxes + 1 real arrow — passes the binary floor but FAILS the strict richness gate (ratio 0.10 < 0.3, nontrivial 1 < 3)", () => {
    const actions = [...Array.from({ length: 9 }, (_, i) => box(String(i))), arrow("hero")];
    expect(richness(actions).passesCurrentGate).toBe(true); // unchanged production behavior
    expect(richnessStrict(actions)).toBe(false); // R2: strict mode now rejects this
  });

  it("REQUIRED: a genuinely rich response (freehand + arrow + 2 labels) passes both gates", () => {
    const actions = [freehand("sketch"), arrow("flow"), label("a"), label("b")];
    expect(richness(actions).passesCurrentGate).toBe(true);
    expect(richnessStrict(actions)).toBe(true); // ratio 0.5 >= 0.3
  });

  it("REQUIRED: 3+ nontrivial actions pass the strict gate via the count floor even at a low ratio", () => {
    const actions = [
      ...Array.from({ length: 10 }, (_, i) => box(String(i))),
      arrow("a"), arrow("b"), arrow("c"),
    ];
    expect(richnessStrict(actions)).toBe(true); // nontrivial=3 >= VISUAL_RICHNESS_COUNT_FLOOR, ratio ~0.23 < 0.3
  });

  it("all-boxes response fails both gates identically — the strict gate never accepts what the binary floor already correctly rejects", () => {
    const actions = Array.from({ length: 12 }, (_, i) => box(String(i)));
    expect(richness(actions).passesCurrentGate).toBe(false);
    expect(richnessStrict(actions)).toBe(false);
  });
});

// ── Correction (Whiteboard density): "if it creates five shapes and three
//    of them are empty containers, the step should be rejected and
//    replanned" — a NEW, separate gate from the richness ratio above. The
//    richness gate can still pass a response full of unlabeled
//    ellipses/diamonds/hexagons/clouds, since isNontrivialProfessorAgentAction
//    treats any non-"box" shape as automatically nontrivial (see
//    professorTldrawAgent.test.ts's computeVisualDensityDiagnostic suite for
//    behavioral coverage of the density math itself — this is wiring-only,
//    same source-inspection convention as Part 1 above).
describe("TldrawCanvas.tsx — empty-container rejection (Whiteboard density correction)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: computeVisualDensityDiagnostic is imported and computed once per pass", () => {
    expect(src).toMatch(/computeVisualDensityDiagnostic,/);
    expect(src).toMatch(/density = computeVisualDensityDiagnostic\(verified\.actions, request\.step\.focusBounds\);/);
  });

  it("REQUIRED: ProfessorAgentDiagnostic carries the density diagnostic, populated in both the success and fallback updates", () => {
    const idx = src.indexOf("interface ProfessorAgentDiagnostic {");
    const block = src.slice(idx, src.indexOf("}", idx + 200));
    expect(block).toMatch(/density: VisualDensityDiagnostic;/);
    const occurrences = (src.match(/\n\s*density,\n/g) ?? []).length;
    expect(occurrences).toBe(2);
  });

  it("REQUIRED: the rejection floor matches the correction's own named example — count >= 3 AND ratio >= 0.5 (5 shapes, 3 empty = 60%)", () => {
    expect(src).toMatch(/const EMPTY_CONTAINER_COUNT_FLOOR = 3;/);
    expect(src).toMatch(/const EMPTY_CONTAINER_RATIO_CEILING = 0\.5;/);
    expect(src).toMatch(
      /density\.emptyContainerCount >= EMPTY_CONTAINER_COUNT_FLOOR\s*\n\s*&& density\.totalShapeCount > 0\s*\n\s*&& density\.emptyContainerCount \/ density\.totalShapeCount >= EMPTY_CONTAINER_RATIO_CEILING/,
    );
    expect(src).toMatch(/throw new ProfessorAgentRequestError\("empty_containers"\);/);
  });

  it("REQUIRED (L12): runs unconditionally, alongside (not instead of) the richness-floor check — both live in the same unconditional block, no PROFESSOR_AGENT_STRICT guard", () => {
    const idx = src.indexOf('throw new ProfessorAgentRequestError("low_visual_richness");');
    const block = src.slice(idx, idx + 1300);
    expect(block).toMatch(/tooManyEmptyContainers/);
    expect(block).toMatch(/throw new ProfessorAgentRequestError\("empty_containers"\);/);
    // Both checks live inside the SAME `if (passIndex === 0)` block opened above them.
    const gateIdx = src.indexOf("if (passIndex === 0) {");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(idx);
  });

  it("REQUIRED: empty_containers is a real ProfessorAgentFailureReason value", () => {
    const libSrc = fs.readFileSync(path.resolve(__dirname, "../../lib/whiteboard/professorTldrawAgent.ts"), "utf8");
    expect(libSrc).toMatch(/"empty_containers"/);
  });
});

// L17 — operationalizes Brian's own acceptance test: "if removing the text
// labels makes the Whiteboard meaningless, it isn't sufficiently visual."
// A DIFFERENT gate from empty-container rejection above: the failure mode
// this catches is "Reactants -> Products" (two LABELED generic boxes joined
// by one arrow) — every box has a label so emptyContainerCount is 0 and the
// step clears that check entirely, yet the illustration still conveys
// nothing once the labels are stripped. See professorTldrawAgent.test.ts's
// computeVisualDensityDiagnostic suite for behavioral coverage of the
// label-dependent/label-independent math itself — this is wiring-only.
describe("TldrawCanvas.tsx — label-dependent-only rejection (L17 acceptance-test enforcement)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: the floor/ceiling constants exist with the documented reasoning", () => {
    expect(src).toMatch(/const LABEL_DEPENDENT_COUNT_FLOOR = 2;/);
    expect(src).toMatch(/const LABEL_INDEPENDENT_RATIO_FLOOR = 0\.4;/);
  });

  it("REQUIRED: the reject condition requires the count floor AND the ratio floor, mirroring the empty-container check's own dual-condition shape", () => {
    expect(src).toMatch(
      /density\.labelDependentShapeCount >= LABEL_DEPENDENT_COUNT_FLOOR\s*\n\s*&& \(density\.labelDependentShapeCount \+ density\.labelIndependentMeaningfulCount\) > 0\s*\n\s*&& \(density\.labelIndependentMeaningfulCount \/ \(density\.labelDependentShapeCount \+ density\.labelIndependentMeaningfulCount\)\) < LABEL_INDEPENDENT_RATIO_FLOOR/,
    );
    expect(src).toMatch(/throw new ProfessorAgentRequestError\("label_dependent_only"\);/);
  });

  it("REQUIRED: runs unconditionally alongside empty_containers/low_visual_richness, in the same unconditional block, no PROFESSOR_AGENT_STRICT guard", () => {
    const idx = src.indexOf('throw new ProfessorAgentRequestError("label_dependent_only");');
    expect(idx).toBeGreaterThan(-1);
    const emptyContainersIdx = src.indexOf('throw new ProfessorAgentRequestError("empty_containers");');
    expect(emptyContainersIdx).toBeGreaterThan(-1);
    expect(emptyContainersIdx).toBeLessThan(idx);
    const gateIdx = src.indexOf("if (passIndex === 0) {");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(emptyContainersIdx);
    expect(src.slice(gateIdx, idx)).not.toMatch(/PROFESSOR_AGENT_STRICT/);
  });

  it("REQUIRED: label_dependent_only is a real ProfessorAgentFailureReason value", () => {
    const libSrc = fs.readFileSync(path.resolve(__dirname, "../../lib/whiteboard/professorTldrawAgent.ts"), "utf8");
    expect(libSrc).toMatch(/"label_dependent_only"/);
  });
});
