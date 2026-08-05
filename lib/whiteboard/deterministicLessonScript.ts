// lib/whiteboard/deterministicLessonScript.ts
// AI-free fallback ProfessorLessonScript — the whiteboard's equivalent of
// lib/highlights/deterministicAnnotationPlan.ts. When the Professor Lesson
// Planner is unavailable or fails, the canvas must still perform a lesson
// (never fall back to the old static concept-map render), just without an
// AI-authored script: labels are the VSG's own node.label clamped to a short
// phrase, narration is the node's own source body text, and the single
// highest-importance node is the emphasized "high-yield point."

import type { VisualSceneGraph } from "./visualSceneGraph";
import type { GroundedProfessorLessonScript } from "./groundProfessorLesson";
import { clampToShortLabel } from "./textMetrics";
import { MAX_GROUNDED_TARGETS } from "./groundProfessorLesson";

const IMPORTANCE_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, reference: 3 };

const GRAMMAR_FALLBACK: Record<string, GroundedProfessorLessonScript["visualGrammar"]> = {
  flow: "concept-map",
  anatomy: "anatomy",
  pathway: "mechanism",
  "worked-solution": "equation",
  timeline: "procedure",
  "system-diagram": "anatomy",
  "case-map": "diagnosis",
};

/**
 * Build a deterministic, non-AI GroundedProfessorLessonScript directly from
 * a VisualSceneGraph — no network call, cannot fail, cannot hallucinate a
 * targetId (every entry comes from the vsg's own node/edge ids).
 */
export function buildDeterministicLessonScript(vsg: VisualSceneGraph): GroundedProfessorLessonScript {
  const sortedNodes = [...vsg.nodes].sort(
    (a, b) => (IMPORTANCE_RANK[a.importanceLevel] ?? 9) - (IMPORTANCE_RANK[b.importanceLevel] ?? 9),
  );
  const emphasizeId = sortedNodes[0]?.id ?? null;

  const nodeScripts: GroundedProfessorLessonScript["nodeScripts"] = [];

  for (const node of vsg.nodes) {
    if (nodeScripts.length >= MAX_GROUNDED_TARGETS) break;
    nodeScripts.push({
      targetId:   node.id,
      shortLabel: clampToShortLabel(node.label, 8),
      narration:  node.body || node.label,
      tone:       node.id === emphasizeId ? "introduce" : "explain",
      pace:       "normal",
      emphasize:  node.id === emphasizeId,
    });
  }
  for (const edge of vsg.edges) {
    if (nodeScripts.length >= MAX_GROUNDED_TARGETS) break;
    if (!edge.label) continue;
    nodeScripts.push({
      targetId:   edge.id,
      shortLabel: clampToShortLabel(edge.label, 8),
      narration:  edge.label,
      tone:       "connect",
      pace:       "normal",
      emphasize:  false,
    });
  }

  return {
    title:             clampToShortLabel(sortedNodes[0]?.label ?? "This Page", 6),
    visualGrammar:     GRAMMAR_FALLBACK[vsg.grammar] ?? "concept-map",
    synthesisQuestion: "How would you explain this back in your own words?",
    nodeScripts,
  };
}
