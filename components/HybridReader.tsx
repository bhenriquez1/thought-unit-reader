// components/HybridReader.tsx
import React, { useEffect } from "react";
import { ThoughtUnit, ReadingStats } from "./ProgressiveView";
import { saveReadingProgress, loadReadingProgress } from "@/lib/firebase";

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
  onTextSelect?: (text: string) => void;
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
  sampleText,
  currentPage,
  setCurrentPage
}: HybridReaderProps) {

  /** ===== Restore reading progress on mount ===== **/
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

  /** ===== Auto-save progress whenever relevant state changes ===== **/
  useEffect(() => {
    if (userId && pdfId) {
      saveReadingProgress(userId, pdfId, {
        currentPage,
        currentThoughtUnit,
        highlightedWord
      });
    }
  }, [userId, pdfId, currentPage, currentThoughtUnit, highlightedWord]);

  const handleMouseUp = () => {
    const selection = window.getSelection()?.toString().trim();
    if (selection && onTextSelect) {
      onTextSelect(selection);
    }
  };

  if (!thoughtUnits || thoughtUnits.length === 0) {
    return (
      <div
        className="p-4 flex items-center justify-center text-gray-400 italic"
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
      >
        📂 Please upload a PDF to start Hybrid Reading.
      </div>
    );
  }

  const unit = thoughtUnits[currentThoughtUnit - 1];
  if (!unit) {
    return (
      <div
        className="p-4 flex items-center justify-center text-gray-400 italic"
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
      >
        ⏳ Preparing your reading view...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 p-4 h-full" onMouseUp={handleMouseUp}>
      {/* Original View */}
      <div className="bg-gray-800 p-4 rounded-lg overflow-y-auto shadow-inner">
        <h4 className="text-sm font-semibold text-gray-300 mb-3">Original View</h4>
        <p style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}>
          {sampleText || "📄 Original text will appear here when a PDF is uploaded."}
        </p>
      </div>

      {/* Progressive View */}
      <div className="bg-gray-800 p-4 rounded-lg overflow-y-auto shadow-inner">
        <h4 className="text-sm font-semibold text-gray-300 mb-3">Progressive View</h4>
        <div style={{ fontSize, fontFamily, lineHeight: lineSpacing }}>
          {unit.text.split(" ").map((word, idx) => (
            <span
              key={idx}
              className={`${
                word === highlightedWord
                  ? "bg-yellow-400 text-black px-1 rounded"
                  : "hover:bg-gray-700 cursor-pointer px-1 rounded"
              }`}
              onClick={() => {
                onWordClick(word);
                setHighlightedWord(word);
              }}
            >
              {word}{" "}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}