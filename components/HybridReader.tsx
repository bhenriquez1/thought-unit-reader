// components/HybridReader.tsx
import React from 'react';
import SmartPDFViewer from '@/components/SmartPDFViewer';
import ProgressiveView, { ThoughtUnit, ReadingStats } from '@/components/ProgressiveView';
import { Play, Pause } from 'lucide-react';

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
}

export default function HybridReader({
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
  clickSwitchesTo,
  onWordClick,
  onStartReading,
  onPauseReading,
  onResetReading,
  setReadingSpeed,
  setCurrentPage,
}: HybridReaderProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
      {/* Left Side: PDF Viewer */}
      <div className="bg-gray-800 p-4 rounded-lg overflow-hidden">
        <SmartPDFViewer
          fileUrl={fileUrl}
          scale={1.25}
          onWordClick={onWordClick}
          showTextOverlay={true}
          textContent={sampleText}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Right Side: Progressive Reading View */}
      <div className="bg-gray-800 p-4 rounded-lg flex flex-col space-y-4">
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

        {/* Reading Controls */}
        <div className="flex items-center space-x-4">
          <button
            onClick={isReading && !isPaused ? onPauseReading : onStartReading}
            className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
              isReading && !isPaused
                ? 'bg-yellow-600 hover:bg-yellow-700'
                : 'bg-green-600 hover:bg-green-700'
            } text-white transition-colors`}
          >
            {isReading && !isPaused ? <Pause size={16} /> : <Play size={16} />}
            <span>{isReading && !isPaused ? 'Pause' : 'Start'}</span>
          </button>

          <button
            onClick={onResetReading}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
          >
            Reset
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
      </div>
    </div>
  );
}