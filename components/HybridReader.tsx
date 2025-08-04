import React from 'react';
import { ThoughtUnit, ReadingStats } from './ProgressiveView';

interface HybridReaderProps {
  fileUrl: string;
  sampleText: string;
  currentPage: number;
  pdfPageCount: number;
  readingSpeed: number;
  isReading: boolean;
  isPaused: boolean;
  currentThoughtUnit: number;
  thoughtUnits: ThoughtUnit[];
  highlightedWord: string;
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
  onTextSelect?: (text: string) => void; // ✅ New prop
}

export default function HybridReader({
  thoughtUnits,
  currentThoughtUnit,
  fontSize,
  fontFamily,
  lineSpacing,
  highlightedWord,
  onWordClick,
  onTextSelect
}: HybridReaderProps) {

  const handleMouseUp = () => {
    const selection = window.getSelection()?.toString().trim();
    if (selection && onTextSelect) {
      onTextSelect(selection);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-6 p-4" onMouseUp={handleMouseUp}>
      {/* Original View */}
      <div className="bg-gray-800 p-4 rounded-lg">
        <h4 className="text-sm font-semibold text-gray-300 mb-3">Original View</h4>
        <p className="text-sm leading-relaxed">
          {/* Sample text placeholder */}
        </p>
      </div>

      {/* Progressive View */}
      <div className="bg-gray-800 p-4 rounded-lg">
        <h4 className="text-sm font-semibold text-gray-300 mb-3">Progressive View</h4>
        {thoughtUnits[currentThoughtUnit - 1] && (
          <div style={{ fontSize, fontFamily, lineHeight: lineSpacing }}>
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
    </div>
  );
}