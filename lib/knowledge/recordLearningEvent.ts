// lib/knowledge/recordLearningEvent.ts
// Phase B3 — the shared read-apply-write helper for writing a
// LearningStateEvent to a node's progress record. Every module that reacts
// to a real learner activity (Whiteboard here; Recall's updateCardDifficulty
// in lib/recalllab/recallStore.ts predates this and has its own equivalent
// inline sequence) follows the same three steps: read existing progress (or
// start from emptyProgress), run it through the deterministic
// applyLearningEvent reducer, persist the result. Extracted here so a THIRD
// caller doesn't have to re-derive this sequence a third time.

import { getNodeProgress, saveNodeProgress } from "./knowledgeGraphStore";
import { applyLearningEvent, emptyProgress, type LearningStateEvent } from "./learningStateEvents";

export async function recordLearningEvent(
  nodeId: string,
  documentId: string,
  event: LearningStateEvent,
): Promise<void> {
  const existing = await getNodeProgress(nodeId);
  const base = existing ?? emptyProgress(nodeId, documentId);
  const next = applyLearningEvent(base, event);
  await saveNodeProgress(next);
}
