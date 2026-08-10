// lib/whiteboard/groundProfessorLesson.ts
// Grounding/validation layer for a ProfessorLessonScript — the same "AI
// proposes, deterministic code verifies-or-drops" discipline
// groundSurgeonQuotes.ts applies to PDF highlights, applied here to the
// whiteboard's teaching script:
//   - A targetId that doesn't name a real VisualSceneGraph node/edge id is
//     dropped, never rendered (OpenAI never invents nodes).
//   - Every surviving node shortLabel is clamped to <=8 words and every edge
//     explanation to <=5 words / non-paragraph-shaped, regardless of what
//     the model returned.
//   - At most ONE node/edge is emphasized (the single "circle the high-yield
//     point" moment) — later duplicates are demoted, not multiplied.
//   - Total surviving targets are capped so the canvas stays under ~10
//     primary objects even if the underlying VSG has more nodes/edges.

import type { VisualSceneGraph } from "./visualSceneGraph";
import type {
  ProfessorLessonScript, ProfessorNodeScript, GroupType, ExplanationAction, ProfessorRelationship, TeachingStructure,
} from "./professorLessonPlan";
import { clampToShortLabel, isParagraphShaped } from "./textMetrics";

/** Mirrors ProfessorNodeScriptSchema.relationships' own .max(3) — re-enforced
 *  here as a hard backstop, same discipline as MAX_EXPLAIN_ACTIONS below. */
const MAX_RELATIONSHIPS = 3;

/**
 * Validate one nodeScript entry's AI-declared relationships[] against the
 * FINAL set of node ids that survived grounding (not the original script's
 * targetIds — some of those may have been density-capped or deduplicated
 * away by the time this runs). A relationship pointing at a dropped node, a
 * non-node (edge) id, or itself is simply dropped, never rendered — the same
 * "no highlight is better than a wrong highlight" philosophy as
 * sanitizeExplain(). Never throws.
 */
function sanitizeRelationships(
  raw: ProfessorRelationship[],
  ownTargetId: string,
  survivingNodeIds: Set<string>,
): ProfessorRelationship[] {
  const seen = new Set<string>();
  const result: ProfessorRelationship[] = [];
  for (const rel of raw) {
    if (result.length >= MAX_RELATIONSHIPS) break;
    if (!rel.targetId || rel.targetId === ownTargetId) continue;      // self-reference — drop
    if (!survivingNodeIds.has(rel.targetId)) continue;                 // hallucinated/dropped node — drop
    if (seen.has(rel.targetId)) continue;                              // duplicate target — keep first only
    seen.add(rel.targetId);
    result.push(rel.label ? { ...rel, label: clampToShortLabel(rel.label, 4) } : rel);
  }
  return result;
}

/** Keeps the canvas readable — the VSG itself may carry up to 12 nodes plus
 *  edges; this is the whiteboard-specific "fewer than 10 main visual
 *  objects" ceiling applied on top of that. */
export const MAX_GROUNDED_TARGETS = 10;

/** Mirrors ProfessorNodeScriptSchema.explain's own .max(6) — re-enforced
 *  here as a hard backstop for anything sanitizeExplain() itself grows. */
const MAX_EXPLAIN_ACTIONS = 6;

/**
 * Validate one nodeScript entry's explain[] mini-diagram: a write/icon
 * action must declare a non-empty local id before anything else in the SAME
 * array can reference it (plus the always-available "self"); an arrow or
 * emphasize action referencing an undeclared/forward/duplicate id is simply
 * dropped, never rendered — the same "no highlight is better than a wrong
 * highlight" philosophy applied to this mini-diagram. Never throws.
 */
