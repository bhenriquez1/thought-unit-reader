// lib/knowledge/recordLearningEvent.ts
// Phase B3 — the shared read-apply-write helper for writing a
// LearningStateEvent to a node's progress record. Every module that reacts
// to a real learner activity follows the same three steps: read existing
// progress (or start from emptyProgress), run it through the deterministic
// reducer, and persist the result.

import { getNodeProgress, saveNodeProgress } from "./knowledgeGraphStore";
import { applyLearningEvent, emptyProgress, type LearningStateEvent } from "./learningStateEvents";

export async function recordLearningEvent(
  nodeId: string,
  documentId: string,
  event: LearningStateEvent,
  pageTruthKey?: string,
): Promise<void> {
  const existing = await getNodeProgress(nodeId);
  // A node id must never carry progress across resolved documents. If an old
  // colliding record is encountered, start a clean document-owned record.
  const owned = existing?.documentId === documentId ? existing : null;
  const base = {
    ...(owned ?? emptyProgress(nodeId, documentId)),
    ...(pageTruthKey ? { pageTruthKey } : {}),
  };
  const next = applyLearningEvent(base, event);
  await saveNodeProgress(next);
}
