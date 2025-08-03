// components/HybridReader.tsx
import React from 'react';
import SmartPDFViewer from '@/components/SmartPDFViewer';
import ProgressiveView, { ThoughtUnit, ReadingStats } from '@/components/ProgressiveView';
import { Play, Pause } from 'lucide-react';

interface HybridReaderProps {
  fileUrl: string | null;
  sampleText: string;
  currentThoughtUnit: number;
  totalThoughtUnits: number;
  thoughtUnits: ThoughtUnit[];
  readingSpeed: number;
  isReading: boolean;
  isPaused: boolean;
  stats: ReadingStats;
  highlightedWord: string;
  fontSize: number;
  fontFamily: string;
  lineSpacing: number;
  currentPage: number;
  pdfPageCount: number;
  aiEnabled: boolean;
  handleStartReading: () => void;
  handlePauseReading: () => void;
  handleResetReading: () => void;
  handleWordClick: (word: string) => void;
  setReadingSpeed: (wpm: number) => void;
  setCurrentPage: (page: number) => void;
}

const HybridReader: React.FC<HybridReaderProps> = ({
  fileUrl,
  sampleText,
  currentThoughtUnit,
  totalThoughtUnits,
  thoughtUnits,
  readingSpeed,
  isReading,
  isPaused,
  stats,
  highlightedWord,
  fontSize,
  fontFamily,
  lineSpacing,
  currentPage,
  pdfPageCount,
  aiEnabled,
  handleStartReading,
  handlePauseReading,
  handleResetReading,
  handleWordClick,
  setReadingSpeed,
  setCurrentPage
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
      {/* PDF View */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <h4 className="text-sm font-semibold text-gray-300 p-3 border-b border-gray-700">
          PDF View - Page {currentPage}
        </h4>
        <div style={{ height: '60vh' }}>
          {fileUrl && (
            <SmartPDFViewer
              fileUrl={fileUrl}
              scale={1.0}
              onWordClick={handleWordClick}
              showTextOverlay={true}
              textContent={sampleText}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
            />
          )}
        </div>
      </div>

      {/* Progressive Reading View */}
      <div className="bg-gray-800 p-4 rounded-lg">
        <h4 className="text-sm font-semibold text-gray-300 mb-3">Progressive Reading</h4>
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
          <span className="text-xs text-gray-400">{readingSpeed} WPM</span>
        </div>
        {thoughtUnits[currentThoughtUnit - 1] && (
          <div className="text-lg leading-relaxed mb-2">
            {thoughtUnits[currentThoughtUnit - 1].text.split(' ').map((word, index) => (
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