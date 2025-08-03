// pages/index.tsx
import dynamic from 'next/dynamic';
import ErrorBoundary from '@/components/ErrorBoundary';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, ZoomIn, ZoomOut, Upload } from 'lucide-react';
import ProgressiveView, { ThoughtUnit, ReadingStats } from '@/components/ProgressiveView';
import HybridReader from '@/components/HybridReader';

// (keep earlier constants like fullTableOfContents, sampleText, etc., unchanged)

// Dynamic components (you can still keep SmartPDFViewer used directly for PDF-progressive)
const SmartPDFViewer = dynamic(() => import('@/components/SmartPDFViewer'), {
  ssr: false,
  loading: () => <div className="p-4 text-center">Loading PDF viewer...</div>,
});

export default function ThoughtUnitReader() {
  // ... all your existing state and hooks remain identical ...

  // Render content based on view mode (only the relevant parts adjusted)
  const renderContent = () => {
    const currentUnit = thoughtUnits[currentThoughtUnit - 1];

    // If PDF is loaded, show PDF-based views
    if (fileUrl && uploadedFile?.type === 'application/pdf') {
      switch (viewMode) {
        case 'progressive':
          // keep original progressive PDF layout but delegate thought-unit display if needed
          return (
            <div className="space-y-6 p-6">
              {/* Progressive Reading Header & Controls (you could optionally replace with ProgressiveView for text portion) */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-yellow-400 flex items-center">
                  <span className="mr-2">⚡</span>
                  Progressive Reading
                </h3>
                <div className="text-sm text-gray-400">
                  Page {currentPage} of {pdfPageCount}
                </div>
              </div>

              {/* Reading Controls */}
              <div className="flex items-center space-x-4">
                <button
                  onClick={isReading && !isPaused ? handlePauseReading : handleStartReading}
                  className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
                    isReading && !isPaused ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'
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
                    min="50"
                    max="1000"
                  />
                  <span className="text-sm text-gray-300">WPM</span>
                  <button
                    onClick={() => setReadingSpeed(prev => Math.min(prev + 50, 1000))}
                    className="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Statistics Cards */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-blue-600 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold">{Math.round((currentPage / pdfPageCount) * 100)}%</div>
                  <div className="text-sm opacity-75">Complete</div>
                </div>
                <div className="bg-green-600 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold">{currentPage}</div>
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

              {/* PDF with Text Overlay */}
              <div className="bg-gray-800 rounded-lg overflow-hidden" style={{ height: '60vh' }}>
                <ErrorBoundary fallback={<div className="p-4 text-center text-red-400">PDF viewer failed to load.</div>}>
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

        // other cases (rightbrain/original) stay as before...
        default:
          return (
            <div className="bg-gray-800 rounded-lg overflow-hidden p-6" style={{ height: '70vh' }}>
              <ErrorBoundary fallback={<div className="p-4 text-center text-red-400">PDF viewer failed to load.</div>}>
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

    // Text-based views (no PDF)
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
              <h4 className="text-sm font-semibold text-gray-300 mb-3">Original View</h4>
              <div className="text-sm leading-relaxed">
                {(textContent || sampleText).split(' ').map((word, index) => (
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

            {/* Progressive View */}
            <div className="bg-gray-800 p-4 rounded-lg">
              <h4 className="text-sm font-semibold text-gray-300 mb-3">Progressive View</h4>
              {thoughtUnits[currentThoughtUnit - 1] && (
                <div className="text-lg leading-relaxed">
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
            </div>
          </div>
        );

      // original/rightbrain remain as before...
      default:
        // fallback to existing internal logic
        return null;
    }
  };

  // ...rest of your component markup remains unchanged, including header, controls, notes panel, etc.

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
      {/* Header, controls, typography, buttons etc. kept exactly as before */}
      <div className="max-w-7xl mx-auto p-4 space-y-4">
        {/* ... your existing control UI ... */}

        {/* Main Content Area */}
        <div className="bg-gray-800 rounded-lg overflow-hidden min-h-[60vh]">
          {renderContent()}
        </div>

        {/* Debug Info */}
        {debugMode && (
          <div className="bg-yellow-900 border border-yellow-700 rounded-lg p-4">
            <h4 className="font-semibold text-yellow-300 mb-2">Debug Information</h4>
            <div className="text-sm text-yellow-200 grid grid-cols-2 gap-4">
              <div>
                <p>Current Thought Unit: {currentThoughtUnit}</p>
                <p>Total Units: {thoughtUnits.length}</p>
                <p>Reading Speed: {readingSpeed} WPM</p>
                <p>View Mode: {viewMode}</p>
              </div>
              <div>
                <p>Words Read: {stats.wordsRead}</p>
                <p>Time Elapsed: {formatTime(stats.timeElapsed)}</p>
                <p>Current WPM: {stats.currentWPM}</p>
                <p>Highlighted Word: {highlightedWord}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}