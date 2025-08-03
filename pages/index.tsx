// pages/index.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Play, Pause, RotateCcw } from 'lucide-react';

// Dynamic imports
const SmartPDFViewer = dynamic(() => import('@/components/SmartPDFViewer'), {
  ssr: false,
  loading: () => <div className="p-4 text-center">Loading PDF viewer...</div>,
});
const ProgressiveView = dynamic(() => import('@/components/ProgressiveView'), {
  ssr: false,
  loading: () => <div className="p-4 text-center">Loading progressive view...</div>,
});
const HybridReader = dynamic(() => import('@/components/HybridReader'), {
  ssr: false,
  loading: () => <div className="p-4 text-center">Loading hybrid reader...</div>,
});

export default function Home() {
  // Core state
  const [viewMode, setViewMode] = useState<'original' | 'progressive' | 'hybrid' | 'rightbrain'>('original');
  const [darkMode, setDarkMode] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [debugMode, setDebugMode] = useState(false);

  // Reading state
  const [readingSpeed, setReadingSpeed] = useState(200);
  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentThoughtUnit, setCurrentThoughtUnit] = useState(1);
  const [totalThoughtUnits] = useState(832767);
  const [stats, setStats] = useState({
    wordsRead: 0,
    timeElapsed: 0,
    currentWPM: 200,
    averageWPM: 200
  });
  const [highlightedWord, setHighlightedWord] = useState<string>('Use');
  const [fontSize, setFontSize] = useState(18);
  const [fontFamily, setFontFamily] = useState('OpenDyslexic');
  const [lineSpacing, setLineSpacing] = useState(1.5);
  const [clickSwitchesTo, setClickSwitchesTo] = useState('Progressive View');

  // PDF/file
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(35);
  const [pdfPageCount] = useState(1423);

  // Thought units
  const [thoughtUnits, setThoughtUnits] = useState<any[]>([]);
  const readingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const sampleText = `Use of the current edition of the electronic version of this book (eBook) is subject to the terms of the nontransferable, limited license granted on expertconsult.inkling.com. Access to the eBook is limited to the first individual who redeems the PIN, located on the inside cover of this book, at expertconsult.inkling.com and may not be transferred to another party by resale, lending, or other means.`;

  // Initialize thought units
  useEffect(() => {
    const content = textContent || sampleText;
    const words = content.split(/\s+/);
    const units: any[] = [];
    for (let i = 0; i < words.length; i += 12) {
      const unitWords = words.slice(i, i + 12);
      units.push({
        id: Math.floor(i / 12) + 1,
        text: unitWords.join(' '),
        wordCount: unitWords.length,
        isCompleted: false,
        timeSpent: 0
      });
    }
    setThoughtUnits(units);
  }, [textContent]);

  // Timer logic
  useEffect(() => {
    if (isReading && !isPaused) {
      readingTimerRef.current = setInterval(() => {
        setStats(prev => {
          const newTimeElapsed = prev.timeElapsed + 1;
          const newCurrentWPM = Math.round((prev.wordsRead / newTimeElapsed) * 60) || readingSpeed;
          return {
            ...prev,
            timeElapsed: newTimeElapsed,
            currentWPM: newCurrentWPM,
            averageWPM: Math.round((prev.averageWPM + newCurrentWPM) / 2) || readingSpeed
          };
        });
      }, 1000);
    } else {
      if (readingTimerRef.current) clearInterval(readingTimerRef.current);
    }
    return () => {
      if (readingTimerRef.current) clearInterval(readingTimerRef.current);
    };
  }, [isReading, isPaused, readingSpeed]);

  // Auto-advance (simplified)
  useEffect(() => {
    if (isReading && !isPaused && viewMode === 'progressive') {
      const wordsPerUnit = thoughtUnits[currentThoughtUnit - 1]?.wordCount || 12;
      const timePerUnit = (wordsPerUnit / readingSpeed) * 60 * 1000;
      const timer = setTimeout(() => {
        if (currentThoughtUnit < thoughtUnits.length) {
          setCurrentThoughtUnit(prev => prev + 1);
          setStats(prev => ({
            ...prev,
            wordsRead: prev.wordsRead + (thoughtUnits[currentThoughtUnit - 1]?.wordCount || 0)
          }));
        }
      }, timePerUnit);
      return () => clearTimeout(timer);
    }
  }, [isReading, isPaused, viewMode, currentThoughtUnit, readingSpeed, thoughtUnits]);

  const handleWordClick = useCallback((word: string) => {
    setHighlightedWord(word);
    if (clickSwitchesTo === 'Progressive View' && viewMode !== 'progressive') {
      setViewMode('progressive');
    } else if (clickSwitchesTo === 'Hybrid View' && viewMode !== 'hybrid') {
      setViewMode('hybrid');
    }
  }, [clickSwitchesTo, viewMode]);

  const handleStartReading = () => {
    setIsReading(true);
    setIsPaused(false);
    startTimeRef.current = Date.now();
  };
  const handlePauseReading = () => setIsPaused(prev => !prev);
  const handleResetReading = () => {
    setIsReading(false);
    setIsPaused(false);
    setCurrentThoughtUnit(1);
    setStats({
      wordsRead: 0,
      timeElapsed: 0,
      currentWPM: readingSpeed,
      averageWPM: readingSpeed
    });
    setThoughtUnits(prev => prev.map((u: any) => ({ ...u, isCompleted: false, timeSpent: 0 })));
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    if (file.type === 'application/pdf') {
      setFileUrl(URL.createObjectURL(file));
    } else if (file.type.startsWith('text/')) {
      const text = await file.text();
      setTextContent(text);
    }
  }, []);

  const completionPercentage = Math.round((currentThoughtUnit / totalThoughtUnits) * 100);
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    return `${minutes}m ${secs}s`;
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
      <header className="text-center py-6 border-b border-gray-700">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-400 to-purple-600 bg-clip-text text-transparent">
          Thought-Unit Reader
        </h1>
        <p className="text-gray-400 mt-2">Read deeper, faster, and smarter.</p>
      </header>

      <div className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm">Enable AI Mode</span>
              <button
                onClick={() => setAiEnabled(!aiEnabled)}
                className={`w-12 h-6 rounded-full transition-colors ${aiEnabled ? 'bg-blue-500' : 'bg-gray-600'} relative`}
              >
                <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${aiEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <label className="flex items-center space-x-2 bg-pink-500 hover:bg-pink-600 px-4 py-2 rounded-lg cursor-pointer transition-colors">
              <span>Upload Book</span>
              <input type="file" onChange={handleFileUpload} className="hidden" accept=".pdf,.txt,.epub" />
            </label>
            <button onClick={() => setDebugMode(!debugMode)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg">
              Debug
            </button>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm">Dark Mode</span>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`w-12 h-6 rounded-full transition-colors ${darkMode ? 'bg-blue-500' : 'bg-gray-600'} relative`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

        {/* View mode buttons */}
        <div className="flex space-x-2">
          <button
            onClick={() => setViewMode('original')}
            className={`px-4 py-2 rounded-lg transition-colors ${viewMode === 'original' ? 'bg-pink-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
          >
            Original View
          </button>
          <button
            onClick={() => setViewMode('progressive')}
            className={`px-4 py-2 rounded-lg transition-colors ${viewMode === 'progressive' ? 'bg-pink-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
          >
            Progressive View
          </button>
          <button
            onClick={() => setViewMode('hybrid')}
            className={`px-4 py-2 rounded-lg transition-colors ${viewMode === 'hybrid' ? 'bg-pink-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
          >
            Hybrid View
          </button>
          <button
            onClick={() => setViewMode('rightbrain')}
            className={`px-4 py-2 rounded-lg transition-colors ${viewMode === 'rightbrain' ? 'bg-blue-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
          >
            🧠 Right Brain View
          </button>
        </div>

        {/* Tip */}
        <div className="bg-blue-900 border border-blue-700 rounded-lg p-3">
          <div className="flex items-center text-blue-300">
            <span className="mr-2">💡</span>
            <span className="text-sm">Tip: Click on any word below to instantly switch to progressive view!</span>
          </div>
        </div>

        {/* Main area */}
        <div className="bg-gray-800 rounded-lg overflow-hidden min-h-[60vh]">
          {viewMode === 'original' && fileUrl && (
            <div className="p-6">
              <SmartPDFViewer
                fileUrl={fileUrl}
                scale={1.25}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                showTextOverlay={false}
              />
            </div>
          )}

          {viewMode === 'progressive' && (
            <ProgressiveView
              sampleText={sampleText}
              currentThoughtUnit={currentThoughtUnit}
              totalThoughtUnits={totalThoughtUnits}
              thoughtUnits={thoughtUnits}
              readingSpeed={readingSpeed}
              isReading={isReading}
              isPaused={isPaused}
              stats={stats}
              highlightedWord={highlightedWord}
              fontSize={fontSize}
              fontFamily={fontFamily}
              lineSpacing={lineSpacing}
              handleStartReading={handleStartReading}
              handlePauseReading={handlePauseReading}
              handleResetReading={handleResetReading}
              handleWordClick={handleWordClick}
              setReadingSpeed={setReadingSpeed}
            />
          )}

          {viewMode === 'hybrid' && (
            <HybridReader
              fileUrl={fileUrl}
              sampleText={sampleText}
              currentThoughtUnit={currentThoughtUnit}
              totalThoughtUnits={totalThoughtUnits}
              thoughtUnits={thoughtUnits}
              readingSpeed={readingSpeed}
              isReading={isReading}
              isPaused={isPaused}
              stats={stats}
              highlightedWord={highlightedWord}
              fontSize={fontSize}
              fontFamily={fontFamily}
              lineSpacing={lineSpacing}
              currentPage={currentPage}
              pdfPageCount={pdfPageCount}
              aiEnabled={aiEnabled}
              handleStartReading={handleStartReading}
              handlePauseReading={handlePauseReading}
              handleResetReading={handleResetReading}
              handleWordClick={handleWordClick}
              setReadingSpeed={setReadingSpeed}
              setCurrentPage={setCurrentPage}
            />
          )}

          {viewMode === 'rightbrain' && (
            <div className="p-6">
              <div className="text-xl font-semibold text-blue-400 mb-4">🧠 Right Brain View - Creative Notes</div>
              <div className="flex gap-6">
                <div className="flex-1 bg-gray-700 p-4 rounded"> {/* Placeholder for notes panel */}Medical / Creative Notes</div>
                <div className="flex-1 bg-gray-700 p-4 rounded"> {/* Context / cards */}Context & Study Cards</div>
              </div>
            </div>
          )}
        </div>

        {/* Debug panel */}
        {debugMode && (
          <div className="bg-yellow-900 border border-yellow-700 rounded-lg p-4 mt-4">
            <div className="grid grid-cols-2 gap-4 text-sm text-yellow-200">
              <div>
                <p>View Mode: {viewMode}</p>
                <p>Current Thought Unit: {currentThoughtUnit}</p>
                <p>Reading Speed: {readingSpeed} WPM</p>
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