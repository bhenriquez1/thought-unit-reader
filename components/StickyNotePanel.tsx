// components/StickyNotePanel.tsx
import React, { useEffect, useState } from "react";
import {
  // legacy page-based APIs from the service
  createStickyNote,
  updateStickyNote,
  deleteStickyNote,
  fetchStickyNotes,
  type StickyNote as LegacyStickyNote,
} from "@/lib/StickyNoteService";
import Button from "@/components/ui/button";
import Textarea from "@/components/ui/textarea";

interface Props {
  userId: string;
  fileId: string;
  pageNumber: number;
  childName?: string;
}

export default function StickyNotePanel({
  userId,
  fileId,
  pageNumber,
  childName,
}: Props) {
  const [notes, setNotes] = useState<LegacyStickyNote[]>([]);
  const [newNote, setNewNote] = useState("");

  // Load notes for this file/page (legacy: fetch all for file, then filter by page)
  useEffect(() => {
    const load = async () => {
      const all = await fetchStickyNotes(userId, fileId, childName);
      setNotes(all.filter((n) => n.pageNumber === pageNumber));
    };
    load();
  }, [userId, fileId, pageNumber, childName]);

  const handleSave = async () => {
    const content = newNote.trim();
    if (!content) return;

    const note: LegacyStickyNote = {
      userId,
      fileId,
      pageNumber,
      content,
      ...(childName ? { childName } : {}),
    };

    await createStickyNote(note); // legacy overload that accepts the shape above
    setNewNote("");

    const refreshed = await fetchStickyNotes(userId, fileId, childName);
    setNotes(refreshed.filter((n) => n.pageNumber === pageNumber));
  };

  const handleDelete = async (noteId: string) => {
    await deleteStickyNote(noteId); // legacy overload
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  };

  const handleUpdate = async (noteId: string, content: string) => {
    await updateStickyNote(noteId, content); // legacy overload
  };

  return (
    <div className="w-full p-4 border-t dark:border-zinc-700 mt-4">
      <h3 className="text-lg font-semibold mb-2">
        Sticky Notes for Page {pageNumber}
      </h3>

      {notes.map((note) => (
        <div key={note.id} className="mb-3">
          <Textarea
            defaultValue={note.content}
            className="w-full resize-none text-base"
            onBlur={(e) => handleUpdate(note.id!, e.target.value)}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDelete(note.id!)}
            className="mt-1 text-red-500"
          >
            Delete
          </Button>
        </div>
      ))}

      <Textarea
        placeholder="Add a new note..."
        value={newNote}
        onChange={(e) => setNewNote(e.target.value)}
        className="w-full resize-none text-base mt-4"
      />
      <Button onClick={handleSave} className="mt-2">
        Save Note
      </Button>
    </div>
  );
}