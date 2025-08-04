import React from 'react';

export interface ThoughtUnit {
  text: string;
}

export interface ReadingStats {
  wordsRead: number;
  timeElapsed: number;
  currentWPM: number;
}

interface ProgressiveViewProps {
  thoughtUnits: ThoughtUnit[];
  currentThoughtUnit: number;
  readingSpeed: number;
  isReading: boolean;
  isPaused: boolean;
  stats: ReadingStats;
  highlightedWord: string;
  currentPage: number;
  pdfPageCount: number;
  fontSize: number;
  fontFamily: string;
  lineSpacing: number;
  onWordClick: (word: string) => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  setReadingSpeed: (speed: number) => void;
  onTextSelect?: (text: string) => void; // ✅ New prop
}

export default function ProgressiveView({
  thoughtUnits,
  currentThoughtUnit,
  fontSize,
  fontFamily,
  lineSpacing,
  highlightedWord,
  onWordClick,
  onTextSelect
}: ProgressiveViewProps) {

  const handleMouseUp = () => {
    const selection = window.getSelection()?.toString().trim();
    if (selection && onTextSelect) {
      onTextSelect(selection);
    }
  };

  // ✅ No thought units loaded
  if (!thoughtUnits || thoughtUnits.length === 0) {
    return (
      <div
        className="progressive-view p-4 flex items-center justify-center text-gray-400 italic"
        style={{
          fontSize: `${fontSize}px`,
          fontFamily,
          lineHeight: lineSpacing
        }}
      >
        📂 Please upload a PDF to start Progressive Reading.
      </div>
    );
  }

  // ✅ Current unit out of range (e.g., file just uploaded but parsing delayed)
  const unit = thoughtUnits[currentThoughtUnit - 1];
  if (!unit) {
    return (
      <div
        className="progressive-view p-4 flex items-center justify-center text-gray-400 italic"
        style={{
          fontSize: `${fontSize}px`,
          fontFamily,
          lineHeight: lineSpacing
        }}
      >
        ⏳ Preparing your reading view...
      </div>
    );
  }

  return (
    <div
      className="progressive-view p-4 overflow-y-auto"
      style={{
        fontSize: `${fontSize}px`,
        fontFamily,
        lineHeight: lineSpacing
      }}
      onMouseUp={handleMouseUp}
    >
      {unit.text.split(' ').map((word, idx) => (
        <span
          key={idx}
          className={`${
            word === highlightedWord
              ? 'bg-yellow-400 text-black px-1 rounded'
              : 'hover:bg-gray-700 cursor-pointer px-1 rounded'
          }`}
          onClick={() => onWordClick(word)}
        >
          {word}{' '}
        </span>
      ))}
    </div>
  );
}