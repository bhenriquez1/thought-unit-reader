// components/StickyNotePanel.tsx

import React, { useState, useEffect } from 'react';
import { StickyNote } from '@/types/StickyNote';
import { createStickyNote, updateStickyNote, deleteStickyNote, getStickyNotes } from '@/lib/StickyNoteService';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  userId: string;
  fileId: string;
  pageNumber: number;
  childName?: string;
}

export default function StickyNotePanel({ userId, fileId, pageNumber, childName }: Props) {
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [newNote, setNewNote] = useState('');

  useEffect(() => {
    const fetchNotes = async () => {
      const fetched = await getStickyNotes(userId, fileId, pageNumber, childName);
      setNotes(fetched);
    };
    fetchNotes();
  }, [userId, fileId, pageNumber, childName]);

  const handleSave = async () => {
    if (!newNote.trim()) return;
    const note: StickyNote = {
      userId,
      fileId,
      pageNumber,
      childName: childName || null,
      content: newNote,
      timestamp: Date.now(),
    };
    await createStickyNote(note);
    setNewNote('');
    const updatedNotes = await getStickyNotes(userId, fileId, pageNumber, childName);
    setNotes(updatedNotes);
  };

  const handleDelete = async (noteId: string) => {
    await deleteStickyNote(noteId);
    setNotes(notes.filter((n) => n.id !== noteId));
  };

  const handleUpdate = async (noteId: string, content: string) => {
    await updateStickyNote(noteId, content);
  };

  return (
    <div className="w-full p-4 border-t dark:border-zinc-700 mt-4">
      <h3 className="text-lg font-semibold mb-2">Sticky Notes for Page {pageNumber}</h3>

      {notes.map((note) => (
        <div key={note.id} className="mb-3">
          <Textarea
            defaultValue={note.content}
            className="w-full resize-none text-base"
            onBlur={(e) => handleUpdate(note.id!, e.target.value)}
          />
          <Button variant="ghost" size="sm" onClick={() => handleDelete(note.id!)} className="mt-1 text-red-500">
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
      <Button onClick={handleSave} className="mt-2">Save Note</Button>
    </div>
  );
}