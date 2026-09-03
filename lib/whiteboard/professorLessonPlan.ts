// lib/whiteboard/professorLessonPlan.ts
// Types for the "professor performance" teaching engine — replaces the old
// concept-map-that-fades-in model (lib/whiteboard/teachingTimeline.ts,
// retired). tldraw is the renderer only (strokes/arrows/shapes/labels/camera/
// visibility); this module defines what gets drawn, said, and when.
//
// Design split, mirroring the Surgeon Annotation pipeline's "AI proposes
// meaning, deterministic code proposes geometry" principle: OpenAI never
// invents canvas coordinates. It receives the already-built, already-laid-out
// VisualSceneGraph (node/edge ids + short source text) and returns a
// ProfessorLessonScript — short hand-written phrases, a spoken teaching
// narration per node/edge, tone/pacing, and which single point is the
// "high-yield" one to circle. lib/whiteboard/buildProfessorTeachingActions.ts
// then converts that script + the VSG's real positions into the actual
// ProfessorTeachingAction[] timeline tldraw executes.

import { z } from "zod";
import type { SpeechContentRole } from "@/lib/speech/speechContentRole";

// ── Geometry primitives ─────────────────────────────────────────────────────

export interface Point { x: number; y: number; }
export interface Bounds { x: number; y: number; w: number; h: number; }

export const ProfessorSurfaceSchema = z.enum(["pdf", "whiteboard"]);
export type ProfessorSurface = z.infer<typeof ProfessorSurfaceSchema>;

export const CameraIntentSchema = z.enum([
  "stay-on-pdf",
  "active-concept",
  "keep-context",
  "comparison",
  "follow-sequence",
  "summary-overview",
]);
export type CameraIntent = z.infer<typeof CameraIntentSchema>;

/** Domain-neutral semantic structures. The planner classifies the current
 * page from its evidence, never from the book title, then selects the
 * smallest useful combination for each teaching step. */
export const TeachingStructureSchema = z.enum([
  "definition-concept",
  "mechanism-causal-process",
  "sequence-procedure",
  "comparison-contrast",
  "classification-hierarchy",
  "anatomy-spatial-relationship",
  "equation-calculation",
  "worked-example-problem-solving",
  "timeline-history",
  "argument-evidence",
  "narrative-event-sequence",
  "decision-tree",
  "diagnostic-reasoning",
  "table-data-interpretation",
  "figure-image-interpretation",
  "exception-trap-warning",
  "synthesis-summary",
]);
export type TeachingStructure = z.infer<typeof TeachingStructureSchema>;

/** Renderer-safe visual styling shared by deterministic actions and the
 * constrained runtime tldraw Agent. These are tldraw's built-in style names,
 * not arbitrary CSS/model output. */
export type ProfessorVisualColor =
  | "black" | "grey" | "blue" | "light-blue" | "green" | "light-green"
  | "yellow" | "orange" | "red" | "violet";
export type ProfessorVisualSize = "s" | "m" | "l" | "xl";
export type ProfessorVisualDash = "draw" | "solid" | "dashed" | "dotted";
export type ProfessorVisualFill = "none" | "semi" | "solid" | "pattern";
export interface ProfessorVisualStyle {
  color?: ProfessorVisualColor;
  size?: ProfessorVisualSize;
  dash?: ProfessorVisualDash;
  fill?: ProfessorVisualFill;
}
export interface ProfessorFreehandPoint extends Point {
  /** Normalized pen pressure. Omitted points use a stable mid-pressure. */
  z?: number;
}

// ── ProfessorTeachingAction — the deterministic, replayable drawing timeline ─
// Every action carries a stable actionId (referenced by NarrationSegment.
// linkedActionIds) and a durationMs (pacing for autoplay/Previous-Next). The
// user-facing spec didn't put these on every variant explicitly; they're
// added uniformly because a real playback engine needs both on every action
// to be deterministic and controllable — documented here rather than left
// implicit.