function sanitizeExplain(raw: ExplanationAction[]): ExplanationAction[] {
  const declared = new Set<string>(["self"]);
  const result: ExplanationAction[] = [];

  for (const action of raw) {
    if (result.length >= MAX_EXPLAIN_ACTIONS) break;

    if (action.type === "write") {
      if (!action.id || declared.has(action.id) || !action.text?.trim()) continue;
      declared.add(action.id);
      result.push({ ...action, text: clampToShortLabel(action.text, 5) });
    } else if (action.type === "icon") {
      if (!action.id || declared.has(action.id) || !action.icon) continue;
      declared.add(action.id);
      result.push(action);
    } else if (action.type === "arrow") {
      if (!action.from || !action.to) continue;
      if (!declared.has(action.from) || !declared.has(action.to)) continue;
      result.push(action);
    } else if (action.type === "emphasize") {
      if (!action.target || !action.style) continue;
      if (!declared.has(action.target)) continue;
      result.push(action);
    }
  }

  return result;
}

/** Same shape as ProfessorGroup, but nodeIds are guaranteed to be real,
 *  surviving (post-density-cap) VSG node ids — never hallucinated, never
 *  double-assigned, never pointing at a node that got dropped. */
export interface GroundedProfessorGroup {
  id: string;
  type: GroupType;
  order: number;
  nodeIds: string[];
}

export interface GroundedProfessorLessonScript {
  title: string;
  visualGrammar: ProfessorLessonScript["visualGrammar"];
  teachingStructures?: ProfessorLessonScript["teachingStructures"];
  centralQuestion: string;
  learningObjective: string;
  synthesisQuestion: string;
  nodeScripts: ProfessorNodeScript[];
  /** Every node in nodeScripts belongs to exactly one group here — see
   *  resolveGroups() below for how AI-declared groups are validated and
   *  leftover/ungrouped nodes get a deterministic canonicalType-derived
   *  fallback group, so lib/whiteboard/groupLayout.ts never has to
   *  special-case "no groups." */
  groups: GroundedProfessorGroup[];
}

// A node's VSG canonicalType (bare-string taxonomy — see
// SURGEON_CANONICAL_TYPE_TO_VSG_TYPE in visualSceneGraph.ts) mapped onto the
// closest GroupType, used only when the AI script left a node ungrouped or
// declared no groups at all.
const NODE_CANONICAL_TYPE_TO_GROUP_TYPE: Record<string, GroupType> = {
  definition:      "core",
  "core-concept":  "core",
  evidence:        "core",
  mechanism:       "mechanism",
  process:         "sequence",
  "decision-point": "clinical",
  comparison:      "comparison",
  warning:         "warning",
  "clinical-pearl": "clinical",
};

function fallbackGroupType(canonicalType: string | null): GroupType {
  if (!canonicalType) return "core";
  return NODE_CANONICAL_TYPE_TO_GROUP_TYPE[canonicalType] ?? "core";
}

/**
 * Validate the AI-declared groups against the VSG + the nodeScripts that
 * actually survived grounding (groundedNodeIds, in narration order — the
 * same order the board gets drawn in). A node referenced by more than one
 * declared group keeps only its first assignment; a node never mentioned by
 * any group falls into a canonicalType-derived fallback group appended after
 * the highest declared order, bucketed and ordered by first appearance in
 * groundedNodeIds so the fallback still reads in narrative order.
 */
