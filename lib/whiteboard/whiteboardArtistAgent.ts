// lib/whiteboard/whiteboardArtistAgent.ts
// WA1 — the Whiteboard Artist Agent, formalized out of TldrawCanvas.tsx's
// inline runtime-visual-agent loop into its own narrow-mission module, per
// the specialized-agent architecture direction: this module's ONLY job is
// deciding what to draw and whether a response is good enough — it never
// touches the tldraw Editor directly, never owns playback/camera authority,
// and never persists anything. Two effectful operations (reading canvas
// state, rendering verified actions) are injected by the caller as plain
// async callbacks, so this module is testable with real function calls and
// fake dependencies instead of a live editor.
//
// The pure decision core it drives — buildProfessorTldrawAgentRequest,
// requestProfessorTldrawAgent, verifyProfessorTldrawAgentResponse,
// computeVisualDensityDiagnostic, resolveProfessorAgentFailure — already
// lived in professorTldrawAgent.ts and is unchanged; this module is the
// bounded observe/draw/inspect/correct orchestration loop that was missing
// from that pure core, previously inlined as TldrawCanvas.tsx's
// ensureRuntimeAgentVisualStep.
//
// What deliberately stays OUT of this module (the caller's job instead):
//   - WHEN/HOW each verified action actually paints (reveal timing) —
//     `renderActions` is injected so the caller's own timeline/reveal
//     scheduler owns pacing.
//   - Camera authority — this module never applies a move-camera action
//     itself; the caller's rendering pipeline decides whether to honor one.
//   - Playback pause/resume — a "fallback" result carries
//     `shouldStopPlayback` as data; the caller decides whether to act on it.

import {
  buildProfessorTldrawAgentRequest,
  requestProfessorTldrawAgent,
  verifyProfessorTldrawAgentResponse,
  isNontrivialProfessorAgentAction,
  computeVisualDensityDiagnostic,
  ProfessorAgentRequestError,
  resolveProfessorAgentFailure,
  type ProfessorAgentCanvasContext,
  type ProfessorAgentFailureReason,
  type VisualDensityDiagnostic,
} from "@/lib/whiteboard/professorTldrawAgent";
import { buildProfessorLessonCacheKey } from "@/lib/whiteboard/professorLessonPlan";
import type { ProfessorTeachingAction, ProfessorLessonPlan } from "@/lib/whiteboard/professorLessonPlan";

export const WHITEBOARD_ARTIST_MAX_PASSES = 3;
export const WHITEBOARD_ARTIST_STRICT = process.env.NEXT_PUBLIC_PROFESSOR_AGENT_STRICT === "true";

// L12 (Whiteboard visual-execution correction) — the richness-ratio and
// empty-container checks below used to be gated behind this STRICT flag
// (default false; nothing in this repo ever set it true), so WD3's density
// diagnostic was computed every pass but never actually rejected a live
// production response — the only check that ever ran in production was the
// much weaker nontrivialVisualCount === 0 floor below, which a response of
// "9 generic boxes + 1 real arrow" still satisfies at a richness ratio of
// just 0.10 (proven by tests/whiteboard/professorVisualRichness.test.ts).
// Both checks now run unconditionally in every environment. WHITEBOARD_
// ARTIST_STRICT still controls only resolveProfessorAgentFailure's
// shouldStopPlayback — a rejection here degrades to the deterministic M7
// layout (which always self-labels every shape) in production, and stops
// playback outright only in strict dev/test mode.
export const VISUAL_RICHNESS_RATIO_FLOOR = 0.3;
export const VISUAL_RICHNESS_COUNT_FLOOR = 3;
// Correction (Whiteboard density) — "if it creates five shapes and three of
// them are empty containers, the step should be rejected and replanned."
// Both conditions must hold: an absolute floor (a single stray empty shape
// among many real ones isn't a systemic problem) AND a ratio ceiling (empty
// containers must be at least HALF of what got drawn, not just present).
export const EMPTY_CONTAINER_COUNT_FLOOR = 3;
export const EMPTY_CONTAINER_RATIO_CEILING = 0.5;
// L17 — the correction's own acceptance test: "if removing the text labels
// makes the Whiteboard meaningless, it isn't sufficiently visual." A step
// full of LABELED generic boxes (the "Reactants -> Products" failure mode)
// already clears the empty-container check above — each box IS labeled,
// so none of them are "empty" — but still fails this test once the labels
// are stripped. Only enforced once there's enough label-dependent content
// to judge (a single simple labeled shape isn't a violation on its own),
// mirroring EMPTY_CONTAINER_COUNT_FLOOR's own reasoning; the ratio floor is
// a minimum proportion, not a maximum, so it's a floor rather than a ceiling.
export const LABEL_DEPENDENT_COUNT_FLOOR = 2;
export const LABEL_INDEPENDENT_RATIO_FLOOR = 0.4;