// stepId (Phase B2): every action belongs to exactly ONE teaching step — a
// single narrated point (or the intro/closing) — set by
// buildProfessorTeachingActions.ts. Lets Previous/Next navigate by
// pedagogical unit ("speak + write + draw + connect + emphasize" together)
// instead of by raw micro-action, and lets the playback scheduler know which
// actions belong to the SAME step for draw-while-teaching interleaving. See
// lib/whiteboard/professorTimelineEngine.ts's step-boundary helpers.
export interface ProfessorAgentGrounding {
  documentId: string;
  pageTruthKey: string;
  lessonId: string;
  stepId: number;
  conceptIds: string[];
}

export type ProfessorTeachingAction = (
  | { type: "write"; actionId: string; shapeId: string; targetId?: string; text: string; x: number; y: number; durationMs: number; stepId: number; visualStyle?: ProfessorVisualStyle; visualRole?: string }
  // bend: Phase B2 connector-obstacle-avoidance — a nonzero value curves
  // the arrow (tldraw's own native "bend" arc prop) around a third node's
  // box the straight from->to line would otherwise cross. 0/omitted means
  // a straight line, unchanged from Phase B1.
  | { type: "draw-arrow"; actionId: string; shapeId: string; targetId?: string; from: Point; to: Point; durationMs: number; bend?: number; relationshipKind?: RelationshipKind; stepId: number; visualStyle?: ProfessorVisualStyle; visualRole?: string }
  // "circle"/"box" map to tldraw's ellipse/rectangle geo shapes (the only
  // two ever produced before this comment was added). "diamond"/"hexagon"/
  // "cloud" are real, additional tldraw geo shapes — decision points, traps/
  // warnings, and clinical pearls now get their OWN distinct shape, not just
  // a different fill color on an identical rectangle. See
  // shapeKindForNode() in buildProfessorTeachingActions.ts for the mapping.
  // spatialIntent/teachingRole: semantic metadata from the AI script (see
  // SpatialIntentSchema/TeachingRoleSchema below). Deterministic code maps
  // spatialIntent to regions and teachingRole to the stable color vocabulary;
  // neither field ever contains coordinates or renderer-specific values.
  | { type: "draw-shape"; actionId: string; shapeId: string; targetId?: string; shape: "circle" | "box" | "brace" | "line" | "diamond" | "hexagon" | "cloud"; bounds: Bounds; durationMs: number; spatialIntent?: SpatialIntent; teachingRole?: TeachingRole; stepId: number; visualStyle?: ProfessorVisualStyle; visualRole?: string; opacity?: number }
  /** Native tldraw pressure-sensitive draw shape. Runtime Claude tool calls
   * are verified and clamped before they can become this action. Also used
   * (correction: Whiteboard visual language) by the deterministic converter
   * itself for ordinary concept-node outlines — see buildOrganicRectanglePoints/
   * buildOrganicEllipsePoints in organicOutline.ts and shapeKindForNode() in
   * buildProfessorTeachingActions.ts — so an organic box/circle outline gets
   * genuine pencil character AND the same M7 progressive stroke-by-stroke
   * reveal every other freehand mark already has, for free. `bounds`/
   * `teachingRole` are optional pass-through metadata for that case only —
   * computeCanvasStateAtStep copies them into ShapeVisualState purely so
   * emphasis-overlay anchoring (which reads shape.bounds) and semantic
   * coloring (which reads shape.teachingRole) keep working exactly as they
   * did when this same node was a draw-shape action; rendering itself still
   * always draws from `points`, never from `bounds`. */
  | { type: "draw-freehand"; actionId: string; shapeId: string; targetId?: string; points: ProfessorFreehandPoint[]; durationMs: number; stepId: number; visualStyle?: ProfessorVisualStyle; visualRole?: string; isPen?: boolean; closed?: boolean; opacity?: number; bounds?: Bounds; teachingRole?: TeachingRole; spatialIntent?: SpatialIntent }
  | { type: "emphasize"; actionId: string; targetId: string; treatment: "circle" | "underline" | "pulse" | "highlight" | "number" | "crossOut"; sequenceNumber?: number; durationMs: number; stepId: number }
  | { type: "speak"; actionId: string; segmentId: string; text: string; durationMs: number; stepId: number }
  | { type: "pause"; actionId: string; durationMs: number; stepId: number }
  | { type: "move-camera"; actionId: string; targetIds: string[]; durationMs: number; stepId: number; focusBounds?: Bounds; cameraIntent?: CameraIntent; retainContextTargetIds?: string[] }
  | { type: "set-surface"; actionId: string; surface: ProfessorSurface; reason: "source-passage" | "visual-lesson" | "return-to-source" | "summary"; durationMs: number; stepId: number }
  /** Removes a previously-drawn shape from the canvas from this point in the
   *  timeline forward — e.g. clearing a rough sketch before drawing the
   *  clean version. Handled by computeCanvasStateAtStep exactly like every
   *  other action: state-at-step is recomputed from scratch, so an erase is
   *  just "this shapeId's entry doesn't exist for index >= this action's". */
  | { type: "erase"; actionId: string; targetShapeId: string; durationMs: number; stepId: number }
) & { agentGrounding?: ProfessorAgentGrounding };

