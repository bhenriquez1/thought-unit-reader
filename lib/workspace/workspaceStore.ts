// lib/workspace/workspaceStore.ts
// Zustand + persist store for the Personal Workspace.
// Items are keyed by bookId so each book has its own independent notebook.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  WorkspaceItem,
  WorkspaceItemType,
  NoteItem,
  FavoriteItem,
  PinItem,
  MnemonicItem,
  QuestionItem,
  TaskItem,
  HighlightItem,
} from "./workspaceTypes";

// ── Simple UUID without crypto dependency ─────────────────────────────────────
function uid(): string {
  return Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
}

// ── Store shape ───────────────────────────────────────────────────────────────

type ItemMap = Record<string, WorkspaceItem[]>; // bookId → items[]

interface WorkspaceState {
  // Data
  itemsByBook: ItemMap;

  // Getters
  getItems(bookId: string): WorkspaceItem[];
  getItemsByType(bookId: string, type: WorkspaceItemType): WorkspaceItem[];

  // Mutators
  addNote(bookId: string, title: string, content: string, pageRef?: number): string;
  addFavorite(bookId: string, conceptTitle: string, excerpt?: string, canonicalType?: string, pageRef?: number): string;
  addPin(bookId: string, quote: string, pageRef: number, chapter?: string, note?: string): string;
  addMnemonic(bookId: string, conceptTitle: string, mnemonic: string, pageRef?: number): string;
  addQuestion(bookId: string, question: string, pageRef?: number): string;
  addTask(bookId: string, text: string, pageRef?: number): string;
  addHighlight(bookId: string, quote: string, color: HighlightItem["color"], pageRef: number, note?: string): string;

  updateItem(bookId: string, id: string, patch: Partial<WorkspaceItem>): void;
  deleteItem(bookId: string, id: string): void;
  toggleTaskComplete(bookId: string, id: string): void;
  toggleQuestionAnswered(bookId: string, id: string): void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      itemsByBook: {},

      getItems(bookId) {
        return get().itemsByBook[bookId] ?? [];
      },

      getItemsByType(bookId, type) {
        return (get().itemsByBook[bookId] ?? []).filter(i => i.type === type);
      },

      addNote(bookId, title, content, pageRef) {
        const id = uid();
        const now = Date.now();
        const item: NoteItem = { id, bookId, type: "note", createdAt: now, updatedAt: now, title, content, pageRef };
        set(s => ({ itemsByBook: { ...s.itemsByBook, [bookId]: [item, ...(s.itemsByBook[bookId] ?? [])] } }));
        return id;
      },

      addFavorite(bookId, conceptTitle, excerpt, canonicalType, pageRef) {
        const id = uid();
        const now = Date.now();
        const item: FavoriteItem = { id, bookId, type: "favorite", createdAt: now, updatedAt: now, conceptTitle, excerpt, canonicalType, pageRef };
        set(s => ({ itemsByBook: { ...s.itemsByBook, [bookId]: [item, ...(s.itemsByBook[bookId] ?? [])] } }));
        return id;
      },

      addPin(bookId, quote, pageRef, chapter, note) {
        const id = uid();
        const now = Date.now();
        const item: PinItem = { id, bookId, type: "pin", createdAt: now, updatedAt: now, quote, pageRef, chapter, note };
        set(s => ({ itemsByBook: { ...s.itemsByBook, [bookId]: [item, ...(s.itemsByBook[bookId] ?? [])] } }));
        return id;
      },

      addMnemonic(bookId, conceptTitle, mnemonic, pageRef) {
        const id = uid();
        const now = Date.now();
        const item: MnemonicItem = { id, bookId, type: "mnemonic", createdAt: now, updatedAt: now, conceptTitle, mnemonic, pageRef };
        set(s => ({ itemsByBook: { ...s.itemsByBook, [bookId]: [item, ...(s.itemsByBook[bookId] ?? [])] } }));
        return id;
      },

      addQuestion(bookId, question, pageRef) {
        const id = uid();
        const now = Date.now();
        const item: QuestionItem = { id, bookId, type: "question", createdAt: now, updatedAt: now, question, answered: false, pageRef };
        set(s => ({ itemsByBook: { ...s.itemsByBook, [bookId]: [item, ...(s.itemsByBook[bookId] ?? [])] } }));
        return id;
      },

      addTask(bookId, text, pageRef) {
        const id = uid();
        const now = Date.now();
        const item: TaskItem = { id, bookId, type: "task", createdAt: now, updatedAt: now, text, completed: false, pageRef };
        set(s => ({ itemsByBook: { ...s.itemsByBook, [bookId]: [item, ...(s.itemsByBook[bookId] ?? [])] } }));
        return id;
      },

      addHighlight(bookId, quote, color, pageRef, note) {
        const id = uid();
        const now = Date.now();
        const item: HighlightItem = { id, bookId, type: "highlight", createdAt: now, updatedAt: now, quote, color, pageRef, note };
        set(s => ({ itemsByBook: { ...s.itemsByBook, [bookId]: [item, ...(s.itemsByBook[bookId] ?? [])] } }));
        return id;
      },

      updateItem(bookId, id, patch) {
        set(s => ({
          itemsByBook: {
            ...s.itemsByBook,
            [bookId]: (s.itemsByBook[bookId] ?? []).map(item =>
              item.id === id ? { ...item, ...patch, updatedAt: Date.now() } as WorkspaceItem : item
            ),
          },
        }));
      },

      deleteItem(bookId, id) {
        set(s => ({
          itemsByBook: {
            ...s.itemsByBook,
            [bookId]: (s.itemsByBook[bookId] ?? []).filter(item => item.id !== id),
          },
        }));
      },

      toggleTaskComplete(bookId, id) {
        set(s => ({
          itemsByBook: {
            ...s.itemsByBook,
            [bookId]: (s.itemsByBook[bookId] ?? []).map(item =>
              item.id === id && item.type === "task"
                ? { ...item, completed: !item.completed, updatedAt: Date.now() }
                : item
            ),
          },
        }));
      },

      toggleQuestionAnswered(bookId, id) {
        set(s => ({
          itemsByBook: {
            ...s.itemsByBook,
            [bookId]: (s.itemsByBook[bookId] ?? []).map(item =>
              item.id === id && item.type === "question"
                ? { ...item, answered: !item.answered, updatedAt: Date.now() }
                : item
            ),
          },
        }));
      },
    }),
    {
      name: "avrrio-workspace-v1",
      partialize: (s) => ({ itemsByBook: s.itemsByBook }),
    },
  ),
);