export const EMPTY_DENSITY_DIAGNOSTIC: VisualDensityDiagnostic = {
  meaningfulPrimitiveCount: 0, emptyContainerCount: 0, totalShapeCount: 0,
  usedCanvasBounds: null, activeTeachingBounds: null, canvasUtilizationRatio: 0,
  labelDependentShapeCount: 0, labelIndependentMeaningfulCount: 0,
};

export interface WhiteboardArtistDiagnostic {
  eligible: boolean; agentTriggered: boolean; currentPass: number;
  executeActions: number; correctionActions: number; cameraCommands: number;
  nontrivialVisualCount: number; fallbackUsed: boolean;
  fallbackReason: ProfessorAgentFailureReason | null; agentDurationMs: number;
  actualTldrawShapeDelta: number;
  /** Total verified actions across all passes, how many of those are
   *  trivial (isNontrivialProfessorAgentAction === false: plain boxes and
   *  labels), and how many are real freehand/sketch strokes.
   *  nontrivialVisualCount above is a NARROWER count (nontrivial actions
   *  that both verified AND actually rendered a tldraw shape) — totalActions/
   *  trivialActions here are the wider "what did the agent propose" picture. */
  totalActions: number; trivialActions: number; freehandCount: number;
  /** nontrivialVisualCount / totalActions (0 when totalActions is 0). */
  visualRichnessRatio: number;
  /** The last pass-0 response's own density diagnostic (see
   *  computeVisualDensityDiagnostic). Reflects whichever pass most recently
   *  ran, success or fallback. */
  density: VisualDensityDiagnostic;
}
export const EMPTY_WHITEBOARD_ARTIST_DIAGNOSTIC: WhiteboardArtistDiagnostic = {
  eligible: false, agentTriggered: false, currentPass: 0, executeActions: 0,
  correctionActions: 0, cameraCommands: 0, nontrivialVisualCount: 0,
  fallbackUsed: false, fallbackReason: null, agentDurationMs: 0,
  actualTldrawShapeDelta: 0,
  totalActions: 0, trivialActions: 0, freehandCount: 0, visualRichnessRatio: 0,
  density: EMPTY_DENSITY_DIAGNOSTIC,
};

export type WhiteboardArtistStatus = "idle" | "observing" | "drawing" | "inspecting" | "fallback";

export interface WhiteboardArtistRenderResult {
  shapeDelta: number;
  nontrivialRendered: number;
  resultingShapeIds: string[];
}

export interface WhiteboardArtistStepDeps {
  /** Capture the current canvas (screenshot + structured shapes) for the
   *  agent to read. The caller owns the live tldraw Editor — this module
   *  never touches it directly. */
  captureCanvas: () => Promise<ProfessorAgentCanvasContext>;
  /** Render a verified batch of actions. The caller owns HOW/WHEN each
   *  action actually paints (reveal timing, camera authority) — this module
   *  only decides WHAT to render and whether the result is acceptable.
   *  `shapeDelta` is the count of newly-created shape ids from this call
   *  (never negative — nothing is deleted mid-loop), accumulated by this
   *  module into the diagnostic's actualTldrawShapeDelta without ever
   *  reading the editor's shape count directly. */
  renderActions: (actions: ProfessorTeachingAction[]) => Promise<WhiteboardArtistRenderResult>;
  /** True once the underlying lesson plan has changed mid-flight — the
   *  caller owns lesson-swap lifecycle; this module has no way to observe
   *  it on its own. */
  isStale: () => boolean;
  /** True once the caller's own timeout has fired (and aborted `signal`) —
   *  needed to distinguish an explicit timeout from a manual abort when
   *  classifying the failure reason. */
  isTimedOut: () => boolean;
  /** Fired whenever the visible "what is the agent doing" status changes —
   *  the caller decides how (or whether) to surface it. */
  onStatus?: (status: WhiteboardArtistStatus) => void;
  /** Fired with the running diagnostic after every pass and on failure —
   *  the caller decides how (or whether) to surface it. */
  onDiagnostic?: (diagnostic: WhiteboardArtistDiagnostic) => void;
}