// ── NarrationSegment — the spoken teaching script, tightly linked to actions ─

export const NarrationToneSchema = z.enum(["introduce", "explain", "warn", "connect", "question"]);
export type NarrationTone = z.infer<typeof NarrationToneSchema>;

export const NarrationPaceSchema = z.enum(["slow", "normal"]);
export type NarrationPace = z.infer<typeof NarrationPaceSchema>;

export interface NarrationSegment {
  id: string;
  text: string;
  tone: NarrationTone;
  pace: NarrationPace;
  pauseAfterMs: number;
  linkedActionIds: string[];
  /** Explicit source-vs-commentary boundary. Director source-passage phases
   *  are SOURCE_VERBATIM; explanation/checkpoint phases are
   *  PROFESSOR_EXPLANATION. Current Page remains an independent, fully
   *  source-faithful speech path. */
  contentRole: SpeechContentRole;
}

// ── ProfessorLessonScript — the AI-authored, VSG-grounded input ─────────────
// OpenAI annotates EXISTING VisualSceneGraph node/edge ids with a short
// hand-written label + spoken narration. It never proposes x/y/bounds — the
// deterministic VSG layout (lib/whiteboard/layoutAdapters.ts) already owns
// those, exactly as groundSurgeonQuotes.ts's exactQuote-only contract keeps
// OpenAI out of the coordinate business for PDF highlights.

export const VisualGrammarChoiceSchema = z.enum([
  "definition", "procedure", "mechanism", "anatomy", "diagnosis", "comparison", "equation", "concept-map",
  "hierarchy", "timeline", "argument", "narrative", "decision-tree", "data-interpretation", "figure-interpretation", "summary",
]);
export type VisualGrammarChoice = z.infer<typeof VisualGrammarChoiceSchema>;

// ── ExplanationAction — a small "professor's aside" mini-diagram drawn while
// narrating ONE nodeScript point, e.g. while explaining WHY hypothermia can
// buy the brain time: "↓ metabolism" -> "↓ O2 demand" written and arrowed in
// beside the main box, not just a bigger flowchart node. This is the bridge
// from "draws labels of the explanation" to "draws the explanation" the user
// asked for — the AI proposes a short SEQUENCE of pedagogical micro-actions
// (write a fragment, drop in an icon, arrow between two of them, circle one),
// never pixels; lib/whiteboard/buildProfessorTeachingActions.ts places this
// chain deterministically beside the node it belongs to.
//
// One flat, fully-nullable shape (not a discriminated union) — every field
// is present on every action regardless of `type`, with `null` where a field
// doesn't apply to that type. This is the same "always present" discipline
// `emphasize` above documents, applied to a variant shape: OpenAI Structured
// Outputs strict mode requires a schema's `required` list to name literally
// every property with no omissions, and (unlike TypeScript) does not narrow
// per-branch of a union the way `emphasize: false` elsewhere in this file
// wouldn't need touching — a nullable flat object sidesteps needing strict
// mode's less-common anyOf/discriminated-union support entirely.
export const ExplainActionTypeSchema = z.enum(["write", "icon", "arrow", "emphasize"]);
export type ExplainActionType = z.infer<typeof ExplainActionTypeSchema>;

