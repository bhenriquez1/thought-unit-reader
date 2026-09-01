// lib/knowledge/useNodeProgress.ts
// React hook: read and write KnowledgeNodeProgress for a single node.

import { useState, useEffect, useCallback, useRef } from "react";
import type { KnowledgeNode, KnowledgeNodeProgress } from "./knowledgeGraphSchema";
import { getNodeProgress, saveNodeProgress, getProgressForNodes } from "./knowledgeGraphStore";
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

export interface UseNodeProgressListResult {
  progressByNodeId: Map<string, KnowledgeNodeProgress>;
  isLoading: boolean;
  /** Re-fetch from IDB (call after an external write — e.g. a Recall grade
   *  or Whiteboard lesson completion elsewhere in the app — that this hook
   *  itself has no way to observe). */
  refresh: () => void;
}

/** L2 (Learning Hub orchestration correction) — bulk sibling of
 *  useNodeProgress, for a caller that needs progress across MANY nodes at
 *  once (e.g. lib/syllabus/chapterProgress.ts's per-chapter rollup over
 *  every KnowledgeNode in the active book, sourced from useKnowledgeGraph).
 *  Loads once per distinct node-id set (keyed by a joined id string so a
 *  same-length-different-nodes array, or the SAME ids in stable order
 *  re-rendering under a new array reference, doesn't reload spuriously),
 *  and exposes refresh() for callers to invoke on the app's existing
 *  "something was saved elsewhere" signals (mirrors the
 *  noteLabRefreshKey/recallLabRefreshKey pattern pages/index.tsx already
 *  uses for its other Syllabus-tab cross-module reads). */
export function useNodeProgressList(nodes: KnowledgeNode[]): UseNodeProgressListResult {
  const [progressByNodeId, setProgressByNodeId] = useState<Map<string, KnowledgeNodeProgress>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const nodeIdsRef = useRef<string[]>([]);
  nodeIdsRef.current = nodes.map((n) => n.id);
  const nodeIdsKey = nodeIdsRef.current.join(",");

  const load = useCallback(async () => {
    const nodeIds = nodeIdsRef.current;
    if (nodeIds.length === 0) { setProgressByNodeId(new Map()); return; }
    setIsLoading(true);
    try {
      const loaded = await getProgressForNodes(nodeIds);
      setProgressByNodeId(loaded);
    } catch (err) {
      console.error("[NODE_PROGRESS_LIST] load error", err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeIdsKey]);

  useEffect(() => { load(); }, [load]);

  return { progressByNodeId, isLoading, refresh: load };
}
