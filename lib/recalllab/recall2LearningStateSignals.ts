// lib/recalllab/recall2LearningStateSignals.ts
// C3 fix — bridges Recall 2.0's Weak-Area Drill to the shared Learning
// State Engine (lib/knowledge/knowledgeGraphStore.ts's getNodeProgress),
// the SAME per-concept record TestLab (lib/datApex/datLearningState.ts)
// and Elena (lib/elena/childLearningState.ts) write into. Deliberately a
// thin adapter, not a second mastery computation: every number here is
// read directly off KnowledgeNodeProgress, never re-derived independently
// (see lib/recalllab/recall2Srs.ts's RecallWeaknessSignal for what's
// actually consumed).

import { getNodeProgress } from "@/lib/knowledge/knowledgeGraphStore";
import type { RecallBlueprint } from "./recall2Types";
import type { RecallWeaknessSignal } from "./recall2Srs";

/** Fetches a weakness signal per unique knowledgeNodeId referenced by
 *  `blueprints`. Best-effort: a card with no knowledgeNodeId, or a lookup
 *  that fails/finds nothing, simply has no entry in the returned map —
 *  callers already treat a missing signal as "fall back to Recall's own
 *  local SM-2 state," never as an error. */
export async function fetchRecallWeaknessSignals(
  blueprints: RecallBlueprint[],
): Promise<Map<string, RecallWeaknessSignal>> {
  const nodeIds = Array.from(new Set(
    blueprints.map((bp) => bp.knowledgeNodeId).filter((id): id is string => !!id),
  ));

  const signals = new Map<string, RecallWeaknessSignal>();
  await Promise.all(nodeIds.map(async (nodeId) => {
    try {
      const progress = await getNodeProgress(nodeId);
      if (!progress) return;
      signals.set(nodeId, {
        masteryScore: progress.masteryScore,
        datPerformance: progress.datPerformance
          ? { attempts: progress.datPerformance.attempts, correct: progress.datPerformance.correct }
          : null,
      });
    } catch {
      // Best-effort — a lookup failure just leaves this node's signal absent.
    }
  }));
  return signals;
}