// Closed, deterministic-glyph vocabulary — the model picks a KEY (meaning),
// buildProfessorTeachingActions.ts picks the actual unicode glyph rendered
// (an EXPLAIN_ICON_GLYPH lookup), matching "AI proposes meaning, code
// proposes the visual" everywhere else in this pipeline.
export const ExplainIconSchema = z.enum([
  "thermometer", "heart", "brain", "lungs", "warning",
  "arrowDown", "arrowUp", "clock", "snowflake", "checkmark", "xmark",
  // Phase B1 additions — a few domain-general symbols (this app teaches more
  // than one subject), still a closed, deterministic-glyph vocabulary.
  "lightbulb", "flag", "scale", "link",
]);
export type ExplainIcon = z.infer<typeof ExplainIconSchema>;

// Deliberately a SUBSET of professorLessonPlan's full emphasize-treatment
// vocabulary — "pulse"/"number" stay reserved for the deterministic,
// non-AI-chosen treatments buildProfessorTeachingActions.ts already applies
// from VSG role/tier data (step numbering, danger highlighting); the model
// only ever gets to ask for the four treatments a professor would actually
// gesture with mid-explanation.
export const ExplainEmphasisStyleSchema = z.enum(["circle", "underline", "crossOut", "highlight"]);
export type ExplainEmphasisStyle = z.infer<typeof ExplainEmphasisStyleSchema>;

export const ExplanationActionSchema = z.object({
  type: ExplainActionTypeSchema,
  /** write/icon only — a short LOCAL id (unique within this ONE nodeScript
   *  entry's explain[] array, never global) that a LATER arrow/emphasize
   *  action in the SAME array can reference via from/to/target. null on
   *  arrow/emphasize actions, which never introduce their own id. */
  id:     z.string().max(20).nullable(),
  /** write only — a short fragment, e.g. "↓ metabolism", NOT a sentence. */
  text:   z.string().max(40).nullable(),
  /** icon only. */
  icon:   ExplainIconSchema.nullable(),
  /** icon only — a short caption drawn beside the glyph. */
  label:  z.string().max(24).nullable(),
  /** arrow only — "self" (this nodeScript's own point) or an id declared by
   *  an EARLIER write/icon action in this SAME explain[] array. Grounding
   *  drops any arrow whose from/to isn't already-declared at that point —
   *  forward references and cross-step references are never honored. */
  from:   z.string().max(20).nullable(),
  /** arrow only — see `from`. */
  to:     z.string().max(20).nullable(),
  /** emphasize only — "self" or an earlier explain[] id, same rule as `from`. */
  target: z.string().max(20).nullable(),
  /** emphasize only. */
  style:  ExplainEmphasisStyleSchema.nullable(),
});
export type ExplanationAction = z.infer<typeof ExplanationActionSchema>;

// ── Teaching-arc role — closes the gap between a loose group type (below)
// and a real per-point pedagogical stage. TldrawCanvas maps this meaning to
// one stable color across lessons; the model still never chooses a color.
export const TeachingRoleSchema = z.enum([
  "definition", "mechanism", "consequence", "application", "warning", "summary", "reinforcement", "context",
]);
export type TeachingRole = z.infer<typeof TeachingRoleSchema>;

// ── Spatial intent — where this idea belongs in the board's COMPOSITION,
// never a coordinate. The model may say "this is a left branch" or "this is
// the warning aside," never "put this at x=400." groupLayout.ts maps the
// intent into deterministic lanes, measures boxes, and resolves collisions.
export const SpatialIntentSchema = z.enum([
  "left-branch", "right-branch", "central-mechanism", "warning-aside", "comparison-column", "final-summary",
]);
export type SpatialIntent = z.infer<typeof SpatialIntentSchema>;

// ── Drawing intent — a semantic hint for WHICH kind of mark best represents
// this point, consumed by shapeKindForNode() in buildProfessorTeachingActions.ts
// as a fallback once tier/role-derived rules (danger/pearl/decision/hub) have
// already had first say — those still win; drawingIntent only decides shape
// for the ordinary case that would otherwise always default to a plain box.
export const DrawingIntentSchema = z.enum(["definition", "chain", "contrast", "callout", "sequence", "plain"]);
export type DrawingIntent = z.infer<typeof DrawingIntentSchema>;

