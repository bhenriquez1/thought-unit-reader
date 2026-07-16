// lib/knowledge/knowledgeSelectionStore.ts
// In-memory Zustand store — cross-module sync bus for the selected KnowledgeNode.
// Never persisted: selection resets on page reload, intentionally.

import { create } from "zustand";

interface KnowledgeSelectionState {
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
}

export const useKnowledgeSelectionStore = create<KnowledgeSelectionState>()((set) => ({
  selectedNodeId: null,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
}));