function resolveGroups(
  declaredGroups: ProfessorLessonScript["groups"],
  vsg: VisualSceneGraph,
  groundedNodeIds: string[],
): GroundedProfessorGroup[] {
  const vsgNodeIds = new Set(vsg.nodes.map(n => n.id));
  const groundedNodeIdSet = new Set(groundedNodeIds);
  const assigned = new Set<string>();
  const result: GroundedProfessorGroup[] = [];

  for (const g of declaredGroups) {
    const nodeIds = g.nodeIds.filter(id =>
      vsgNodeIds.has(id) && groundedNodeIdSet.has(id) && !assigned.has(id),
    );
    if (nodeIds.length === 0) continue; // hallucinated/duplicate/dropped-node group — skip
    nodeIds.forEach(id => assigned.add(id));
    result.push({ id: g.id, type: g.type, order: g.order, nodeIds });
  }

  const leftover = groundedNodeIds.filter(id => !assigned.has(id));
  if (leftover.length > 0) {
    const buckets = new Map<GroupType, string[]>();
    for (const id of leftover) {
      const node = vsg.nodes.find(n => n.id === id);
      const type = fallbackGroupType(node?.canonicalType ?? null);
      const bucket = buckets.get(type) ?? [];
      bucket.push(id);
      buckets.set(type, bucket);
    }
    const maxOrder = result.reduce((m, g) => Math.max(m, g.order), 0);
    let nextOrder = maxOrder + 1;
    let fallbackIndex = 0;
    for (const [type, nodeIds] of buckets) {
      result.push({ id: `fallback-group-${fallbackIndex++}`, type, order: nextOrder++, nodeIds });
    }
  }

  return result;
}

function sanitizeLabel(raw: string, maxWords = 8): string {
  const clamped = clampToShortLabel(raw, maxWords);
  if (!isParagraphShaped(clamped)) return clamped;
  // Still reads as multiple sentences even after the word clamp (e.g. several
  // short clauses crammed together) — cut at the FIRST sentence boundary
  // instead of just trimming words, so no trailing sentence survives.
  const firstSentenceEnd = clamped.search(/[.!?](?:\s|$)/);
  const singleSentence = firstSentenceEnd >= 0 ? clamped.slice(0, firstSentenceEnd) : clamped;
  return clampToShortLabel(singleSentence.replace(/[.!?]+$/, ""), Math.min(maxWords, 6));
}

function fallbackTeachingStructure(entry: ProfessorNodeScript): TeachingStructure {
  if (entry.teachingRole === "warning") return "exception-trap-warning";
  if (entry.teachingRole === "mechanism" || entry.drawingIntent === "chain") return "mechanism-causal-process";
  if (entry.drawingIntent === "sequence") return "sequence-procedure";
  if (entry.drawingIntent === "contrast") return "comparison-contrast";
  if (entry.teachingRole === "summary") return "synthesis-summary";
  return "definition-concept";
}

/**
 * Ground a ProfessorLessonScript against the VisualSceneGraph it was
 * generated for. Never throws — always returns a script the converter can
 * safely turn into an action timeline, even if every targetId was bogus
 * (nodeScripts then comes back empty; the caller — useProfessorLesson.ts —
 * treats that as a failure and surfaces a retry state, there is no
 * fallback generator to hand off to).
 */