// ── Emphasis treatment — what the ONE emphasized point (see `emphasize`
// below) should actually look like. Previously hardcoded to always "circle"
// regardless of context; a misconception being debunked reads better as
// crossOut, a danger as highlight, a formula or exact phrase worth quoting
// verbatim as underline. Only meaningful when emphasize is true —
// groundProfessorLesson.ts forces "none" on every non-winning entry.
// Correction (Whiteboard visual language) — "underline" was already a real,
// distinctly-rendered emphasize.treatment (see emphasisOverlaySpec in
// TldrawCanvas.tsx) and already choosable inside an explain[] mini-diagram
// (ExplainEmphasisStyleSchema above), but was never reachable here at the
// top level — the model had no way to request it for the ONE emphasized
// point of a lesson, so it silently never got used.
export const EmphasisTreatmentChoiceSchema = z.enum(["circle", "crossOut", "highlight", "underline", "none"]);
export type EmphasisTreatmentChoice = z.infer<typeof EmphasisTreatmentChoiceSchema>;

// ── RelationshipKind — an AI-authored semantic link to ANOTHER node in this
// SAME script, distinct from the deterministic VSGEdge network VisualSceneGraph
// already carries. The AI proposes meaning (which two ideas connect, and
// how); buildProfessorTeachingActions.ts resolves the actual arrow geometry
// via the already-computed node bounds — never a coordinate the model
// invented, never a raw tldraw shape id.
export const RelationshipKindSchema = z.enum([
  "supports", "causes", "contrasts", "leads-to", "part-of", "warns-about",
]);
export type RelationshipKind = z.infer<typeof RelationshipKindSchema>;

export const ProfessorRelationshipSchema = z.object({
  /** Must name another node's targetId already present in nodeScripts —
   *  anything else (a hallucinated id, an edge id, a self-reference) is
   *  dropped by groundProfessorLesson.ts, never rendered. */
  targetId: z.string().min(1),
  kind:     RelationshipKindSchema,
  /** Optional short caption drawn at the connector's midpoint — falls back
   *  to a deterministic label derived from `kind` when null. */
  label:    z.string().max(24).nullable(),
});
export type ProfessorRelationship = z.infer<typeof ProfessorRelationshipSchema>;

export const ProfessorNodeScriptSchema = z.object({
  /** Must reference a real VisualSceneGraph node.id or edge.id — anything
   *  else is dropped by groundProfessorLesson.ts, never rendered. */
  targetId:   z.string().min(1),
  /** Short, hand-written phrase — clamped to <=8 words by the grounding
   *  layer regardless of what the model returns; never a full sentence. */
  shortLabel: z.string().min(1).max(80),
  /** Conversational spoken teaching line for this point — not textbook prose. */
  narration:  z.string().min(1).max(500),
  tone:       NarrationToneSchema,
  pace:       NarrationPaceSchema,
  /** At most one node/edge across the whole script should set this true —
   *  the single "circle the high-yield point" moment. Enforced (not just
   *  requested) by groundProfessorLesson.ts, which keeps only the first.
   *  Required (not optional+default) — OpenAI Structured Outputs strict
   *  mode requires every property to always be present; the prompt already
   *  instructs the model to explicitly set this false everywhere else. */
  emphasize:  z.boolean(),
  /** Optional mini-diagram narrated alongside THIS point — see
   *  ExplanationActionSchema above. Required key (may be an empty array) for
   *  the same Structured-Outputs-strict-mode reason as `groups` on
   *  ProfessorLessonScriptSchema below; node-target entries only — an
   *  edge-target nodeScript entry with a non-empty explain[] is dropped by
   *  groundProfessorLesson.ts (a connector doesn't get its own aside). */
  explain:    z.array(ExplanationActionSchema).max(6),
  /** This point's stage in the teaching arc — see TeachingRoleSchema. */
  teachingRole:  TeachingRoleSchema,
  /** Where this idea belongs in the board's composition — see
   *  SpatialIntentSchema. Meaning only, never a coordinate. */
  spatialIntent: SpatialIntentSchema,
  /** A hint for which kind of mark best represents this point — see
   *  DrawingIntentSchema. */
  drawingIntent: DrawingIntentSchema,
  /** What the emphasize:true treatment should look like for this point —
   *  see EmphasisTreatmentChoiceSchema. Ignored when emphasize is false. */
  emphasisTreatment: EmphasisTreatmentChoiceSchema,
  /** Up to 3 explicit semantic links to OTHER nodes this script narrates,
   *  additional to (never replacing) the VisualSceneGraph's own deterministic
   *  edges — see ProfessorRelationshipSchema. Required (may be empty) for the
   *  same Structured-Outputs-strict-mode reason as `explain`/`groups`. */
  relationships: z.array(ProfessorRelationshipSchema).max(3),
  /** Canonical VSG node ids supporting this step. The grounding layer drops
   * anything outside the current page and always restores the target node as
   * a minimum evidence anchor. */
  sourceEvidence: z.array(z.string().min(1)).min(1).max(4),
  teachingGoal: z.string().min(1).max(240),
  teachingStructure: TeachingStructureSchema,
  /** False keeps Professor on the PDF for this Thought Unit. No drawing or
   * camera action is emitted for a verbal-only step. */
  visualNeeded: z.boolean(),
  visualIntent: z.string().min(1).max(240),
  cameraIntent: CameraIntentSchema,
  checkpoint: z.string().min(1).max(240).nullable(),
});
type StrictProfessorNodeScript = z.infer<typeof ProfessorNodeScriptSchema>;
type DirectorNodeFields = "sourceEvidence" | "teachingGoal" | "teachingStructure" | "visualNeeded" | "visualIntent" | "cameraIntent" | "checkpoint";
/** Runtime Structured Output requires every Director field. The optionality
 * here is TypeScript-only backward compatibility for persisted v1-v6 plans
 * and older deterministic fixtures; groundProfessorLesson always expands
 * them to explicit v7 values before execution. */
