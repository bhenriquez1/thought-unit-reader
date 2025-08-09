// components/StickyNoteDrawer.tsx
import React, { useEffect, useState } from "react";
import {
  createStickyNote,
  updateStickyNote,
  deleteStickyNote,
  getStickyNotes,
} from "@/lib/StickyNoteService";

/** Minimal note shape (avoid external type import) */
type StickyNote = {
  id?: string;
  text: string;
  page?: number | null;
  createdAt?: any;
  updatedAt?: any;
  userId?: string | null;
};

interface StickyNoteDrawerProps {
  /** Where to persist notes (e.g., book/lesson/document id) */
  lessonId: string;
  /** Optional: associate notes to a user */
  userId?: string | null;
  /** Optional: current page (if you tie notes to pages) */
  page?: number | null;
  /** Optional: close handler for a drawer/sheet */
  onClose?: () => void;
  /** Optional: title to display in header */
  title?: string;
}

export default function StickyNoteDrawer({
  lessonId,
  userId = null,
  page = null,
  onClose,
  title = "Sticky Notes",
}: StickyNoteDrawerProps) {
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    try {
      setLoading(true);
      // If your service supports filters, pass them here; otherwise just lessonId
      const list = await getStickyNotes(lessonId);
      setNotes(Array.isArray(list) ? list : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!lessonId) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  async function saveNote() {
    const value = text.trim();
    if (!value) return;

    if (editingId) {
      await updateStickyNote(lessonId, editingId, { text: value });
      setEditingId(null);
    } else {
      await createStickyNote(lessonId, { text: value, page, userId: userId ?? undefined });
    }
    setText("");
    await refresh();
  }

  async function startEdit(n: StickyNote) {
    setEditingId(n.id || null);
    setText(n.text || "");
  }

  async function removeNote(id?: string) {
    if (!id) return;
    await deleteStickyNote(lessonId, id);
    if (editingId === id) {
      setEditingId(null);
      setText("");
    }
    await refresh();
  }

  return (
    <div className="flex h-full flex-col bg-gray-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <h3 className="font-semibold">{title}</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded bg-gray-700 px-2 py-1 text-sm hover:bg-gray-600"
          >
            ✖ Close
          </button>
        )}
      </div>

      {/* Editor */}
      <div className="p-4 space-y-2">
        <label className="text-sm opacity-80">New note</label>
        <textarea
          className="w-full min-h-[120px] p-2 rounded border border-gray-700 bg-gray-800 text-white placeholder-gray-400"
          placeholder="Type a sticky note…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            onClick={saveNote}
            className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
          >
            {editingId ? "Update" : "Save"}
          </button>
          {editingId && (
            <button
              onClick={() => {
                setEditingId(null);
                setText("");
              }}
              className="px-3 py-1 rounded border border-gray-600 hover:bg-gray-800"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="mb-2 text-sm opacity-70">
          {loading ? "Loading…" : `${notes.length} note${notes.length === 1 ? "" : "s"}`}
        </div>

        {notes.length === 0 ? (
          <div className="rounded border border-dashed border-gray-700 p-4 text-sm text-gray-400">
            No notes yet. Add one above.
          </div>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li
                key={n.id ?? Math.random().toString(36)}
                className="rounded border border-gray-800 bg-gray-850 p-3"
              >
                <div className="whitespace-pre-wrap break-words">{n.text}</div>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => startEdit(n)}
                    className="rounded bg-gray-700 px-2 py-1 text-sm hover:bg-gray-600"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => removeNote(n.id)}
                    className="rounded bg-red-600 px-2 py-1 text-sm hover:bg-red-700 text-white"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}