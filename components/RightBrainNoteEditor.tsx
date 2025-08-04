import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';

interface RightBrainNoteEditorProps {
  bookId: string; // Unique identifier for the current book
  initialText?: string;
  attachments?: string[];
}

interface Note {
  id?: string;
  title: string;
  content: string;
  tags: string[];
  attachments: string[];
  createdAt: Timestamp;
}

export default function RightBrainNoteEditor({
  bookId,
  initialText = '',
  attachments = [],
}: RightBrainNoteEditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState(initialText);
  const [tags, setTags] = useState('');
  const [localAttachments, setLocalAttachments] = useState<string[]>(attachments);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  /** ===============================
   * 📌 Load saved notes for this book
   * =============================== */
  useEffect(() => {
    const fetchNotes = async () => {
      if (!db) return;
      try {
        const q = query(collection(db, 'notes'), where('bookId', '==', bookId));
        const snapshot = await getDocs(q);
        const loadedNotes = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as Note[];
        setNotes(loadedNotes);
      } catch (error) {
        console.error('❌ Error fetching notes:', error);
      }
    };

    fetchNotes();
  }, [bookId]);

  /** ===============================
   * 📌 Load note into editor for editing
   * =============================== */
  const handleSelectNote = (note: Note) => {
    setSelectedNoteId(note.id || null);
    setTitle(note.title);
    setContent(note.content);
    setTags(note.tags.join(', '));
    setLocalAttachments(note.attachments || []);
  };

  /** ===============================
   * 📌 Save new or updated note
   * =============================== */
  const handleSave = async () => {
    if (!db) {
      console.error('Firestore is not initialized.');
      return;
    }

    const noteData = {
      title: title.trim(),
      content: content.trim(),
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      attachments: localAttachments,
      bookId,
      createdAt: Timestamp.now(),
    };

    try {
      if (selectedNoteId) {
        // Update existing note
        const noteRef = doc(db, 'notes', selectedNoteId);
        await updateDoc(noteRef, noteData);
        console.log('✅ Note updated in Firestore');
        setNotes((prev) =>
          prev.map((n) => (n.id === selectedNoteId ? { ...noteData, id: selectedNoteId } : n))
        );
      } else {
        // Create new note
        const docRef = await addDoc(collection(db, 'notes'), noteData);
        console.log('✅ New note saved to Firestore');
        setNotes((prev) => [...prev, { ...noteData, id: docRef.id }]);
      }

      // Reset editor
      setSelectedNoteId(null);
      setTitle('');
      setContent('');
      setTags('');
      setLocalAttachments([]);
    } catch (error) {
      console.error('❌ Error saving note:', error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white p-4 rounded-lg">
      <h2 className="text-lg font-bold mb-2">🧠 Right Brain Notes</h2>

      {/* Saved notes list */}
      {notes.length > 0 && (
        <div className="mb-4 bg-gray-800 p-3 rounded max-h-40 overflow-y-auto">
          <h3 className="font-semibold mb-2">📜 Saved Notes</h3>
          <ul className="space-y-2">
            {notes.map((note) => (
              <li
                key={note.id}
                onClick={() => handleSelectNote(note)}
                className={`p-2 rounded cursor-pointer ${
                  selectedNoteId === note.id
                    ? 'bg-yellow-500 text-black'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                <strong>{note.title || 'Untitled'}</strong>
                <p className="text-sm truncate">{note.content}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Note editor */}
      <input
        type="text"
        placeholder="Note Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mb-2 p-2 rounded bg-gray-800 border border-gray-700"
      />

      <textarea
        rows={8}
        placeholder="Write your note..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="mb-2 p-2 rounded bg-gray-800 border border-gray-700 resize-none"
      />

      <input
        type="text"
        placeholder="Tags (comma separated)"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        className="mb-2 p-2 rounded bg-gray-800 border border-gray-700"
      />

      {/* Attachments display */}
      {localAttachments.length > 0 && (
        <div className="mt-4 space-y-3">
          <h3 className="text-md font-semibold">📎 Attachments:</h3>
          {localAttachments.map((link, idx) => (
            <div key={idx} className="bg-gray-800 p-2 rounded">
              {link.includes('youtube.com') || link.includes('youtu.be') ? (
                <iframe
                  width="100%"
                  height="200"
                  src={link.replace('watch?v=', 'embed/')}
                  allowFullScreen
                ></iframe>
              ) : link.includes('vimeo.com') ? (
                <iframe
                  src={link.replace('vimeo.com', 'player.vimeo.com/video')}
                  width="100%"
                  height="200"
                  allowFullScreen
                ></iframe>
              ) : (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-yellow-400 underline"
                >
                  {link}
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handleSave}
        className="bg-yellow-500 hover:bg-yellow-600 text-black py-2 px-4 rounded mt-4"
      >
        {selectedNoteId ? 'Update Note' : 'Save Note'}
      </button>
    </div>
  );
}