export type ProfessorNodeScript = Omit<StrictProfessorNodeScript, DirectorNodeFields>
  & Partial<Pick<StrictProfessorNodeScript, DirectorNodeFields>>;

// ── ProfessorGroup — semantic organization, NOT geometry ────────────────────
// The bridge between "AI decides meaning" and "deterministic code decides
// pixels": the model assigns every node to ONE semantic region and gives the
// regions a build order (the same order a professor would physically
// construct that part of the board, top-to-bottom) — it still never touches
// x/y/width/height. lib/whiteboard/groupLayout.ts consumes this to place
// regions before placing nodes within them, and buildProfessorTeachingActions
// .ts draws in (group.order, position within group) sequence so the spatial
// layout and the spoken narrative order can never diverge (previously: VSG
// layout used importance-sorted order while the teaching script used its own
// narrative order — two different orderings driving one board).
export const GroupTypeSchema = z.enum([
  "core",       // the page's central idea/anchor — usually one group, drawn first
  "mechanism",  // a causal chain / how-it-works explanation
  "sequence",   // an ordered set of steps
  "comparison", // two or more things being contrasted, side by side
  "clinical",   // clinical significance / application / decision point
  "warning",    // a trap, exception, or danger — reads as set apart from the main flow
  "summary",    // a closing synthesis point, drawn last
  "hierarchy",  // parent/child classification
  "timeline",   // chronological events and consequences
  "argument",   // claim/evidence/reasoning
  "narrative",  // character/event progression
  "data",       // table/chart/figure interpretation
]);
export type GroupType = z.infer<typeof GroupTypeSchema>;

export const ProfessorGroupSchema = z.object({
  id:   z.string().min(1),
  type: GroupTypeSchema,
  /** 1-based build order across ALL groups in this script — the order the
   *  professor would physically move through the board, top-to-bottom.
   *  Should match the order nodeScripts narrates its member nodes in. */
  order: z.number().int().positive(),
  /** Every VSG NODE id (never an edge id) this group contains. A node
   *  omitted from every group, or double-assigned to more than one, is
   *  resolved deterministically by groundProfessorLesson.ts (first group
   *  wins; an unassigned node falls into a canonicalType-derived group) —
   *  never a reason to drop the node from the lesson entirely. */
  nodeIds: z.array(z.string().min(1)),
});
export type ProfessorGroup = z.infer<typeof ProfessorGroupSchema>;

