import React, { useEffect, useState } from "react";
import {
  createStickyNote,
  updateStickyNote,
  deleteStickyNote,
  getStickyNotes,
} from "@/lib/StickyNoteService";
import Button from "@/components/ui/button";
import Textarea from "@/components/ui/textarea";

type DrawerNote = {
  id: string;
  text: string;
  page?: number | null;
  userId?: string | null;
  createdAt?: any;
  updatedAt?: any;
};

interface Props {
  userId: string;
  lessonId?: string;
  currentPage?: number | null;
}

export default function StickyNoteDrawer({
  userId,
  lessonId = "global",
  currentPage = null,
}: Props) {
  const [notes, setNotes] = useState<DrawerNote[]>([]);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    try {
      const rows = await getStickyNotes(lessonId);
      setNotes(rows);
    } catch (e) {
      console.error("Failed to load sticky notes:", e);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  async function saveNote() {
    const trimmed = text.trim();
    if (!trimmed) return;

    setLoading(true);
    try {
      if (editingId) {
        await updateStickyNote(lessonId, editingId, {
          text: trimmed,
          page: currentPage ?? null,
        });
      } else {
        await createStickyNote(lessonId, {
          text: trimmed,
          page: currentPage ?? null,
          userId,
        });
      }
      setText("");
      setEditingId(null);
      await refresh();
    } catch (e) {
      console.error("Save note failed:", e);
      alert("Failed to save sticky note.");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(n: DrawerNote) {
    setEditingId(n.id);
    setText(n.text);
  }

  async function removeNote(id: string) {
    if (!confirm("Delete this note?")) return;
    setLoading(true);
    try {
      await deleteStickyNote(lessonId, id);
      await refresh();
    } catch (e) {
      console.error("Delete note failed:", e);
      alert("Failed to delete sticky note.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-3 bg-gray-900 text-white rounded-lg border border-gray-700">
      <h3 className="text-sm font-semibold mb-2">📝 Sticky Notes</h3>

      <Textarea
        placeholder="Write a quick note…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div className="mt-2 flex gap-2">
        <Button onClick={saveNote} disabled={loading}>
          {editingId ? "Update" : "Save"}
        </Button>
        {editingId && (
          <Button
            type="button"
            className="bg-gray-600 hover:bg-gray-700"
            onClick={() => {
              setEditingId(null);
              setText("");
            }}
          >
            Cancel
          </Button>
        )}
      </div>

      <ul className="mt-4 space-y-2 max-h-64 overflow-y-auto pr-1">
        {notes.length === 0 && (
          <li className="text-gray-400 text-sm">No notes yet.</li>
        )}
        {notes.map((n) => (
          <li
            key={n.id}
            className="p-2 rounded bg-gray-800 border border-gray-700 flex items-start justify-between gap-3"
          >
            <div className="text-sm whitespace-pre-wrap">{n.text}</div>
            <div className="flex-shrink-0 flex gap-2">
              <Button
                className="bg-yellow-600 hover:bg-yellow-700"
                onClick={() => startEdit(n)}
              >
                Edit
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700"
                onClick={() => removeNote(n.id)}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}