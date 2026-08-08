// lib/knowledge/useNodeProgress.ts
// React hook: read and write KnowledgeNodeProgress for a single node.

import { useState, useEffect, useCallback } from "react";
import type { KnowledgeNodeProgress } from "./knowledgeGraphSchema";
import { getNodeProgress, saveNodeProgress } from "./knowledgeGraphStore";
import { applyLearningEvent, emptyProgress, type LearningStateEvent } from "./learningStateEvents";

export interface UseNodeProgressResult {
  progress:  KnowledgeNodeProgress | null;
  isLoading: boolean;
  /** Merge a partial patch and persist immediately. Prefer recordEvent()
   *  below for anything that should go through the deterministic event log
   *  (recall grading, whiteboard completion, etc.) — this is for ad hoc
   *  field updates only (e.g. a UI-driven confusionNodeIds edit). */
  update: (patch: Partial<Omit<KnowledgeNodeProgress, "nodeId">>) => Promise<void>;
  /** Apply a LearningStateEvent via the canonical reducer and persist the result. */
  recordEvent: (event: LearningStateEvent) => Promise<void>;
}

/** documentId is required so a first-ever progress record for this node is
 *  seeded correctly (KnowledgeNodeProgress.documentId must always be the
 *  resolved document identity — see knowledgeGraphSchema.ts). */
export function useNodeProgress(nodeId: string | null, documentId: string | null): UseNodeProgressResult {
  const [progress, setProgress]   = useState<KnowledgeNodeProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!nodeId) { setProgress(null); return; }
    setIsLoading(true);
    try {
      const p = await getNodeProgress(nodeId);
      setProgress(p ?? null);
    } catch (err) {
      console.error("[NODE_PROGRESS] load error", err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [nodeId]);

  useEffect(() => { load(); }, [load]);

  const update = useCallback(
    async (patch: Partial<Omit<KnowledgeNodeProgress, "nodeId">>) => {
      if (!nodeId || !documentId) return;
      const base: KnowledgeNodeProgress = progress ?? emptyProgress(nodeId, documentId);
      const next: KnowledgeNodeProgress = { ...base, ...patch };
      setProgress(next);
      try {
        await saveNodeProgress(next);
      } catch (err) {
        console.error("[NODE_PROGRESS] save error", err instanceof Error ? err.message : String(err));
      }
    },
    [nodeId, documentId, progress],
  );

  const recordEvent = useCallback(
    async (event: LearningStateEvent) => {
      if (!nodeId || !documentId) return;
      const base: KnowledgeNodeProgress = progress ?? emptyProgress(nodeId, documentId);
      const next = applyLearningEvent(base, event);
      setProgress(next);
      try {
        await saveNodeProgress(next);
      } catch (err) {
        console.error("[NODE_PROGRESS] save error", err instanceof Error ? err.message : String(err));
      }
    },
    [nodeId, documentId, progress],
  );

  return { progress, isLoading, update, recordEvent };
}
