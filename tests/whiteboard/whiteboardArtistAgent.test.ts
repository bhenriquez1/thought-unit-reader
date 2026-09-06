// tests/whiteboard/whiteboardArtistAgent.test.ts
// WA1 — real function-call tests for runWhiteboardArtistStep, the Whiteboard
// Artist Agent's bounded observe/draw/inspect/correct loop, extracted out of
// TldrawCanvas.tsx's formerly-inline ensureRuntimeAgentVisualStep. Unlike
// most Whiteboard tests in this directory (source-inspection only — no
// jsdom/tldraw-editor harness in this repo), this module never touches the
// tldraw Editor or React state directly, so it's testable with real calls
// against fake `captureCanvas`/`renderActions` dependencies instead of
// string-matching source.
//
// buildProfessorTldrawAgentRequest/requestProfessorTldrawAgent/
// verifyProfessorTldrawAgentResponse/computeVisualDensityDiagnostic are
// mocked here — their own behavior is already covered by
// tests/whiteboard/professorTldrawAgent.test.ts; this file exercises the
// ORCHESTRATION loop built on top of them (pass counting, accept/reject
// thresholds, diagnostic accumulation, dependency injection boundaries).

import {
  runWhiteboardArtistStep,
  EMPTY_DENSITY_DIAGNOSTIC,
  WHITEBOARD_ARTIST_MAX_PASSES,
  type WhiteboardArtistStepDeps,
  type WhiteboardArtistDiagnostic,
  type WhiteboardArtistStatus,
} from "../../lib/whiteboard/whiteboardArtistAgent";
import {
  buildProfessorTldrawAgentRequest,
  requestProfessorTldrawAgent,
  verifyProfessorTldrawAgentResponse,
  computeVisualDensityDiagnostic,
} from "../../lib/whiteboard/professorTldrawAgent";
import type { ProfessorLessonPlan, ProfessorTeachingAction } from "../../lib/whiteboard/professorLessonPlan";
import type { VisualDensityDiagnostic } from "../../lib/whiteboard/professorTldrawAgent";

jest.mock("../../lib/whiteboard/professorTldrawAgent", () => {
  const actual = jest.requireActual("../../lib/whiteboard/professorTldrawAgent");
  return {
    ...actual,
    buildProfessorTldrawAgentRequest: jest.fn(),
    requestProfessorTldrawAgent: jest.fn(),
    verifyProfessorTldrawAgentResponse: jest.fn(),
    computeVisualDensityDiagnostic: jest.fn(),
  };
});

const mockBuildRequest = buildProfessorTldrawAgentRequest as jest.Mock;
const mockRequestAgent = requestProfessorTldrawAgent as jest.Mock;
const mockVerify = verifyProfessorTldrawAgentResponse as jest.Mock;
const mockDensity = computeVisualDensityDiagnostic as jest.Mock;

const PLAN = {
  sourceSnapshot: {
    documentId: "doc-1", pageTruthKey: "doc-1::1::t", activeCanonicalUnitId: null,
    vsgId: "vsg-1", plannerVersion: 7,
  },
} as unknown as ProfessorLessonPlan;

function freehand(id: string): ProfessorTeachingAction {
  return { type: "draw-freehand", actionId: `fh-${id}`, shapeId: `shape:${id}`, targetId: `source-${id}`, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], durationMs: 1, stepId: 1 };
}

function makeDeps(overrides: Partial<WhiteboardArtistStepDeps> = {}): WhiteboardArtistStepDeps & {
  statuses: WhiteboardArtistStatus[];
  diagnostics: WhiteboardArtistDiagnostic[];
} {
  const statuses: WhiteboardArtistStatus[] = [];
  const diagnostics: WhiteboardArtistDiagnostic[] = [];
  return {
    captureCanvas: jest.fn().mockResolvedValue({ viewportBounds: { x: 0, y: 0, w: 100, h: 100 }, shapes: [], screenshotBase64: null }),
    renderActions: jest.fn().mockResolvedValue({ shapeDelta: 1, nontrivialRendered: 1, resultingShapeIds: ["shape:a"] }),
    isStale: jest.fn().mockReturnValue(false),
    isTimedOut: jest.fn().mockReturnValue(false),
    onStatus: (s) => statuses.push(s),
    onDiagnostic: (d) => diagnostics.push(d),
    statuses,
    diagnostics,
    ...overrides,
  };
}

