// lib/knowledge/useKnowledgeGraph.ts
// React hook: loads KnowledgeNode records for the active book and provides
// a fast lookup by canonicalAnchorId.
//
// Read-only from the component side — to create or update nodes,
// use resolveOrCreateNode from knowledgeGraphStore (never call IDB directly).

import { useState, useEffect, useCallback, useRef } from "react";
import type { KnowledgeNode } from "./knowledgeGraphSchema";
import { getNodesByBook } from "./knowledgeGraphStore";

export interface UseKnowledgeGraphResult {
  nodes: KnowledgeNode[];
  isLoading: boolean;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  /** O(1) lookup by canonicalAnchorId. Returns undefined when no node exists yet. */
  getNodeForAnchor: (canonicalAnchorId: string) => KnowledgeNode | undefined;
  /** Re-fetch nodes from IDB (call after resolveOrCreateNode if UI needs to reflect new nodes). */
  refresh: () => void;
}

export function useKnowledgeGraph(bookId: string | null): UseKnowledgeGraphResult {
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // In-memory index: canonicalAnchorId → node for O(1) lookups
  const anchorIndexRef = useRef<Map<string, KnowledgeNode>>(new Map());

  const load = useCallback(async () => {
    if (!bookId) {
      setNodes([]);
      anchorIndexRef.current = new Map();
      return;
    }
    setIsLoading(true);
    try {
      const loaded = await getNodesByBook(bookId);
      setNodes(loaded);
      anchorIndexRef.current = new Map(loaded.map(n => [n.canonicalAnchorId, n]));
    } catch (err) {
      console.error("[KG_HOOK] load error", err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [bookId]);

  useEffect(() => { load(); }, [load]);

  const getNodeForAnchor = useCallback(
    (canonicalAnchorId: string) => anchorIndexRef.current.get(canonicalAnchorId),
    [],
  );

  return {
    nodes,
    isLoading,
    selectedNodeId,
    setSelectedNodeId,
    getNodeForAnchor,
    refresh: load,
  };
}
