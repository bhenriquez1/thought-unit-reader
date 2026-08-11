import { z } from "zod";
import { computeAvoidanceBend, pushClearOf, type LayoutBox } from "./groupLayout";
import { estimateLabelHeight, estimateLabelWidth } from "./textMetrics";
import {
  CameraIntentSchema,
  type Bounds,
  type ProfessorLessonPlan,
  type ProfessorTeachingAction,
  type ProfessorVisualColor,
  type ProfessorVisualDash,
  type ProfessorVisualFill,
  type ProfessorVisualSize,
} from "./professorLessonPlan";

const finite = z.number().finite();
export const AgentBoundsSchema = z.object({ x: finite, y: finite, w: finite.positive(), h: finite.positive() });
export const AgentPointSchema = z.object({ x: finite, y: finite, z: finite.min(0).max(1).optional() });
const ColorSchema = z.enum(["black", "grey", "blue", "light-blue", "green", "light-green", "yellow", "orange", "red", "violet"]);
const SizeSchema = z.enum(["s", "m", "l", "xl"]);
const DashSchema = z.enum(["draw", "solid", "dashed", "dotted"]);
const FillSchema = z.enum(["none", "semi", "solid", "pattern"]);
const LocalIdSchema = z.string().min(1).max(48).regex(/^[a-zA-Z0-9_-]+$/);

const FreehandToolSchema = z.object({
  tool: z.enum(["drawFreehandStroke", "drawAnatomySketch", "drawMuscle", "drawBone", "drawNerve", "drawHatching", "drawBrace", "drawBracket"]),
  localId: LocalIdSchema,
  sourceTargetId: z.string().max(160).nullable().optional(),
  points: z.array(AgentPointSchema).min(2).max(64),
  color: ColorSchema.default("black"),
  size: SizeSchema.default("m"),
  dash: DashSchema.default("draw"),
  isPen: z.boolean().default(true),
  closed: z.boolean().default(false),
  fill: FillSchema.default("none"),
});

const SymbolToolSchema = z.object({
  tool: z.literal("drawSymbol"),
  localId: LocalIdSchema,
  sourceTargetId: z.string().max(160).nullable().optional(),
  symbol: z.enum(["rectangle", "ellipse", "diamond", "hexagon", "cloud", "line"]),
  bounds: AgentBoundsSchema,
  color: ColorSchema.default("blue"),
  size: SizeSchema.default("m"),
  dash: DashSchema.default("draw"),
  fill: FillSchema.default("none"),
});

const LabelToolSchema = z.object({
  tool: z.literal("writeLabel"),
  localId: LocalIdSchema,
  sourceTargetId: z.string().max(160).nullable().optional(),
  text: z.string().min(1).max(120),
  x: finite,
  y: finite,
  color: ColorSchema.default("black"),
  size: SizeSchema.default("m"),
  attachToLocalId: LocalIdSchema.nullable().optional(),
});

const ArrowToolSchema = z.object({
  tool: z.literal("drawFlowArrow"),
  localId: LocalIdSchema,
  sourceTargetId: z.string().max(160).nullable().optional(),
  from: AgentPointSchema.omit({ z: true }),
  to: AgentPointSchema.omit({ z: true }),
  bend: finite.min(-500).max(500).optional(),
  color: ColorSchema.default("green"),
  size: SizeSchema.default("m"),
  dash: DashSchema.default("draw"),
});

const ZoneToolSchema = z.object({
  tool: z.enum(["drawPressureZone", "highlightRegion"]),
  localId: LocalIdSchema,
  sourceTargetId: z.string().max(160).nullable().optional(),
  bounds: AgentBoundsSchema,
  color: ColorSchema.default("red"),
  opacity: finite.min(0.08).max(0.55).default(0.24),
});

