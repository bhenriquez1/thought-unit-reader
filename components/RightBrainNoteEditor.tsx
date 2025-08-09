// components/RightBrainNoteEditor.tsx
import React, { useEffect, useState } from "react";
import {
  saveNote,
  updateNote,
  getNotesForBook,
  type RightBrainNote,
} from "@/lib/noteService";
import { createFlashcardFromSelection } from "@/lib/flashcardService";
import { addMindMapNode } from "@/lib/mindMapService";
import summarizeText from "@/lib/aiSummary"; // ✅ default import
import { firebaseConnected, auth } from "@/lib/firebase";
import { generateMnemonic } from "@/lib/mnemonicAI";
import { useAIReview } from "@/hooks/useAIReview";
import type { User } from "firebase/auth";

const getSelectionText = () => window.getSelection()?.toString().trim() || "";

export interface RightBrainNoteEditorProps {
  bookId: string;
  initialText?: string;
  attachments?: string[];
  currentPage?: number;
  dictationText?: string;
  onDone?: () => void;
}

export default function RightBrainNoteEditor({
  bookId,
  initialText = "",
  attachments = [],
  currentPage,
  dictationText = "",
  onDone,
}: RightBrainNoteEditorProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState(initialText);
  const [mnemonic, setMnemonic] = useState("");
  const [tags, setTags] = useState("");
  const [localAttachments, setLocalAttachments] = useState<string[]>(attachments);
  const [notes, setNotes] = useState<RightBrainNote[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isGeneratingMnemonic, setIsGeneratingMnemonic] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // ✅ spaced-repetition review (cards)
  const { isReviewMode, currentCard, startReviewMode, gradeCard } = useAIReview(user?.uid);

  // Auth
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => setUser(u));
    return () => unsubscribe();
  }, []);

  // Load notes for this book
  useEffect(() => {
    if (!firebaseConnected || !user) return;
    getNotesForBook(user.uid, bookId).then(setNotes);
  }, [bookId, user]);

  // Auto-generate mnemonic for initial text
  useEffect(() => {
    if (!initialText.trim()) return;
    (async () => {
      setIsGeneratingMnemonic(true);
      try {
        const generated = await generateMnemonic(initialText);
        setMnemonic(generated);
      } catch (err) {
        console.error("❌ Mnemonic generation failed:", err);
      } finally {
        setIsGeneratingMnemonic(false);
      }
    })();
  }, [initialText]);

  // Append live dictation to content
  useEffect(() => {
    if (dictationText && dictationText.trim()) {
      setContent((prev) => {
        if (prev.endsWith(dictationText)) return prev;
        return (prev ? prev + " " : "") + dictationText;
      });
    }
  }, [dictationText]);

  const handleSelectNote = (note: RightBrainNote) => {
    setSelectedNoteId(note.id || null);
    setTitle(note.title);
    setContent(note.content);
    setMnemonic(note.mnemonic || "");
    setTags(note.tags.join(", "));
    setLocalAttachments(note.attachments || []);
  };

  const handleSave = async () => {
    if (!firebaseConnected || !user) {
      alert("⚠️ Please sign in to save notes.");
      return;
    }
    if (!title.trim() && !content.trim()) {
      alert("Please enter a title or content.");
      return;
    }

    const noteData = {
      title: title.trim(),
      content: content.trim(),
      mnemonic: mnemonic.trim(),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      attachments: localAttachments,
      bookId,
      page: currentPage || null,
    };

    if (selectedNoteId) {
      await updateNote(user.uid, selectedNoteId, noteData);
    } else {
      await saveNote(user.uid, noteData);
    }

    setSelectedNoteId(null);
    setTitle("");
    setContent("");
    setMnemonic("");
    setTags("");
    setLocalAttachments([]);

    const refreshed = await getNotesForBook(user.uid, bookId);
    setNotes(refreshed);

    onDone?.();
  };

  const handleExportFlashcard = async () => {
    if (!user) return alert("Sign in to create flashcards.");
    const selection = getSelectionText() || content.trim() || title.trim();
    if (!selection) return alert("Highlight or enter text first.");
    await createFlashcardFromSelection(selection, currentPage);
    alert("📇 Flashcard saved for review!");
  };

  const handleExportMindMap = async () => {
    if (!user) return alert("Sign in to create mind map nodes.");
    const selection = getSelectionText() || content.trim() || title.trim();
    if (!selection) return alert("Highlight or enter text first.");
    await addMindMapNode(selection, currentPage);
    alert("🧠 Mind Map node saved!");
  };

  const handleSummarize = async () => {
    if (!content.trim()) return alert("No text to summarize.");
    setIsSummarizing(true);
    try {
      const summary = await summarizeText(content);
      setContent(summary);
    } catch (err) {
      console.error("❌ Summarization failed:", err);
      alert("Failed to summarize text.");
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white p-4 rounded-lg">
      <h2 className="text-lg font-bold mb-2 text-yellow-400">🧠 Right Brain Notes</h2>

      {isReviewMode ? (
        <div className="bg-gray-800 p-4 rounded-lg">
          {currentCard ? (
            <>
              <p className="mb-3"><strong>Question:</strong> {currentCard.front}</p>
              <p className="mb-3"><strong>Answer:</strong> {currentCard.back}</p>
              <button onClick={gradeCard} className="bg-blue-500 px-3 py-1 rounded">
                Next Card
              </button>
            </>
          ) : (
            <p>All cards reviewed 🎉</p>
          )}
        </div>
      ) : (
        <>
          {notes.length > 0 && (
            <div className="mb-4 bg-gray-800 p-3 rounded max-h-40 overflow-y-auto">
              <h3 className="font-semibold mb-2">📜 Saved Notes</h3>
              <ul className="space-y-2">
                {notes.map((note) => (
                  <li
                    key={note.id}
                    onClick={() => handleSelectNote(note)}
                    className={`p-2 rounded cursor-pointer ${
                      selectedNoteId === note.id ? "bg-yellow-500 text-black" : "bg-gray-700 hover:bg-gray-600"
                    }`}
                  >
                    <strong>{note.title || "Untitled"}</strong>
                    <p className="text-sm truncate">{note.content}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <input
            type="text"
            placeholder="Note Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mb-2 p-2 rounded bg-gray-800 border border-gray-700"
          />

          <textarea
            rows={6}
            placeholder="Write your note..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="mb-2 p-2 rounded bg-gray-800 border border-gray-700 resize-none"
          />

          <textarea
            rows={2}
            placeholder="Mnemonic (auto-generated)"
            value={isGeneratingMnemonic ? "Generating mnemonic..." : mnemonic}
            onChange={(e) => setMnemonic(e.target.value)}
            className="mb-2 p-2 rounded bg-purple-800 border border-purple-700 resize-none text-purple-200"
          />

          <input
            type="text"
            placeholder="Tags (comma separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="mb-2 p-2 rounded bg-gray-800 border border-gray-700"
          />

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
                    />
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

          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={handleSave}
              className="bg-yellow-500 hover:bg-yellow-600 text-black py-2 px-4 rounded"
            >
              {selectedNoteId ? "Update Note" : "Save Note"}
            </button>

            <button
              onClick={handleExportFlashcard}
              className="bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded"
            >
              📇 Export Flashcard
            </button>

            <button
              onClick={handleExportMindMap}
              className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded"
            >
              🧠 Export Mind Map
            </button>

            <button
              onClick={handleSummarize}
              disabled={isSummarizing}
              className="bg-orange-500 hover:bg-orange-600 text-white py-2 px-4 rounded"
            >
              {isSummarizing ? "Summarizing..." : "✨ Summarize"}
            </button>

            <button
              onClick={startReviewMode}
              className="bg-purple-500 hover:bg-purple-600 text-white py-2 px-4 rounded"
            >
              📅 Start Review
            </button>
          </div>
        </>
      )}
    </div>
  );
}