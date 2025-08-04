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
      {thoughtUnits[currentThoughtUnit - 1] && (
        <div>
          {thoughtUnits[currentThoughtUnit - 1].text.split(' ').map((word, idx) => (
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
      )}
    </div>
  );
}