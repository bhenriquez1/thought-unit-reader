// lib/workspace/workspaceTypes.ts
// Type definitions for the Personal Workspace — the student's own digital notebook.
//
// Distinct from AI-generated content: every item here is authored or curated
// by the student themselves. The workspace is per-book and persists locally.

export type WorkspaceItemType =
  | "note"       // free-form personal note
  | "favorite"   // starred concept (title + optional excerpt)
  | "pin"        // pinned textbook passage (exact quote + page)
  | "mnemonic"   // student's own memory device
  | "question"   // question for later / instructor
  | "task"       // to-do item (with completion state)
  | "highlight"  // personal highlight (color-coded, not AI highlights)
  | "link";      // link to a textbook location or page

// ── Base ──────────────────────────────────────────────────────────────────────

export interface WorkspaceItemBase {
  id: string;
  bookId: string;
  type: WorkspaceItemType;
  createdAt: number;     // Unix ms
  updatedAt: number;
  /** The page this item was created on (for "Jump to Source" navigation) */
  pageRef?: number;
  tags?: string[];
}

// ── Concrete item types ───────────────────────────────────────────────────────

export interface NoteItem extends WorkspaceItemBase {
  type: "note";
  title: string;
  content: string;       // markdown / plain text
}

export interface FavoriteItem extends WorkspaceItemBase {
  type: "favorite";
  conceptTitle: string;
  excerpt?: string;      // short snippet from the page
  canonicalType?: string;
}

export interface PinItem extends WorkspaceItemBase {
  type: "pin";
  quote: string;         // exact passage text
  chapter?: string;      // chapter or section label
  note?: string;         // optional personal annotation
}

export interface MnemonicItem extends WorkspaceItemBase {
  type: "mnemonic";
  conceptTitle: string;
  mnemonic: string;      // the memory device text
}

export interface QuestionItem extends WorkspaceItemBase {
  type: "question";
  question: string;
  answered: boolean;
  answer?: string;       // student's own answer or instructor note
}

export interface TaskItem extends WorkspaceItemBase {
  type: "task";
  text: string;
  completed: boolean;
  dueDate?: number;      // Unix ms
}

export interface HighlightItem extends WorkspaceItemBase {
  type: "highlight";
  quote: string;
  color: "yellow" | "green" | "blue" | "pink" | "orange";
  note?: string;
}

export interface LinkItem extends WorkspaceItemBase {
  type: "link";
  label: string;
  targetPage: number;
  targetBookId?: string;
}

export type WorkspaceItem =
  | NoteItem
  | FavoriteItem
  | PinItem
  | MnemonicItem
  | QuestionItem
  | TaskItem
  | HighlightItem
  | LinkItem;

// ── Aggregate ─────────────────────────────────────────────────────────────────

export interface BookWorkspace {
  bookId: string;
  items: WorkspaceItem[];
  /** Wall-clock of last modification */
  lastModified: number;
}

// ── Section config used by the UI ─────────────────────────────────────────────

export interface WorkspaceSection {
  type: WorkspaceItemType;
  label: string;
  icon: string;
  emptyText: string;
}

export const WORKSPACE_SECTIONS: WorkspaceSection[] = [
  { type: "note",      label: "Personal Notes",    icon: "✍️",  emptyText: "No personal notes yet. Start writing." },
  { type: "favorite",  label: "Favorites",          icon: "⭐",  emptyText: "Star concepts to save them here." },
  { type: "pin",       label: "Pinned Passages",    icon: "📌",  emptyText: "Pin textbook passages to revisit them." },
  { type: "mnemonic",  label: "Mnemonics",          icon: "🧠",  emptyText: "Add your own memory devices here." },
  { type: "question",  label: "Questions",          icon: "❓",  emptyText: "Capture questions for later or for your instructor." },
  { type: "task",      label: "Tasks",              icon: "✅",  emptyText: "Track what you need to review or do." },
  { type: "highlight", label: "My Highlights",      icon: "🖍️",  emptyText: "Your personal highlights appear here." },
];
