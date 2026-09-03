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
  // L15 (Whiteboard composable primitives) — drawCrossSection/shadeRegion
  // are deliberately just two more named roles on this SAME points-based
  // freehand tool, not new schema/renderer surface: a cross-section is a
  // closed contour (optionally with an internal divider stroke, drawn as a
  // second drawCrossSection call) and a shaded region is a closed, filled
  // area — both already exactly what this tool draws. Composable vocabulary
  // means new TEACHING semantics reuse the existing small set of rendering
  // primitives, not a growing renderer.
  tool: z.enum(["drawFreehandStroke", "drawAnatomySketch", "drawMuscle", "drawBone", "drawNerve", "drawHatching", "drawBrace", "drawBracket", "drawCrossSection", "shadeRegion"]),
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

// L15 (Whiteboard composable primitives) — a hand-drawn ring AROUND
// already-drawn content to direct attention to it, distinct from drawSymbol
// (which draws a new structural shape). Composable: reuses the exact same
// "circle" draw-shape rendering drawSymbol already has, just fill:"none"
// and its own visualRole so it's treated as a deliberately-unlabeled
// annotation (like drawPressureZone/highlightRegion) rather than an empty
// container needing its own label.
const CircleFeatureToolSchema = z.object({
  tool: z.literal("circleFeature"),
  localId: LocalIdSchema,
  sourceTargetId: z.string().max(160).nullable().optional(),
  bounds: AgentBoundsSchema,
  color: ColorSchema.default("red"),
  size: SizeSchema.default("m"),
});