const CalloutToolSchema = z.object({
  tool: z.literal("drawCallout"),
  localId: LocalIdSchema,
  sourceTargetId: z.string().max(160).nullable().optional(),
  bounds: AgentBoundsSchema,
  label: z.string().min(1).max(120),
  color: ColorSchema.default("orange"),
});

const NumberToolSchema = z.object({
  tool: z.literal("drawNumberBadge"),
  localId: LocalIdSchema,
  sourceTargetId: z.string().max(160).nullable().optional(),
  bounds: AgentBoundsSchema,
  number: z.number().int().min(1).max(30),
  color: ColorSchema.default("violet"),
});

const EraseToolSchema = z.object({
  tool: z.literal("eraseRegion"),
  targetLocalId: LocalIdSchema,
});

const CameraToolSchema = z.object({
  tool: z.enum(["moveCamera", "zoomTo", "panTo", "focusNode"]),
  localId: LocalIdSchema,
  bounds: AgentBoundsSchema,
  retainShapeIds: z.array(z.string().max(160)).max(8).default([]),
});

export const ProfessorTldrawToolCallSchema = z.union([
  FreehandToolSchema,
  SymbolToolSchema,
  LabelToolSchema,
  ArrowToolSchema,
  ZoneToolSchema,
  CalloutToolSchema,
  NumberToolSchema,
  EraseToolSchema,
  CameraToolSchema,
]);
export type ProfessorTldrawToolCall = z.infer<typeof ProfessorTldrawToolCallSchema>;

export const ProfessorAgentCanvasShapeSchema = z.object({
  shapeId: z.string().max(160),
  type: z.string().max(40),
  bounds: AgentBoundsSchema,
  text: z.string().max(160).default(""),
  semanticRole: z.string().max(80).default("visual"),
  sourceTargetId: z.string().max(160).nullable().optional(),
  origin: z.enum(["planner", "agent", "student"]),
});
export type ProfessorAgentCanvasShape = z.infer<typeof ProfessorAgentCanvasShapeSchema>;

const FallbackVisualSchema = z.object({
  type: z.enum(["shape", "arrow", "label", "freehand"]),
  shapeId: z.string().max(160),
  targetId: z.string().max(160).nullable(),
  bounds: AgentBoundsSchema.nullable(),
  text: z.string().max(160).nullable(),
});

export const ProfessorTldrawAgentRequestSchema = z.object({
  identity: z.object({
    documentId: z.string().min(1).max(300),
    pageTruthKey: z.string().min(1).max(300),
    lessonId: z.string().min(1).max(500),
    stepId: z.number().int().nonnegative(),
    groundedConceptIds: z.array(z.string().min(1).max(160)).min(1).max(24),
  }),
  pageTruthKey: z.string().min(1).max(300),
  pass: z.enum(["execute", "inspect"]),
  step: z.object({
    stepId: z.number().int().nonnegative(),
    teachingGoal: z.string().min(1).max(600),
    teachingStructure: z.string().min(1).max(80),
    visualIntent: z.string().min(1).max(600),
    narration: z.string().min(1).max(4000),
    focusBounds: AgentBoundsSchema,
    cameraIntent: CameraIntentSchema,
    activeTargetIds: z.array(z.string().max(160)).max(16),
    retainContextTargetIds: z.array(z.string().max(160)).max(12),
    allowedLabels: z.array(z.string().min(1).max(120)).max(24),
    allowedSourceTargetIds: z.array(z.string().min(1).max(160)).max(24),
    relationships: z.array(z.object({
      targetId: z.string().max(160),
      kind: z.string().max(40),
      label: z.string().max(120).nullable(),
    })).max(12),
    fallbackVisuals: z.array(FallbackVisualSchema).max(32),
  }),
  canvas: z.object({
    viewportBounds: AgentBoundsSchema,
    shapes: z.array(ProfessorAgentCanvasShapeSchema).max(60),
    screenshotBase64: z.string().max(900_000).nullable(),
  }),
  priorAgentLocalIds: z.array(LocalIdSchema).max(32),
}).superRefine((value, context) => {
  if (value.identity.pageTruthKey !== value.pageTruthKey) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["identity", "pageTruthKey"], message: "page_truth_mismatch" });
  }
  if (value.identity.stepId !== value.step.stepId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["identity", "stepId"], message: "step_mismatch" });
  }
  const grounded = new Set(value.identity.groundedConceptIds);
  if (value.step.allowedSourceTargetIds.some(id => !grounded.has(id))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["step", "allowedSourceTargetIds"], message: "ungrounded_source" });
  }
});
export type ProfessorTldrawAgentRequest = z.infer<typeof ProfessorTldrawAgentRequestSchema>;

