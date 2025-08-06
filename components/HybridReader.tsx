import React, { useEffect, useState } from "react";
import { ThoughtUnit, ReadingStats } from "./ProgressiveView.types";
import { saveReadingProgress, loadReadingProgress } from "@/lib/firebase";
import RightBrainToolbar from "@/components/RightBrainToolbar";
import { useAIReview } from "@/hooks/useAIReview";

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
  setReadingSpeed: (speed: number) => void;
  setCurrentPage: (page: number) => void;
  onTextSelect?: (text: string) => void;
  onGenerateNote?: (text: string, mnemonic?: string) => void;
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
  onTextSelect,
  onGenerateNote,
  sampleText,
  currentPage,
  setCurrentPage
}: HybridReaderProps) {
  const [selectionText, setSelectionText] = useState("");

  const { isReviewMode, currentCard, startReview, gradeCard } = useAIReview(userId);

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

  useEffect(() => {
    if (userId && pdfId) {
      saveReadingProgress(userId, pdfId, {
        currentPage,
        currentThoughtUnit,
        highlightedWord
      });
    }
  }, [userId, pdfId, currentPage, currentThoughtUnit, highlightedWord]);

  const getSelectionText = () => window.getSelection()?.toString().trim() || "";
  const handleMouseUp = () => {
    const selection = getSelectionText();
    setSelectionText(selection);
    if (selection && onTextSelect) onTextSelect(selection);
  };

  if (!thoughtUnits || thoughtUnits.length === 0) {
    return (
      <div className="p-4 flex items-center justify-center text-gray-400 italic"
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}>
        📂 Please upload a PDF to start Hybrid Reading.
      </div>
    );
  }

  const unit = thoughtUnits[currentThoughtUnit - 1];
  if (!unit) {
    return (
      <div className="p-4 flex items-center justify-center text-gray-400 italic"
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}>
        ⏳ Preparing your reading view...
      </div>
    );
  }

  if (isReviewMode) {
    return (
      <div className="p-4 bg-gray-900 text-white rounded-lg">
        <h3 className="text-lg font-bold mb-4">📅 Review Mode</h3>
        {currentCard ? (
          <>
            <p className="mb-3"><strong>Question:</strong> {currentCard.front}</p>
            <p className="mb-3"><strong>Answer:</strong> {currentCard.back}</p>
            <button onClick={gradeCard} className="bg-blue-500 hover:bg-blue-600 px-3 py-1 rounded">
              Next Card
            </button>
          </>
        ) : (
          <p>🎉 All cards reviewed!</p>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 p-4 h-full" onMouseUp={handleMouseUp}>
      {/* Original View */}
      <div className="bg-gray-800 p-4 rounded-lg overflow-y-auto shadow-inner">
        <h4 className="text-sm font-semibold text-yellow-400 mb-3">Original View</h4>
        <p style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}>
          {sampleText || "📄 Original text will appear here when a PDF is uploaded."}
        </p>
        <RightBrainToolbar
          userId={userId}
          bookId={pdfId}
          currentPage={currentPage}
          selectionText={selectionText}
          onGenerateNote={onGenerateNote}
          startReview={startReview}
        />
      </div>

      {/* Progressive View */}
      <div className="bg-gray-800 p-4 rounded-lg overflow-y-auto shadow-inner">
        <h4 className="text-sm font-semibold text-yellow-400 mb-3">Progressive View</h4>
        <div style={{ fontSize, fontFamily, lineHeight: lineSpacing }}>
          {unit.text.split(" ").map((word, idx) => (
            <span key={idx}
              className={`${word === highlightedWord ? "bg-yellow-400 text-black px-1 rounded" :
                "hover:bg-gray-700 cursor-pointer px-1 rounded"}`}
              onClick={() => { onWordClick(word); setHighlightedWord(word); }}>
              {word}{" "}
            </span>
          ))}
        </div>
        <RightBrainToolbar
          userId={userId}
          bookId={pdfId}
          currentPage={currentPage}
          selectionText={selectionText}
          onGenerateNote={onGenerateNote}
          startReview={startReview}
        />
      </div>
    </div>
  );
}