export interface WhiteboardArtistStepArgs {
  plan: ProfessorLessonPlan;
  stepId: number;
  /** localIds already claimed by prior passes/attempts for this step, so a
   *  correction pass doesn't propose the same id twice. */
  priorAgentLocalIds: string[];
  signal: AbortSignal;
}

export interface WhiteboardArtistStepResult {
  outcome: "success" | "fallback";
  /** All localIds verified across every pass this run — the caller persists
   *  this as the step's new dedup history. */
  localIds: string[];
  diagnostic: WhiteboardArtistDiagnostic;
  /** Present only when outcome is "fallback" — the caller decides what to
   *  do (production always keeps playing on the deterministic layout;
   *  shouldStopPlayback is strict/dev/test-only). */
  failure?: { reason: ProfessorAgentFailureReason; shouldStopPlayback: boolean };
}

/**
 * The Whiteboard Artist Agent's bounded observe -> draw -> inspect -> correct
 * loop for one teaching step. Every pass sees the freshly rendered canvas
 * state (via `deps.captureCanvas`, called again each iteration); a "fallback"
 * result means every pass was rejected or the request failed — the caller
 * decides whether that means "keep the deterministic layout and move on"
 * (production) or "stop playback" (`failure.shouldStopPlayback`, strict
 * dev/test only).
 */