const RICH_DENSITY: VisualDensityDiagnostic = {
  ...EMPTY_DENSITY_DIAGNOSTIC,
  meaningfulPrimitiveCount: 1, totalShapeCount: 1, labelIndependentMeaningfulCount: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("runWhiteboardArtistStep — success path", () => {
  it("REQUIRED: a single complete, non-correcting pass returns outcome 'success' after exactly one request", async () => {
    mockBuildRequest.mockReturnValue({ identity: { lessonId: "lesson-1" }, step: { focusBounds: { x: 0, y: 0, w: 10, h: 10 } } });
    mockRequestAgent.mockResolvedValue({ actions: [freehand("a")] });
    mockVerify.mockReturnValue({ actions: [freehand("a")], localIds: ["local-1"], needsCorrection: false, complete: true, rejectedActionCount: 0 });
    mockDensity.mockReturnValue(RICH_DENSITY);

    const deps = makeDeps();
    const result = await runWhiteboardArtistStep(
      { plan: PLAN, stepId: 1, priorAgentLocalIds: [], signal: new AbortController().signal },
      deps,
    );

    expect(result.outcome).toBe("success");
    expect(result.localIds).toEqual(["local-1"]);
    expect(mockRequestAgent).toHaveBeenCalledTimes(1);
    expect(deps.statuses).toEqual(["observing", "drawing", "idle"]);
  });

  it("REQUIRED: needsCorrection on pass 1 triggers a second 'inspect' pass, and priorAgentLocalIds accumulates across passes", async () => {
    mockBuildRequest.mockReturnValue({ identity: { lessonId: "lesson-1" }, step: { focusBounds: { x: 0, y: 0, w: 10, h: 10 } } });
    mockRequestAgent.mockResolvedValue({ actions: [freehand("a")] });
    mockVerify
      .mockReturnValueOnce({ actions: [freehand("a")], localIds: ["local-1"], needsCorrection: true, complete: false, rejectedActionCount: 0 })
      .mockReturnValueOnce({ actions: [freehand("b")], localIds: ["local-2"], needsCorrection: false, complete: true, rejectedActionCount: 0 });
    mockDensity.mockReturnValue(RICH_DENSITY);

    const deps = makeDeps();
    const result = await runWhiteboardArtistStep(
      { plan: PLAN, stepId: 1, priorAgentLocalIds: [], signal: new AbortController().signal },
      deps,
    );

    expect(result.outcome).toBe("success");
    expect(mockRequestAgent).toHaveBeenCalledTimes(2);
    expect(result.localIds).toEqual(["local-1", "local-2"]);
    // Second call's request must have been built with the FIRST pass's localIds already folded in.
    expect(mockBuildRequest.mock.calls[1][0].priorAgentLocalIds).toEqual(["local-1"]);
    expect(deps.statuses).toEqual(["observing", "drawing", "inspecting", "drawing", "idle"]);
  });

  it("REQUIRED: stops after WHITEBOARD_ARTIST_MAX_PASSES even if every pass keeps requesting correction — never an infinite loop", async () => {
    mockBuildRequest.mockReturnValue({ identity: { lessonId: "lesson-1" }, step: { focusBounds: { x: 0, y: 0, w: 10, h: 10 } } });
    mockRequestAgent.mockResolvedValue({ actions: [freehand("a")] });
    mockVerify.mockReturnValue({ actions: [freehand("a")], localIds: ["local-x"], needsCorrection: true, complete: false, rejectedActionCount: 0 });
    mockDensity.mockReturnValue(RICH_DENSITY);

    const result = await runWhiteboardArtistStep(
      { plan: PLAN, stepId: 1, priorAgentLocalIds: [], signal: new AbortController().signal },
      makeDeps(),
    );

    expect(result.outcome).toBe("success"); // the loop just ends, not an error
    expect(mockRequestAgent).toHaveBeenCalledTimes(WHITEBOARD_ARTIST_MAX_PASSES);
  });

  it("passes through renderActions' shapeDelta/resultingShapeIds into the diagnostic and never touches an Editor directly (no editor-shaped argument anywhere in the deps contract)", async () => {
    mockBuildRequest.mockReturnValue({ identity: { lessonId: "lesson-1" }, step: { focusBounds: { x: 0, y: 0, w: 10, h: 10 } } });
    mockRequestAgent.mockResolvedValue({ actions: [freehand("a")] });
    mockVerify.mockReturnValue({ actions: [freehand("a")], localIds: [], needsCorrection: false, complete: true, rejectedActionCount: 0 });
    mockDensity.mockReturnValue(RICH_DENSITY);

    const deps = makeDeps({ renderActions: jest.fn().mockResolvedValue({ shapeDelta: 3, nontrivialRendered: 1, resultingShapeIds: ["shape:a", "shape:b", "shape:c"] }) });
    const result = await runWhiteboardArtistStep(
      { plan: PLAN, stepId: 1, priorAgentLocalIds: [], signal: new AbortController().signal },
      deps,
    );
    expect(result.diagnostic.actualTldrawShapeDelta).toBe(3);
  });
});

describe("runWhiteboardArtistStep — rejection/fallback paths", () => {
  it("REQUIRED: buildProfessorTldrawAgentRequest returning null (not visualNeeded) is a 'visual_needed_false' fallback with no network call", async () => {
    mockBuildRequest.mockReturnValue(null);
    const result = await runWhiteboardArtistStep(
      { plan: PLAN, stepId: 1, priorAgentLocalIds: [], signal: new AbortController().signal },
      makeDeps(),
    );
    expect(result.outcome).toBe("fallback");
    expect(result.failure?.reason).toBe("visual_needed_false");
    expect(mockRequestAgent).not.toHaveBeenCalled();
  });

  it("REQUIRED: zero nontrivial actions on pass 0 is a 'no_visual_actions' fallback", async () => {
    mockBuildRequest.mockReturnValue({ identity: { lessonId: "lesson-1" }, step: { focusBounds: { x: 0, y: 0, w: 10, h: 10 } } });
    mockRequestAgent.mockResolvedValue({ actions: [] });
    mockVerify.mockReturnValue({ actions: [], localIds: [], needsCorrection: false, complete: true, rejectedActionCount: 0 });
    mockDensity.mockReturnValue(EMPTY_DENSITY_DIAGNOSTIC);

    const deps = makeDeps({ renderActions: jest.fn().mockResolvedValue({ shapeDelta: 0, nontrivialRendered: 0, resultingShapeIds: [] }) });
    const result = await runWhiteboardArtistStep(
      { plan: PLAN, stepId: 1, priorAgentLocalIds: [], signal: new AbortController().signal },
      deps,
    );
    expect(result.outcome).toBe("fallback");
    expect(result.failure?.reason).toBe("no_visual_actions");
    expect(deps.statuses[deps.statuses.length - 1]).toBe("fallback");
  });

  it("REQUIRED: a stale plan (deps.isStale() true) after the request resolves is an 'aborted' fallback", async () => {
    mockBuildRequest.mockReturnValue({ identity: { lessonId: "lesson-1" }, step: { focusBounds: { x: 0, y: 0, w: 10, h: 10 } } });
    mockRequestAgent.mockResolvedValue({ actions: [] });
    const result = await runWhiteboardArtistStep(
      { plan: PLAN, stepId: 1, priorAgentLocalIds: [], signal: new AbortController().signal },
      makeDeps({ isStale: jest.fn().mockReturnValue(true) }),
    );
    expect(result.outcome).toBe("fallback");
    expect(result.failure?.reason).toBe("aborted");
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("REQUIRED: a timed-out request (deps.isTimedOut() true) classifies as 'timeout', not 'network_error'", async () => {
    mockBuildRequest.mockReturnValue({ identity: { lessonId: "lesson-1" }, step: { focusBounds: { x: 0, y: 0, w: 10, h: 10 } } });
    mockRequestAgent.mockRejectedValue(new Error("aborted by signal"));
    const result = await runWhiteboardArtistStep(
      { plan: PLAN, stepId: 1, priorAgentLocalIds: [], signal: new AbortController().signal },
      makeDeps({ isTimedOut: jest.fn().mockReturnValue(true) }),
    );
    expect(result.outcome).toBe("fallback");
    expect(result.failure?.reason).toBe("timeout");
  });

  it("REQUIRED: a plain network error (not timed out, signal not aborted) classifies as 'network_error'", async () => {
    mockBuildRequest.mockReturnValue({ identity: { lessonId: "lesson-1" }, step: { focusBounds: { x: 0, y: 0, w: 10, h: 10 } } });
    mockRequestAgent.mockRejectedValue(new Error("fetch failed"));
    const result = await runWhiteboardArtistStep(
      { plan: PLAN, stepId: 1, priorAgentLocalIds: [], signal: new AbortController().signal },
      makeDeps(),
    );
    expect(result.outcome).toBe("fallback");
    expect(result.failure?.reason).toBe("network_error");
  });

  it("REQUIRED: fallback shouldStopPlayback reflects WHITEBOARD_ARTIST_STRICT (false in this test environment) — production-safe by default", async () => {
    mockBuildRequest.mockReturnValue(null);
    const result = await runWhiteboardArtistStep(
      { plan: PLAN, stepId: 1, priorAgentLocalIds: [], signal: new AbortController().signal },
      makeDeps(),
    );
    expect(result.failure?.shouldStopPlayback).toBe(false);
  });
});

describe("runWhiteboardArtistStep — dependency-injection boundary", () => {
  it("never calls renderActions when a pass verifies zero actions", async () => {
    mockBuildRequest.mockReturnValue({ identity: { lessonId: "lesson-1" }, step: { focusBounds: { x: 0, y: 0, w: 10, h: 10 } } });
    mockRequestAgent.mockResolvedValue({ actions: [] });
    mockVerify.mockReturnValue({ actions: [], localIds: [], needsCorrection: false, complete: true, rejectedActionCount: 0 });
    mockDensity.mockReturnValue(EMPTY_DENSITY_DIAGNOSTIC);

    const deps = makeDeps();
    await runWhiteboardArtistStep(
      { plan: PLAN, stepId: 1, priorAgentLocalIds: [], signal: new AbortController().signal },
      deps,
    );
    expect(deps.renderActions).not.toHaveBeenCalled();
  });

  it("calls captureCanvas fresh on every pass (never reuses a stale canvas snapshot across a correction pass)", async () => {
    mockBuildRequest.mockReturnValue({ identity: { lessonId: "lesson-1" }, step: { focusBounds: { x: 0, y: 0, w: 10, h: 10 } } });
    mockRequestAgent.mockResolvedValue({ actions: [freehand("a")] });
    mockVerify
      .mockReturnValueOnce({ actions: [freehand("a")], localIds: [], needsCorrection: true, complete: false, rejectedActionCount: 0 })
      .mockReturnValueOnce({ actions: [freehand("b")], localIds: [], needsCorrection: false, complete: true, rejectedActionCount: 0 });
    mockDensity.mockReturnValue(RICH_DENSITY);

    const deps = makeDeps();
    await runWhiteboardArtistStep(
      { plan: PLAN, stepId: 1, priorAgentLocalIds: [], signal: new AbortController().signal },
      deps,
    );
    expect(deps.captureCanvas).toHaveBeenCalledTimes(2);
  });
});
