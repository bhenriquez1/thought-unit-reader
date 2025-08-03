// components/HybridReader.tsx
import React from 'react';
import SmartPDFViewer from './SmartPDFViewer';
import ProgressiveView, { ThoughtUnit, ReadingStats } from './ProgressiveView';
import { Play, Pause } from 'lucide-react';

export interface HybridReaderProps {
  fileUrl: string | null;
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
  clickSwitchesTo: string;
  onWordClick: (word: string) => void;
  onStartReading: () => void;
  onPauseReading: () => void;
  onResetReading: () => void;
  setReadingSpeed: (wpm: number) => void;
  setCurrentPage: (page: number) => void;
}

const HybridReader: React.FC<HybridReaderProps> = ({
  fileUrl,
  sampleText,
  currentPage,
  pdfPageCount,
  readingSpeed,
  isReading,
  isPaused,
  currentThoughtUnit,
  thoughtUnits,
  highlightedWord,
  stats,
  fontSize,
  fontFamily,
  lineSpacing,
  onWordClick,
  onStartReading,
  onPauseReading,
  onResetReading,
  setReadingSpeed,
  setCurrentPage,
}) => {
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
              onWordClick={onWordClick}
              showTextOverlay={true}
              textContent={sampleText}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
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
            onClick={isReading && !isPaused ? onPauseReading : onStartReading}
            className={`px-3 py-1 rounded text-sm flex items-center space-x-1 ${
              isReading && !isPaused ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'
            } text-white transition-colors`}
          >
            {isReading && !isPaused ? <Pause size={12} /> : <Play size={12} />}
            <span>{isReading && !isPaused ? 'Pause' : 'Start'}</span>
          </button>
          <span className="text-xs text-gray-400">{readingSpeed} WPM</span>
        </div>

        <ProgressiveView
          thoughtUnits={thoughtUnits}
          currentThoughtUnit={currentThoughtUnit}
          readingSpeed={readingSpeed}
          isReading={isReading}
          isPaused={isPaused}
          stats={stats}
          highlightedWord={highlightedWord}
          currentPage={currentPage}
          pdfPageCount={pdfPageCount}
          fontSize={fontSize}
          fontFamily={fontFamily}
          lineSpacing={lineSpacing}
          onWordClick={onWordClick}
          onStart={onStartReading}
          onPause={onPauseReading}
          onReset={onResetReading}
          setReadingSpeed={setReadingSpeed}
        />
      </div>
    </div>
  );
};

export default HybridReader;