export async function runWhiteboardArtistStep(
  args: WhiteboardArtistStepArgs,
  deps: WhiteboardArtistStepDeps,
): Promise<WhiteboardArtistStepResult> {
  const { plan, stepId, signal } = args;
  const startedAt = performance.now();
  let localIds = [...args.priorAgentLocalIds];
  let executeActions = 0;
  let correctionActions = 0;
  let cameraCommands = 0;
  let nontrivialVisualCount = 0;
  let totalActions = 0;
  let trivialActions = 0;
  let freehandCount = 0;
  let cumulativeShapeDelta = 0;
  let currentPass = 0;
  let density: VisualDensityDiagnostic = EMPTY_DENSITY_DIAGNOSTIC;
  deps.onDiagnostic?.({ ...EMPTY_WHITEBOARD_ARTIST_DIAGNOSTIC, eligible: true, agentTriggered: true });

  const snapshot = (): WhiteboardArtistDiagnostic => ({
    eligible: true, agentTriggered: true, currentPass, executeActions,
    correctionActions, cameraCommands, nontrivialVisualCount,
    fallbackUsed: false, fallbackReason: null,
    agentDurationMs: Math.round(performance.now() - startedAt),
    actualTldrawShapeDelta: cumulativeShapeDelta,
    totalActions, trivialActions, freehandCount,
    visualRichnessRatio: totalActions > 0 ? nontrivialVisualCount / totalActions : 0,
    density,
  });

  try {
    for (let passIndex = 0; passIndex < WHITEBOARD_ARTIST_MAX_PASSES; passIndex++) {
      currentPass = passIndex + 1;
      const pass = passIndex === 0 ? "execute" as const : "inspect" as const;
      deps.onStatus?.(pass === "execute" ? "observing" : "inspecting");
      const updatedCanvas = await deps.captureCanvas();
      const request = buildProfessorTldrawAgentRequest({
        plan, stepId, pass, canvas: updatedCanvas, priorAgentLocalIds: localIds,
      });
      if (!request) throw new ProfessorAgentRequestError("visual_needed_false");
      const response = await requestProfessorTldrawAgent(request, signal);
      if (deps.isStale()) throw new ProfessorAgentRequestError("aborted");
      const verified = verifyProfessorTldrawAgentResponse(request, response);
      if (response.actions.length > 0 && verified.actions.length === 0) {
        throw new ProfessorAgentRequestError("verification_reject");
      }
      if (passIndex === 0) executeActions = verified.actions.length;
      else correctionActions += verified.actions.length;
      cameraCommands += verified.actions.filter(action => action.type === "move-camera").length;
      totalActions += verified.actions.length;
      trivialActions += verified.actions.filter(action => !isNontrivialProfessorAgentAction(action)).length;
      freehandCount += verified.actions.filter(action => action.type === "draw-freehand").length;
      density = computeVisualDensityDiagnostic(verified.actions, request.step.focusBounds);
      localIds = [...localIds, ...verified.localIds];
      if (verified.actions.length > 0) {
        deps.onStatus?.("drawing");
        const rendered = await deps.renderActions(verified.actions);
        nontrivialVisualCount += rendered.nontrivialRendered;
        cumulativeShapeDelta += rendered.shapeDelta;
        console.log("[PROFESSOR_VISUAL_AGENT_ACTIONS]", {
          lessonId: request.identity.lessonId, stepId, pass: currentPass,
          actionTypes: verified.actions.map(action => action.type),
          actionIds: verified.actions.map(action => action.actionId),
          resultingShapeIds: rendered.resultingShapeIds,
          rejectedActionCount: verified.rejectedActionCount,
        });
      }
      deps.onDiagnostic?.(snapshot());
      if (passIndex === 0 && nontrivialVisualCount === 0) {
        throw new ProfessorAgentRequestError("no_visual_actions");
      }
      // See VISUAL_RICHNESS_RATIO_FLOOR's comment above — only reachable
      // once the zero-nontrivial case above has already been ruled out, so
      // this is specifically the "technically cleared the floor but is
      // still mostly generic boxes" case.
      if (passIndex === 0) {
        const richnessRatio = totalActions > 0 ? nontrivialVisualCount / totalActions : 0;
        const passesRichnessFloor =
          richnessRatio >= VISUAL_RICHNESS_RATIO_FLOOR || nontrivialVisualCount >= VISUAL_RICHNESS_COUNT_FLOOR;
        if (!passesRichnessFloor) {
          throw new ProfessorAgentRequestError("low_visual_richness");
        }
        const tooManyEmptyContainers =
          density.emptyContainerCount >= EMPTY_CONTAINER_COUNT_FLOOR
          && density.totalShapeCount > 0
          && density.emptyContainerCount / density.totalShapeCount >= EMPTY_CONTAINER_RATIO_CEILING;
        if (tooManyEmptyContainers) {
          throw new ProfessorAgentRequestError("empty_containers");
        }
        const tooLabelDependent =
          density.labelDependentShapeCount >= LABEL_DEPENDENT_COUNT_FLOOR
          && (density.labelDependentShapeCount + density.labelIndependentMeaningfulCount) > 0
          && (density.labelIndependentMeaningfulCount / (density.labelDependentShapeCount + density.labelIndependentMeaningfulCount)) < LABEL_INDEPENDENT_RATIO_FLOOR;
        if (tooLabelDependent) {
          throw new ProfessorAgentRequestError("label_dependent_only");
        }
      }
      if (verified.complete && !verified.needsCorrection) break;
    }
    deps.onStatus?.("idle");
    return { outcome: "success", localIds, diagnostic: snapshot() };
  } catch (error) {
    const fallbackReason: ProfessorAgentFailureReason = deps.isTimedOut() ? "timeout"
      : error instanceof ProfessorAgentRequestError ? error.reason
        : signal.aborted ? "aborted" : "network_error";
    const failure = resolveProfessorAgentFailure(WHITEBOARD_ARTIST_STRICT, fallbackReason);
    deps.onStatus?.("fallback");
    const diagnostic: WhiteboardArtistDiagnostic = {
      ...snapshot(), fallbackUsed: failure.fallbackUsed, fallbackReason,
    };
    deps.onDiagnostic?.(diagnostic);
    console.warn("[PROFESSOR_VISUAL_AGENT_FALLBACK]", {
      lessonId: buildProfessorLessonCacheKey(plan.sourceSnapshot), stepId, reason: fallbackReason,
    });
    // No verified visual actions means the caller's own applyStateAtStep
    // continues using the existing deterministic layout; Professor playback never stalls
    // in production (shouldStopPlayback is strict-mode only).
    return {
      outcome: "fallback", localIds, diagnostic,
      failure: { reason: fallbackReason, shouldStopPlayback: failure.shouldStopPlayback },
    };
  }
}
