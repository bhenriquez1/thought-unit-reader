"use client";

import React, { useState, useRef, useEffect } from "react";
import { generateMnemonic } from "@/lib/mnemonicAI";
import { createFlashcardFromSelection } from "@/lib/flashcardService";
import { addMindMapNode } from "@/lib/mindMapService";
import summarizeText from "@/lib/aiSummary";

interface RightBrainToolbarProps {
  userId: string;
  bookId: string;
  currentPage: number;
  /** unified selection text passed down from Progressive/Hybrid/PDF */
  selectionText: string;
  /** open editor and optionally seed text/mnemonic/template mode */
  onGenerateNote?: (
    text: string,
    mnemonic?: string,
    mode?: "sketch" | "highYield"
  ) => void;
  startReview?: () => void;
}

/** Simple local speech synthesis (no deps) */
function useLocalSpeechSynthesis() {
  const speak = ({ text }: { text: string }) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (!text?.trim()) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 1;
      u.pitch = 1;
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  };
  return { speak };
}

export default function RightBrainToolbar({
  userId,
  bookId,
  currentPage,
  selectionText,
  onGenerateNote,
  startReview,
}: RightBrainToolbarProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDictationOn, setIsDictationOn] = useState(false);
  const recognitionRef = useRef<any>(null);
  const { speak } = useLocalSpeechSynthesis();

  // 🎙️ Dictation
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SR: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      onGenerateNote?.(transcript.trim());
    };

    recognition.onerror = (err: any) => {
      console.error("🎤 Dictation error:", err);
    };

    recognitionRef.current = recognition;
  }, [onGenerateNote]);

  useEffect(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (isDictationOn) {
      try {
        rec.start();
      } catch {
        /* already started */
      }
    } else {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
  }, [isDictationOn]);

  const toggleDictation = () => setIsDictationOn((p) => !p);

  const handleReadAloud = () => {
    if (!selectionText) return alert("Select text first to read aloud.");
    speak({ text: selectionText });
  };

  const handleAISummary = async () => {
    if (!selectionText) return alert("Select text to summarize.");
    setIsGenerating(true);
    try {
      const summary = await summarizeText(selectionText);
      alert(`📝 AI Summary:\n\n${summary}`);
    } catch (err) {
      console.error("❌ AI Summary failed:", err);
      alert("AI Summary failed. Try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddMnemonic = async () => {
    if (!selectionText) return alert("Select text first.");
    setIsGenerating(true);
    try {
      const mnemonic = await generateMnemonic(selectionText);
      onGenerateNote?.(selectionText, mnemonic);
    } catch (err) {
      console.error("❌ Mnemonic generation failed:", err);
      onGenerateNote?.(selectionText);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateFlashcard = async () => {
    if (!selectionText) return alert("Select text first.");
    try {
      await createFlashcardFromSelection(selectionText);
      alert("📇 Flashcard created");
    } catch (err) {
      console.error("❌ Flashcard create failed:", err);
      alert("Failed to create flashcard.");
    }
  };

  const handleAddMindMap = async () => {
    if (!selectionText) return alert("Select text first.");
    try {
      await addMindMapNode(selectionText, currentPage);
      alert("🧠 Added to Mind Map");
    } catch (err) {
      console.error("❌ Mind map add failed:", err);
      alert("Failed to add to mind map.");
    }
  };

  const handleSketchNote = () => {
    if (!selectionText) return alert("Select text first.");
    onGenerateNote?.(selectionText, undefined, "sketch");
  };

  const handleHighYieldNote = () => {
    if (!selectionText) return alert("Select text first.");
    onGenerateNote?.(selectionText, undefined, "highYield");
  };

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button
        onClick={toggleDictation}
        className={`${isDictationOn ? "bg-red-500" : "bg-gray-600"} text-white px-3 py-1 rounded`}
      >
        🎤 {isDictationOn ? "Stop Dictation" : "Start Dictation"}
      </button>

      <button
        onClick={handleReadAloud}
        className="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded"
      >
        🔊 Read Aloud
      </button>

      <button
        onClick={handleAISummary}
        disabled={isGenerating}
        className={`px-3 py-1 rounded text-white ${
          isGenerating ? "bg-gray-500" : "bg-orange-500 hover:bg-orange-600"
        }`}
      >
        {isGenerating ? "Summarizing..." : "📝 AI Summary"}
      </button>

      <button
        onClick={() =>
          selectionText
            ? alert(`🔗 Note linked to page ${currentPage}`)
            : alert("Select text first to link page.")
        }
        className="bg-teal-500 hover:bg-teal-600 text-white px-3 py-1 rounded"
      >
        🔗 Link Page
      </button>

      <button
        onClick={handleAddMnemonic}
        disabled={isGenerating}
        className={`px-3 py-1 rounded text-white ${
          isGenerating ? "bg-gray-500" : "bg-purple-500 hover:bg-purple-600"
        }`}
      >
        🧠 Add Mnemonic
      </button>

      <button
        onClick={handleCreateFlashcard}
        className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded"
      >
        📇 Create Flashcard
      </button>

      <button
        onClick={handleAddMindMap}
        className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded"
      >
        🗺️ Add to Mind Map
      </button>

      <button
        onClick={handleSketchNote}
        className="bg-pink-600 hover:bg-pink-700 text-white px-3 py-1 rounded"
      >
        ✍️ Sketch-Style Note
      </button>

      <button
        onClick={handleHighYieldNote}
        className="bg-yellow-700 hover:bg-yellow-800 text-white px-3 py-1 rounded"
      >
        📘 High-Yield Note
      </button>

      {startReview && (
        <button
          onClick={startReview}
          className="bg-yellow-500 hover:bg-yellow-600 text-black px-3 py-1 rounded"
        >
          📅 Review Cards
        </button>
      )}
    </div>
  );
}