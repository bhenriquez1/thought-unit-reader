// pages/index.tsx
import dynamic from 'next/dynamic';
import ErrorBoundary from '@/components/ErrorBoundary';
import React, { useState } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import ProgressiveView, { ThoughtUnit, ReadingStats } from '@/components/ProgressiveView';
import HybridReader from '@/components/HybridReader';

// Dynamic import for SmartPDFViewer
const SmartPDFViewer = dynamic(() => import('@/components/SmartPDFViewer'), {
  ssr: false,
  loading: () => <div className="p-4 text-center">Loading PDF viewer...</div>,
});

export default function ThoughtUnitReader() {
  /** ===============================
   *  📌 State Variables
   *  =============================== */
  const [thoughtUnits, setThoughtUnits] = useState<ThoughtUnit[]>([]);
  const [currentThoughtUnit, setCurrentThoughtUnit] = useState(1);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [viewMode, setViewMode] = useState<'progressive' | 'hybrid' | 'original' | 'rightbrain'>('progressive');
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfPageCount, setPdfPageCount] = useState(1);
  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [readingSpeed, setReadingSpeed] = useState(200);
  const [stats, setStats] = useState<ReadingStats>({ wordsRead: 0, timeElapsed: 0, currentWPM: 0 });
  const [highlightedWord, setHighlightedWord] = useState('');
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('sans-serif');
  const [lineSpacing, setLineSpacing] = useState(1.5);
  const [clickSwitchesTo, setClickSwitchesTo] = useState(false);
  const [sampleText, setSampleText] = useState('');
  const [textContent, setTextContent] = useState('');
  const [darkMode, setDarkMode] = useState(true);
  const [debugMode, setDebugMode] = useState(false);

  /** ===============================
   *  📌 Handlers
   *  =============================== */
  const handleWordClick = (word: string) => setHighlightedWord(word);
  const handleStartReading = () => setIsReading(true);
  const handlePauseReading = () => setIsPaused(true);
  const handleResetReading = () => {
    setIsReading(false);
    setIsPaused(false);
    setCurrentThoughtUnit(1);
  };
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  /** ===============================
   *  📌 Content Renderer
   *  =============================== */
  const renderContent = () => {
    const currentUnit = thoughtUnits[currentThoughtUnit - 1];

    // PDF Mode
    if (fileUrl && uploadedFile?.type === 'application/pdf') {
      switch (viewMode) {
        case 'progressive':
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
                  onClick={isReading && !isPaused ? handlePauseReading : handleStartReading}
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
                  onClick={handleResetReading}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg flex items-center space-x-2"
                >
                  <RotateCcw size={16} />
                  <span>Reset</span>
                </button>
              </div>

              {/* PDF Viewer */}
              <div className="bg-gray-800 rounded-lg overflow-hidden" style={{ height: '60vh' }}>
                <ErrorBoundary fallback={<div className="p-4 text-center text-red-400">PDF failed to load.</div>}>
                  <SmartPDFViewer
                    fileUrl={fileUrl}
                    scale={1.25}
                    onWordClick={handleWordClick}
                    showTextOverlay={true}
                    textContent={sampleText}
                    currentPage={currentPage}
                    onPageChange={setCurrentPage}
                  />
                </ErrorBoundary>
              </div>
            </div>
          );

        case 'hybrid':
          return (
            <ErrorBoundary fallback={<div className="p-4 text-center">Hybrid reader failed to load.</div>}>
              <HybridReader
                fileUrl={fileUrl}
                sampleText={sampleText}
                currentPage={currentPage}
                pdfPageCount={pdfPageCount}
                readingSpeed={readingSpeed}
                isReading={isReading}
                isPaused={isPaused}
                currentThoughtUnit={currentThoughtUnit}
                thoughtUnits={thoughtUnits}
                highlightedWord={highlightedWord}
                stats={stats}
                fontSize={fontSize}
                fontFamily={fontFamily}
                lineSpacing={lineSpacing}
                clickSwitchesTo={clickSwitchesTo}
                onWordClick={handleWordClick}
                onStartReading={handleStartReading}
                onPauseReading={handlePauseReading}
                onResetReading={handleResetReading}
                setReadingSpeed={setReadingSpeed}
                setCurrentPage={setCurrentPage}
              />
            </ErrorBoundary>
          );

        default:
          return (
            <div className="bg-gray-800 rounded-lg overflow-hidden p-6" style={{ height: '70vh' }}>
              <ErrorBoundary fallback={<div className="p-4 text-center text-red-400">PDF failed to load.</div>}>
                <SmartPDFViewer
                  fileUrl={fileUrl}
                  scale={1.25}
                  onWordClick={handleWordClick}
                  showTextOverlay={false}
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                />
              </ErrorBoundary>
            </div>
          );
      }
    }

    // Text Mode
    switch (viewMode) {
      case 'progressive':
        return (
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
            onWordClick={handleWordClick}
            onStart={handleStartReading}
            onPause={handlePauseReading}
            onReset={handleResetReading}
            setReadingSpeed={setReadingSpeed}
          />
        );

      case 'hybrid':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
            {/* Original Text */}
            <div className="bg-gray-800 p-4 rounded-lg">
              {(textContent || sampleText).split(' ').map((word, idx) => (
                <span
                  key={idx}
                  className={`${
                    word === highlightedWord
                      ? 'bg-yellow-400 text-black px-1 rounded'
                      : 'hover:bg-gray-700 cursor-pointer px-1 rounded'
                  }`}
                  onClick={() => handleWordClick(word)}
                >
                  {word}{' '}
                </span>
              ))}
            </div>

            {/* Progressive Text */}
            <div className="bg-gray-800 p-4 rounded-lg">
              {currentUnit?.text.split(' ').map((word, idx) => (
                <span
                  key={idx}
                  className={`${
                    word === highlightedWord
                      ? 'bg-yellow-400 text-black px-1 rounded'
                      : 'hover:bg-gray-700 cursor-pointer px-1 rounded'
                  }`}
                  onClick={() => handleWordClick(word)}
                >
                  {word}{' '}
                </span>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  /** ===============================
   *  📌 JSX Layout
   *  =============================== */
  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
      <div className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Main Content */}
        <div className="bg-gray-800 rounded-lg overflow-hidden min-h-[60vh]">
          {renderContent()}
        </div>

        {/* Debug Panel */}
        {debugMode && (
          <div className="bg-yellow-900 border border-yellow-700 rounded-lg p-4">
            <h4 className="font-semibold text-yellow-300 mb-2">Debug Info</h4>
            <pre className="text-sm text-yellow-200">
              {JSON.stringify({ thoughtUnits, currentThoughtUnit, readingSpeed, viewMode, stats }, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}