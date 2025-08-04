// components/RightBrainNoteEditor.tsx
import React, { useEffect, useState } from "react";
import {
  saveNote,
  updateNote,
  getNotesForBook,
  RightBrainNote,
} from "@/lib/noteService";
import { firebaseConnected, auth } from "@/lib/firebase";
import { User } from "firebase/auth";

interface RightBrainNoteEditorProps {
  bookId: string; // unique per uploaded PDF
  initialText?: string;
  attachments?: string[];
  onDone?: () => void;
}

export default function RightBrainNoteEditor({
  bookId,
  initialText = "",
  attachments = [],
  onDone,
}: RightBrainNoteEditorProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState(initialText);
  const [tags, setTags] = useState("");
  const [localAttachments, setLocalAttachments] = useState<string[]>(attachments);
  const [notes, setNotes] = useState<RightBrainNote[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  /** ===============================
   * 📌 Track signed‑in user
   * =============================== */
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => setUser(u));
    return () => unsubscribe();
  }, []);

  /** ===============================
   * 📌 Load notes for this PDF
   * =============================== */
  useEffect(() => {
    if (!firebaseConnected || !user) {
      return;
    }
    async function fetchNotes() {
      const loadedNotes = await getNotesForBook(user.uid, bookId);
      setNotes(loadedNotes);
    }
    fetchNotes();
  }, [bookId, user]);

  /** ===============================
   * 📌 Select note for editing
   * =============================== */
  const handleSelectNote = (note: RightBrainNote) => {
    setSelectedNoteId(note.id || null);
    setTitle(note.title);
    setContent(note.content);
    setTags(note.tags.join(", "));
    setLocalAttachments(note.attachments || []);
  };

  /** ===============================
   * 📌 Save or update note in Firestore
   * =============================== */
  const handleSave = async () => {
    if (!firebaseConnected || !user) {
      alert("⚠️ Please sign in with Google to save notes.");
      return;
    }
    if (!title.trim() && !content.trim()) {
      alert("Please enter a title or content.");
      return;
    }

    if (selectedNoteId) {
      await updateNote(user.uid, selectedNoteId, {
        title: title.trim(),
        content: content.trim(),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        attachments: localAttachments,
      });
    } else {
      await saveNote(user.uid, {
        title: title.trim(),
        content: content.trim(),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        attachments: localAttachments,
        bookId,
      });
    }

    // Reset
    setSelectedNoteId(null);
    setTitle("");
    setContent("");
    setTags("");
    setLocalAttachments([]);

    // Reload
    const refreshedNotes = await getNotesForBook(user.uid, bookId);
    setNotes(refreshedNotes);

    if (onDone) onDone();
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white p-4 rounded-lg">
      {/* Header */}
      <h2 className="text-lg font-bold mb-2 text-yellow-400">🧠 Right Brain Notes</h2>

      {/* Saved Notes */}
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
                    ? "bg-yellow-500 text-black"
                    : "bg-gray-700 hover:bg-gray-600"
                }`}
              >
                <strong>{note.title || "Untitled"}</strong>
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
              {link.includes("youtube.com") || link.includes("youtu.be") ? (
                <iframe
                  width="100%"
                  height="200"
                  src={link.replace("watch?v=", "embed/")}
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
        {selectedNoteId ? "Update Note" : "Save Note"}
      </button>
    </div>
  );
}