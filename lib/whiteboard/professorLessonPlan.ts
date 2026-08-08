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

// ── Geometry primitives ─────────────────────────────────────────────────────

export interface Point { x: number; y: number; }
export interface Bounds { x: number; y: number; w: number; h: number; }

// ── ProfessorTeachingAction — the deterministic, replayable drawing timeline ─
// Every action carries a stable actionId (referenced by NarrationSegment.
// linkedActionIds) and a durationMs (pacing for autoplay/Previous-Next). The
// user-facing spec didn't put these on every variant explicitly; they're
// added uniformly because a real playback engine needs both on every action
// to be deterministic and controllable — documented here rather than left
// implicit.

export type ProfessorTeachingAction =
  | { type: "write"; actionId: string; shapeId: string; targetId?: string; text: string; x: number; y: number; durationMs: number }
  | { type: "draw-arrow"; actionId: string; shapeId: string; targetId?: string; from: Point; to: Point; durationMs: number }
  // "circle"/"box" map to tldraw's ellipse/rectangle geo shapes (the only
  // two ever produced before this comment was added). "diamond"/"hexagon"/
  // "cloud" are real, additional tldraw geo shapes — decision points, traps/
  // warnings, and clinical pearls now get their OWN distinct shape, not just
  // a different fill color on an identical rectangle. See
  // shapeKindForNode() in buildProfessorTeachingActions.ts for the mapping.
  | { type: "draw-shape"; actionId: string; shapeId: string; targetId?: string; shape: "circle" | "box" | "brace" | "line" | "diamond" | "hexagon" | "cloud"; bounds: Bounds; durationMs: number }
  | { type: "emphasize"; actionId: string; targetId: string; treatment: "circle" | "underline" | "pulse" | "highlight" | "number" | "crossOut"; sequenceNumber?: number; durationMs: number }
  | { type: "speak"; actionId: string; segmentId: string; text: string; durationMs: number }
  | { type: "pause"; actionId: string; durationMs: number }
  | { type: "move-camera"; actionId: string; targetIds: string[]; durationMs: number }
  /** Removes a previously-drawn shape from the canvas from this point in the
   *  timeline forward — e.g. clearing a rough sketch before drawing the
   *  clean version. Handled by computeCanvasStateAtStep exactly like every
   *  other action: state-at-step is recomputed from scratch, so an erase is
   *  just "this shapeId's entry doesn't exist for index >= this action's". */
  | { type: "erase"; actionId: string; targetShapeId: string; durationMs: number };

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
}

// ── ProfessorLessonScript — the AI-authored, VSG-grounded input ─────────────
// OpenAI annotates EXISTING VisualSceneGraph node/edge ids with a short
// hand-written label + spoken narration. It never proposes x/y/bounds — the
// deterministic VSG layout (lib/whiteboard/layoutAdapters.ts) already owns
// those, exactly as groundSurgeonQuotes.ts's exactQuote-only contract keeps
// OpenAI out of the coordinate business for PDF highlights.

export const VisualGrammarChoiceSchema = z.enum([
  "definition", "procedure", "mechanism", "anatomy", "diagnosis", "comparison", "equation", "concept-map",
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
});
export type ProfessorNodeScript = z.infer<typeof ProfessorNodeScriptSchema>;

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
  /** Short hand-written title, e.g. "ASPIRIN OVERDOSE" — 2-6 words. */
  title:             z.string().min(1).max(50),
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
export type ProfessorLessonScript = z.infer<typeof ProfessorLessonScriptSchema>;

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
}

export interface ProfessorLessonPlan {
  actions:           ProfessorTeachingAction[];
  segments:          NarrationSegment[];
  visualGrammar:      VisualGrammarChoice;
  title:              string;
  learningObjective:  string;
  synthesisQuestion:  string;
  sourceSnapshot:     ProfessorLessonSourceSnapshot;
}

// ── Cache key ─────────────────────────────────────────────────────────────
// documentId + pageTruthKey + activeCanonicalUnitId + plannerVersion, per
// the user's spec — fresh, page-specific teaching without repeatedly paying
// for identical generation. Bump PLANNER_VERSION whenever the prompt/schema
// changes so a stale cached script isn't silently reused.
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
export const PLANNER_VERSION = 4;

export function buildProfessorLessonCacheKey(params: {
  documentId: string;
  pageTruthKey: string;
  activeCanonicalUnitId: string | null;
}): string {
  const { documentId, pageTruthKey, activeCanonicalUnitId } = params;
  return `plesson:v${PLANNER_VERSION}:${documentId}:${pageTruthKey}:${activeCanonicalUnitId ?? "none"}`;
}
