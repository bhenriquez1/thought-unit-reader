// components/ProgressiveView.tsx
import React from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

export interface ThoughtUnit {
  id: number;
  text: string;
  wordCount: number;
  isCompleted: boolean;
  timeSpent: number;
}

export interface ReadingStats {
  wordsRead: number;
  timeElapsed: number; // seconds
  currentWPM: number;
  averageWPM: number;
  comprehensionScore?: number;
}

export interface ProgressiveViewProps {
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
  setReadingSpeed: (wpm: number) => void;
}

const ProgressiveView: React.FC<ProgressiveViewProps> = ({
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
}) => {
  const currentUnit = thoughtUnits[currentThoughtUnit - 1];
  const completionPercentage = Math.round((currentThoughtUnit / Math.max(1, thoughtUnits.length)) * 100);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    return `${minutes}m ${secs}s`;
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-yellow-400 flex items-center">
          <span className="mr-2">⚡</span>
          Progressive Reading
        </h3>
        <div className="text-sm text-gray-400">
          Thought Unit {currentThoughtUnit} of {thoughtUnits.length.toLocaleString()}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center space-x-4">
        <button
          onClick={isReading && !isPaused ? onPause : onStart}
          className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
            isReading && !isPaused ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'
          } text-white transition-colors`}
        >
          {isReading && !isPaused ? <Pause size={16} /> : <Play size={16} />}
          <span>{isReading && !isPaused ? 'Pause' : 'Start'}</span>
        </button>

        <button
          onClick={onReset}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg flex items-center space-x-2 transition-colors"
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
            min={50}
            max={1000}
          />
          <span className="text-sm text-gray-300">WPM</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-blue-600 p-4 rounded-lg text-center">
          <div className="text-2xl font-bold">{completionPercentage}%</div>
          <div className="text-sm opacity-75">Complete</div>
        </div>
        <div className="bg-green-600 p-4 rounded-lg text-center">
          <div className="text-2xl font-bold">{currentThoughtUnit}</div>
          <div className="text-sm opacity-75">Current</div>
        </div>
        <div className="bg-purple-600 p-4 rounded-lg text-center">
          <div className="text-2xl font-bold">{stats.currentWPM}</div>
          <div className="text-sm opacity-75">WPM</div>
        </div>
        <div className="bg-red-900 p-4 rounded-lg text-center">
          <div className="text-2xl font-bold">{formatTime(stats.timeElapsed)}</div>
          <div className="text-sm opacity-75">Left</div>
        </div>
      </div>

      {/* Current Unit */}
      {currentUnit && (
        <div className="bg-gray-800 p-6 rounded-lg">
          <div
            className="text-lg leading-relaxed"
            style={{
              fontSize: `${fontSize}px`,
              fontFamily: fontFamily,
              lineHeight: lineSpacing,
            }}
          >
            {currentUnit.text.split(' ').map((word, index) => (
              <span
                key={index}
                className={`${
                  word === highlightedWord
                    ? 'bg-yellow-400 text-black px-1 rounded'
                    : 'hover:bg-gray-700 cursor-pointer px-1 rounded'
                } transition-colors`}
                onClick={() => onWordClick(word)}
              >
                {word}{' '}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Page info if needed */}
      <div className="text-sm text-gray-400">
        <p>Page {currentPage} of {pdfPageCount}</p>
      </div>
    </div>
  );
};

export default ProgressiveView;