// lib/learningHub/knowledgeStateSelectors.ts
// C8 (Phase 0 audit) — pure selection logic for KnowledgeStatePanel, kept
// separate from the component so it gets real behavioral tests (this repo
// has no jsdom/RTL render harness, so a React component's own inline logic
// only ever gets source-inspection coverage — pulling the logic out here
// gets it real tests instead, same discipline as
// lib/examEngine/examScope.ts's selectWeakNodes and
// lib/examEngine/recommendationEngine.ts's pure helpers).
//
// "Weak concepts" intentionally is NOT reimplemented here — it reuses
// lib/examEngine/examScope.ts's selectWeakNodes() directly, the exact same
// logic TestLab's own "weak areas" exam scope already uses, so a concept
// flagged weak in Learning Hub means the same thing TestLab means by it.

import type { KnowledgeNode, KnowledgeNodeProgress } from "@/lib/knowledge/knowledgeGraphSchema";

export interface KnowledgeStateInputs {
  nodes: KnowledgeNode[];
  progressByNodeId: Map<string, KnowledgeNodeProgress>;
  masteredThreshold?: number;
  maxItems?: number;
  /** Defaults to Date.now() — injectable so tests are deterministic. */
  now?: number;
}

const DEFAULT_MASTERED_THRESHOLD = 80;
const DEFAULT_MAX_ITEMS = 5;

/** Nodes whose spaced-repetition schedule says they're due (or overdue) for
 *  review right now, soonest-due first. A node with no nextReviewAt has
 *  never been scheduled — not the same as "due," so it's excluded rather
 *  than treated as infinitely overdue. */
export function selectDueForRecall(inputs: KnowledgeStateInputs): KnowledgeNode[] {
  const now = inputs.now ?? Date.now();
  const maxItems = inputs.maxItems ?? DEFAULT_MAX_ITEMS;
  return inputs.nodes
    .filter((n) => {
      const p = inputs.progressByNodeId.get(n.id);
      return !!p?.nextReviewAt && new Date(p.nextReviewAt).getTime() <= now;
    })
    .sort((a, b) => {
      const pa = inputs.progressByNodeId.get(a.id)?.nextReviewAt ?? "";
      const pb = inputs.progressByNodeId.get(b.id)?.nextReviewAt ?? "";
      return pa.localeCompare(pb);
    })
    .slice(0, maxItems);
}

/** Nodes at or above the mastery threshold, most-recently-reviewed first —
 *  "recently" mastered, not just "ever" mastered. A node with no
 *  lastReviewedAt sorts last among mastered nodes (empty string sorts
 *  before any ISO timestamp), never first. */
export function selectRecentlyMastered(inputs: KnowledgeStateInputs): KnowledgeNode[] {
  const threshold = inputs.masteredThreshold ?? DEFAULT_MASTERED_THRESHOLD;
  const maxItems = inputs.maxItems ?? DEFAULT_MAX_ITEMS;
  return inputs.nodes
    .filter((n) => (inputs.progressByNodeId.get(n.id)?.masteryScore ?? 0) >= threshold)
    .sort((a, b) => {
      const pa = inputs.progressByNodeId.get(a.id)?.lastReviewedAt ?? "";
      const pb = inputs.progressByNodeId.get(b.id)?.lastReviewedAt ?? "";
      return pb.localeCompare(pa);
    })
    .slice(0, maxItems);
}