export function groundProfessorLesson(
  script: ProfessorLessonScript,
  vsg: VisualSceneGraph,
): GroundedProfessorLessonScript {
  const nodeIds = new Set(vsg.nodes.map(n => n.id));
  const validIds = new Set<string>([...nodeIds, ...vsg.edges.map(e => e.id)]);

  const seenTargets = new Set<string>();
  let emphasizeUsed = false;
  const grounded: ProfessorNodeScript[] = [];

  for (const entry of script.nodeScripts) {
    if (!validIds.has(entry.targetId)) continue;      // hallucinated id — drop
    if (seenTargets.has(entry.targetId)) continue;     // duplicate — keep first only
    if (grounded.length >= MAX_GROUNDED_TARGETS) break; // density cap

    seenTargets.add(entry.targetId);
    const emphasize = Boolean(entry.emphasize) && !emphasizeUsed;
    if (emphasize) emphasizeUsed = true;
    // The chosen treatment only ever applies to the ONE winning emphasis —
    // every other entry (including one that set emphasize:true but lost the
    // "first wins" race above) is forced to "none" regardless of what the
    // model requested, so a downstream reader can trust
    // `emphasize === (emphasisTreatment !== "none")` always holds.
    const emphasisTreatment = emphasize
      ? (entry.emphasisTreatment === "none" ? "circle" : entry.emphasisTreatment)
      : "none";
    // Explain asides belong to a POINT, not a connector — an edge-target
    // entry with a non-empty explain[] gets none (a connector doesn't get
    // its own mini-diagram). Relationships are sanitized in a second pass
    // below, once the FINAL surviving node id set is known.
    const explain = nodeIds.has(entry.targetId) ? sanitizeExplain(entry.explain) : [];

    // Evidence references are ids only. Resolve them against CURRENT-page VSG
    // nodes here; edge ids and hallucinated/future-page ids are never allowed
    // to become Professor source passages. A node step always retains its own
    // target as the minimum traceable source.
    const targetEdge = vsg.edges.find(edge => edge.id === entry.targetId);
    const targetEvidenceIds = nodeIds.has(entry.targetId)
      ? [entry.targetId]
      : targetEdge
      ? [targetEdge.fromId, targetEdge.toId]
      : [];
    const sourceEvidence = Array.from(new Set([
      ...targetEvidenceIds,
      ...(entry.sourceEvidence ?? []).filter(id => nodeIds.has(id)),
    ])).slice(0, 4);

    // A visual=false step cannot smuggle in a camera move through a conflicting
    // planner field. Conversely a visual step cannot remain "stay-on-pdf";
    // deterministic execution promotes it to an active-concept focus.
    const visualNeeded = entry.visualNeeded !== false;
    const cameraIntent = visualNeeded
      ? (!entry.cameraIntent || entry.cameraIntent === "stay-on-pdf" ? "active-concept" : entry.cameraIntent)
      : "stay-on-pdf";

    grounded.push({
      ...entry,
      // Edge captions have less room at the midpoint than node labels do.
      // Keep their causal explanation to the prompt's 2-5-word contract;
      // node labels retain the existing 8-word ceiling.
      shortLabel: sanitizeLabel(entry.shortLabel, nodeIds.has(entry.targetId) ? 8 : 5),
      emphasize,
      emphasisTreatment,
      explain,
      sourceEvidence,
      visualNeeded,
      cameraIntent,
      teachingGoal: entry.teachingGoal?.trim() || entry.narration.trim(),
      teachingStructure: entry.teachingStructure ?? fallbackTeachingStructure(entry),
      visualIntent: entry.visualIntent?.trim() || entry.drawingIntent,
      checkpoint: entry.checkpoint?.trim() || null,
    });
  }

  const groundedNodeIds = grounded
    .map(entry => entry.targetId)
    .filter(id => vsg.nodes.some(n => n.id === id)); // groups are node-only, never edges

  // Second pass: relationships must be validated against the FINAL surviving
  // node set, not the entry's own local view — a relationship declared
  // before this entry in the raw script may target a node that got dropped
  // later (density cap, duplicate). Edge-target entries never get
  // relationships (same reasoning as explain above).
  const survivingNodeIds = new Set(groundedNodeIds);
  const withRelationships = grounded.map(entry => ({
    ...entry,
    relationships: nodeIds.has(entry.targetId)
      ? sanitizeRelationships(entry.relationships, entry.targetId, survivingNodeIds)
      : [],
  }));

  return {
    title:              sanitizeLabel(script.title.length > 0 ? clampToShortLabel(script.title, 6) : script.title),
    visualGrammar:      script.visualGrammar,
    teachingStructures: script.teachingStructures?.length
      ? script.teachingStructures
      : Array.from(new Set(withRelationships.map(entry => entry.teachingStructure ?? fallbackTeachingStructure(entry)))),
    centralQuestion:    clampToShortLabel(script.centralQuestion.trim(), 16),
    learningObjective:  script.learningObjective.trim(),
    synthesisQuestion:  script.synthesisQuestion.trim(),
    nodeScripts:         withRelationships,
    groups:              resolveGroups(script.groups, vsg, groundedNodeIds),
  };
}
