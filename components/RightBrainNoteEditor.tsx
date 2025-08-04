import React, { useEffect, useState } from 'react';
import {
  saveNote,
  updateNote,
  getNotesForBook,
  RightBrainNote,
} from '@/lib/noteService';

interface RightBrainNoteEditorProps {
  bookId: string; // Unique identifier for the current book
  initialText?: string;
  attachments?: string[];
  onDone?: () => void; // callback to return to reader
}

export default function RightBrainNoteEditor({
  bookId,
  initialText = '',
  attachments = [],
  onDone,
}: RightBrainNoteEditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState(initialText);
  const [tags, setTags] = useState('');
  const [localAttachments, setLocalAttachments] = useState<string[]>(attachments);
  const [notes, setNotes] = useState<RightBrainNote[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const debugMode = true; // ✅ Always true for now

  /** ===============================
   * 📌 Load notes for this book
   * =============================== */
  useEffect(() => {
    async function fetchNotes() {
      try {
        const loadedNotes = await getNotesForBook(bookId);
        if (debugMode) console.log('🛠 DEBUG → Loaded Notes:', loadedNotes);
        setNotes(loadedNotes || []);
      } catch (error) {
        console.error('❌ Error fetching notes:', error);
        setNotes([]);
      }
    }
    fetchNotes();
  }, [bookId]);

  /** ===============================
   * 📌 Select note for editing
   * =============================== */
  const handleSelectNote = (note: RightBrainNote) => {
    if (!note) return;
    setSelectedNoteId(note.id || null);
    setTitle(note.title || '');
    setContent(note.content || '');
    setTags(note.tags?.join(', ') || '');
    setLocalAttachments(note.attachments || []);
    if (debugMode) console.log('🛠 DEBUG → Editing Note:', note);
  };

  /** ===============================
   * 📌 Save or update note
   * =============================== */
  const handleSave = async () => {
    if (!title.trim() && !content.trim()) {
      alert('Please enter a title or content.');
      return;
    }

    const notePayload = {
      title: title.trim(),
      content: content.trim(),
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      attachments: localAttachments,
      bookId,
    };

    try {
      if (selectedNoteId) {
        await updateNote(selectedNoteId, notePayload);
        if (debugMode) console.log(`🛠 DEBUG → Updated Note ID: ${selectedNoteId}`, notePayload);
      } else {
        await saveNote(notePayload);
        if (debugMode) console.log('🛠 DEBUG → Saved New Note:', notePayload);
      }

      // Reload notes
      const refreshedNotes = await getNotesForBook(bookId);
      if (debugMode) console.log('🛠 DEBUG → Reloaded Notes:', refreshedNotes);
      setNotes(refreshedNotes || []);

      // Reset editor
      setSelectedNoteId(null);
      setTitle('');
      setContent('');
      setTags('');
      setLocalAttachments([]);

      // Return to reader
      if (onDone) onDone();
    } catch (error) {
      console.error('❌ Error saving/updating note:', error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white p-4 rounded-lg">
      {/* Header */}
      <h2 className="text-lg font-bold mb-2 text-yellow-400">
        🧠 Right Brain Notes
      </h2>

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

      {/* Title */}
      <input
        type="text"
        placeholder="Note Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mb-2 p-2 rounded bg-gray-800 border border-gray-700"
      />

      {/* Content */}
      <textarea
        rows={8}
        placeholder="Write your note..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="mb-2 p-2 rounded bg-gray-800 border border-gray-700 resize-none"
      />

      {/* Tags */}
      <input
        type="text"
        placeholder="Tags (comma separated)"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        className="mb-2 p-2 rounded bg-gray-800 border border-gray-700"
      />

      {/* Attachments */}
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

      {/* Save button */}
      <button
        onClick={handleSave}
        className="bg-yellow-500 hover:bg-yellow-600 text-black py-2 px-4 rounded mt-4"
      >
        {selectedNoteId ? 'Update Note' : 'Save Note'}
      </button>
    </div>
  );
}