export const ProfessorTldrawAgentResponseSchema = z.object({
  model: z.string().nullable().optional(),
  stepId: z.number().int().nonnegative(),
  pass: z.enum(["execute", "inspect"]),
  assessment: z.object({
    needsCorrection: z.boolean(),
    issues: z.array(z.string().max(160)).max(6),
  }),
  actions: z.array(ProfessorTldrawToolCallSchema).max(20),
  complete: z.boolean(),
});
export type ProfessorTldrawAgentResponse = z.infer<typeof ProfessorTldrawAgentResponseSchema>;

export interface ProfessorAgentCanvasContext {
  viewportBounds: Bounds;
  shapes: ProfessorAgentCanvasShape[];
  screenshotBase64: string | null;
}

export interface VerifiedProfessorAgentPass {
  actions: ProfessorTeachingAction[];
  localIds: string[];
  needsCorrection: boolean;
  complete: boolean;
  rejectedActionCount: number;
  model: string | null;
}

export type ProfessorAgentFailureReason =
  | "missing_key" | "not_triggered" | "visual_needed_false" | "timeout"
  | "network_error" | "schema_reject" | "no_visual_actions"
  | "verification_reject" | "aborted";

export class ProfessorAgentRequestError extends Error {
  constructor(public readonly reason: ProfessorAgentFailureReason, message = reason) {
    super(message);
    this.name = "ProfessorAgentRequestError";
  }
}

export function resolveProfessorAgentFailure(strict: boolean, reason: ProfessorAgentFailureReason) {
  return { reason, fallbackUsed: !strict, shouldStopPlayback: strict } as const;
}

export function isNontrivialProfessorAgentAction(action: ProfessorTeachingAction): boolean {
  if (action.type === "draw-freehand" || action.type === "draw-arrow" || action.type === "emphasize") return true;
  if (action.type === "draw-shape") {
    if (action.shape !== "box") return true;
    return action.visualRole === "drawPressureZone"
      || action.visualRole === "highlightRegion"
      || action.visualRole === "drawCallout";
  }
  return false;
}

function visualBounds(action: ProfessorTeachingAction): Bounds | null {
  if (action.type === "draw-shape") return action.bounds;
  if (action.type === "draw-freehand") {
    const xs = action.points.map(point => point.x);
    const ys = action.points.map(point => point.y);
    if (xs.length === 0) return null;
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
  }
  if (action.type === "draw-arrow") {
    const x = Math.min(action.from.x, action.to.x);
    const y = Math.min(action.from.y, action.to.y);
    return { x, y, w: Math.max(1, Math.abs(action.to.x - action.from.x)), h: Math.max(1, Math.abs(action.to.y - action.from.y)) };
  }
  return null;
}

