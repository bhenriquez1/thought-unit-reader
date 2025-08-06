// components/RightBrainToolbar.tsx
import React, { useState, useRef, useEffect } from "react";
import { generateMnemonic } from "@/lib/mnemonicAI";
import { createFlashcardFromSelection } from "@/lib/flashcardService";
import { addMindMapNode } from "@/lib/mindMapService";
import { summarizeText } from "@/lib/aiSummary";
import { useSpeechSynthesis } from "react-speech-kit";

interface RightBrainToolbarProps {
  userId: string;
  bookId: string;
  currentPage: number;
  selectionText: string;
  onGenerateNote?: (text: string, mnemonic?: string) => void;
  startReview?: () => void;
}

export default function RightBrainToolbar({
  userId,
  bookId,
  currentPage,
  selectionText,
  onGenerateNote,
  startReview
}: RightBrainToolbarProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  // 🎤 Dictation
  const [isDictationOn, setIsDictationOn] = useState(false);
  const recognitionRef = useRef<any>(null);

  // 🔊 Read Aloud
  const { speak } = useSpeechSynthesis();

  /** ===== Dictation Setup ===== **/
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (onGenerateNote) {
        onGenerateNote(transcript.trim());
      }
    };

    recognition.onerror = (err: any) => {
      console.error("🎤 Dictation error:", err);
    };

    recognitionRef.current = recognition;
  }, [onGenerateNote]);

  /** ===== Handle Dictation Toggle ===== **/
  useEffect(() => {
    if (recognitionRef.current) {
      if (isDictationOn) {
        recognitionRef.current.start();
      } else {
        recognitionRef.current.stop();
      }
    }
  }, [isDictationOn]);

  const toggleDictation = () => {
    setIsDictationOn((prev) => !prev);
  };

  /** ===== Read Aloud ===== **/
  const handleReadAloud = () => {
    if (!selectionText) {
      alert("Select text first to read aloud.");
      return;
    }
    speak({ text: selectionText });
  };

  /** ===== AI Summary ===== **/
  const handleAISummary = async () => {
    if (!selectionText) return alert("Select text to summarize.");
    setIsGenerating(true);
    try {
      const summary = await summarizeText(selectionText);
      alert(`📝 AI Summary:\n${summary}`);
    } catch (err) {
      console.error("AI Summary failed:", err);
      alert("AI Summary failed. Try again.");
    }
    setIsGenerating(false);
  };

  /** ===== Add Mnemonic & Note ===== **/
  const handleAddMnemonic = async () => {
    if (!selectionText) return alert("Select text first.");
    setIsGenerating(true);
    try {
      const mnemonic = await generateMnemonic(selectionText);
      onGenerateNote?.(selectionText, mnemonic);
    } catch (err) {
      console.error("Mnemonic generation failed:", err);
      onGenerateNote?.(selectionText);
    }
    setIsGenerating(false);
  };

  /** ===== Create Flashcard ===== **/
  const handleCreateFlashcard = async () => {
    if (!selectionText) return alert("Select text first.");
    await createFlashcardFromSelection(selectionText, currentPage);
    alert("📇 Flashcard created");
  };

  /** ===== Add Mind Map Node ===== **/
  const handleAddMindMap = async () => {
    if (!selectionText) return alert("Select text first.");
    await addMindMapNode(selectionText, currentPage);
    alert("🧠 Added to Mind Map");
  };

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {/* 🎤 Dictation toggle */}
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