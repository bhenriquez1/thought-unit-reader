// lib/whiteboard/buildProfessorTeachingActions.ts
// Pure converter: VisualSceneGraph (node/edge identity + role/tier data) + a
// GroundedProfessorLessonScript (short labels, spoken narration, and
// validated semantic groups, already verified against the same VSG) -> a
// complete, replayable ProfessorLessonPlan. No React, no tldraw Editor, no
// network — this is the deterministic "geometry" half of the pipeline;
// OpenAI supplied only the "meaning" half (lib/whiteboard/groundProfessorLesson.ts
// already stripped anything it invented that isn't a real node/edge id, and
// resolved every surviving node into exactly one group).
//
// Geometry itself is delegated entirely to lib/whiteboard/groupLayout.ts:
// every node box is measured from its REAL final shortLabel (width AND
// wrapped height), regions are placed group-by-group in the SAME order
// nodeScripts narrates them (so the spatial build order and the spoken
// narrative order can never diverge), and a deterministic collision pass
// guarantees no two boxes overlap. This file no longer computes any x/y/w/h
// itself — it only asks groupLayout.ts for bounds and turns those into a
// timeline of write/draw-shape/draw-arrow/move-camera actions.

import { createShapeId } from "@tldraw/tldraw";
import type { VisualSceneGraph, VSGNode } from "./visualSceneGraph";
import type { GroundedProfessorLessonScript } from "./groundProfessorLesson";
import type {
  ProfessorLessonPlan, ProfessorTeachingAction, NarrationSegment,
  ProfessorLessonSourceSnapshot, ExplainIcon, DrawingIntent,
} from "./professorLessonPlan";
import { estimateLabelWidth, estimateLabelHeight, wordCount } from "./textMetrics";
import { computeGroupLayout, anchorPoint, pushClearOf, computeAvoidanceBend } from "./groupLayout";
import type { LayoutBox } from "./groupLayout";

// ── Pacing ────────────────────────────────────────────────────────────────
const STROKE_DURATION_MS = 550;   // drawing a box/circle outline
const WRITE_MS_PER_WORD  = 260;   // "hand writing" a short phrase, word by word
const WRITE_MIN_MS       = 500;
const ARROW_DURATION_MS  = 500;
const EMPHASIZE_DURATION_MS = 550;
const CAMERA_DURATION_MS = 400;
const SPEAK_MS_PER_WORD  = 330;   // ~180wpm spoken pace, used as a pre-audio estimate
const SPEAK_MIN_MS       = 700;

const PAUSE_AFTER_MS_BY_TONE: Record<string, number> = {
  introduce: 400,
  explain:   400,
  connect:   300,
  warn:      700,
  question:  900,
};

// Short, deterministic label per edge kind — every drawn arrow gets ONE of
// these as a small write action at its midpoint (see below), instead of
// rendering as an unlabeled grey line. Never derived from the model; VSGEdge
// already carries `kind` from deterministic relationship inference
// (canonicalRelationshipGraph.ts / the SurgeonAnnotation.relationship field),
// so this needs no extra AI call and can never be blank or hallucinated.
const EDGE_KIND_LABEL: Record<string, string> = {
  causation:   "leads to",
  contrast:    "vs.",
  elaboration: "explains",
  sequence:    "then",
  reference:   "relates to",
};

// Structural edge entries also receive an AI-authored shortLabel. Prefer it
// when it actually explains the mechanism ("reduces tissue seal"), but keep
// the canonical connective for generic labels ("leads to"). This lets an
// arrow answer WHY two ideas connect without turning every connector into a
// second node or surrendering routing/placement to the model.
const GENERIC_CONNECTOR_LABELS = new Set([
  "leads to", "lead to", "causes", "then", "next", "explains",
  "relates to", "supports", "part of", "vs", "versus",
]);

function edgeExplanationLabel(shortLabel: string, kind: string): string {
  const fallback = EDGE_KIND_LABEL[kind] ?? "relates to";
  const normalized = shortLabel.trim().toLowerCase().replace(/[.!?:;]+$/g, "");
  return normalized.length === 0 || GENERIC_CONNECTOR_LABELS.has(normalized)
    ? fallback
    : shortLabel.trim();
}

