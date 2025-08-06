// components/HybridReader.tsx
import React, { useEffect, useState, useRef } from "react";
import { ThoughtUnit, ReadingStats } from "./ProgressiveView";
import { saveReadingProgress, loadReadingProgress } from "@/lib/firebase";
import { useAIReview } from "@/hooks/useAIReview";
import RightBrainNoteEditor from "@/components/RightBrainNoteEditor";

interface HybridReaderProps {
  fileUrl: string;
  pdfId: string;
  userId: string;
  sampleText: string;
  currentPage: number;
  pdfPageCount: number;
  readingSpeed: number;
  isReading: boolean;
  isPaused: boolean;
  currentThoughtUnit: number;
  setCurrentThoughtUnit: (unit: number) => void;
  thoughtUnits: ThoughtUnit[];
  highlightedWord: string;
  setHighlightedWord: (word: string) => void;
  stats: ReadingStats;
  fontSize: number;
  fontFamily: string;
  lineSpacing: number;
  clickSwitchesTo: boolean;
  onWordClick: (word: string) => void;
  onStartReading: () => void;
  onPauseReading: () => void;
  onResetReading: () => void;
  setReadingSpeed: (speed: number) => void;
  setCurrentPage: (page: number) => void;
}

export default function HybridReader({
  pdfId,
  userId,
  thoughtUnits,
  currentThoughtUnit,
  setCurrentThoughtUnit,
  fontSize,
  fontFamily,
  lineSpacing,
  highlightedWord,
  setHighlightedWord,
  onWordClick,
  sampleText,
  currentPage,
  setCurrentPage
}: HybridReaderProps) {
  const { isReviewMode, currentCard, startReview, gradeCard } = useAIReview(userId);

  // 🎙️ Dictation state
  const [isDictating, setIsDictating] = useState(false);
  const [dictationText, setDictationText] = useState("");
  const recognitionRef = useRef<any>(null);

  /** ===== Restore reading progress ===== **/
  useEffect(() => {
    if (userId && pdfId) {
      loadReadingProgress(userId, pdfId).then((progress) => {
        if (progress) {
          if (progress.currentPage) setCurrentPage(progress.currentPage);
          if (progress.currentThoughtUnit) setCurrentThoughtUnit(progress.currentThoughtUnit);
          if (progress.highlightedWord) setHighlightedWord(progress.highlightedWord);
        }
      });
    }
  }, [userId, pdfId]);

  /** ===== Auto-save reading progress ===== **/
  useEffect(() => {
    if (userId && pdfId) {
      saveReadingProgress(userId, pdfId, {
        currentPage,
        currentThoughtUnit,
        highlightedWord
      });
    }
  }, [userId, pdfId, currentPage, currentThoughtUnit, highlightedWord]);

  /** ===== Dictation setup ===== **/
  useEffect(() => {
    if (!("webkitSpeechRecognition" in window)) {
      console.warn("Speech recognition not supported");
      return;
    }

    const SpeechRecognition =
      (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setDictationText(transcript.trim());
    };

    recognition.onend = () => {
      // Auto-restart if still dictating
      if (isDictating) recognition.start();
    };

    recognitionRef.current = recognition;
  }, []);

  /** ===== Toggle dictation ===== **/
  const toggleDictation = () => {
    if (!recognitionRef.current) {
      alert("Voice recognition not supported in this browser.");
      return;
    }
    if (isDictating) {
      recognitionRef.current.stop();
      setIsDictating(false);
    } else {
      recognitionRef.current.start();
      setIsDictating(true);
    }
  };

  /** ===== No text loaded ===== **/
  if (!thoughtUnits || thoughtUnits.length === 0) {
    return (
      <div className="p-4 flex items-center justify-center text-gray-400 italic"
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}>
        📂 Please upload a PDF to start Hybrid Reading.
      </div>
    );
  }

  /** ===== Out of range ===== **/
  const unit = thoughtUnits[currentThoughtUnit - 1];
  if (!unit) {
    return (
      <div className="p-4 flex items-center justify-center text-gray-400 italic"
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}>
        ⏳ Preparing your reading view...
      </div>
    );
  }

  /** ===== Review Mode UI ===== **/
  if (isReviewMode) {
    return (
      <div className="p-4 bg-gray-900 text-white rounded-lg">
        <h3 className="text-lg font-bold mb-4">📅 Review Mode</h3>
        {currentCard ? (
          <>
            <p className="mb-3"><strong>Question:</strong> {currentCard.front}</p>
            <p className="mb-3"><strong>Answer:</strong> {currentCard.back}</p>
            <button
              onClick={gradeCard}
              className="bg-blue-500 hover:bg-blue-600 px-3 py-1 rounded"
            >
              Next Card
            </button>
          </>
        ) : (
          <p>🎉 All cards reviewed!</p>
        )}
      </div>
    );
  }

  /** ===== Main dual-panel reading UI ===== **/
  return (
    <div className="grid grid-cols-2 gap-4 p-4 h-full">
      {/* Left Panel - Original */}
      <div className="bg-gray-800 p-4 rounded-lg overflow-y-auto shadow-inner">
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-sm font-semibold text-yellow-400">Original View</h4>
          <button
            onClick={toggleDictation}
            className={`${isDictating ? "bg-red-500" : "bg-gray-500"} text-white px-3 py-1 rounded`}
          >
            🎙️ {isDictating ? "Stop Dictation" : "Start Dictation"}
          </button>
        </div>
        <p style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}>
          {sampleText || "📄 Original text will appear here when a PDF is uploaded."}
        </p>
      </div>

      {/* Right Panel - Progressive View with Note Editor */}
      <RightBrainNoteEditor
        bookId={pdfId}
        currentPage={currentPage}
        initialText=""
        dictationText={dictationText} // 🎙️ Pass live transcript here
      />
    </div>
  );
}