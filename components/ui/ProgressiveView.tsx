import React from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import SmartPDFViewer from './SmartPDFViewer';

export interface ThoughtUnit {
  id: number;
  text: string;
  wordCount: number;
  isCompleted: boolean;
  timeSpent: number;
}

export interface ReadingStats {
  wordsRead: number;
  timeElapsed: number;
  currentWPM: number;
  averageWPM: number;
}

interface ProgressiveViewProps {
  isReading: boolean;
  isPaused: boolean;
  handleStartReading: () => void;
  handlePauseReading: () => void;
  handleResetReading: () => void;
  readingSpeed: number;
  setReadingSpeed: (v: number) => void;
  currentThoughtUnit: number;
  thoughtUnits: ThoughtUnit[];
  highlightedWord: string;
  handleWordClick: (word: string) => void;
  stats: ReadingStats;
  completionPercentage: number;
  currentPage: number;
  pdfPageCount: number;
  fileUrl: string | null;
  sampleText: string;
  onPageChange: (page: number) => void;
}

const ProgressiveView: React.FC<ProgressiveViewProps> = ({
  isReading,
  isPaused,
  handleStartReading,
  handlePauseReading,
  handleResetReading,
  readingSpeed,
  setReadingSpeed,
  currentThoughtUnit,
  thoughtUnits,
  highlightedWord,
  handleWordClick,
  stats,
  completionPercentage,
  currentPage,
  pdfPageCount,
  fileUrl,
  sampleText,
  onPageChange,
}) => {
  const currentUnit = thoughtUnits[currentThoughtUnit - 1];

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    return `${minutes}m ${secs}s`;
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-yellow-400 flex items-center">
          <span className="mr-2">⚡</span>Progressive Reading
        </h3>
        <div className="text-sm text-gray-400">
          Page {currentPage} of {pdfPageCount}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center space-x-4">
        <button
          onClick={isReading ? handlePauseReading : handleStartReading}
          className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
            isReading ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'
          } text-white transition-colors`}
        >
          {isReading && !isPaused ? <Pause size={16} /> : <Play size={16} />}
          <span>{isReading && !isPaused ? 'Pause' : 'Start'}</span>
        </button>

        <button
          onClick={handleResetReading}
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

      {/* Content */}
      {fileUrl ? (
        <div className="bg-gray-800 rounded-lg overflow-hidden" style={{ height: '60vh' }}>
          <SmartPDFViewer
            fileUrl={fileUrl}
            scale={1.25}
            onWordClick={handleWordClick}
            showTextOverlay={true}
            textContent={sampleText}
            currentPage={currentPage}
            onPageChange={onPageChange}
          />
        </div>
      ) : (
        currentUnit && (
          <div className="bg-gray-800 p-6 rounded-lg">
            <div className="text-lg leading-relaxed">
              {currentUnit.text.split(' ').map((word, index) => (
                <span
                  key={index}
                  className={`${
                    word === highlightedWord
                      ? 'bg-yellow-400 text-black px-1 rounded'
                      : 'hover:bg-gray-700 cursor-pointer px-1 rounded'
                  } transition-colors`}
                  onClick={() => handleWordClick(word)}
                >
                  {word}{' '}
                </span>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
};

export default ProgressiveView;