// The AI picks an icon KEY (meaning); this map is what actually decides the
// rendered glyph — "AI proposes meaning, code proposes the visual," same
// split as shapeKindForNode() below. tldraw geo-shape labels render plain
// unicode fine, so no image asset pipeline is needed.
const EXPLAIN_ICON_GLYPH: Record<ExplainIcon, string> = {
  thermometer: "🌡️", heart: "❤️", brain: "🧠", lungs: "🫁", warning: "⚠️",
  arrowDown: "⬇️", arrowUp: "⬆️", clock: "⏱️", snowflake: "❄️",
  checkmark: "✅", xmark: "❌",
  lightbulb: "💡", flag: "🚩", scale: "⚖️", link: "🔗",
};

// Deterministic label for an AI-declared relationship — same "never blank,
// never hallucinated" discipline as EDGE_KIND_LABEL, applied to
// ProfessorRelationship.kind instead of VSGEdge.kind. The AI's own optional
// `label` (already clamped to <=4 words by groundProfessorLesson.ts) is
// preferred when present; this is only the fallback.
const RELATIONSHIP_KIND_LABEL: Record<string, string> = {
  supports:     "supports",
  causes:       "causes",
  contrasts:    "vs.",
  "leads-to":   "leads to",
  "part-of":    "part of",
  "warns-about": "⚠ watch for",
};

// A professor's-aside mini-diagram is drawn beside the point it explains,
// never overlapping the already-placed groups (lib/whiteboard/groupLayout.ts's
// pushClearOf handles the "never overlapping" half).
const EXPLAIN_GAP_X = 24;
const EXPLAIN_GAP_Y = 16;

let actionCounter = 0;
let segmentCounter = 0;
function nextActionId(): string { return `a${actionCounter++}`; }
function nextSegmentId(): string { return `seg${segmentCounter++}`; }

/** Resets the module-local id counters — call at the start of each
 *  buildProfessorTeachingActions() so ids are stable/deterministic per build
 *  rather than accumulating across calls within one process lifetime. */
function resetIdCounters(): void {
  actionCounter = 0;
  segmentCounter = 0;
}

function writeDurationMs(text: string): number {
  return Math.max(WRITE_MIN_MS, wordCount(text) * WRITE_MS_PER_WORD);
}
function speakDurationMs(text: string): number {
  return Math.max(SPEAK_MIN_MS, wordCount(text) * SPEAK_MS_PER_WORD);
}

