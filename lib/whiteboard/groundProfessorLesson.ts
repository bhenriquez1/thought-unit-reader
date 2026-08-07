// lib/whiteboard/groundProfessorLesson.ts
// Grounding/validation layer for a ProfessorLessonScript — the same "AI
// proposes, deterministic code verifies-or-drops" discipline
// groundSurgeonQuotes.ts applies to PDF highlights, applied here to the
// whiteboard's teaching script:
//   - A targetId that doesn't name a real VisualSceneGraph node/edge id is
//     dropped, never rendered (OpenAI never invents nodes).
//   - Every surviving shortLabel is clamped to <=8 words / non-paragraph-
//     shaped, regardless of what the model returned.
//   - At most ONE node/edge is emphasized (the single "circle the high-yield
//     point" moment) — later duplicates are demoted, not multiplied.
//   - Total surviving targets are capped so the canvas stays under ~10
//     primary objects even if the underlying VSG has more nodes/edges.

import type { VisualSceneGraph } from "./visualSceneGraph";
import type { ProfessorLessonScript, ProfessorNodeScript, GroupType } from "./professorLessonPlan";
import { clampToShortLabel, isParagraphShaped } from "./textMetrics";

/** Keeps the canvas readable — the VSG itself may carry up to 12 nodes plus
 *  edges; this is the whiteboard-specific "fewer than 10 main visual
 *  objects" ceiling applied on top of that. */
export const MAX_GROUNDED_TARGETS = 10;

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

function sanitizeLabel(raw: string): string {
  const clamped = clampToShortLabel(raw, 8);
  if (!isParagraphShaped(clamped)) return clamped;
  // Still reads as multiple sentences even after the word clamp (e.g. several
  // short clauses crammed together) — cut at the FIRST sentence boundary
  // instead of just trimming words, so no trailing sentence survives.
  const firstSentenceEnd = clamped.search(/[.!?](?:\s|$)/);
  const singleSentence = firstSentenceEnd >= 0 ? clamped.slice(0, firstSentenceEnd) : clamped;
  return clampToShortLabel(singleSentence.replace(/[.!?]+$/, ""), 6);
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
  const validIds = new Set<string>([
    ...vsg.nodes.map(n => n.id),
    ...vsg.edges.map(e => e.id),
  ]);

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

    grounded.push({
      ...entry,
      shortLabel: sanitizeLabel(entry.shortLabel),
      emphasize,
    });
  }

  const groundedNodeIds = grounded
    .map(entry => entry.targetId)
    .filter(id => vsg.nodes.some(n => n.id === id)); // groups are node-only, never edges

  return {
    title:              sanitizeLabel(script.title.length > 0 ? clampToShortLabel(script.title, 6) : script.title),
    visualGrammar:      script.visualGrammar,
    learningObjective:  script.learningObjective.trim(),
    synthesisQuestion:  script.synthesisQuestion.trim(),
    nodeScripts:         grounded,
    groups:              resolveGroups(script.groups, vsg, groundedNodeIds),
  };
}