export const ProfessorLessonScriptSchema = z.object({
  pageTruthKey:      z.string().min(1),
  visualGrammar:     VisualGrammarChoiceSchema,
  teachingStructures: z.array(TeachingStructureSchema).min(1).max(4),
  /** Short hand-written title, e.g. "ASPIRIN OVERDOSE" — 2-6 words. */
  title:             z.string().min(1).max(50),
  /** The motivating question written under the title before any mechanism
   *  is drawn. It frames the board around something the explanation will
   *  answer, instead of opening with a pre-built diagram. */
  centralQuestion:   z.string().min(1).max(160),
  /** One sentence: what the student should be able to do after this lesson.
   *  Spoken as its own intro segment, right after the title. */
  learningObjective: z.string().min(1).max(300),
  nodeScripts:       z.array(ProfessorNodeScriptSchema).min(1).max(20),
  /** Semantic organization of the SAME nodes nodeScripts narrates — see
   *  ProfessorGroupSchema above. Required (Structured Outputs strict mode)
   *  but MAY be an empty array; groundProfessorLesson.ts synthesizes a
   *  deterministic fallback grouping in that case, so downstream layout
   *  never has to special-case "no groups." */
  groups:            z.array(ProfessorGroupSchema),
  /** The lesson's closing "one synthesis question." */
  synthesisQuestion: z.string().min(1).max(240),
});
type StrictProfessorLessonScript = z.infer<typeof ProfessorLessonScriptSchema>;
export type ProfessorLessonScript = Omit<StrictProfessorLessonScript, "nodeScripts" | "teachingStructures"> & {
  nodeScripts: ProfessorNodeScript[];
  teachingStructures?: TeachingStructure[];
};

// ── ProfessorLessonPlan — the final, playback-ready timeline ────────────────
// Built once per (documentId, pageTruthKey, activeCanonicalUnitId, VSG
// content, plannerVersion) by buildProfessorTeachingActions.ts. Play/Pause/
// Previous/Next/Restart replay THIS — they never regenerate it.

export interface ProfessorLessonSourceSnapshot {
  documentId:            string;
  pageNumber:            number;
  pageTruthKey:           string;
  activeCanonicalUnitId: string | null;
  /** VisualSceneGraph.id — deterministic content hash; an unchanged vsgId
   *  means the underlying page content hasn't changed, so a cached plan is
   *  still correct to reuse. */
  vsgId:                 string;
  plannerVersion:         number;
  /** L18 — caller-supplied, never inferred: which register/visual-complexity
   *  the Director and runtime tldraw agent should teach at. Optional and
   *  defaults to "adult" everywhere it's read (the API routes, the cache
   *  key below) so the existing adult Reader — still the only real caller —
   *  is byte-for-byte unchanged by this field's addition. Set by Elena Mode
   *  once it has its own Whiteboard integration. */
  audience?:              "adult" | "child";
}

export interface ProfessorLessonPlan {
  actions:           ProfessorTeachingAction[];
  segments:          NarrationSegment[];
  visualGrammar:      VisualGrammarChoice;
  teachingStructures?: TeachingStructure[];
  title:              string;
  centralQuestion:    string;
  learningObjective:  string;
  synthesisQuestion:  string;
  sourceSnapshot:     ProfessorLessonSourceSnapshot;
  /** Canonical Professor Director contract. This is the orchestration layer
   * above tldraw: evidence and pedagogy stay semantic; drawInstructions are
   * the already-validated deterministic actions the renderer may execute. */
  directorSteps?:     ProfessorDirectorStep[];
  executionAgent?: {
    provider: "claude" | "deterministic";
    model: string | null;
    correctedStepIds: number[];
    mode?: "preflight-camera" | "runtime-visual-loop";
    executedStepIds?: number[];
  };
}

export interface ProfessorSourceEvidence {
  targetId: string;
  sourceId: string;
  exactText: string;
  /** Stabilization item 4C-4 — the canonical sentence id (lib/pdf/
   *  canonicalPageMap.ts's stable "S00N" ids) this evidence resolved to,
   *  when the originating Highlight grounding's groundingState was
   *  "sentenceId" (see VSGNode.sourceSentenceId's doc comment for the
   *  full provenance chain). Development/cross-reference metadata only —
   *  not used by lesson-plan generation or grounding here. */
  sourceSentenceId?: string;
}

