// tests/whiteboard/professorVisualRichness.test.ts
// Stabilization item 6 — Whiteboard visual richness: measure first, don't
// enforce yet.
//
// components/whiteboard/TldrawCanvas.tsx's ensureRuntimeAgentVisualStep now
// tracks, per agent run: totalActions, trivialActions, freehandCount (in
// addition to the existing executeActions/correctionActions/cameraCommands/
// nontrivialVisualCount/actualTldrawShapeDelta/fallbackReason), and a
// calculated visualRichnessRatio = nontrivialVisualCount / totalActions.
// These are pure instrumentation — nothing in production reads them to
// reject a response. This file:
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

  it("does NOT use these new metrics to reject/gate a response — only the pre-existing nontrivialVisualCount === 0 check still throws no_visual_actions", () => {
    const rejectionSites = (src.match(/throw new ProfessorAgentRequestError\(/g) ?? []).length;
    // Same count as before this stabilization item — no new throw site was added.
    expect(rejectionSites).toBe(4);
    expect(src).not.toMatch(/visualRichnessRatio\s*[<>]=?\s*0\.\d/); // no threshold comparison anywhere
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

// ── Part 3: the proposal — NOT enforced, written here as documentation only ──
//
// PROPOSED (not implemented): if live production data — once API keys are
// available and this instrumentation has actually observed real Claude
// responses — confirms the deployed agent is settling for the pass-0
// "exactly one nontrivial action among many boxes" floor rather than
// genuinely rich output, the smallest next step would be a SEPARATE ratio
// floor (e.g. visualRichnessRatio >= 0.3 OR nontrivialVisualCount >= 3,
// whichever is looser) applied ONLY alongside the existing
// nontrivialVisualCount === 0 check, in development/strict mode first (same
// rollout pattern PROFESSOR_AGENT_STRICT already uses) before ever touching
// the production fallback path. That threshold number is a proposal for
// review against real telemetry, not a value derived from these synthetic
// fixtures — do not promote it into ensureRuntimeAgentVisualStep without
// live data behind it.
