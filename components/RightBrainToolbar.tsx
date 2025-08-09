// components/RightBrainToolbar.tsx
import React, { useState, useRef, useEffect } from "react";
import { generateMnemonic } from "@/lib/mnemonicAI";
import { createFlashcardFromSelection } from "@/lib/flashcardService";
import { addMindMapNode } from "@/lib/mindMapService";
import summarizeText from "@/lib/aiSummary";
import { useSpeechSynthesis } from "react-speech-kit";

interface RightBrainToolbarProps {
  userId: string;
  bookId: string;
  currentPage: number;
  selectionText: string;
  onGenerateNote?: (text: string, mnemonic?: string, mode?: "sketch" | "highYield") => void;
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
  const [isDictationOn, setIsDictationOn] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { speak } = useSpeechSynthesis();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR: typeof window.SpeechRecognition | typeof window.webkitSpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      onGenerateNote?.(transcript.trim());
    };
    recognition.onerror = (err: any) => console.error("🎤 Dictation error:", err);
    recognitionRef.current = recognition as unknown as SpeechRecognition;
  }, [onGenerateNote]);

  useEffect(() => {
    if (!recognitionRef.current) return;
    if (isDictationOn) {
      try { recognitionRef.current.start(); } catch {}
    } else {
      try { recognitionRef.current.stop(); } catch {}
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
    await createFlashcardFromSelection(selectionText, currentPage);
    alert("📇 Flashcard created");
  };

  const handleAddMindMap = async () => {
    if (!selectionText) return alert("Select text first.");
    await addMindMapNode(selectionText, currentPage);
    alert("🧠 Added to Mind Map");
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
      <button onClick={toggleDictation} className={`${isDictationOn ? "bg-red-500" : "bg-gray-600"} text-white px-3 py-1 rounded`}>
        🎤 {isDictationOn ? "Stop Dictation" : "Start Dictation"}
      </button>
      <button onClick={handleReadAloud} className="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded">
        🔊 Read Aloud
      </button>
      <button onClick={handleAISummary} disabled={isGenerating} className={`px-3 py-1 rounded text-white ${isGenerating ? "bg-gray-500" : "bg-orange-500 hover:bg-orange-600"}`}>
        {isGenerating ? "Summarizing..." : "📝 AI Summary"}
      </button>
      <button onClick={() => selectionText ? alert(`🔗 Note linked to page ${currentPage}`) : alert("Select text first to link page.")} className="bg-teal-500 hover:bg-teal-600 text-white px-3 py-1 rounded">
        🔗 Link Page
      </button>
      <button onClick={handleAddMnemonic} disabled={isGenerating} className={`px-3 py-1 rounded text-white ${isGenerating ? "bg-gray-500" : "bg-purple-500 hover:bg-purple-600"}`}>
        🧠 Add Mnemonic
      </button>
      <button onClick={handleCreateFlashcard} className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded">
        📇 Create Flashcard
      </button>
      <button onClick={handleAddMindMap} className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded">
        🗺️ Add to Mind Map
      </button>
      <button onClick={handleSketchNote} className="bg-pink-600 hover:bg-pink-700 text-white px-3 py-1 rounded">
        ✍️ Sketch-Style Note
      </button>
      <button onClick={handleHighYieldNote} className="bg-yellow-700 hover:bg-yellow-800 text-white px-3 py-1 rounded">
        📘 High-Yield Note
      </button>
      {startReview && (
        <button onClick={startReview} className="bg-yellow-500 hover:bg-yellow-600 text-black px-3 py-1 rounded">
          📅 Review Cards
        </button>
      )}
    </div>
  );
}