export function buildProfessorTldrawAgentRequest(args: {
  plan: ProfessorLessonPlan;
  stepId: number;
  pass: "execute" | "inspect";
  canvas: ProfessorAgentCanvasContext;
  priorAgentLocalIds?: string[];
}): ProfessorTldrawAgentRequest | null {
  const step = args.plan.directorSteps?.find(candidate => candidate.stepId === args.stepId);
  if (!step?.visualNeeded || !step.focusBounds) return null;
  const stepActions = step.drawInstructions;
  const camera = stepActions.find(action => action.type === "move-camera");
  const labels = Array.from(new Set(stepActions
    .filter((action): action is Extract<ProfessorTeachingAction, { type: "write" }> => action.type === "write")
    .map(action => action.text.trim())
    .filter(Boolean)));
  const sourceTargets = Array.from(new Set([
    ...step.sourceEvidence.map(evidence => evidence.sourceId),
    ...stepActions.flatMap(action => "targetId" in action && action.targetId ? [action.targetId] : []),
  ]));
  if (sourceTargets.length === 0) return null;
  const fallbackVisuals: Array<{
    type: "shape" | "arrow" | "label" | "freehand";
    shapeId: string;
    targetId: string | null;
    bounds: Bounds | null;
    text: string | null;
  }> = [];
  for (const action of stepActions) {
    if (action.type === "draw-shape" || action.type === "draw-freehand") {
      fallbackVisuals.push({ type: action.type === "draw-freehand" ? "freehand" : "shape", shapeId: action.shapeId, targetId: action.targetId ?? null, bounds: visualBounds(action), text: null });
    }
    else if (action.type === "draw-arrow") fallbackVisuals.push({ type: "arrow", shapeId: action.shapeId, targetId: action.targetId ?? null, bounds: visualBounds(action), text: null });
    else if (action.type === "write") fallbackVisuals.push({ type: "label", shapeId: action.shapeId, targetId: action.targetId ?? null, bounds: null, text: action.text });
  }
  return ProfessorTldrawAgentRequestSchema.parse({
    identity: {
      documentId: args.plan.sourceSnapshot.documentId,
      pageTruthKey: args.plan.sourceSnapshot.pageTruthKey,
      lessonId: `plesson:v${args.plan.sourceSnapshot.plannerVersion}:${args.plan.sourceSnapshot.documentId}:${args.plan.sourceSnapshot.pageTruthKey}:${args.plan.sourceSnapshot.activeCanonicalUnitId ?? "none"}:${args.plan.sourceSnapshot.vsgId}`,
      stepId: step.stepId,
      groundedConceptIds: sourceTargets,
    },
    pageTruthKey: args.plan.sourceSnapshot.pageTruthKey,
    pass: args.pass,
    step: {
      stepId: step.stepId,
      teachingGoal: step.teachingGoal,
      teachingStructure: step.teachingStructure,
      visualIntent: step.visualIntent,
      narration: step.narration,
      focusBounds: step.focusBounds,
      cameraIntent: step.cameraIntent,
      activeTargetIds: camera?.type === "move-camera" ? camera.targetIds : [],
      retainContextTargetIds: camera?.type === "move-camera" ? (camera.retainContextTargetIds ?? []) : [],
      allowedLabels: labels,
      allowedSourceTargetIds: sourceTargets,
      relationships: step.relationships.map(relationship => ({
        targetId: relationship.targetId,
        kind: relationship.kind,
        label: relationship.label ?? null,
      })),
      fallbackVisuals,
    },
    canvas: args.canvas,
    priorAgentLocalIds: args.priorAgentLocalIds ?? [],
  });
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function expanded(bounds: Bounds, padding = 120): Bounds {
  return { x: bounds.x - padding, y: bounds.y - padding, w: bounds.w + padding * 2, h: bounds.h + padding * 2 };
}

function clampPoint(point: { x: number; y: number; z?: number }, region: Bounds) {
  return {
    x: clamp(point.x, region.x, region.x + region.w),
    y: clamp(point.y, region.y, region.y + region.h),
    ...(point.z == null ? {} : { z: clamp(point.z, 0, 1) }),
  };
}

function clampBounds(bounds: Bounds, region: Bounds): Bounds {
  const x = clamp(bounds.x, region.x, region.x + region.w - 4);
  const y = clamp(bounds.y, region.y, region.y + region.h - 4);
  return {
    x,
    y,
    w: clamp(bounds.w, 4, Math.max(4, region.x + region.w - x)),
    h: clamp(bounds.h, 4, Math.max(4, region.y + region.h - y)),
  };
}

function stableShapeId(stepId: number, localId: string): string {
  return `shape:prof-agent-${stepId}-${localId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function style(input: { color?: ProfessorVisualColor; size?: ProfessorVisualSize; dash?: ProfessorVisualDash; fill?: ProfessorVisualFill }) {
  return { color: input.color, size: input.size, dash: input.dash, fill: input.fill };
}

function sourceTarget(call: { sourceTargetId?: string | null }, allowed: Set<string>): string | undefined {
  return call.sourceTargetId && allowed.has(call.sourceTargetId) ? call.sourceTargetId : undefined;
}

/** The deterministic "hands" gate. Claude tool calls do not reach tldraw
 * directly: ids, labels, coordinates, erases, source links and camera bounds
 * are all verified against the single current Director step. */
export function verifyProfessorTldrawAgentResponse(
  request: ProfessorTldrawAgentRequest,
  response: ProfessorTldrawAgentResponse,
): VerifiedProfessorAgentPass {
  if (response.stepId !== request.step.stepId || response.pass !== request.pass) {
    return { actions: [], localIds: [], needsCorrection: false, complete: false, rejectedActionCount: response.actions.length, model: response.model ?? null };
  }
  const region = expanded(request.step.focusBounds);
  const allowedLabels = new Set(request.step.allowedLabels);
  const allowedSources = new Set(request.step.allowedSourceTargetIds);
  const canvasShapeIds = new Set(request.canvas.shapes.map(shape => shape.shapeId));
  const priorLocalIds = new Set(request.priorAgentLocalIds);
  const reservedLocalIds = new Set(request.priorAgentLocalIds);
  const obstacles: LayoutBox[] = request.canvas.shapes
    .filter(shape => shape.origin !== "student")
    .map(shape => ({ ...shape.bounds }));
  const actions: ProfessorTeachingAction[] = [];
  const acceptedLocalIds: string[] = [];
  const stepId = request.step.stepId;
  let ordinal = 0;
  let rejectedActionCount = 0;

  const push = (action: ProfessorTeachingAction) => actions.push(action);
  const actionId = (localId: string, suffix = "visual") => `agent-${stepId}-${localId}-${suffix}-${ordinal++}`;
  const acceptLocalId = (localId: string): boolean => {
    if (reservedLocalIds.has(localId)) return false;
    reservedLocalIds.add(localId);
    acceptedLocalIds.push(localId);
    return true;
  };

  for (const call of response.actions.slice(0, 20)) {
    if (call.tool === "eraseRegion") {
      if (!priorLocalIds.has(call.targetLocalId)) { rejectedActionCount++; continue; }
      push({ type: "erase", actionId: actionId(call.targetLocalId, "erase"), targetShapeId: stableShapeId(stepId, call.targetLocalId), durationMs: 140, stepId });
      continue;
    }
    if (call.tool === "writeLabel" && !allowedLabels.has(call.text)) { rejectedActionCount++; continue; }
    if (call.tool === "drawCallout" && !allowedLabels.has(call.label)) { rejectedActionCount++; continue; }
    if (!acceptLocalId(call.localId)) { rejectedActionCount++; continue; }

    if (call.tool === "moveCamera" || call.tool === "zoomTo" || call.tool === "panTo" || call.tool === "focusNode") {
      const focusBounds = clampBounds(call.bounds, region);
      const retained = call.retainShapeIds.filter(shapeId => canvasShapeIds.has(shapeId));
      push({
        type: "move-camera",
        actionId: actionId(call.localId, "camera"),
        targetIds: Array.from(new Set([...request.step.activeTargetIds, ...retained])),
        retainContextTargetIds: retained,
        focusBounds,
        cameraIntent: request.step.cameraIntent,
        durationMs: 420,
        stepId,
      });
      continue;
    }

    // Every visual primitive must be traceable to the current grounded
    // Professor step. Camera actions are grounded by activeTargetIds above;
    // erase actions are grounded by a prior accepted local id.
    const groundedSourceTargetId = "sourceTargetId" in call ? call.sourceTargetId : null;
    if (!groundedSourceTargetId || !allowedSources.has(groundedSourceTargetId)) {
      rejectedActionCount++;
      acceptedLocalIds.pop();
      reservedLocalIds.delete(call.localId);
      continue;
    }

    const shapeId = stableShapeId(stepId, call.localId);
    if (call.tool === "drawFreehandStroke" || call.tool === "drawAnatomySketch" || call.tool === "drawMuscle" || call.tool === "drawBone" || call.tool === "drawNerve" || call.tool === "drawHatching" || call.tool === "drawBrace" || call.tool === "drawBracket") {
      const points = call.points.map(point => clampPoint(point, region));
      if (points.length < 2) continue;
      push({
        type: "draw-freehand",
        actionId: actionId(call.localId, "stroke"),
        shapeId,
        targetId: sourceTarget(call, allowedSources),
        points,
        visualStyle: style(call),
        visualRole: call.tool,
        isPen: call.isPen,
        closed: call.closed,
        durationMs: 220,
        stepId,
      });
      continue;
    }

    if (call.tool === "drawSymbol") {
      let bounds = clampBounds(call.bounds, region);
      bounds = clampBounds(pushClearOf(bounds, obstacles), region);
      obstacles.push(bounds);
      const shapeKind = call.symbol === "ellipse" ? "circle" : call.symbol === "rectangle" ? "box" : call.symbol;
      push({
        type: "draw-shape",
        actionId: actionId(call.localId, "symbol"),
        shapeId,
        targetId: sourceTarget(call, allowedSources),
        shape: shapeKind,
        bounds,
        visualStyle: style(call),
        visualRole: call.tool,
        durationMs: 220,
        stepId,
      });
      continue;
    }

    if (call.tool === "writeLabel") {
      let x = clamp(call.x, region.x, region.x + region.w);
      let y = clamp(call.y, region.y, region.y + region.h);
      if (!call.attachToLocalId) {
        const labelBox = pushClearOf({ x, y, w: estimateLabelWidth(call.text), h: estimateLabelHeight(call.text) }, obstacles);
        const clamped = clampBounds(labelBox, region);
        x = clamped.x;
        y = clamped.y;
        obstacles.push(clamped);
      }
      push({
        type: "write",
        actionId: actionId(call.localId, "label"),
        shapeId,
        targetId: sourceTarget(call, allowedSources),
        text: call.text,
        x,
        y,
        visualStyle: { color: call.color, size: call.size },
        visualRole: call.tool,
        durationMs: 210,
        stepId,
      });
      continue;
    }

    if (call.tool === "drawFlowArrow") {
      const from = clampPoint(call.from, region);
      const to = clampPoint(call.to, region);
      push({
        type: "draw-arrow",
        actionId: actionId(call.localId, "arrow"),
        shapeId,
        targetId: sourceTarget(call, allowedSources),
        from,
        to,
        bend: call.bend ?? computeAvoidanceBend(from, to, obstacles),
        visualStyle: style(call),
        visualRole: call.tool,
        durationMs: 220,
        stepId,
      });
      continue;
    }

    if (call.tool === "drawPressureZone" || call.tool === "highlightRegion") {
      const bounds = clampBounds(call.bounds, region);
      push({
        type: "draw-shape",
        actionId: actionId(call.localId, "zone"),
        shapeId,
        targetId: sourceTarget(call, allowedSources),
        shape: call.tool === "drawPressureZone" ? "circle" : "box",
        bounds,
        visualStyle: { color: call.color, fill: "solid", dash: "draw", size: "m" },
        visualRole: call.tool,
        opacity: call.opacity,
        durationMs: 180,
        stepId,
      });
      continue;
    }

    if (call.tool === "drawCallout") {
      let bounds = clampBounds(call.bounds, region);
      bounds = clampBounds(pushClearOf(bounds, obstacles), region);
      obstacles.push(bounds);
      const targetId = sourceTarget(call, allowedSources);
      push({
        type: "draw-shape", actionId: actionId(call.localId, "callout"), shapeId, targetId,
        shape: "cloud", bounds, visualStyle: { color: call.color, fill: "none", dash: "draw", size: "m" },
        visualRole: call.tool, durationMs: 220, stepId,
      });
      push({
        type: "write", actionId: actionId(call.localId, "callout-label"), shapeId, targetId,
        text: call.label, x: bounds.x + 12, y: bounds.y + 12,
        visualStyle: { color: call.color, size: "m" }, visualRole: call.tool, durationMs: 190, stepId,
      });
      continue;
    }

    if (call.tool === "drawNumberBadge") {
      let bounds = clampBounds(call.bounds, region);
      bounds = clampBounds(pushClearOf(bounds, obstacles), region);
      obstacles.push(bounds);
      const targetId = sourceTarget(call, allowedSources);
      push({
        type: "draw-shape", actionId: actionId(call.localId, "number"), shapeId, targetId,
        shape: "circle", bounds, visualStyle: { color: call.color, fill: "solid", dash: "draw", size: "s" },
        visualRole: call.tool, durationMs: 160, stepId,
      });
      push({
        type: "write", actionId: actionId(call.localId, "number-label"), shapeId, targetId,
        text: String(call.number), x: bounds.x + bounds.w / 3, y: bounds.y + bounds.h / 4,
        visualStyle: { color: "black", size: "s" }, visualRole: call.tool, durationMs: 130, stepId,
      });
    }
  }

  // The camera follows the active teaching region even if Claude elected to
  // spend all of its tool budget on strokes. This is the deterministic camera
  // guardrail around the agent, not a second visual interpretation.
  if (!actions.some(action => action.type === "move-camera")) {
    actions.unshift({
      type: "move-camera",
      actionId: `agent-${stepId}-camera-guardrail`,
      targetIds: request.step.activeTargetIds,
      retainContextTargetIds: request.step.retainContextTargetIds.filter(id => canvasShapeIds.has(id)),
      focusBounds: request.step.focusBounds,
      cameraIntent: request.step.cameraIntent,
      durationMs: 420,
      stepId,
    });
  }

  const groundedActions = actions.map(action => ({
    ...action,
    agentGrounding: {
      documentId: request.identity.documentId,
      pageTruthKey: request.identity.pageTruthKey,
      lessonId: request.identity.lessonId,
      stepId,
      conceptIds: "targetId" in action && action.targetId
        ? [action.targetId]
        : request.identity.groundedConceptIds,
    },
  } as ProfessorTeachingAction));

  return {
    actions: groundedActions,
    localIds: acceptedLocalIds,
    needsCorrection: response.assessment.needsCorrection,
    complete: response.complete,
    rejectedActionCount,
    model: response.model ?? null,
  };
}

export async function requestProfessorTldrawAgent(
  request: ProfessorTldrawAgentRequest,
  signal?: AbortSignal,
): Promise<ProfessorTldrawAgentResponse> {
  const response = await fetch("/api/professor-tldraw-agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const serverReason = payload?.reason;
    const reason: ProfessorAgentFailureReason = serverReason === "missing_key" || serverReason === "schema_reject"
      ? serverReason
      : "network_error";
    throw new ProfessorAgentRequestError(reason);
  }
  const parsed = ProfessorTldrawAgentResponseSchema.safeParse(payload);
  if (!parsed.success) throw new ProfessorAgentRequestError("schema_reject");
  return parsed.data;
}