function boxCenter(box: LayoutBox): { x: number; y: number } {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

// A professor's diagram uses different SHAPES for different kinds of ideas,
// not just one box with a different border color — a diamond at a decision
// point, a hexagon for a warning, a cloud for an expert aside, matching how
// this same distinction is already drawn as trapNotch/decisionConnector/
// pearlMarker on the PDF (components/pdf/PdfEvidenceOverlay.tsx). tier is
// checked before role: a "danger" or "pearl" idea keeps that shape even if
// it also happens to be the page's hub node, since the warning/insight
// reading matters more than "this is the central concept" once both are true.
// drawingIntent is a SECOND-PRIORITY signal — the AI's stated intent for
// what kind of mark best represents this point. Tier/role-derived rules
// above (danger/pearl/decision/hub) still win when they apply, since those
// encode real, deterministic product knowledge (e.g. a danger point must
// always read as a hexagon, regardless of what the AI thought this point's
// "drawing intent" was). drawingIntent only breaks the tie for the ordinary
// case that would otherwise always fall through to a plain box.
const SHAPE_FOR_DRAWING_INTENT: Partial<Record<DrawingIntent, "circle" | "box" | "diamond" | "hexagon" | "cloud">> = {
  contrast: "diamond",
  callout:  "cloud",
};

function shapeKindForNode(node: VSGNode, drawingIntent?: DrawingIntent): "circle" | "box" | "diamond" | "hexagon" | "cloud" {
  if (node.tier === "danger") return "hexagon";
  if (node.tier === "pearl")  return "cloud";
  if (node.tier === "decision" || node.canonicalType === "decision" || node.canonicalType === "comparison") return "diamond";
  if (node.role === "hub") return "circle";
  if (drawingIntent && SHAPE_FOR_DRAWING_INTENT[drawingIntent]) return SHAPE_FOR_DRAWING_INTENT[drawingIntent]!;
  return "box";
}

export function buildProfessorTeachingActions(
  vsg: VisualSceneGraph,
  grounded: GroundedProfessorLessonScript,
  sourceSnapshot: ProfessorLessonSourceSnapshot,
): ProfessorLessonPlan {
  resetIdCounters();

  const actions: ProfessorTeachingAction[] = [];
  const segments: NarrationSegment[] = [];
  let stepSequenceCounter = 0;

  // Phase B2: every action pushed via `push()` is auto-stamped with the
  // CURRENT teaching step id — incremented once per narrated point (see the
  // main loop below), so a step boundary is exactly "everything pushed
  // between two increments," matching how pushSegment already interleaves
  // that point's visuals with its own speak+pause.
  let currentStepId = 0;
  // Plain Omit<Union, K> collapses to only the properties common to every
  // member of the union (it computes over the union's keyof, which is an
  // INTERSECTION, not per-member) — losing shapeId/targetIds/segmentId/etc.
  // A conditionally-distributed Omit preserves each variant's own shape
  // minus stepId, so callers can still pass e.g. a draw-shape action with
  // its bounds/shape fields intact.
  type ActionWithoutStepId = ProfessorTeachingAction extends infer T
    ? T extends ProfessorTeachingAction ? Omit<T, "stepId"> : never
    : never;
  function push(action: ActionWithoutStepId): void {
    actions.push({ ...action, stepId: currentStepId } as ProfessorTeachingAction);
  }

  // Pushes a narration segment's speak+pause actions IMMEDIATELY (not
  // batched at the end) so drawing and narration stay interleaved — this is
  // the fix for "the drawing and narration are not tightly synchronized":
  // each teaching point's visual actions are followed right away by the
  // speech that explains them, not by the next point's visuals.
  const pushSegment = (text: string, tone: NarrationSegment["tone"], pace: NarrationSegment["pace"], linkedActionIds: string[]) => {
    const seg: NarrationSegment = {
      id: nextSegmentId(),
      text,
      tone,
      pace,
      pauseAfterMs: PAUSE_AFTER_MS_BY_TONE[tone] ?? 400,
      linkedActionIds,
      contentRole: "PROFESSOR_EXPLANATION",
    };
    segments.push(seg);

    const speakActionId = nextActionId();
    push({ type: "speak", actionId: speakActionId, segmentId: seg.id, text: seg.text, durationMs: speakDurationMs(seg.text) });
    if (seg.pauseAfterMs > 0) {
      push({ type: "pause", actionId: nextActionId(), durationMs: seg.pauseAfterMs });
    }
    return seg;
  };

  // ── Pre-pass: every drawn node's bounds via the group-aware layout engine,
  //     computed BEFORE any actions are built. A real professor narrates
  //     connections the moment they're relevant — "here's the trigger... and
  //     that leads to..." — which naturally places an edge's nodeScript
  //     entry BETWEEN its two endpoints, not strictly after both. That
  //     conversational order is exactly what rule 3 of the AI prompt in
  //     pages/api/professor-lesson-plan.ts asks for ("connect... explaining
  //     why two points relate"). Computing bounds only when a node's OWN
  //     script entry was reached (the previous approach) silently dropped
  //     any edge whose "to" node hadn't been drawn yet. Bounds are pure
  //     geometry — computeGroupLayout only needs every drawn node's real
  //     shortLabel and its validated group — so there's no reason computing
  //     them needs to wait for script-processing order at all; only the
  //     DRAWING (the write/draw-shape actions) does. ─────────────────────────
  const scriptByTargetId = new Map(grounded.nodeScripts.map(e => [e.targetId, e]));
  const drawnNodeIds = new Set(vsg.nodes.map(n => n.id).filter(id => scriptByTargetId.has(id)));
  const layoutNodes = Array.from(drawnNodeIds).map(id => ({
    id, label: scriptByTargetId.get(id)!.shortLabel, spatialIntent: scriptByTargetId.get(id)!.spatialIntent,
  }));

  // groundProfessorLesson.ts guarantees every surviving node lands in some
  // group, but this converter takes GroundedProfessorLessonScript as its
  // input type directly (useful for tests, and defensive against any future
  // caller) — so any drawn node NOT covered by grounded.groups still gets
  // placed, via one synthesized catch-all region appended after every
  // declared group, rather than silently vanishing from the layout.
  const groupedNodeIds = new Set(grounded.groups.flatMap(g => g.nodeIds));
  const ungroupedIds = Array.from(drawnNodeIds).filter(id => !groupedNodeIds.has(id));
  const effectiveGroups = ungroupedIds.length === 0
    ? grounded.groups
    : [
        ...grounded.groups,
        { id: "auto-fallback", type: "core" as const, order: Math.max(0, ...grounded.groups.map(g => g.order)) + 1, nodeIds: ungroupedIds },
      ];

  const { nodeBounds: nodeBoundsById, groupBounds: groupBoundsById } = computeGroupLayout(layoutNodes, effectiveGroups);

  // Every drawn node's group id, for camera batching below.
  const groupIdByNodeId = new Map<string, string>();
  for (const g of effectiveGroups) {
    for (const id of g.nodeIds) {
      if (!groupIdByNodeId.has(id)) groupIdByNodeId.set(id, g.id);
    }
  }
  const nodeShapeId = (nodeId: string) => String(createShapeId(`pn-${nodeId}`));
  const explainShapeId = (nodeId: string, localId: string) => String(createShapeId(`pn-explain-${nodeId}-${localId}`));
  const shapeIdsByGroup = new Map<string, string[]>();
  for (const g of effectiveGroups) {
    const primaryIds = g.nodeIds.filter(id => drawnNodeIds.has(id));
    // Fold each node's explain sub-shape ids in too, so the region's camera
    // move frames the WHOLE mini-diagram, not just the primary boxes — local
    // ids come straight from the AI script, known before layout even runs.
    const explainIds = primaryIds.flatMap(id =>
      (scriptByTargetId.get(id)?.explain ?? [])
        .filter(a => (a.type === "write" || a.type === "icon") && a.id)
        .map(a => explainShapeId(id, a.id!)),
    );
    shapeIdsByGroup.set(g.id, [...primaryIds.map(nodeShapeId), ...explainIds]);
  }

  // Running obstacle list for explain mini-diagrams — seeded with every
  // primary node box (fixed, never moved) and grown as each nodeScript
  // entry's explain chain is placed, so later chains avoid earlier ones too.
  const obstacleBoxes: LayoutBox[] = Array.from(nodeBoundsById.values());

  // Every (fromId, toId) pair the VSG already connects with a real,
  // deterministic edge — an AI-declared relationship duplicating one of
  // these is skipped (see the relationships loop below) so the board never
  // shows two arrows between the same two boxes.
  const existingEdgePairs = new Set<string>();
  for (const e of vsg.edges) {
    existingEdgePairs.add(`${e.fromId}|${e.toId}`);
    existingEdgePairs.add(`${e.toId}|${e.fromId}`);
  }

  // Obstacles for a connector between fromId/toId — every OTHER drawn
  // node's box (never the connection's own two endpoints, which the
  // straight/curved line is SUPPOSED to touch).
  const connectorObstacles = (fromId: string, toId: string): LayoutBox[] =>
    Array.from(nodeBoundsById.entries())
      .filter(([id]) => id !== fromId && id !== toId)
      .map(([, box]) => box);

  // ── Step 1: central concept + motivating question ──────────────────────
  // Placed comfortably ABOVE the topmost laid-out node — a fixed (24, 12)
  // collided with the first box's own position.
  if (grounded.title) {
    const topLayoutY = nodeBoundsById.size > 0 ? Math.min(...Array.from(nodeBoundsById.values()).map(b => b.y)) : 40;
    const titleActionId = nextActionId();
    push({
      type: "write", actionId: titleActionId, shapeId: String(createShapeId("pl-title")),
      text: grounded.title, x: 24, y: topLayoutY - 105, durationMs: writeDurationMs(grounded.title),
    });
    pushSegment(`${grounded.title}.`, "introduce", "normal", [titleActionId]);
  }

  if (grounded.centralQuestion) {
    const topLayoutY = nodeBoundsById.size > 0 ? Math.min(...Array.from(nodeBoundsById.values()).map(b => b.y)) : 40;
    const questionActionId = nextActionId();
    push({
      type: "write", actionId: questionActionId, shapeId: String(createShapeId("pl-central-question")),
      text: grounded.centralQuestion, x: 24, y: topLayoutY - 58,
      durationMs: writeDurationMs(grounded.centralQuestion),
    });
    pushSegment(grounded.centralQuestion, "question", "slow", [questionActionId]);
  }

  // ── Step 1b: learning objective, spoken only — states what the student
  //     should be able to do after this lesson, right up front. ────────────
  if (grounded.learningObjective) {
    pushSegment(grounded.learningObjective, "introduce", "normal", []);
  }

  // Tracks the current teaching region so the camera moves once per region
  // instead of once per object — "move by meaningful teaching region," not
  // aggressively after every individual shape. Edges never trigger their own
  // camera move: both endpoints already belong to a region the camera has
  // already framed by the time an edge between them is drawn.
  let currentGroupId: string | null = null;

  // ── Step 2..N: one draw-shape + write (+ optional emphasize) per node,
  //     one draw-arrow per edge — in the grounded script's own order, which
  //     IS the teaching sequence the professor performs. Each iteration is
  //     its OWN teaching step (Phase B2) — every action pushed for this
  //     entry, including its explain[] chain and relationships, shares one
  //     stepId, so Previous/Next and the draw-while-teaching scheduler both
  //     treat "this narrated point" as one pedagogical unit. ───────────────
  for (const entry of grounded.nodeScripts) {
    currentStepId += 1;
    const node = vsg.nodes.find(n => n.id === entry.targetId);
    if (node) {
      const bounds = nodeBoundsById.get(node.id)!; // set for every drawn node in the pre-pass above
      const shapeId = nodeShapeId(node.id);

      const groupId = groupIdByNodeId.get(node.id) ?? node.id;
      if (groupId !== currentGroupId) {
        currentGroupId = groupId;
        const targets = shapeIdsByGroup.get(groupId) ?? [shapeId];
        push({ type: "move-camera", actionId: nextActionId(), targetIds: targets, durationMs: CAMERA_DURATION_MS });
      }

      const drawActionId = nextActionId();
      push({
        type: "draw-shape", actionId: drawActionId, shapeId, targetId: node.sourceId,
        shape: shapeKindForNode(node, entry.drawingIntent), bounds, durationMs: STROKE_DURATION_MS,
        // Pass-through metadata only (see the ProfessorTeachingAction comment
        // in professorLessonPlan.ts) — proves these AI-authored fields
        // survive to the final timeline instead of being silently dropped.
        spatialIntent: entry.spatialIntent, teachingRole: entry.teachingRole,
      });

      const writeActionId = nextActionId();
      push({
        type: "write", actionId: writeActionId, shapeId, targetId: node.sourceId,
        text: entry.shortLabel, x: bounds.x + 8, y: bounds.y + bounds.h / 2 - 8,
        durationMs: writeDurationMs(entry.shortLabel),
      });

      const linked = [drawActionId, writeActionId];
      if (entry.emphasize) {
        const emphasizeActionId = nextActionId();
        push({
          type: "emphasize", actionId: emphasizeActionId, targetId: shapeId,
          // groundProfessorLesson.ts already guarantees emphasisTreatment is
          // never "none" when emphasize is true (falls back to "circle"
          // there) — the "circle" fallback here is defense-in-depth only.
          treatment: entry.emphasisTreatment === "none" ? "circle" : entry.emphasisTreatment,
          durationMs: EMPHASIZE_DURATION_MS,
        });
        linked.push(emphasizeActionId);
      }
      // Deterministic, non-AI treatments derived from data the VSG already
      // carries — "draw the five numbered stages" (sequential step-role
      // nodes get a running number badge) and "add a small warning beside
      // the common diagnostic error" (danger-tier nodes get a highlight)
      // both come from node.role/node.tier, never from the model choosing
      // a treatment.
      if (node.role === "step") {
        stepSequenceCounter += 1;
        const numberActionId = nextActionId();
        push({
          type: "emphasize", actionId: numberActionId, targetId: shapeId,
          treatment: "number", sequenceNumber: stepSequenceCounter, durationMs: EMPHASIZE_DURATION_MS,
        });
        linked.push(numberActionId);
      }
      if (node.tier === "danger") {
        const warnActionId = nextActionId();
        push({
          type: "emphasize", actionId: warnActionId, targetId: shapeId,
          treatment: "highlight", durationMs: EMPHASIZE_DURATION_MS,
        });
        linked.push(warnActionId);
      }

      // ── explain[]: the professor's-aside mini-diagram — a short write/
      //     icon/arrow/emphasize chain drawn beside this point while
      //     narrating it, so the board depicts the MECHANISM being taught
      //     instead of just a labeled box per idea. "self" always resolves
      //     to this node's own already-drawn shape; every other reference
      //     resolves to a sub-box placed earlier in THIS SAME chain —
      //     groundProfessorLesson.ts already guarantees both hold before
      //     this ever runs, so no reference here can be dangling. ─────────
      if (entry.explain.length > 0) {
        const localBoxById = new Map<string, LayoutBox>([["self", bounds]]);
        const localShapeIdById = new Map<string, string>([["self", shapeId]]);
        let stackY = bounds.y;

        for (const action of entry.explain) {
          if (action.type === "write" || action.type === "icon") {
            const text = action.type === "write"
              ? (action.text ?? "")
              : `${EXPLAIN_ICON_GLYPH[action.icon!] ?? "•"}${action.label ? ` ${action.label}` : ""}`;
            const w = estimateLabelWidth(text);
            const h = estimateLabelHeight(text);
            const placed = pushClearOf(
              { x: bounds.x + bounds.w + EXPLAIN_GAP_X, y: stackY, w, h },
              obstacleBoxes,
            );
            obstacleBoxes.push(placed);
            stackY = placed.y + placed.h + EXPLAIN_GAP_Y;

            const subShapeId = explainShapeId(node.id, action.id!);
            localBoxById.set(action.id!, placed);
            localShapeIdById.set(action.id!, subShapeId);

            const subDrawId = nextActionId();
            push({
              type: "draw-shape", actionId: subDrawId, shapeId: subShapeId,
              shape: action.type === "icon" ? "circle" : "box", bounds: placed, durationMs: STROKE_DURATION_MS,
            });
            linked.push(subDrawId);

            const subWriteId = nextActionId();
            push({
              type: "write", actionId: subWriteId, shapeId: subShapeId,
              text, x: placed.x + 6, y: placed.y + placed.h / 2 - 8, durationMs: writeDurationMs(text),
            });
            linked.push(subWriteId);
          } else if (action.type === "arrow") {
            const fromBox = localBoxById.get(action.from!);
            const toBox = localBoxById.get(action.to!);
            if (!fromBox || !toBox) continue; // grounding guarantees this holds; stay defensive, never crash
            const fromCenter = boxCenter(fromBox);
            const toCenter = boxCenter(toBox);
            const subArrowShapeId = String(createShapeId(`pe-explain-${node.id}-${linked.length}`));
            const subArrowId = nextActionId();
            push({
              type: "draw-arrow", actionId: subArrowId, shapeId: subArrowShapeId,
              from: anchorPoint(fromBox, toCenter.x, toCenter.y), to: anchorPoint(toBox, fromCenter.x, fromCenter.y),
              durationMs: ARROW_DURATION_MS,
            });
            linked.push(subArrowId);
          } else if (action.type === "emphasize") {
            const targetShapeId = localShapeIdById.get(action.target!);
            if (!targetShapeId) continue; // grounding guarantees this holds; stay defensive, never crash
            const subEmphasizeId = nextActionId();
            push({
              type: "emphasize", actionId: subEmphasizeId, targetId: targetShapeId,
              treatment: action.style!, durationMs: EMPHASIZE_DURATION_MS,
            });
            linked.push(subEmphasizeId);
          }
        }
      }

      // ── relationships: AI-authored semantic links to OTHER nodes this
      //     script narrates, additional to (never replacing) the VSG's own
      //     deterministic edges. groundProfessorLesson.ts already validated
      //     every target as a real, surviving node id — bounds for every
      //     drawn node are known from the pre-pass above regardless of
      //     narration order, so these can be drawn safely from either node's
      //     turn. Skipped when a VSG edge already connects the exact same
      //     pair, so a relationship never produces a visibly redundant
      //     second arrow on top of a structural one. ─────────────────────
      for (const rel of entry.relationships) {
        const toBounds = nodeBoundsById.get(rel.targetId);
        if (!toBounds) continue; // defensive — grounding guarantees this holds
        const pairKey = `${node.id}|${rel.targetId}`;
        const reversePairKey = `${rel.targetId}|${node.id}`;
        if (existingEdgePairs.has(pairKey) || existingEdgePairs.has(reversePairKey)) continue;

        const relFromCenter = boxCenter(bounds);
        const relToCenter = boxCenter(toBounds);
        const relFrom = anchorPoint(bounds, relToCenter.x, relToCenter.y);
        const relTo = anchorPoint(toBounds, relFromCenter.x, relFromCenter.y);
        const relShapeId = String(createShapeId(`pr-${node.id}-${rel.targetId}`));
        const relBend = computeAvoidanceBend(relFrom, relTo, connectorObstacles(node.id, rel.targetId));

        const relArrowId = nextActionId();
        push({
          type: "draw-arrow", actionId: relArrowId, shapeId: relShapeId,
          from: relFrom, to: relTo, bend: relBend, relationshipKind: rel.kind,
          durationMs: ARROW_DURATION_MS,
        });
        linked.push(relArrowId);

        const relLabelText = rel.label ?? RELATIONSHIP_KIND_LABEL[rel.kind] ?? rel.kind;
        const relLabelRaw = {
          x: (relFrom.x + relTo.x) / 2 - estimateLabelWidth(relLabelText) / 2,
          y: (relFrom.y + relTo.y) / 2 - 8,
          w: estimateLabelWidth(relLabelText), h: estimateLabelHeight(relLabelText),
        };
        const relLabelPlaced = pushClearOf(relLabelRaw, obstacleBoxes.filter(b => b !== bounds && b !== toBounds));
        obstacleBoxes.push(relLabelPlaced);
        const relLabelId = nextActionId();
        push({
          type: "write", actionId: relLabelId, shapeId: String(createShapeId(`pr-label-${node.id}-${rel.targetId}`)),
          text: relLabelText, x: relLabelPlaced.x, y: relLabelPlaced.y,
          durationMs: writeDurationMs(relLabelText),
        });
        linked.push(relLabelId);
      }

      pushSegment(entry.narration, entry.tone, entry.pace, linked);
      continue;
    }

    const edge = vsg.edges.find(e => e.id === entry.targetId);
    if (edge) {
      // Bounds are now precomputed for every drawn VSG node regardless of
      // script order (see the pre-pass above) — the guard that matters here
      // is different: does EACH endpoint actually get a visible draw-shape
      // action at some point in this timeline? An edge pointing at a node
      // the AI chose to skip narrating (rule 1 allows skipping "a couple of
      // nodes") would otherwise draw an arrow to/from an invisible box.
      if (!scriptByTargetId.has(edge.fromId) || !scriptByTargetId.has(edge.toId)) continue;
      const from = nodeBoundsById.get(edge.fromId);
      const to   = nodeBoundsById.get(edge.toId);
      if (!from || !to) continue; // edge references a node id not in this VSG at all — skip, not a crash

      const shapeId = String(createShapeId(`pe-${edge.id}`));

      // Route from whichever edge of each box actually faces the other box,
      // instead of always bottom-center -> top-center — the direct fix for
      // "connectors don't respect shape geometry" once regions can be laid
      // out side by side (comparison columns, a warning's side lane) rather
      // than only ever stacked in one vertical column.
      const fromCenter = boxCenter(from);
      const toCenter = boxCenter(to);
      const arrowFrom = anchorPoint(from, toCenter.x, toCenter.y);
      const arrowTo   = anchorPoint(to, fromCenter.x, fromCenter.y);
      // Phase B2: curve around a third node's box the straight line would
      // otherwise cross — real 2D regions (branches/comparison/warning) can
      // now sit between two connected nodes in a way a single vertical
      // column never could.
      const arrowBend = computeAvoidanceBend(arrowFrom, arrowTo, connectorObstacles(edge.fromId, edge.toId));

      const arrowActionId = nextActionId();
      push({
        type: "draw-arrow", actionId: arrowActionId, shapeId, targetId: edge.id,
        from: arrowFrom, to: arrowTo, bend: arrowBend, durationMs: ARROW_DURATION_MS,
      });
      const linkedArrowActions = [arrowActionId];

      // A short, deterministic label at the arrow's midpoint — "leads to",
      // "vs.", "then" — so the relationship reads visually, not only through
      // the (previously never-applied) arrow color. See EDGE_KIND_LABEL.
      // Nudged clear of any node box it would otherwise sit on top of (same
      // obstacle list explain[] sub-diagrams already avoid).
      const edgeLabel = edgeExplanationLabel(entry.shortLabel, edge.kind);
      if (edgeLabel) {
        const edgeLabelPlaced = pushClearOf({
          x: (arrowFrom.x + arrowTo.x) / 2 - estimateLabelWidth(edgeLabel) / 2,
          y: (arrowFrom.y + arrowTo.y) / 2 - 8,
          w: estimateLabelWidth(edgeLabel), h: estimateLabelHeight(edgeLabel),
        }, obstacleBoxes.filter(b => b !== from && b !== to)); // never pushed away from its OWN two endpoints
        obstacleBoxes.push(edgeLabelPlaced);
        const labelActionId = nextActionId();
        push({
          type: "write", actionId: labelActionId, shapeId: String(createShapeId(`pe-label-${edge.id}`)),
          text: edgeLabel,
          x: edgeLabelPlaced.x,
          y: edgeLabelPlaced.y,
          durationMs: writeDurationMs(edgeLabel),
        });
        linkedArrowActions.push(labelActionId);
      }

      pushSegment(entry.narration, entry.tone, entry.pace, linkedArrowActions);
    }
  }

  // ── Comparison-group divider: a real bracket between the two columns a
  //     "comparison" group's nodes were already split into (groupLayout.ts
  //     unchanged — this only draws on top of geometry it already computed),
  //     so a contrast reads as a genuine visual structure instead of two
  //     unrelated columns that happen to sit side by side. Uses the "brace"
  //     shape kind — previously declared in the schema but never emitted by
  //     anything, silently falling back to a plain rectangle; see
  //     toTldrawShapeSpec in TldrawCanvas.tsx for the real bracket render. ──
  for (const group of effectiveGroups) {
    if (group.type !== "comparison") continue;
    const region = groupBoundsById.get(group.id);
    if (!region || region.h <= 0) continue;

    // Mirror groupLayout.ts's own comparison split EXACTLY (same nodeIds
    // order, same Math.ceil(length/2) midpoint) so the bracket lands in the
    // real gap between the two columns it actually laid out — not a guess
    // from the group's overall bounding box, which can be off-center when
    // the two columns have different widths. If fewer than 2 of this
    // group's nodes actually got drawn, groupLayout.ts never split it into
    // two columns in the first place (falls through to its plain
    // single-column case) — skip the divider in that case too.
    const drawnMemberIds = group.nodeIds.filter(id => nodeBoundsById.has(id));
    if (drawnMemberIds.length < 2) continue;
    const mid = Math.ceil(drawnMemberIds.length / 2);
    const colABoxes = drawnMemberIds.slice(0, mid).map(id => nodeBoundsById.get(id)!);
    const colBBoxes = drawnMemberIds.slice(mid).map(id => nodeBoundsById.get(id)!);
    const colARight = Math.max(...colABoxes.map(b => b.x + b.w));
    const colBLeft  = Math.min(...colBBoxes.map(b => b.x));
    const dividerX  = (colARight + colBLeft) / 2;

    const dividerId = nextActionId();
    push({
      type: "draw-shape", actionId: dividerId, shapeId: String(createShapeId(`pg-divider-${group.id}`)),
      shape: "brace",
      bounds: { x: dividerX - 5, y: region.y, w: 10, h: region.h },
      durationMs: STROKE_DURATION_MS,
    });
  }

  // ── Final: zoom back to the complete causal picture, then ask the learner
  //     to synthesize it. This is one pedagogical step: the board remains the
  //     compact final artifact and the question is spoken over the overview.
  if (grounded.synthesisQuestion) {
    currentStepId += 1;
    const overviewTargetIds = Array.from(new Set(
      effectiveGroups.flatMap(group => shapeIdsByGroup.get(group.id) ?? []),
    ));
    const overviewLinkedActionIds: string[] = [];
    if (overviewTargetIds.length > 0) {
      const overviewActionId = nextActionId();
      push({
        type: "move-camera", actionId: overviewActionId,
        targetIds: overviewTargetIds, durationMs: CAMERA_DURATION_MS,
      });
      overviewLinkedActionIds.push(overviewActionId);
    }
    pushSegment(
      grounded.synthesisQuestion,
      "question",
      "slow",
      overviewLinkedActionIds,
    );
  }

  return {
    actions,
    segments,
    visualGrammar:      grounded.visualGrammar,
    title:               grounded.title,
    centralQuestion:     grounded.centralQuestion,
    learningObjective:   grounded.learningObjective,
    synthesisQuestion:   grounded.synthesisQuestion,
    sourceSnapshot,
  };
}
