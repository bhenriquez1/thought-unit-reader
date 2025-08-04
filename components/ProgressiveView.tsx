// components/ProgressiveView.tsx
import React from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

/** ===============================
 *  📌 Type Definitions
 *  =============================== */
export interface ThoughtUnit {
  id: number;
  text: string;
}

export interface ReadingStats {
  wordsRead: number;
  timeElapsed: number; // in seconds
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
}

/** ===============================
 *  📌 Progressive Reading Component
 *  =============================== */
export default function ProgressiveView({
  thoughtUnits,
  currentThoughtUnit,
  readingSpeed,
  isReading,
  isPaused,
  stats,
  highlightedWord,
  currentPage,
  pdfPageCount,
  fontSize,
  fontFamily,
  lineSpacing,
  onWordClick,
  onStart,
  onPause,
  onReset,
  setReadingSpeed,
}: ProgressiveViewProps) {
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const currentUnit = thoughtUnits[currentThoughtUnit - 1];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-yellow-400 flex items-center">
          ⚡ Progressive Reading
        </h3>
        <div className="text-sm text-gray-400">
          Page {currentPage} of {pdfPageCount}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center space-x-4">
        <button
          onClick={isReading && !isPaused ? onPause : onStart}
          className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
            isReading && !isPaused
              ? 'bg-yellow-600 hover:bg-yellow-700'
              : 'bg-green-600 hover:bg-green-700'
          } text-white`}
        >
          {isReading && !isPaused ? <Pause size={16} /> : <Play size={16} />}
          <span>{isReading && !isPaused ? 'Pause' : 'Start'}</span>
        </button>

        <button
          onClick={onReset}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg flex items-center space-x-2"
        >
          <RotateCcw size={16} />
          <span>Reset</span>
        </button>

        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-300">Speed:</label>
          <input
            type="number"
            value={readingSpeed}
            onChange={(e) => setReadingSpeed(parseInt(e.target.value) || 200)}
            className="w-16 px-2 py-1 bg-gray-700 text-white rounded text-center"
            min="50"
            max="1000"
          />
          <span className="text-sm text-gray-300">WPM</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-blue-600 p-4 rounded-lg text-center">
          <div className="text-2xl font-bold">
            {Math.round((currentPage / pdfPageCount) * 100)}%
          </div>
          <div className="text-sm opacity-75">Complete</div>
        </div>
        <div className="bg-green-600 p-4 rounded-lg text-center">
          <div className="text-2xl font-bold">{currentPage}</div>
          <div className="text-sm opacity-75">Current Page</div>
        </div>
        <div className="bg-purple-600 p-4 rounded-lg text-center">
          <div className="text-2xl font-bold">{stats.currentWPM}</div>
          <div className="text-sm opacity-75">WPM</div>
        </div>
        <div className="bg-red-900 p-4 rounded-lg text-center">
          <div className="text-2xl font-bold">{formatTime(stats.timeElapsed)}</div>
          <div className="text-sm opacity-75">Time Elapsed</div>
        </div>
      </div>

      {/* Current Thought Unit */}
      <div
        className="bg-gray-800 p-4 rounded-lg"
        style={{
          fontSize: `${fontSize}px`,
          fontFamily: fontFamily,
          lineHeight: `${lineSpacing}em`,
        }}
      >
        {currentUnit?.text.split(' ').map((word, idx) => (
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
    </div>
  );
}