// A strike/X mark over an existing wrong-answer or misconception region —
// pairs with a "warn" tone narration. Composable: synthesized as two
// crossing draw-freehand strokes from the given bounds at verification
// time (see verifyProfessorTldrawAgentResponse), so it needs no new
// renderer primitive — the agent only decides WHERE, not how to draw an X.
const CrossOutToolSchema = z.object({
  tool: z.literal("crossOutMisconception"),
  localId: LocalIdSchema,
  sourceTargetId: z.string().max(160).nullable().optional(),
  bounds: AgentBoundsSchema,
  color: ColorSchema.default("red"),
  size: SizeSchema.default("m"),
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
  CircleFeatureToolSchema,
  CrossOutToolSchema,
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
  // L18 — caller-supplied via ProfessorLessonPlan.sourceSnapshot.audience
  // (see buildProfessorTldrawAgentRequest below), never inferred here.
  // Optional and defaults to "adult" wherever it's read (the API route),
  // so a plan built before this field existed round-trips unchanged.
  audience: z.enum(["adult", "child"]).optional(),
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
    // Stabilization item 4B: the current step's own canonical current-page
    // evidence (ProfessorDirectorStep.sourceEvidence's exactText, already
    // grounded upstream to a real VSG node/Thought Unit via sourceId) — NOT
    // previously threaded into the agent request at all. Widens what counts
    // as grounded label vocabulary beyond this step's own spoken narration
    // (e.g. a page whose evidence names "nurses," "anesthesia," "residents"
    // even if the narration only says "the surgical team") without ever
    // letting the agent draw a label absent from the real page text.
    sourceEvidenceText: z.array(z.string().min(1).max(2000)).max(6).default([]),
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
  | "verification_reject" | "aborted" | "low_visual_richness"
  | "empty_containers" | "label_dependent_only";

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

function mergeAgentBoundsList(list: Bounds[]): Bounds | null {
  if (list.length === 0) return null;
  const x0 = Math.min(...list.map(b => b.x));
  const y0 = Math.min(...list.map(b => b.y));
  const x1 = Math.max(...list.map(b => b.x + b.w));
  const y1 = Math.max(...list.map(b => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export interface VisualDensityDiagnostic {
  /** Real teaching marks — freehand strokes, arrows, a genuinely self-
   *  labeled or deliberately-unlabeled-by-design shape (drawPressureZone/
   *  highlightRegion fills, drawCallout/drawNumberBadge — both always
   *  self-label via the same shapeId reused for their own write action),
   *  and any standalone label not merged onto a shape in this same list. */
  meaningfulPrimitiveCount: number;
  /** A drawSymbol-originated shape (rectangle/ellipse/diamond/hexagon/
   *  cloud/line) with no matching write action ever merged onto its own
   *  shapeId — "empty oval / empty rounded rectangle / empty container,"
   *  the correction's own named failure mode. */
  emptyContainerCount: number;
  /** Every draw-shape action in this list, empty or not — the denominator
   *  for judging whether empty containers are a MINORITY or the bulk of
   *  what got drawn. */
  totalShapeCount: number;
  /** The union bounding box of every real visual primitive actually drawn
   *  (freehand points, arrow endpoints, shape bounds) — "how much of the
   *  canvas is genuinely occupied," not the region the step was ALLOWED to
   *  draw in. */
  usedCanvasBounds: Bounds | null;
  /** This step's own focusBounds — the teaching region the camera frames,
   *  i.e. what "the viewport" means for this step. */
  activeTeachingBounds: Bounds | null;
  /** area(usedCanvasBounds) / area(activeTeachingBounds), 0 when either is
   *  null or degenerate. A low ratio is the direct, measurable version of
   *  "too much empty canvas remains." */
  canvasUtilizationRatio: number;
  /** L17 — draw-shape actions whose meaning depends ENTIRELY on an attached
   *  text label: a drawSymbol container (rectangle/ellipse/diamond/hexagon/
   *  cloud/line — labeled or not, its shape alone conveys nothing
   *  subject-specific), a drawCallout bubble, or a drawNumberBadge. Strip
   *  every label in the pass and each of these becomes an undifferentiated
   *  shape — this is the direct measure of the correction's "Reactants ->
   *  Products" failure mode (two labeled boxes joined by one arrow), which
   *  the pre-existing emptyContainerCount alone cannot catch: a LABELED
   *  generic box is "meaningful" by that check, even though its shape still
   *  carries no real teaching content once the label is gone. */
  labelDependentShapeCount: number;
  /** L17 — actions that convey real teaching meaning through their own
   *  geometry, independent of any attached text: every freehand stroke
   *  (drawFreehandStroke/drawAnatomySketch/.../drawCrossSection/shadeRegion/
   *  crossOutMisconception — all rendered as draw-freehand), every arrow
   *  (direction/relationship is visible without reading a label), and
   *  draw-shape actions whose role is drawPressureZone/highlightRegion/
   *  circleFeature (their size/position IS the point). Operationalizes the
   *  correction's own acceptance test: "if removing the text labels makes
   *  the Whiteboard meaningless, it isn't sufficiently visual." */
  labelIndependentMeaningfulCount: number;
}

/**
 * Correction (Whiteboard density) — "Add validation such as:
 * meaningfulPrimitiveCount / emptyContainerCount / usedCanvasBounds /
 * activeTeachingBounds / canvasUtilizationRatio." Operates on a whole
 * verified action list (one pass's worth), not a single action, because
 * "is this drawSymbol shape empty" depends on whether some OTHER action in
 * the same list (a writeLabel with attachToLocalId) ever merged text onto
 * it — see the attachToLocalId fix this same phase also shipped.
 */
export function computeVisualDensityDiagnostic(
  actions: ProfessorTeachingAction[],
  activeTeachingBounds: Bounds | null,
): VisualDensityDiagnostic {
  // L15 — circleFeature joins this set for the same reason as the original
  // two: it's an annotation ring drawn AROUND already-drawn content to
  // direct attention to it, not a new container that needs its own label.
  const DELIBERATELY_UNLABELED_ROLES = new Set(["drawPressureZone", "highlightRegion", "circleFeature"]);
  const drawShapeIds = new Set(
    actions.filter((a): a is Extract<ProfessorTeachingAction, { type: "draw-shape" }> => a.type === "draw-shape").map(a => a.shapeId),
  );
  const shapeIdsWithText = new Set(
    actions.filter((a): a is Extract<ProfessorTeachingAction, { type: "write" }> => a.type === "write" && a.text.trim().length > 0)
      .map(a => a.shapeId),
  );

  // L17 — draw-shape roles whose SHAPE alone (independent of any attached
  // text) conveys no subject-specific meaning. A drawCallout/drawNumberBadge
  // is always "self-labeled" (meaningfulPrimitiveCount already counts it,
  // never emptyContainerCount), but that alone doesn't survive this
  // correction's own acceptance test — strip the label and both are just an
  // undifferentiated cloud/circle. drawSymbol joins them regardless of
  // whether IT happens to be labeled or empty, for the same reason.
  const LABEL_DEPENDENT_ROLES = new Set(["drawSymbol", "drawCallout", "drawNumberBadge"]);

  let meaningfulPrimitiveCount = 0;
  let emptyContainerCount = 0;
  let totalShapeCount = 0;
  let labelDependentShapeCount = 0;
  let labelIndependentMeaningfulCount = 0;
  const boundsList: Bounds[] = [];

  for (const action of actions) {
    if (action.type === "draw-freehand") {
      meaningfulPrimitiveCount++;
      labelIndependentMeaningfulCount++;
      if (action.points.length > 0) {
        const xs = action.points.map(p => p.x);
        const ys = action.points.map(p => p.y);
        boundsList.push({
          x: Math.min(...xs), y: Math.min(...ys),
          w: Math.max(1, Math.max(...xs) - Math.min(...xs)),
          h: Math.max(1, Math.max(...ys) - Math.min(...ys)),
        });
      }
    } else if (action.type === "draw-arrow") {
      meaningfulPrimitiveCount++;
      labelIndependentMeaningfulCount++;
      boundsList.push({
        x: Math.min(action.from.x, action.to.x), y: Math.min(action.from.y, action.to.y),
        w: Math.max(1, Math.abs(action.to.x - action.from.x)), h: Math.max(1, Math.abs(action.to.y - action.from.y)),
      });
    } else if (action.type === "write") {
      // A write action whose shapeId matches a draw-shape action in this
      // SAME list is a merged/attached label — already reflected via that
      // shape's own self-labeled check below, not counted twice.
      if (!drawShapeIds.has(action.shapeId) && action.text.trim().length > 0) meaningfulPrimitiveCount++;
    } else if (action.type === "draw-shape") {
      totalShapeCount++;
      boundsList.push(action.bounds);
      const isDeliberatelyUnlabeled = action.visualRole ? DELIBERATELY_UNLABELED_ROLES.has(action.visualRole) : false;
      const isSelfLabeled = shapeIdsWithText.has(action.shapeId);
      if (isDeliberatelyUnlabeled || isSelfLabeled) meaningfulPrimitiveCount++;
      else emptyContainerCount++;
      // L17 — independent of the empty-container check above: does this
      // shape's own GEOMETRY carry meaning, or only its (possibly present)
      // label? isDeliberatelyUnlabeled roles are sized/positioned emphasis
      // marks — meaningful with or without text. LABEL_DEPENDENT_ROLES are
      // generic containers whose text IS the only content, labeled or not.
      if (isDeliberatelyUnlabeled) labelIndependentMeaningfulCount++;
      else if (action.visualRole && LABEL_DEPENDENT_ROLES.has(action.visualRole)) labelDependentShapeCount++;
    }
  }

  const usedCanvasBounds = mergeAgentBoundsList(boundsList);
  const usedArea = usedCanvasBounds ? usedCanvasBounds.w * usedCanvasBounds.h : 0;
  const teachingArea = activeTeachingBounds ? activeTeachingBounds.w * activeTeachingBounds.h : 0;
  const canvasUtilizationRatio = teachingArea > 0 ? usedArea / teachingArea : 0;

  return {
    meaningfulPrimitiveCount, emptyContainerCount, totalShapeCount, usedCanvasBounds, activeTeachingBounds, canvasUtilizationRatio,
    labelDependentShapeCount, labelIndependentMeaningfulCount,
  };
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
    audience: args.plan.sourceSnapshot.audience,
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
      sourceEvidenceText: step.sourceEvidence.map(evidence => evidence.exactText.slice(0, 2000)),
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

// ── Label grounding ──────────────────────────────────────────────────────────
// Loosened from a pure allowedLabels exact-match: a label/callout is grounded
// if it's either (a) one of the deterministic plan's own pre-existing write-
// action strings (the original, still-supported fast path), OR (b) a phrase
// that genuinely occurs in this SAME step's own narration, relationship
// labels, or canonical current-page source evidence — text OpenAI's Director
// already wrote (narration/relationships) or that is literally present on
// the page and already grounded to a real VSG node/Thought Unit via sourceId
// (sourceEvidenceText — see ProfessorDirectorStep.sourceEvidence). This is
// what lets Claude decompose one coarse deterministic label (e.g.
// "Reactants") into the finer-grained sub-entities the narration OR the
// source page already names (e.g. "Na+", "Cl-", "Nurses", "Anesthesia" —
// real entities the narration summarized as "the surgical team" but the
// page's own text names individually) without opening the door to inventing
// anything neither the Director nor the source page ever said. A candidate
// that appears nowhere in allowedLabels/narration/relationships/source
// evidence is still rejected exactly as before — this widens the SOURCE of
// grounded vocabulary, it does not remove the grounding requirement itself.
function normalizeForGrounding(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9%+\-/() ]+/g, " ").replace(/\s+/g, " ").trim();
}

function buildGroundedTextBlob(step: ProfessorTldrawAgentRequest["step"]): string {
  return normalizeForGrounding([
    ...step.allowedLabels,
    step.narration,
    ...step.relationships.map(relationship => relationship.label ?? ""),
    ...step.sourceEvidenceText,
  ].join(" "));
}

/** True when `text` is either an exact allowedLabels string, or a short
 *  (>=3 normalized chars, so a stray single token can't vacuously match)
 *  phrase that literally occurs in this step's own narration, relationship
 *  labels, or canonical source evidence text. Exported for direct unit
 *  coverage, independent of the full verification pass. */
export function isGroundedLabelText(text: string, allowedLabels: Set<string>, groundedTextBlob: string): boolean {
  if (allowedLabels.has(text)) return true;
  const normalized = normalizeForGrounding(text);
  if (normalized.length < 3) return false;
  return groundedTextBlob.includes(normalized);
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
  const groundedTextBlob = buildGroundedTextBlob(request.step);
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
    if (call.tool === "writeLabel" && !isGroundedLabelText(call.text, allowedLabels, groundedTextBlob)) { rejectedActionCount++; continue; }
    if (call.tool === "drawCallout" && !isGroundedLabelText(call.label, allowedLabels, groundedTextBlob)) { rejectedActionCount++; continue; }
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
    if (call.tool === "drawFreehandStroke" || call.tool === "drawAnatomySketch" || call.tool === "drawMuscle" || call.tool === "drawBone" || call.tool === "drawNerve" || call.tool === "drawHatching" || call.tool === "drawBrace" || call.tool === "drawBracket" || call.tool === "drawCrossSection" || call.tool === "shadeRegion") {
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
      // Correction (Whiteboard density) — attachToLocalId used to be parsed
      // but never actually used: this write action always got its OWN
      // shapeId (derived from call.localId, the label's own local id), so
      // every "writeLabel ... attachToLocalId: X" call still produced an
      // independent floating text shape next to a permanently empty symbol
      // — X's own draw-shape action never gets a `text` field from
      // anywhere else. computeCanvasStateAtStep only merges a write
      // action's text onto a shape when their shapeIds MATCH, the same
      // convention the deterministic pipeline already relies on
      // (buildProfessorTeachingActions.ts reuses one shapeId for both a
      // node's outline and its label). When attachToLocalId names a real,
      // already-accepted local id (drawn earlier this pass or a prior
      // one), redirect this write action's shapeId to match it instead —
      // an unresolvable/hallucinated attachToLocalId falls back to the
      // original independent-label behavior rather than trusting an
      // unverified target.
      const attachedShapeId = call.attachToLocalId && reservedLocalIds.has(call.attachToLocalId)
        ? stableShapeId(stepId, call.attachToLocalId)
        : null;
      if (!attachedShapeId) {
        const labelBox = pushClearOf({ x, y, w: estimateLabelWidth(call.text), h: estimateLabelHeight(call.text) }, obstacles);
        const clamped = clampBounds(labelBox, region);
        x = clamped.x;
        y = clamped.y;
        obstacles.push(clamped);
      }
      push({
        type: "write",
        actionId: actionId(call.localId, "label"),
        shapeId: attachedShapeId ?? shapeId,
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
      continue;
    }

    if (call.tool === "circleFeature") {
      const bounds = clampBounds(call.bounds, region);
      push({
        type: "draw-shape",
        actionId: actionId(call.localId, "circle-feature"),
        shapeId,
        targetId: sourceTarget(call, allowedSources),
        shape: "circle",
        bounds,
        visualStyle: { color: call.color, fill: "none", dash: "draw", size: call.size },
        visualRole: call.tool,
        durationMs: 200,
        stepId,
      });
      continue;
    }

    if (call.tool === "crossOutMisconception") {
      // Synthesized, not agent-drawn: the agent decides WHERE (bounds) and
      // the verifier draws the actual X as two crossing freehand strokes —
      // same "composable, not a growing renderer" reasoning as
      // drawCrossSection/shadeRegion above, just synthesized here instead
      // of left to the agent's own stroke points.
      //
      // KNOWN LIMITATION: the two strokes get distinct shapeIds (`-a`/`-b`
      // suffixes on this call's own stableShapeId) because tldraw needs a
      // unique record id per visible shape — reusing one bare shapeId here
      // would make the second createShape silently replace the first
      // (unlike drawCallout/drawNumberBadge's shape+label pair, where the
      // "write" action is special-cased to MERGE onto an existing shapeId
      // rather than create an independent record). The cost: eraseRegion's
      // `stableShapeId(stepId, call.targetLocalId)` computes the bare id,
      // so it cannot currently find/remove either suffixed stroke — a
      // crossOutMisconception mark this pass creates is not erasable by
      // this same pass's inspect step. Narrow enough (the deterministic
      // per-step rebuild already clears the whole teaching layer between
      // steps) to accept for this phase rather than reworking erase to
      // track one-to-many localId->shapeId — flag for L16/L17 if the
      // agent's own inspect pass turns out to need it.
      const bounds = clampBounds(call.bounds, region);
      const targetId = sourceTarget(call, allowedSources);
      const strokeStyle = { color: call.color, size: call.size, dash: "draw" as const, fill: "none" as const };
      push({
        type: "draw-freehand",
        actionId: actionId(call.localId, "crossout-a"),
        shapeId: `${shapeId}-a`,
        targetId,
        points: [{ x: bounds.x, y: bounds.y }, { x: bounds.x + bounds.w, y: bounds.y + bounds.h }],
        visualStyle: strokeStyle,
        visualRole: call.tool,
        isPen: true,
        closed: false,
        durationMs: 180,
        stepId,
      });
      push({
        type: "draw-freehand",
        actionId: actionId(call.localId, "crossout-b"),
        shapeId: `${shapeId}-b`,
        targetId,
        points: [{ x: bounds.x + bounds.w, y: bounds.y }, { x: bounds.x, y: bounds.y + bounds.h }],
        visualStyle: strokeStyle,
        visualRole: call.tool,
        isPen: true,
        closed: false,
        durationMs: 180,
        stepId,
      });
      continue;
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
