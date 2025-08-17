"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  saveNote,
  updateNote,
  getNotesForBook,
  type RightBrainNote,
} from "@/lib/noteService";
import { createFlashcardFromSelection } from "@/lib/flashcardService";
import { addMindMapNode } from "@/lib/mindMapService";
import summarizeText from "@/lib/aiSummary";
import { firebaseConnected, auth } from "@/lib/firebase";
import { generateMnemonic } from "@/lib/mnemonicAI";
import { useAIReview } from "@/hooks/useAIReview";
import type { User } from "firebase/auth";

/** Basic, safe selection getter (used for Flashcard/Mindmap fallbacks) */
const getSelectionText = () =>
  (typeof window !== "undefined" ? window.getSelection()?.toString().trim() : "") || "";

export interface RightBrainNoteEditorProps {
  bookId: string;
  initialText?: string;
  attachments?: string[];
  /** Page is stored with the note (when provided) */
  currentPage?: number;
  /** Live dictation can be appended as it comes in */
  dictationText?: string;
  /** Called after successful save */
  onDone?: () => void;
}

/** Compose a “top-student” structured note (no external API needed) */
async function buildStructuredNote(seed: string) {
  const base = seed.trim();
  const [summary, mnem] = await Promise.allSettled([
    base ? summarizeText(base) : Promise.resolve(""),
    base ? generateMnemonic(base) : Promise.resolve(""),
  ]);
  const bestSummary = summary.status === "fulfilled" ? summary.value : base;
  const bestMnemonic = mnem.status === "fulfilled" ? mnem.value : "";

  const template = [
    `# Title: `,
    ``,
    `## Big Idea`,
    bestSummary || base || "…",
    ``,
    `## Evidence / Details`,
    `- Key facts / steps`,
    `- Exceptions / edge-cases`,
    ``,
    `## Visual Sketch (describe or doodle)`,
    `- Diagram plan: boxes/arrows/labels to show relationships`,
    ``,
    `## Mnemonic`,
    bestMnemonic || "…",
    ``,
    `## Q → A (self-test)`,
    `- Q: …`,
    `  A: …`,
  ].join("\n");
  return { template, mnemonic: bestMnemonic };
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
  const [isAutoNoting, setIsAutoNoting] = useState(false);

  // ✅ spaced-repetition review
  const { isReviewMode, currentCard, startReviewMode, gradeCard } = useAIReview(user?.uid);

  /* -------------------- Auth -------------------- */
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => setUser(u));
    return () => unsub();
  }, []);

  /* -------------------- Load notes for this book -------------------- */
  useEffect(() => {
    if (!firebaseConnected || !user) return;
    getNotesForBook(user.uid, bookId).then(setNotes).catch(() => {});
  }, [bookId, user]);

  /* -------------------- Auto-mnemonic for initial text -------------------- */
  useEffect(() => {
    if (!initialText.trim()) return;
    (async () => {
      setIsGeneratingMnemonic(true);
      try {
        const generated = await generateMnemonic(initialText);
        if (generated) setMnemonic(generated);
      } catch (err) {
        console.error("❌ Mnemonic generation failed:", err);
      } finally {
        setIsGeneratingMnemonic(false);
      }
    })();
  }, [initialText]);

  /* -------------------- Append live dictation -------------------- */
  useEffect(() => {
    if (dictationText && dictationText.trim()) {
      setContent((prev) => {
        if (!prev) return dictationText;
        if (prev.endsWith(dictationText)) return prev;
        return `${prev}\n${dictationText}`;
      });
    }
  }, [dictationText]);

  /* -------------------- Helpers -------------------- */
  const handleSelectNote = (note: RightBrainNote) => {
    setSelectedNoteId(note.id || null);
    setTitle(note.title || "");
    setContent(note.content || "");
    setMnemonic(note.mnemonic || "");
    setTags((note.tags || []).join(", "));
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
      title: title.trim() || "(untitled)",
      content: content.trim(),
      mnemonic: mnemonic.trim(),
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      attachments: localAttachments,
      bookId,
      page: currentPage || null,
    };

    try {
      if (selectedNoteId) {
        await updateNote(user.uid, selectedNoteId, noteData);
      } else {
        await saveNote(user.uid, noteData);
      }
      // refresh list
      const refreshed = await getNotesForBook(user.uid, bookId);
      setNotes(refreshed);

      // reset draft
      setSelectedNoteId(null);
      setTitle("");
      setContent("");
      setMnemonic("");
      setTags("");
      setLocalAttachments([]);

      onDone?.();
    } catch (err) {
      console.error("❌ Save failed:", err);
      alert("Failed to save note.");
    }
  };

  const handleExportFlashcard = async () => {
    if (!user) return alert("Sign in to create flashcards.");
    const selection = getSelectionText() || content.trim() || title.trim();
    if (!selection) return alert("Highlight or enter text first.");
    try {
      await createFlashcardFromSelection(selection);
      alert("📇 Flashcard saved for review!");
    } catch (err) {
      console.error("❌ Flashcard export failed:", err);
      alert("Failed to create flashcard.");
    }
  };

  const handleExportMindMap = async () => {
    if (!user) return alert("Sign in to create mind map nodes.");
    const selection = getSelectionText() || content.trim() || title.trim();
    if (!selection) return alert("Highlight or enter text first.");
    try {
      await addMindMapNode(selection, currentPage);
      alert("🧠 Mind Map node saved!");
    } catch (err) {
      console.error("❌ Mind map export failed:", err);
      alert("Failed to add to mind map.");
    }
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

  const handleAutoNote = async () => {
    const seed = (content || initialText || "").trim();
    if (!seed) return alert("Select or write something first.");
    setIsAutoNoting(true);
    try {
      const { template, mnemonic: mnem } = await buildStructuredNote(seed);
      // keep any existing title; fill template below the title box
      setContent(template);
      if (mnem && !mnemonic) setMnemonic(mnem);
    } catch (err) {
      console.error("❌ Auto-note failed:", err);
      alert("Could not generate a structured note.");
    } finally {
      setIsAutoNoting(false);
    }
  };

  const pageLabel = useMemo(
    () => (typeof currentPage === "number" ? `p.${currentPage}` : ""),
    [currentPage]
  );

  /* -------------------- UI -------------------- */
  return (
    <div className="flex flex-col h-full bg-gray-900 text-white p-4 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-yellow-400">🧠 Right Brain Notes</h2>
        {pageLabel && <span className="text-xs opacity-70">Linked to {pageLabel}</span>}
      </div>

      {isReviewMode ? (
        <div className="bg-gray-800 p-4 rounded-lg">
          {currentCard ? (
            <>
              <p className="mb-3">
                <strong>Question:</strong> {currentCard.front}
              </p>
              <p className="mb-3">
                <strong>Answer:</strong> {currentCard.back}
              </p>
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

          <input
            type="text"
            placeholder="Title (e.g., ‘Glycolysis regulation’)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mb-2 p-2 rounded bg-gray-800 border border-gray-700 w-full"
          />

          <textarea
            rows={10}
            placeholder="Write your note or click ‘Auto-Note’ to get a structured draft…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="mb-2 p-2 rounded bg-gray-800 border border-gray-700 resize-y min-h-[180px] w-full"
          />

          <textarea
            rows={2}
            placeholder="Mnemonic (auto-generated)"
            value={isGeneratingMnemonic ? "Generating mnemonic..." : mnemonic}
            onChange={(e) => setMnemonic(e.target.value)}
            className="mb-2 p-2 rounded bg-purple-800 border border-purple-700 resize-none text-purple-200 w-full"
          />

          <input
            type="text"
            placeholder="Tags (comma separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="mb-2 p-2 rounded bg-gray-800 border border-gray-700 w-full"
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
                      className="text-yellow-400 underline break-all"
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
              onClick={handleAutoNote}
              disabled={isAutoNoting}
              className={`py-2 px-4 rounded text-white ${
                isAutoNoting ? "bg-gray-500" : "bg-pink-600 hover:bg-pink-700"
              }`}
            >
              {isAutoNoting ? "Drafting…" : "✨ Auto-Note (Top Student)"}
            </button>

            <button
              onClick={handleSummarize}
              disabled={isSummarizing}
              className={`py-2 px-4 rounded text-white ${
                isSummarizing ? "bg-gray-500" : "bg-orange-500 hover:bg-orange-600"
              }`}
            >
              {isSummarizing ? "Summarizing…" : "📝 AI Summary"}
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
              🗺️ Add to Mind Map
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