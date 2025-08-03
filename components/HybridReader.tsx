import React from 'react';
import SmartPDFViewer from './SmartPDFViewer';
import { Play, Pause } from 'lucide-react';
import { ThoughtUnit, ReadingStats } from './ProgressiveView';

interface HybridReaderProps {
  isReading: boolean;
  isPaused: boolean;
  handleStartReading: () => void;
  handlePauseReading: () => void;
  readingSpeed: number;
  currentThoughtUnit: number;
  thoughtUnits: ThoughtUnit[];
  highlightedWord: string;
  handleWordClick: (word: string) => void;
  stats: ReadingStats;
  currentPage: number;
  pdfPageCount: number;
  fileUrl: string | null;
  sampleText: string;
  onPageChange: (page: number) => void;
}

const HybridReader: React.FC<HybridReaderProps> = ({
  isReading,
  isPaused,
  handleStartReading,
  handlePauseReading,
  readingSpeed,
  currentThoughtUnit,
  thoughtUnits,
  highlightedWord,
  handleWordClick,
  stats,
  currentPage,
  pdfPageCount,
  fileUrl,
  sampleText,
  onPageChange,
}) => {
  const currentUnit = thoughtUnits[currentThoughtUnit - 1];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
      {/* PDF View */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="p-3 border-b border-gray-700 flex justify-between">
          <div className="text-sm font-semibold text-gray-300">PDF View - Page {currentPage}</div>
          <div className="text-xs text-gray-400">{currentPage} / {pdfPageCount}</div>
        </div>
        <div style={{ height: '60vh' }}>
          {fileUrl && (
            <SmartPDFViewer
              fileUrl={fileUrl}
              scale={1.0}
              onWordClick={handleWordClick}
              showTextOverlay={true}
              textContent={sampleText}
              currentPage={currentPage}
              onPageChange={onPageChange}
            />
          )}
        </div>
      </div>

      {/* Progressive Reading Panel */}
      <div className="bg-gray-800 p-4 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-300">Progressive Reading</h4>
          <div className="text-xs text-gray-400">{readingSpeed} WPM</div>
        </div>

        <div className="flex items-center space-x-2 mb-4">
          <button
            onClick={isReading ? handlePauseReading : handleStartReading}
            className={`px-3 py-1 rounded text-sm flex items-center space-x-1 ${
              isReading ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'
            } text-white transition-colors`}
          >
            {isReading && !isPaused ? <Pause size={12} /> : <Play size={12} />}
            <span>{isReading && !isPaused ? 'Pause' : 'Start'}</span>
          </button>
        </div>

        {currentUnit && (
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
        )}

        <div className="mt-4 text-sm text-gray-400">
          <p>Thought Unit {currentThoughtUnit} of {thoughtUnits.length}</p>
          <p>Page {currentPage} of {pdfPageCount}</p>
        </div>
      </div>
    </div>
  );
};

export default HybridReader;