// lib/knowledge/useNodeProgress.ts
// React hook: read and write KnowledgeNodeProgress for a single node.

import { useState, useEffect, useCallback } from "react";
import type { KnowledgeNodeProgress } from "./knowledgeGraphSchema";
import { getNodeProgress, saveNodeProgress } from "./knowledgeGraphStore";

export interface UseNodeProgressResult {
  progress:  KnowledgeNodeProgress | null;
  isLoading: boolean;
  /** Merge a partial patch and persist immediately. */
  update: (patch: Partial<Omit<KnowledgeNodeProgress, "nodeId">>) => Promise<void>;
}

export function useNodeProgress(nodeId: string | null): UseNodeProgressResult {
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
      if (!nodeId) return;
      const base: KnowledgeNodeProgress = progress ?? emptyProgress(nodeId);
      const next: KnowledgeNodeProgress = { ...base, ...patch };
      setProgress(next);
      try {
        await saveNodeProgress(next);
      } catch (err) {
        console.error("[NODE_PROGRESS] save error", err instanceof Error ? err.message : String(err));
      }
    },
    [nodeId, progress],
  );

  return { progress, isLoading, update };
}

function emptyProgress(nodeId: string): KnowledgeNodeProgress {
  return {
    nodeId,
    understandingScore: 0,
    recallScore:        0,
    memoryStrength:     0,
    masteryScore:       0,
    confidenceScore:    0,
    lastStudiedAt:      null,
    lastReviewedAt:     null,
    nextReviewAt:       null,
    predictedForgetAt:  null,
    missCount:          0,
    correctCount:       0,
    confusionNodeIds:   [],
  };
}