export interface ProfessorDirectorStep {
  stepId: number;
  targetId: string;
  sourceEvidence: ProfessorSourceEvidence[];
  teachingGoal: string;
  teachingStructure: TeachingStructure;
  visualNeeded: boolean;
  visualIntent: string;
  narration: string;
  drawInstructions: ProfessorTeachingAction[];
  relationships: ProfessorRelationship[];
  emphasis: Array<{ targetId: string; treatment: Exclude<EmphasisTreatmentChoice, "none"> }>;
  focusBounds: Bounds | null;
  cameraIntent: CameraIntent;
  checkpoint: string | null;
}

// ── Cache key ─────────────────────────────────────────────────────────────
// documentId + pageTruthKey + activeCanonicalUnitId + VSG content id +
// plannerVersion — fresh, page-specific teaching without repeatedly paying for
// identical generation. pageTruthKey identifies the page slot/readiness, not
// the content itself; vsgId is required so a late-arriving canonical Surgeon
// plan can never reuse a lesson built from a different evidence set. Bump
// PLANNER_VERSION whenever the prompt/schema changes so a stale cached script
// isn't silently reused.
// v2: added learningObjective, made emphasize required (Structured Outputs
// strict-mode compatibility), added "definition" visualGrammar, "line" draw-
// shape variant, "highlight"/"number" emphasize treatments, and the "erase"
// action type — a v1-cached plan predates all of these.
// v3: added ProfessorGroupSchema (semantic regions) to the AI script, and
// buildProfessorTeachingActions.ts now computes geometry via
// lib/whiteboard/groupLayout.ts (measured, grouped, collision-resolved)
// instead of the old fixed-slot VSG layout + neighbor-unaware resize — a
// v1/v2-cached plan has the old, overlap-prone geometry baked in and must be
// regenerated, not just re-read.
// v4: added ExplanationActionSchema (`explain` on each nodeScript) — a
// professor's-aside mini-diagram (write/icon/arrow/emphasize) drawn beside a
// point while narrating it, so the board depicts the MECHANISM the professor
// is explaining, not only a labeled box per idea. A v1-v3 cached plan has no
// explain actions baked in and must be regenerated.
// v5 (Phase B1): added teachingRole, spatialIntent, drawingIntent,
// emphasisTreatment, and relationships to ProfessorNodeScript — richer
// semantic authority for the AI (which kind of point this is, where it
// belongs in the board's composition, what a mark should look like, and
// explicit links to other nodes) without ever letting it touch a coordinate.
// buildProfessorTeachingActions.ts now also actually emits relationship
// arrows, a comparison-group divider bracket, and an AI-chosen emphasis
// treatment instead of a hardcoded circle. A v1-v4 cached plan predates all
// of this and must be regenerated, not just re-read.
// v6 (Phase 3): added a centralQuestion opening, expanded teachingRole with
// warning/summary, carried semantic roles through the executable canvas
// state for consistent color, and finishes on a whole-board synthesis view.
// v7: adds the domain-adaptive Professor Director contract, explicit source
// evidence / teaching structure / visualNeeded decisions per Thought Unit,
// PDF↔Whiteboard surface actions, and intent-aware camera focus bounds.
// v8: teaches the planner to request progressive, domain-adaptive illustrative
// compositions for the verified Claude/tldraw visual-agent primitive set.
export const PLANNER_VERSION = 8;

export function buildProfessorLessonCacheKey(params: {
  documentId: string;
  pageTruthKey: string;
  activeCanonicalUnitId: string | null;
  vsgId: string;
  /** L18 — an "adult" plan and a "child" plan for the SAME page must never
   *  collide in the cache. Omitted (or "adult") leaves the key exactly as
   *  it was before this field existed — only a "child" audience appends a
   *  suffix, so every existing adult-only caller's cache key, and every
   *  cache entry already written before this phase, is unaffected. */
  audience?: "adult" | "child";
}): string {
  const { documentId, pageTruthKey, activeCanonicalUnitId, vsgId, audience } = params;
  const suffix = audience === "child" ? ":child" : "";
  return `plesson:v${PLANNER_VERSION}:${documentId}:${pageTruthKey}:${activeCanonicalUnitId ?? "none"}:${vsgId}${suffix}`;
}
